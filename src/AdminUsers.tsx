import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Search, RefreshCw, UserRound, ShieldCheck, Settings2, X, ExternalLink, Users } from "lucide-react";
import { supabase } from "./lib/supabase";
import "./admin-users.css";

type UserRow = {
  user_id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  provider: string | null;
  providers: string[];
  user_metadata: { full_name: string | null; username: string | null };
  is_admin: boolean;
  profile: {
    member_id: string | null;
    public_member_id: string;
    avatar_url: string | null;
    web_nickname: string | null;
    driver_nickname: string | null;
    first_name: string | null;
    last_name: string | null;
    date_of_birth: string | null;
    nationality: string | null;
    hometown: string | null;
    preferred_role: string | null;
    account_status: string;
    onboarding_completed: boolean;
    privacy_accepted_at: string | null;
    updated_at: string | null;
  } | null;
  member: { id: string; member_code: string | null; character_name: string | null; role: string | null; license: string | null; team_id: string | null; balance: number | null; created_at: string } | null;
  team_name: string | null;
};

const preferredOptions = [
  { value: "", label: "Belum memilih" },
  { value: "Driver", label: "Driver" },
  { value: "Team Owner", label: "Team Owner" },
  { value: "FIA", label: "FIA" },
];
const assignedOptions = [
  { value: "", label: "Public / Tidak ada role aktif" },
  { value: "Driver", label: "Driver" },
  { value: "Principal", label: "Principal" },
  { value: "Owner", label: "Owner" },
  { value: "Agent", label: "Agent" },
  { value: "FIA", label: "FIA" },
];
const dateTime = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Belum tersedia";
const dateOnly = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(value))
  : "Belum tersedia";

