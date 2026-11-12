import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, Check, Clock3, FilePlus2, History, Layers3, Pencil, Plus, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

type Category = "license" | "economy" | "roles" | "regulations";
type Configuration = {
  id: string;
  category: Category;
  config_key: string;
  title: string;
  payload: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  updated_at: string;
};
type Revision = {
  id: string;
  configuration_id: string;
  category: Category;
  config_key: string;
  title: string;
  payload: Record<string, unknown>;
  action: "INSERT" | "UPDATE" | "DELETE";
  changed_at: string;
};

const categories: { id: Category; label: string; description: string }[] = [
  { id: "license", label: "License", description: "Tier, persyaratan, gaji, hak divisi, masa berlaku, dan evaluasi." },
  { id: "economy", label: "Economy", description: "Gaji, bonus, biaya, pajak, denda, subsidi, dan parameter ekonomi." },
  { id: "roles", label: "Roles", description: "Ketentuan dan metadata role yang berlaku di CALERIS." },
  { id: "regulations", label: "Regulations", description: "Dokumen aturan, ketentuan, dan konfigurasi kompetisi." }
];

const emptyPayload = "{\n  \n}";
const prettyDate = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default function AdminConfiguration({ session }: { session: Session }) {
  const [category, setCategory] = useState<Category>("license");
  const [rows, setRows] = useState<Configuration[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [selected, setSelected] = useState<Configuration | null>(null);
  const [title, setTitle] = useState("");
  const [key, setKey] = useState("");
  const [payloadText, setPayloadText] = useState(emptyPayload);
  const [active, setActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const categoryInfo = categories.find((item) => item.id === category)!;
  const loadRows = useCallback(async () => {
    if (!supabase) { setLoading(false); setMessage({ kind: "error", text: "Koneksi Supabase belum tersedia." }); return; }
    setLoading(true);
    const { data, error } = await supabase.from("caleris_configurations").select("*").eq("category", category).order("sort_order", { ascending: true }).order("title", { ascending: true });
    if (error) setMessage({ kind: "error", text: error.message });
    else setRows((data ?? []) as Configuration[]);
    setLoading(false);
  }, [category]);

  const loadRevisions = useCallback(async () => {
    if (!supabase || !selected) return;
    const { data, error } = await supabase.from("caleris_configuration_revisions").select("id,configuration_id,category,config_key,title,payload,action,changed_at").eq("configuration_id", selected.id).order("changed_at", { ascending: false }).limit(30);
    if (error) setMessage({ kind: "error", text: error.message });
    else setRevisions((data ?? []) as Revision[]);
  }, [selected]);

  useEffect(() => { void loadRows(); }, [loadRows]);
  useEffect(() => { if (showHistory) void loadRevisions(); }, [showHistory, loadRevisions]);

  const resetEditor = () => {
    setSelected(null); setTitle(""); setKey(""); setPayloadText(emptyPayload);
    setActive(true); setSortOrder("0"); setEditing(false); setShowHistory(false); setRevisions([]);
  };
  const beginCreate = () => { resetEditor(); setEditing(true); setMessage(null); };
  const beginEdit = (row: Configuration) => {
    setSelected(row); setTitle(row.title); setKey(row.config_key);
    setPayloadText(JSON.stringify(row.payload ?? {}, null, 2));
    setActive(row.is_active); setSortOrder(String(row.sort_order)); setEditing(true); setShowHistory(false); setMessage(null);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    if (!title.trim() || !/^[a-z0-9][a-z0-9_-]{0,99}$/.test(key.trim())) {
      setMessage({ kind: "error", text: "Judul wajib diisi. Key gunakan huruf kecil, angka, tanda hubung, atau garis bawah." });
      return;
    }
    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(payloadText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Isi konfigurasi harus berupa objek JSON.");
      payload = parsed as Record<string, unknown>;
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Format JSON tidak valid." });
      return;
    }
    const order = Number(sortOrder);
    if (!Number.isInteger(order)) { setMessage({ kind: "error", text: "Urutan harus berupa bilangan bulat." }); return; }
    setSaving(true); setMessage(null);
    const values = { category, config_key: key.trim(), title: title.trim(), payload, is_active: active, sort_order: order, updated_by: session.user.id, updated_at: new Date().toISOString() };
    const result = selected
      ? await supabase.from("caleris_configurations").update(values).eq("id", selected.id).select("*").single()
      : await supabase.from("caleris_configurations").insert({ ...values, created_by: session.user.id }).select("*").single();
    setSaving(false);
    if (result.error) { setMessage({ kind: "error", text: result.error.message }); return; }
    setMessage({ kind: "success", text: selected ? "Konfigurasi berhasil diperbarui." : "Konfigurasi berhasil dibuat." });
    setSelected(result.data as Configuration); setEditing(false); await loadRows();
  };

  const remove = async (row: Configuration) => {
    if (!supabase || !window.confirm(`Hapus konfigurasi "${row.title}"? Riwayat perubahan tetap disimpan.`)) return;
    const { error } = await supabase.from("caleris_configurations").delete().eq("id", row.id);
    if (error) setMessage({ kind: "error", text: error.message });
    else { setMessage({ kind: "success", text: "Konfigurasi dihapus. Snapshot tetap tersedia di riwayat." }); if (selected?.id === row.id) resetEditor(); await loadRows(); }
  };

  const counts = useMemo(() => categories.reduce((acc, item) => ({ ...acc, [item.id]: rows.length && item.id === category ? rows.length : 0 }), {} as Record<Category, number>), [category, rows]);
  const current = selected && !editing ? selected : null;

  return <section className="workspace config-workspace">
    <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
    <div className="config-heading">
      <div><p className="config-eyebrow">ADMIN CONTROL · SYSTEM SETTINGS</p><h1>Configuration Center</h1><p>Kelola ketentuan CALERIS dari website. Nilai dan nominal tidak ditanam di source code.</p></div>
      <span className="config-admin-mark"><ShieldCheck size={16}/> ADMIN ONLY</span>
    </div>
    <div className="config-category-grid">
      {categories.map((item) => <button type="button" key={item.id} className={category === item.id ? "config-category active" : "config-category"} onClick={() => { setCategory(item.id); resetEditor(); setMessage(null); }}>
        <span><Layers3 size={17}/>{item.label}</span><small>{item.description}</small>{item.id === category && <strong>{counts[item.id]} item pada kategori ini</strong>}
      </button>)}
    </div>
    <div className="config-main-grid">
      <section className="config-list-panel">
        <div className="config-panel-heading"><div><span className="config-eyebrow">CONFIGURATION LIBRARY</span><h2>{categoryInfo.label} Configuration</h2></div><button type="button" className="config-primary-button" onClick={beginCreate}><Plus size={16}/> Tambah</button></div>
        <p className="config-description">{categoryInfo.description}</p>
        {loading ? <div className="config-empty">Memuat konfigurasi...</div> : rows.length === 0 ? <div className="config-empty"><FilePlus2 size={27}/><strong>Belum ada konfigurasi</strong><span>Buat item pertama. Tidak ada nominal atau aturan lama yang dimasukkan otomatis.</span></div> :
          <div className="config-items">{rows.map((row) => <article key={row.id} className={selected?.id === row.id ? "config-item selected" : "config-item"}>
            <button type="button" className="config-item-main" onClick={() => { setSelected(row); setEditing(false); setShowHistory(false); setMessage(null); }}>
              <span className="config-item-title">{row.title}</span><code>{row.config_key}</code><small>{row.is_active ? "Aktif" : "Nonaktif"} · Urutan {row.sort_order}</small>
            </button>
            <div className="config-item-actions"><button type="button" aria-label={`Edit ${row.title}`} onClick={() => beginEdit(row)}><Pencil size={15}/></button><button type="button" aria-label={`Hapus ${row.title}`} onClick={() => void remove(row)}><Trash2 size={15}/></button></div>
          </article>)}</div>}
      </section>
      <section className="config-editor-panel">
        {editing ? <form onSubmit={save}>
          <div className="config-panel-heading"><div><span className="config-eyebrow">{selected ? "EDIT ITEM" : "NEW ITEM"}</span><h2>{selected ? "Ubah konfigurasi" : "Buat konfigurasi"}</h2></div><button type="button" className="config-icon-button" onClick={resetEditor} aria-label="Tutup editor"><X size={17}/></button></div>
          <label className="config-field">Nama konfigurasi<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required placeholder="Nama konfigurasi"/></label>
          <label className="config-field">Configuration key<input value={key} onChange={(e) => setKey(e.target.value.toLowerCase().replace(/\s+/g, "-"))} maxLength={100} required placeholder="contoh: license-tier-name"/></label>
          <label className="config-field">Detail konfigurasi <span>JSON object</span><textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} rows={13} spellCheck={false}/></label>
          <div className="config-field-row"><label className="config-field">Urutan<input type="number" step="1" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}/></label><label className="config-toggle"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}/> Aktif</label></div>
          <p className="config-hint">Semua detail disimpan sebagai data yang dapat diubah Admin. Gunakan JSON untuk menambahkan persyaratan atau properti baru tanpa mengubah struktur aplikasi.</p>
          <div className="config-form-actions"><button type="submit" className="config-primary-button" disabled={saving}><Save size={16}/>{saving ? "Menyimpan..." : "Simpan konfigurasi"}</button><button type="button" className="config-secondary-button" onClick={resetEditor}>Batal</button></div>
        </form> : current ? <div>
          <div className="config-panel-heading"><div><span className="config-eyebrow">CONFIGURATION DETAIL</span><h2>{current.title}</h2></div><button type="button" className="config-icon-button" onClick={() => beginEdit(current)} aria-label="Edit konfigurasi"><Pencil size={16}/></button></div>
          <div className="config-detail-meta"><code>{current.config_key}</code><span>{current.is_active ? "Aktif" : "Nonaktif"}</span><small>Diperbarui {prettyDate(current.updated_at)}</small></div>
          <pre className="config-json-preview">{JSON.stringify(current.payload, null, 2)}</pre>
          <button type="button" className="config-history-button" onClick={() => setShowHistory((value) => !value)}><History size={16}/>{showHistory ? "Tutup riwayat" : "Lihat riwayat perubahan"}</button>
          {showHistory && <div className="config-history-list">{revisions.length ? revisions.map((revision) => <article key={revision.id}><span>{revision.action}</span><strong>{revision.title}</strong><small><Clock3 size={13}/>{prettyDate(revision.changed_at)}</small><pre>{JSON.stringify(revision.payload, null, 2)}</pre></article>) : <p>Belum ada riwayat yang dapat ditampilkan.</p>}</div>}
        </div> : <div className="config-empty config-editor-empty"><Check size={26}/><strong>Pilih konfigurasi</strong><span>Pilih item di sebelah kiri atau buat konfigurasi baru untuk mulai mengatur CALERIS.</span></div>}
      </section>
    </div>
    {message && <div className={message.kind === "success" ? "config-message success" : "config-message error"} role="status">{message.text}</div>}
    <div className="config-security-note"><ShieldCheck size={17}/><p>Perubahan hanya dapat dilakukan oleh akun yang terdaftar di <code>site_admins</code>. Database memeriksa akses melalui Row Level Security dan menyimpan snapshot setiap perubahan.</p></div>
  </section>;
}
