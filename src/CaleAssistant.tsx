import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useLocation } from "react-router-dom";
import CaleMascot from "./CaleMascot";
import { resolveCaleContext } from "./cale/manifest";

export default function CaleAssistant() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const context = useMemo(() => resolveCaleContext(pathname), [pathname]);
  const designId =
    context === "onboarding"
      ? "welcome_wave"
      : context === "warning"
        ? "reaction_warning"
        : context === "race"
          ? "motorsport_ready"
          : "idle_default";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const message =
    context === "onboarding"
      ? "Saya akan menemani proses pengaturan akun dan menjelaskan setiap langkah."
      : context === "warning"
        ? "Periksa informasi dan ketentuan yang ditampilkan sebelum melanjutkan."
        : context === "race"
          ? "Fokus pada persiapan, jadwal, dan informasi kompetisi."
          : "Saya siap membantu navigasi di CALERIS MASTERS.";

  return (
    <aside className="cale-assistant" aria-label="Asisten Cale">
      {open && (
        <section className="cale-assistant__panel" aria-label="Panel asisten Cale">
          <header className="cale-assistant__header">
            <div>
              <span className="cale-assistant__eyebrow">CALERIS MASTERS</span>
              <h2>Cale Assistant</h2>
            </div>
            <button
              type="button"
              className="cale-assistant__close"
              aria-label="Tutup asisten Cale"
              onClick={() => setOpen(false)}
            >
              <X size={17} />
            </button>
          </header>
          <div className="cale-assistant__body">
            <CaleMascot
              designId={designId}
              context={context}
              size={132}
              className="cale-assistant__character"
              eager
            />
            <div className="cale-assistant__copy">
              <strong>Halo, saya Cale.</strong>
              <p>{message}</p>
              <small>
                Tampilan pakaian menyesuaikan konteks: formal untuk onboarding,
                seragam FIA untuk peringatan, dan racing suit untuk aktivitas balap.
              </small>
            </div>
          </div>
        </section>
      )}
      <button
        type="button"
        className="cale-assistant__trigger"
        aria-label={open ? "Tutup asisten Cale" : "Buka asisten Cale"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <CaleMascot
          designId={designId}
          context={context}
          size={58}
          className="cale-assistant__trigger-art"
          eager
        />
        <span className="cale-assistant__trigger-label">CALE</span>
      </button>
    </aside>
  );
}
