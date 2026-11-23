import { useEffect, useState } from "react";
import CaleMascot from "./CaleMascot";

type Step = {
  id: string;
  title: string;
  body: string;
  designId: string;
  target: string;
};

const STEPS: Step[] = [
  { id: "welcome", title: "Selamat datang di Paddock Access", body: "Saya Cale. Saya akan memandu kamu melengkapi profil dan mengirim pengajuan role. Siapkan informasi yang benar sebelum melanjutkan.", designId: "welcome_wave", target: "Panduan umum" },
  { id: "avatar", title: "Pasang foto profil", body: "Pilih foto JPG, PNG, atau WebP. Kamu bisa mengatur posisi foto sebelum mengonfirmasi hasilnya.", designId: "tutorial_present", target: "Foto profil" },
  { id: "identity", title: "Lengkapi identitas dasar", body: "Isi nama panggilan dan tanggal lahir sesuai informasi yang benar. Batas usia minimum mengikuti ketentuan Paddock Access.", designId: "tutorial_explain", target: "Identitas" },
  { id: "location", title: "Pilih lokasi", body: "Tentukan kewarganegaraan dan hometown. Pilih data yang paling sesuai dengan identitasmu.", designId: "tutorial_point_screen", target: "Nationality & Hometown" },
  { id: "nickname", title: "Tentukan Caleris Nickname", body: "Nickname ini digunakan sebagai identitas kamu di platform. Pastikan mudah dikenali dan tidak melebihi batas karakter.", designId: "tutorial_attention", target: "Caleris Nickname" },
  { id: "role", title: "Pilih preferensi role", body: "Pilih Driver atau Team Owner. Pilihan ini menentukan jenis pengajuan yang akan diperiksa Admin, bukan persetujuan otomatis.", designId: "tutorial_point_screen", target: "Preferensi role" },
  { id: "privacy", title: "Periksa persetujuan dan kirim", body: "Baca persetujuan privasi, centang jika setuju, lalu periksa kembali data sebelum mengirim pengajuan. Status pengajuan dapat dipantau setelah dikirim.", designId: "tutorial_encourage", target: "Persetujuan & pengajuan" },
];

export default function CaleAccountTutorial({ userId }: { userId: string }) {
  const storageKey = `caleris:cale:paddock-tutorial:v1:${userId}`;
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    try {
      setOpen(localStorage.getItem(storageKey) !== "completed");
    } catch {
      setOpen(false);
    }
  }, [storageKey]);

  const finish = () => {
    try {
      localStorage.setItem(storageKey, "completed");
    } catch {
      // The tutorial remains usable when browser storage is unavailable.
    }
    setOpen(false);
  };

  const step = STEPS[stepIndex];
  return (
    <>
      <button type="button" className="cale-tutorial-reopen" onClick={() => { setStepIndex(0); setOpen(true); }}>
        <CaleMascot designId="tutorial_present" context="onboarding" size={30} eager />
        <span>Panduan Cale</span>
      </button>
      {open && (
        <div className="cale-tutorial-backdrop" role="presentation">
          <section className="cale-tutorial-dialog" role="dialog" aria-modal="true" aria-labelledby="cale-tutorial-title">
            <header className="cale-tutorial-header">
              <div><span>CALERIS MASTERS · PADDOCK ACCESS</span><strong>Panduan Akun bersama Cale</strong></div>
              <button type="button" aria-label="Tutup panduan" onClick={finish}>×</button>
            </header>
            <div className="cale-tutorial-progress" aria-label={`Langkah ${stepIndex + 1} dari ${STEPS.length}`}>
              {STEPS.map((item, index) => <span key={item.id} className={index <= stepIndex ? "is-complete" : ""} />)}
            </div>
            <div className="cale-tutorial-content">
              <CaleMascot designId={step.designId} context="onboarding" size={112} eager className="cale-tutorial-character" />
              <div className="cale-tutorial-copy">
                <small>LANGKAH {stepIndex + 1} / {STEPS.length} · {step.target}</small>
                <h2 id="cale-tutorial-title">{step.title}</h2>
                <p>{step.body}</p>
              </div>
            </div>
            <footer className="cale-tutorial-footer">
              <button type="button" className="cale-tutorial-skip" onClick={finish}>Lewati panduan</button>
              <div>
                <button type="button" onClick={() => setStepIndex(index => Math.max(0, index - 1))} disabled={stepIndex === 0}>Sebelumnya</button>
                {stepIndex < STEPS.length - 1
                  ? <button type="button" className="is-primary" onClick={() => setStepIndex(index => Math.min(STEPS.length - 1, index + 1))}>Lanjut</button>
                  : <button type="button" className="is-primary" onClick={finish}>Mulai isi data</button>}
              </div>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
