import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import "./developer-api.css";

const OWNER_USER_ID = "cf35c0be-f660-49ab-a56f-9a3080b8252d";
const SCOPE_OPTIONS = [
  ["circuits:read", "Circuit database"],
  ["seasons:read", "Season calendar"],
  ["teams:read", "Team directory"],
  ["drivers:read", "Driver directory"],
  ["rounds:read", "Race rounds"],
] as const;
type Scope = typeof SCOPE_OPTIONS[number][0];
type ApiKey = { id: string; name: string; key_prefix: string; scopes: Scope[]; expires_at: string | null; last_used_at: string | null; revoked_at: string | null; created_at: string };

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function digest(value: string) {
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export default function DeveloperAPI({ session }: { session: Session }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Scope[]>(["circuits:read", "seasons:read"]);
  const [expires, setExpires] = useState("never");
  const [newSecret, setNewSecret] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/caleris-integrations`;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "YOUR_SUPABASE_PUBLISHABLE_KEY";

  const load = useCallback(async () => {
    if (!supabase || session.user.id !== OWNER_USER_ID) { setError("Akses developer ditolak."); setLoading(false); return; }
    setLoading(true); setError("");
    const { data, error: loadError } = await supabase.from("caleris_api_keys")
      .select("id,name,key_prefix,scopes,expires_at,last_used_at,revoked_at,created_at")
      .eq("owner_user_id", OWNER_USER_ID).order("created_at", { ascending: false });
    if (loadError) setError(loadError.message);
    setKeys((data || []) as ApiKey[]);
    setLoading(false);
  }, [session.user.id]);

  useEffect(() => { void load(); }, [load]);

  const activeCount = useMemo(() => keys.filter((key) => !key.revoked_at && (!key.expires_at || new Date(key.expires_at).getTime() > Date.now())).length, [keys]);

  const createKey = async () => {
    if (!supabase || session.user.id !== OWNER_USER_ID) return;
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 80 || scopes.length === 0) { setError("Isi nama integrasi dan pilih minimal satu izin."); return; }
    setCreating(true); setError(""); setNewSecret("");
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const secret = "cm_live_" + encodeBase64Url(bytes);
    const keyHash = await digest(secret);
    const expiresAt = expires === "never" ? null : new Date(Date.now() + Number(expires) * 86400000).toISOString();
    const { error: insertError } = await supabase.from("caleris_api_keys").insert({
      owner_user_id: OWNER_USER_ID, name: cleanName, key_hash: keyHash,
      key_prefix: secret.slice(0, 18) + "…", scopes, expires_at: expiresAt,
    });
    setCreating(false);
    if (insertError) { setError(insertError.message); return; }
    setNewSecret(secret); setName(""); await load();
  };

  const revokeKey = async (key: ApiKey) => {
    if (!supabase || key.revoked_at || !window.confirm("Cabut API Key " + key.name + "? Integrasi yang memakainya akan langsung kehilangan akses.")) return;
    const { error: revokeError } = await supabase.from("caleris_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", key.id);
    if (revokeError) setError(revokeError.message); else await load();
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  };

  if (session.user.id !== OWNER_USER_ID) return <section className="workspace"><div className="developer-api-denied"><ShieldCheck/><h1>Akses ditolak</h1><p>Developer API hanya tersedia untuk pemilik CALERIS MASTERS.</p></div></section>;

  return <section className="workspace developer-api-page">
    <header className="developer-api-heading"><div><span className="section-eyebrow">OWNER CONTROL · INTEGRATION GATEWAY</span><h1>Developer API & MCP</h1><p>Kelola koneksi aplikasi eksternal dan AI ke data resmi CALERIS MASTERS.</p></div><button className="economy-secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button></header>
    <div className="developer-api-stats"><article><span>API Key aktif</span><strong>{activeCount}</strong></article><article><span>Total key</span><strong>{keys.length}</strong></article><article><span>Transport</span><strong>REST + MCP</strong></article></div>
    <div className="developer-api-security"><ShieldCheck/><div><strong>Owner-only access</strong><p>Hanya akun pemilik yang dapat membuat dan mencabut key. Secret ditampilkan sekali, disimpan sebagai SHA-256 hash, dan tidak dapat dipulihkan setelah dialog ditutup.</p></div></div>
    <div className="workspace-card developer-api-create">
      <div className="section-title-row"><div><span className="section-eyebrow">NEW INTEGRATION</span><h2>Buat API Key</h2></div><KeyRound/></div>
      <label>Nama integrasi<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Contoh: Caleris AI Assistant"/></label>
      <div className="developer-api-scopes"><strong>Hak akses data</strong>{SCOPE_OPTIONS.map(([value,label])=><label key={value}><input type="checkbox" checked={scopes.includes(value)} onChange={(event) => setScopes((current) => event.target.checked ? [...current,value] : current.filter((item) => item !== value))}/><span>{label}</span><small>{value}</small></label>)}</div>
      <label>Masa berlaku<select value={expires} onChange={(event) => setExpires(event.target.value)}><option value="never">Tanpa kedaluwarsa</option><option value="30">30 hari</option><option value="90">90 hari</option><option value="365">1 tahun</option></select></label>
      <button className="action primary" onClick={() => void createKey()} disabled={creating}><Plus size={16}/>{creating ? "Membuat..." : "Buat API Key"}</button>
    </div>
    {newSecret && <div className="developer-api-secret"><div><span className="section-eyebrow">COPY NOW · SHOWN ONCE</span><strong>API Key berhasil dibuat</strong><p>Simpan secret ini di password manager atau secret manager aplikasi yang akan dihubungkan. Jangan tempel di frontend publik.</p></div><code>{newSecret}</code><button className="action primary" onClick={() => void copy(newSecret)}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? "Tersalin" : "Salin API Key"}</button><button className="developer-api-dismiss" onClick={() => setNewSecret("")}>Tutup secret</button></div>}
    {error && <p className="developer-api-error" role="alert">{error}</p>}
    <div className="workspace-card developer-api-endpoints"><span className="section-eyebrow">CONNECTION DETAILS</span><h2>Endpoint integrasi</h2><label>REST API base URL<code>{endpoint}/v1</code></label><label>MCP Server URL<code>{endpoint}/mcp</code></label><label>Authentication header<code>Authorization: Bearer YOUR_CALERIS_API_KEY</code></label><label>Supabase gateway header<code>apikey: {publishableKey}</code></label><p>Semua endpoint bersifat read-only. Setiap API Key hanya dapat membaca resource yang dicentang saat key dibuat.</p><pre>{`curl -H "Authorization: Bearer YOUR_CALERIS_API_KEY" \\\n  -H "apikey: ${publishableKey}" \\\n  "${endpoint}/v1/circuits"`}</pre><pre>{`MCP transport: Streamable HTTP\\nHeaders: Authorization: Bearer YOUR_CALERIS_API_KEY\\n         apikey: ${publishableKey}\\nTools: list_circuits, list_seasons, list_teams, list_drivers, list_rounds`}</pre></div>
    <div className="developer-api-key-list"><div className="section-title-row"><div><span className="section-eyebrow">ACCESS MANAGEMENT</span><h2>API Keys</h2></div></div>{loading ? <p>Memuat API Keys...</p> : keys.length === 0 ? <p>Belum ada API Key.</p> : keys.map((key) => <article className="workspace-card developer-api-key" key={key.id}><div><strong>{key.name}</strong><code>{key.key_prefix}</code><small>Dibuat {dateLabel(key.created_at)} · Terakhir digunakan {dateLabel(key.last_used_at)}</small><div className="developer-api-key-scopes">{key.scopes.map((scope) => <span key={scope}>{scope}</span>)}</div></div><div className="developer-api-key-actions"><span className={key.revoked_at ? "revoked" : key.expires_at && new Date(key.expires_at).getTime() <= Date.now() ? "expired" : "active"}>{key.revoked_at ? "Revoked" : key.expires_at && new Date(key.expires_at).getTime() <= Date.now() ? "Expired" : "Active"}</span>{!key.revoked_at && <button className="action" onClick={() => void revokeKey(key)}><Trash2 size={14}/> Cabut</button>}</div></article>)}</div>
  </section>;
}
