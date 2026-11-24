import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useLocation } from "react-router-dom";
import CaleMascot from "./CaleMascot";
import { resolveCaleContext } from "./cale/manifest";
import { resolveCalePageGuide } from "./cale/pageGuides";

export default function CaleAssistant() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const context = useMemo(() => resolveCaleContext(pathname), [pathname]);
  const pageGuide = useMemo(() => resolveCalePageGuide(pathname), [pathname]);
  const designId =
    context === "onboarding"
      ? "welcome_wave"
      : context === "warning"
        ? "reaction_warning"
        : context === "race"
          ? "motorsport_ready"
          : "tutorial_explain";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <aside className="cale-assistant" aria-label="Asisten Cale">
      {open && (
        <section className="cale-assistant__panel" aria-label={`Panduan halaman ${pageGuide.title}`}>
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
              size={112}
              className="cale-assistant__character"
              eager
            />
            <div className="cale-assistant__copy">
              <strong>{pageGuide.title}</strong>
              <p>{pageGuide.purpose}</p>
              <ul className="cale-assistant__guide-list">
                {pageGuide.sections.map((section) => <li key={section}>{section}</li>)}
              </ul>
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
          size={43}
          className="cale-assistant__trigger-art"
          eager
        />
        <span className="cale-assistant__trigger-label">CALE</span>
      </button>
    </aside>
  );
}