export default function AdminUsers({ session }: { session: Session }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [preferredRole, setPreferredRole] = useState("");
  const [assignedRole, setAssignedRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) { setError("Supabase belum dikonfigurasi."); setLoading(false); return; }
    setLoading(true); setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("admin-user-management", { body: { action: "list_users" } });
    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || "Daftar akun gagal dimuat.");
      setUsers([]);
    } else {
      setUsers((data?.users ?? []) as UserRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("id-ID");
    return users.filter((user) => {
      const profile = user.profile;
      const member = user.member;
      const haystack = [
        user.email, user.user_id, user.user_metadata.full_name, user.user_metadata.username,
        profile?.public_member_id, profile?.web_nickname, profile?.driver_nickname,
        profile?.first_name, profile?.last_name, member?.character_name, member?.member_code,
        member?.role, user.team_name,
      ].filter(Boolean).join(" ").toLocaleLowerCase("id-ID");
      const matchesSearch = !needle || haystack.includes(needle);
      const status = !profile ? "unlinked" : profile.account_status;
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [users, search, statusFilter]);

  const openRoleConfig = (user: UserRow) => {
    setSelected(user);
    setPreferredRole(user.profile?.preferred_role ?? "");
    setAssignedRole(user.member?.role ?? "");
  };

  const saveRoles = async () => {
    if (!supabase || !selected) return;
    setSaving(true);
    const { data, error: invokeError } = await supabase.functions.invoke("admin-user-management", {
      body: {
        action: "update_roles",
        targetUserId: selected.user_id,
        preferredRole: preferredRole || null,
        assignedRole: assignedRole || null,
      },
    });
    setSaving(false);
    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || "Konfigurasi role gagal disimpan.");
      return;
    }
    setUsers((current) => current.map((user) => user.user_id !== selected.user_id ? user : {
      ...user,
      profile: user.profile ? { ...user.profile, preferred_role: preferredRole || null } : user.profile,
      member: user.member ? { ...user.member, role: assignedRole || null } : user.member,
    }));
    setSelected(null);
    setError("");
  };

  const stats = useMemo(() => ({
    total: users.length,
    linked: users.filter((user) => Boolean(user.profile)).length,
    admins: users.filter((user) => user.is_admin).length,
    pending: users.filter((user) => !user.profile?.onboarding_completed).length,
  }), [users]);

  return <section className="workspace admin-users-page">
    <div className="admin-users-heading">
      <div><span className="section-eyebrow">ADMIN CONTROL · ACCOUNT DIRECTORY</span><h1>Daftar Akun</h1><p>Kelola identitas akun, profil member, dan preferensi role dalam satu tempat.</p></div>
      <button type="button" className="economy-secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? "admin-users-spin" : ""}/> Refresh</button>
    </div>

    <div className="admin-users-stats">
      <article><span>Total akun</span><strong>{stats.total}</strong></article>
      <article><span>Profil terhubung</span><strong>{stats.linked}</strong></article>
      <article><span>Administrator</span><strong>{stats.admins}</strong></article>
      <article><span>Belum onboarding</span><strong>{stats.pending}</strong></article>
    </div>

    <div className="workspace-card admin-users-toolbar">
      <label className="admin-users-search"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari email, nama, Member ID, karakter, atau tim..."/></label>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter status akun">
        <option value="all">Semua status</option><option value="active">Active</option><option value="public">Public</option><option value="admin">Admin</option><option value="suspended">Suspended</option><option value="unlinked">Belum memiliki profil</option>
      </select>
      <span>{filtered.length} dari {users.length} akun</span>
    </div>

    {error && <div className="admin-users-error" role="alert">{error}</div>}
    {loading ? <div className="workspace-card admin-users-empty">Memuat seluruh akun...</div> : filtered.length === 0 ? <div className="workspace-card admin-users-empty"><Users size={26}/><strong>Tidak ada akun ditemukan</strong><span>Ubah kata pencarian atau filter status.</span></div> :
      <div className="admin-users-list">
        {filtered.map((user) => {
          const profile = user.profile;
          const member = user.member;
          const displayName = profile?.web_nickname || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || user.user_metadata.full_name || user.email || "Caleris Member";
          const profileHref = profile?.public_member_id ? `/member/${profile.public_member_id}` : null;
          return <article className="workspace-card admin-user-card" key={user.user_id}>
            <div className="admin-user-main">
              <div className="admin-user-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt=""/> : <UserRound size={22}/>}</div>
              <div className="admin-user-identity">
                {profileHref ? <a href={profileHref} className="admin-user-name">{displayName}<ExternalLink size={13}/></a> : <strong className="admin-user-name">{displayName}</strong>}
                <span>{user.email || "Email tidak tersedia"}</span>
                <small>{profile?.public_member_id ? `Member ID · ${profile.public_member_id}` : "Belum memiliki Member ID"}</small>
              </div>
              <div className="admin-user-roles">
                <span className="admin-user-role-label">Preferensi: <b>{profile?.preferred_role || "Belum memilih"}</b></span>
                <span className="admin-user-role-label">Role aktif: <b>{member?.role || (member ? "Public" : "Belum terhubung")}</b></span>
                {member?.team_id && <span className="admin-user-role-label">Tim: <b>{user.team_name || "Tim tidak ditemukan"}</b></span>}
              </div>
              <div className="admin-user-actions">
                {user.is_admin && <span className="admin-user-admin-badge"><ShieldCheck size={13}/> Admin</span>}
                <button type="button" className="action" onClick={() => openRoleConfig(user)} disabled={!profile}><Settings2 size={15}/> Konfigurasi Role</button>
              </div>
            </div>
            <div className="admin-user-meta">
              <span><b>Status akun</b>{profile?.account_status || "Belum onboarding"}</span>
              <span><b>Karakter</b>{member?.character_name || profile?.driver_nickname || "Belum terhubung"}</span>
              <span><b>License</b>{member?.license || "—"}</span>
              <span><b>Login terakhir</b>{dateTime(user.last_sign_in_at)}</span>
              <span><b>Dibuat</b>{dateTime(user.created_at)}</span>
              <span><b>Email</b>{user.email_confirmed_at ? "Terverifikasi" : "Belum terverifikasi"}</span>
            </div>
            <details className="admin-user-details">
              <summary>Lihat informasi akun lengkap</summary>
              <div className="admin-user-detail-grid">
                <span><b>Nama depan</b>{profile?.first_name || "—"}</span><span><b>Nama belakang</b>{profile?.last_name || "—"}</span>
                <span><b>Nickname web</b>{profile?.web_nickname || "—"}</span><span><b>Nickname driver</b>{profile?.driver_nickname || "—"}</span>
                <span><b>Tanggal lahir</b>{dateOnly(profile?.date_of_birth)}</span><span><b>Nationality</b>{profile?.nationality || "—"}</span>
                <span><b>Hometown</b>{profile?.hometown || "—"}</span><span><b>Provider login</b>{user.provider || user.providers.join(", ") || "—"}</span>
                <span><b>Nomor telepon</b>{user.phone || "—"}</span><span><b>Member Code</b>{member?.member_code || "—"}</span>
                <span><b>Tim</b>{user.team_name || "—"}</span><span><b>Member dibuat</b>{dateTime(member?.created_at)}</span>
                <span><b>Onboarding</b>{profile?.onboarding_completed ? "Selesai" : "Belum selesai"}</span>
                <span><b>Persetujuan privasi</b>{dateTime(profile?.privacy_accepted_at)}</span>
                <span><b>Profil diperbarui</b>{dateTime(profile?.updated_at)}</span><span><b>User UUID</b>{user.user_id}</span>
              </div>
            </details>
          </article>;
        })}
      </div>
    }

    {selected && <div className="admin-users-modal-backdrop" role="presentation" onClick={() => { if (!saving) setSelected(null); }}>
      <section className="workspace-card admin-users-modal" role="dialog" aria-modal="true" aria-labelledby="admin-role-title" onClick={(event) => event.stopPropagation()}>
        <div className="admin-users-modal-heading"><div><span className="section-eyebrow">ROLE MANAGEMENT</span><h2 id="admin-role-title">Konfigurasi Role</h2><p>{selected.email || selected.user_id}</p></div><button type="button" className="admin-users-close" onClick={() => setSelected(null)} disabled={saving} aria-label="Tutup"><X size={19}/></button></div>
        <label>Preferensi role akun<select value={preferredRole} onChange={(event) => setPreferredRole(event.target.value)}>{preferredOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>Preferensi ini mencatat pilihan user saat onboarding. Tidak memberikan akses panel.</small></label>
        <label>Role aktif member<select value={assignedRole} onChange={(event) => setAssignedRole(event.target.value)} disabled={!selected.member}><option value="">Public / Tidak ada role aktif</option>{assignedOptions.filter((option) => option.value).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>{selected.member ? "Role ini menentukan akses panel dan kapabilitas member." : "Akun belum memiliki record member. Hubungkan member melalui proses onboarding sebelum menetapkan role aktif."}</small></label>
        {selected.member?.role === "Owner" && selected.member.team_id && assignedRole !== "Owner" && <p className="admin-users-warning">Pemilik tim tidak dapat diturunkan rolenya selama tim masih terhubung.</p>}
        <div className="admin-users-modal-actions"><button type="button" className="action" onClick={() => setSelected(null)} disabled={saving}>Batal</button><button type="button" className="action primary" onClick={() => void saveRoles()} disabled={saving}>{saving ? "Menyimpan..." : "Simpan konfigurasi"}</button></div>
      </section>
    </div>}
  </section>;
}
