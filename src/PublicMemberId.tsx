import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Award, ShieldCheck } from "lucide-react";
import { supabase } from "./lib/supabase";
import "./community-progression.css";

export default function PublicMemberId() {
  const { memberCode = "" } = useParams();
  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      if (!supabase) {
        if (active) { setUnavailable(true); setLoading(false); }
        return;
      }
      const { data, error } = await supabase.rpc("caleris_get_public_digital_id", { p_member_code: memberCode });
      if (!active) return;
      if (error || !data?.member || !data?.card) {
        setUnavailable(true);
        setRecord(null);
      } else {
        setUnavailable(false);
        setRecord(data);
      }
      setLoading(false);
    };
    if (memberCode) void load();
    else { setUnavailable(true); setLoading(false); }
    return () => { active = false; };
  }, [memberCode]);

  if (loading) return <main className="cp-page"><p>Memverifikasi Digital ID...</p></main>;
  if (unavailable || !record) return <main className="cp-page cp-public-id">
    <section className="cp-section"><ShieldCheck size={28} /><h1>Digital ID tidak tersedia</h1>
      <p>Member ini tidak mengaktifkan halaman verifikasi publik atau kode member tidak ditemukan.</p>
      <Link to="/">Kembali ke CALERIS MASTERS</Link>
    </section>
  </main>;

  const { member, card, badges = [], milestones = [], progression = { xp: 0, level: 0 } } = record;
  return <main className="cp-page cp-public-id">
    <header className="cp-header"><div><small>CALERIS MASTERS · VERIFIED MEMBER</small><h1>Digital ID</h1><p>Public identity card and earned achievements.</p></div><ShieldCheck size={30} /></header>
    <section className="cp-id cp-id-public" style={{ borderColor: card.accent_color || "#b99752" }}>
      <div className="cp-id-top"><span>CALERIS MASTERS</span><span>{String(card.theme || "classic").toUpperCase()}</span></div>
      <h1>{member.character_name}</h1>
      <p>{member.role} · {member.license || "UNLICENSED"}</p>
      <p>{member.team_name || "Independent"} · {member.member_code}</p>
      <div className="cp-id-bottom">{card.tagline || "CALERIS MASTERS Member"}</div>
    </section>
    <section className="cp-section cp-public-progress">
      <h2>Account Progression</h2>
      <div className="cp-grid cp-stats">
        <article><span>Account Level</span><strong>LV {Number(progression.level ?? 0)}</strong></article>
        <article><span>Cumulative XP</span><strong>{Number(progression.xp ?? 0).toLocaleString("id-ID")}</strong></article>
        <article><span>Milestones</span><strong>{milestones.length}</strong></article>
      </div>
      <h3>Completed Career Milestones</h3>
      <div className="cp-grid cp-milestone-grid">
        {milestones.map((milestone: any) => <article key={milestone.code} className="earned">
          <strong>{milestone.title}</strong><p>{milestone.description}</p>
          <small>Completed {milestone.completed_at ? new Date(milestone.completed_at).toLocaleDateString("id-ID") : ""}</small>
        </article>)}
        {!milestones.length && <article>Belum ada milestone yang dipublikasikan.</article>}
      </div>
    </section>
    <section className="cp-section">
      <h2><Award size={19} /> Earned Achievements</h2>
      <div className="cp-grid cp-badges">
        {badges.map((badge: any) => <article key={badge.code} className="earned">
          <div className="cp-badge-icon">{badge.icon || <Award size={22} />}</div>
          <strong>{badge.title}</strong><p>{badge.description}</p><small>{badge.rarity || "Standard"}</small>
        </article>)}
        {!badges.length && <article>No public achievements available.</article>}
      </div>
    </section>
    <footer className="cp-public-footer"><ShieldCheck size={16} /> Verified from CALERIS MASTERS public Digital ID records.</footer>
  </main>;
}
