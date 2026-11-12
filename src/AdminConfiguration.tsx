import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, Check, Clock3, FilePlus2, History, Layers3, Pencil, Plus, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

type Category = "license" | "economy" | "roles" | "regulations";
type FieldType = "text" | "number" | "boolean" | "long_text";
type FieldValue = string | boolean;
type DetailField = { id: string; label: string; type: FieldType; value: FieldValue };
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

const prettyDate = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const humanize = (value: string) => value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const makeField = (): DetailField => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label: "", type: "text", value: "" });

function fieldsFromPayload(payload: Record<string, unknown>): DetailField[] {
  return Object.entries(payload ?? {}).map(([label, value], index) => {
    if (typeof value === "boolean") return { id: `saved-${index}`, label: humanize(label), type: "boolean", value };
    if (typeof value === "number") return { id: `saved-${index}`, label: humanize(label), type: "number", value: String(value) };
    return { id: `saved-${index}`, label: humanize(label), type: "text", value: typeof value === "string" ? value : value == null ? "" : String(value) };
  });
}

function payloadFromFields(fields: DetailField[]): Record<string, unknown> {
  return fields.reduce<Record<string, unknown>>((payload, field) => {
    const key = slugify(field.label);
    if (field.type === "boolean") payload[key] = Boolean(field.value);
    else if (field.type === "number") payload[key] = Number(field.value);
    else payload[key] = String(field.value);
    return payload;
  }, {});
}

function DetailList({ payload, empty = "Belum ada detail tambahan." }: { payload: Record<string, unknown>; empty?: string }) {
  const entries = Object.entries(payload ?? {});
  if (!entries.length) return <p className="config-no-details">{empty}</p>;
  return <dl className="config-detail-list">{entries.map(([key, value]) => <div key={key}>
    <dt>{humanize(key)}</dt>
    <dd>{typeof value === "boolean" ? (value ? "Ya" : "Tidak") : String(value ?? "—")}</dd>
  </div>)}</dl>;
}

