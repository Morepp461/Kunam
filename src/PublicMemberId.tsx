import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Award, Crown, Medal, ShieldCheck, Target, TrendingUp, Vote } from "lucide-react";
import { supabase } from "./lib/supabase";
import "./community-progression.css";

const badgeIcon = (value: string) => ({
  award: Award, medal: Medal, vote: Vote, target: Target, crown: Crown,
  "trending-up": TrendingUp, "shield-check": ShieldCheck,
} as Record<string, any>)[value] ?? Medal;

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
  const templateKey = card.template_key || "license_bronze";
  const selectedBadgeCodes: string[] = Array.isArray(card.selected_badges) ? card.selected_badges : [];
  const selectedBadges = badges.filter((badge: any) => selectedBadgeCodes.includes(badge.code)).slice(0, 3);
  const avatarUrl = member.avatar_path && supabase
    ? supabase.storage.from("profile-avatars").getPublicUrl(member.avatar_path).data.publicUrl
    : "";

  return <main className="cp-page cp-public-id">
    <header className="cp-header"><div><small>CALERIS MASTERS · VERIFIED MEMBER</small><h1>Digital ID</h1><p>Public identity card and earned achievements.</p></div><ShieldCheck size={30} /></header>
    <section className={"cp-id cp-id-public cp-id-template cp-id-template--" + templateKey}
      data-layout={card.layout_variant || "license-badge"}
      style={{ ["--id-accent" as any]: card.accent_color || "#b99752" }}>
      <div className="cp-id-brand"><img src="/assets/Add%20a%20heading_20260907_003952_0000.png" alt="CALERIS MASTERS logo" /></div>
      <div className="cp-id-personalization">
        <div className="cp-id-tagline">{card.tagline || "CALERIS MASTERS Member"}</div>
        <div className="cp-id-selected-badges">{selectedBadges.map((badge: any) => <span key={badge.code}>{badge.title}</span>)}</div>
      </div>
      <div className="cp-id-photo">{avatarUrl ? <img src={avatarUrl} alt="Member portrait" /> : <span>{(member.character_name || "CM").slice(0, 2).toUpperCase()}</span>}</div>
      <div className="cp-id-main">
        <small>{card.template_title || templateKey.replace(/_/g, " ")}</small>
        <h1>{member.character_name}</h1>
        <p>{member.role} · {member.license || "UNLICENSED"}</p>
        <p>{member.team_name || "Independent"} · {member.member_code}</p>
        {member.role === "Driver" && <p><strong>Market Value:</strong> {member.market_value_eur == null ? "Belum tersedia" : "€ " + Number(member.market_value_eur).toLocaleString("id-ID")}</p>}
        <div className="cp-id-level"><strong>LV {Number(progression.level ?? 0)}</strong><span>{Number(progression.xp ?? 0).toLocaleString("id-ID")} XP</span></div>
      </div>
      <div className="cp-id-template-seal">CALERIS<br/>VERIFIED</div>
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
        {badges.map((badge: any) => {
          const Icon = badgeIcon(badge.icon);
          return <article key={badge.code} className="earned">
            <div className="cp-badge-icon"><Icon size={22} /></div>
            <strong>{badge.title}</strong><p>{badge.description}</p><small>{badge.rarity || "Standard"}</small>
          </article>;
        })}
        {!badges.length && <article>No public achievements available.</article>}
      </div>
    </section>
    <footer className="cp-public-footer"><ShieldCheck size={16} /> Verified from CALERIS MASTERS public Digital ID records.</footer>
  </main>;
}
