import { useMemo, useState } from "react";
import { Avatar } from "@dicebear/core";
import blobs from "@dicebear/styles/blobs.json" with { type: "json" };
import lorelei from "@dicebear/styles/lorelei.json" with { type: "json" };
import notionists from "@dicebear/styles/notionists.json" with { type: "json" };
import openPeeps from "@dicebear/styles/open-peeps.json" with { type: "json" };
import pixelArt from "@dicebear/styles/pixel-art.json" with { type: "json" };
import thumbs from "@dicebear/styles/thumbs.json" with { type: "json" };
import "./dicebear-avatar-library.css";

const AVATAR_STYLES = [
  { id: "lorelei", label: "Lorelei", definition: lorelei },
  { id: "notionists", label: "Notionists", definition: notionists },
  { id: "open-peeps", label: "Open Peeps", definition: openPeeps },
  { id: "pixel-art", label: "Pixel Art", definition: pixelArt },
  { id: "thumbs", label: "Thumbs", definition: thumbs },
  { id: "blobs", label: "Blobs", definition: blobs },
] as const;

type Props = { seed: string; onSeedChange: (value: string) => void; onApply: (dataUri: string, style: string) => Promise<void>; applying: boolean };

export default function DiceBearAvatarLibrary({ seed, onSeedChange, onApply, applying }: Props) {
  const [selectedStyle, setSelectedStyle] = useState<(typeof AVATAR_STYLES)[number]["id"]>("lorelei");
  const avatars = useMemo(() => AVATAR_STYLES.map((style) => ({
    ...style,
    dataUri: new Avatar(style.definition, { seed: seed.trim() || "CALERIS", size: 128 }).toDataUri(),
  })), [seed]);
  const selected = avatars.find((avatar) => avatar.id === selectedStyle);
  return (
    <section className="dicebear-library" aria-label="Library avatar DiceBear">
      <div className="dicebear-library-heading"><div><strong>Avatar Library · DiceBear</strong><p>Pilih gaya avatar dan ubah seed untuk membuat variasi. Semua avatar dibuat langsung di browser.</p></div></div>
      <label className="dicebear-seed-field">Nama atau seed avatar
        <input value={seed} onChange={(event) => onSeedChange(event.target.value)} maxLength={64} placeholder="Masukkan nama atau seed"/>
      </label>
      <div className="dicebear-avatar-grid">
        {avatars.map((avatar) => <button key={avatar.id} type="button" className="dicebear-avatar-option" aria-pressed={selectedStyle===avatar.id} onClick={()=>setSelectedStyle(avatar.id)} disabled={applying}>
          <img src={avatar.dataUri} alt={avatar.label+" avatar preview"} loading="lazy"/><span>{avatar.label}</span>
        </button>)}
      </div>
      <div className="dicebear-apply-row"><small>6 gaya avatar berlisensi CC0 1.0. File disimpan sebagai WebP di penyimpanan profil privat.</small>
        <button type="button" className="action primary" onClick={()=>selected&&void onApply(selected.dataUri,selected.id)} disabled={applying||!selected}>{applying?"Menyimpan avatar...":"Gunakan avatar"}</button>
      </div>
    </section>
  );
}