export default function AdminConfiguration({ session }: { session: Session }) {
  const [category, setCategory] = useState<Category>("license");
  const [rows, setRows] = useState<Configuration[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [selected, setSelected] = useState<Configuration | null>(null);
  const [title, setTitle] = useState("");
  const [fields, setFields] = useState<DetailField[]>([]);
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
    setSelected(null); setTitle(""); setFields([]);
    setActive(true); setSortOrder("0"); setEditing(false); setShowHistory(false); setRevisions([]);
  };
  const beginCreate = () => { resetEditor(); setEditing(true); setMessage(null); };
  const beginEdit = (row: Configuration) => {
    setSelected(row); setTitle(row.title); setFields(fieldsFromPayload(row.payload ?? {}));
    setActive(row.is_active); setSortOrder(String(row.sort_order)); setEditing(true); setShowHistory(false); setMessage(null);
  };
  const updateField = (id: string, patch: Partial<DetailField>) => setFields((current) => current.map((field) => field.id === id ? { ...field, ...patch } : field));

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    if (!title.trim()) { setMessage({ kind: "error", text: "Nama konfigurasi wajib diisi." }); return; }
    const invalidField = fields.find((field) => !field.label.trim() || (field.type === "number" && String(field.value).trim() !== "" && !Number.isFinite(Number(field.value))));
    if (invalidField) { setMessage({ kind: "error", text: invalidField.type === "number" ? "Periksa kembali angka pada detail konfigurasi." : "Setiap detail harus memiliki nama." }); return; }
    const keys = fields.map((field) => slugify(field.label));
    if (keys.some((key) => !key) || new Set(keys).size !== keys.length) {
      setMessage({ kind: "error", text: "Nama detail tidak boleh kosong atau duplikat." }); return;
    }
    const order = Number(sortOrder);
    if (!Number.isInteger(order)) { setMessage({ kind: "error", text: "Urutan harus berupa bilangan bulat." }); return; }
    setSaving(true); setMessage(null);
    const configKey = selected?.config_key ?? `${slugify(title) || "configuration"}-${Date.now().toString(36)}`;
    const values = { category, config_key: configKey, title: title.trim(), payload: payloadFromFields(fields), is_active: active, sort_order: order, updated_by: session.user.id, updated_at: new Date().toISOString() };
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

  const counts = useMemo(() => categories.reduce((acc, item) => ({ ...acc, [item.id]: item.id === category ? rows.length : 0 }), {} as Record<Category, number>), [category, rows]);
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
              <span className="config-item-title">{row.title}</span><small>{row.is_active ? "Aktif" : "Nonaktif"} · Urutan {row.sort_order}</small>
            </button>
            <div className="config-item-actions"><button type="button" aria-label={`Edit ${row.title}`} onClick={() => beginEdit(row)}><Pencil size={15}/></button><button type="button" aria-label={`Hapus ${row.title}`} onClick={() => void remove(row)}><Trash2 size={15}/></button></div>
          </article>)}</div>}
      </section>
      <section className="config-editor-panel">
        {editing ? <form onSubmit={save}>
          <div className="config-panel-heading"><div><span className="config-eyebrow">{selected ? "EDIT ITEM" : "NEW ITEM"}</span><h2>{selected ? "Ubah konfigurasi" : "Buat konfigurasi"}</h2></div><button type="button" className="config-icon-button" onClick={resetEditor} aria-label="Tutup editor"><X size={17}/></button></div>
          <label className="config-field">Nama konfigurasi<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required placeholder="Contoh: Gold License"/></label>
          <div className="config-fields-heading"><div><strong>Detail konfigurasi</strong><span>Tambahkan informasi yang ingin diatur. Pilih tipe data yang sesuai.</span></div><button type="button" className="config-add-field" onClick={() => setFields((current) => [...current, makeField()])}><Plus size={15}/> Tambah detail</button></div>
          {fields.length === 0 ? <div className="config-fields-empty">Belum ada detail. Tekan <strong>Tambah detail</strong> untuk mulai mengisi.</div> :
            <div className="config-fields-list">{fields.map((field, index) => <div className="config-field-card" key={field.id}>
              <div className="config-field-card-head"><span>DETAIL {index + 1}</span><button type="button" aria-label={`Hapus detail ${index + 1}`} onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))}><Trash2 size={15}/></button></div>
              <label className="config-field">Nama detail<input value={field.label} onChange={(e) => updateField(field.id, { label: e.target.value })} maxLength={100} placeholder="Contoh: Gaji minimum (¢p)"/></label>
              <label className="config-field">Jenis input<select value={field.type} onChange={(e) => { const type = e.target.value as FieldType; updateField(field.id, { type, value: type === "boolean" ? false : String(field.value === true ? "Ya" : field.value === false ? "Tidak" : field.value) }); }}>
                <option value="text">Teks singkat</option><option value="number">Angka</option><option value="boolean">Ya / Tidak</option><option value="long_text">Teks panjang</option>
              </select></label>
              {field.type === "boolean" ? <label className="config-boolean-input"><input type="checkbox" checked={Boolean(field.value)} onChange={(e) => updateField(field.id, { value: e.target.checked })}/><span>{field.value ? "Ya" : "Tidak"}</span></label> :
                field.type === "long_text" ? <label className="config-field">Isi detail<textarea value={String(field.value)} onChange={(e) => updateField(field.id, { value: e.target.value })} rows={4} placeholder="Tulis keterangan lengkap..."/></label> :
                <label className="config-field">Isi detail<input type={field.type === "number" ? "number" : "text"} step={field.type === "number" ? "any" : undefined} value={String(field.value)} onChange={(e) => updateField(field.id, { value: e.target.value })} placeholder={field.type === "number" ? "Masukkan angka" : "Tulis nilai..."}/></label>}
            </div>)}</div>}
          <div className="config-field-row"><label className="config-field">Urutan<input type="number" step="1" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}/></label><label className="config-toggle"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}/> Aktif</label></div>
          <p className="config-hint">Semua detail dapat ditambah, diubah, atau dihapus kapan saja. Pengaturan tersimpan otomatis ke database saat tombol Simpan ditekan.</p>
          <div className="config-form-actions"><button type="submit" className="config-primary-button" disabled={saving}><Save size={16}/>{saving ? "Menyimpan..." : "Simpan konfigurasi"}</button><button type="button" className="config-secondary-button" onClick={resetEditor}>Batal</button></div>
        </form> : current ? <div>
          <div className="config-panel-heading"><div><span className="config-eyebrow">CONFIGURATION DETAIL</span><h2>{current.title}</h2></div><button type="button" className="config-icon-button" onClick={() => beginEdit(current)} aria-label="Edit konfigurasi"><Pencil size={16}/></button></div>
          <div className="config-detail-meta"><span>{current.is_active ? "Aktif" : "Nonaktif"}</span><small>Diperbarui {prettyDate(current.updated_at)}</small></div>
          <DetailList payload={current.payload}/>
          <button type="button" className="config-history-button" onClick={() => setShowHistory((value) => !value)}><History size={16}/>{showHistory ? "Tutup riwayat" : "Lihat riwayat perubahan"}</button>
          {showHistory && <div className="config-history-list">{revisions.length ? revisions.map((revision) => <article key={revision.id}><span>{revision.action === "INSERT" ? "DIBUAT" : revision.action === "UPDATE" ? "DIPERBARUI" : "DIHAPUS"}</span><strong>{revision.title}</strong><small><Clock3 size={13}/>{prettyDate(revision.changed_at)}</small><DetailList payload={revision.payload} empty="Tidak ada detail pada versi ini."/></article>) : <p>Belum ada riwayat yang dapat ditampilkan.</p>}</div>}
        </div> : <div className="config-empty config-editor-empty"><Check size={26}/><strong>Pilih konfigurasi</strong><span>Pilih item di sebelah kiri atau buat konfigurasi baru untuk mulai mengatur CALERIS.</span></div>}
      </section>
    </div>
    {message && <div className={message.kind === "success" ? "config-message success" : "config-message error"} role="status">{message.text}</div>}
    <div className="config-security-note"><ShieldCheck size={17}/><p>Perubahan hanya dapat dilakukan oleh akun yang terdaftar di <code>site_admins</code>. Database memeriksa akses melalui Row Level Security dan menyimpan snapshot setiap perubahan.</p></div>
  </section>;
}
