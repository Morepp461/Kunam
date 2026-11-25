import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { X } from "lucide-react";
import { useLocation } from "react-router-dom";
import CaleMascot from "./CaleMascot";
import { resolveCaleContext } from "./cale/manifest";
import { resolveCalePageGuide } from "./cale/pageGuides";

export default function CaleAssistant() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [panelSize, setPanelSize] = useState({ width: 520, height: 420 });
  const rootRef = useRef<HTMLElement | null>(null);
  const resizeRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const context = useMemo(() => resolveCaleContext(pathname), [pathname]);
  const pageGuide = useMemo(() => resolveCalePageGuide(pathname), [pathname]);
  const designId =
    context === "onboarding" ? "welcome_wave" :
    context === "warning" ? "reaction_warning" :
    context === "race" ? "motorsport_ready" : "tutorial_explain";

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [open]);

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = { x: event.clientX, y: event.clientY, width: panelSize.width, height: panelSize.height };
  };
  const moveResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!resizeRef.current) return;
    const start = resizeRef.current;
    setPanelSize({
      width: Math.max(320, Math.min(window.innerWidth - 24, start.width + start.x - event.clientX)),
      height: Math.max(260, Math.min(window.innerHeight - 100, start.height + event.clientY - start.y))
    });
  };
  const stopResize = () => { resizeRef.current = null; };

  return (
    <aside ref={rootRef} className="cale-assistant" aria-label="Asisten Cale">
      {open && (
        <section className="cale-assistant__panel" aria-label={`Panduan halaman ${pageGuide.title}`}
          style={{ width: "min(" + panelSize.width + "px, calc(100vw - 24px))", height: "min(" + panelSize.height + "px, calc(100dvh - 100px))" }}>
          <button type="button" className="cale-assistant__resize" aria-label="Ubah ukuran panel Cale" title="Tarik untuk mengubah ukuran"
            onPointerDown={startResize} onPointerMove={moveResize} onPointerUp={stopResize} onPointerCancel={stopResize}>↖</button>
          <header className="cale-assistant__header">
            <div><span className="cale-assistant__eyebrow">CALERIS MASTERS</span><h2>Cale Assistant</h2></div>
            <button type="button" className="cale-assistant__close" aria-label="Tutup asisten Cale" onClick={() => setOpen(false)}><X size={17}/></button>
          </header>
          <div className="cale-assistant__body">
            <CaleMascot designId={designId} context={context} size={112} className="cale-assistant__character" eager/>
            <div className="cale-assistant__copy">
              <strong>{pageGuide.title}</strong><p>{pageGuide.purpose}</p>
              <ul className="cale-assistant__guide-list">{pageGuide.sections.map(section => <li key={section}>{section}</li>)}</ul>
            </div>
          </div>
        </section>
      )}
      <button type="button" className="cale-assistant__trigger" aria-label={open ? "Tutup asisten Cale" : "Buka asisten Cale"}
        aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <CaleMascot designId={designId} context={context} size={43} className="cale-assistant__trigger-art" eager/>
        <span className="cale-assistant__trigger-label">CALE</span>
      </button>
    </aside>
  );
}
