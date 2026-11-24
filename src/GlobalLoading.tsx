import { useEffect, useState } from "react";
import CaleMascot from "./CaleMascot";
import "./global-loading.css";

const MESSAGE = "Cale sedang memproses...";

export default function GlobalLoading() {
  const [typedMessage, setTypedMessage] = useState("");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTypedMessage(MESSAGE);
      return;
    }

    let cursor = 0;
    let timeoutId = 0;

    const typeNextCharacter = () => {
      setTypedMessage(MESSAGE.slice(0, cursor));
      if (cursor < MESSAGE.length) {
        cursor += 1;
        timeoutId = window.setTimeout(typeNextCharacter, 68);
        return;
      }

      timeoutId = window.setTimeout(() => {
        cursor = 0;
        setTypedMessage("");
        typeNextCharacter();
      }, 900);
    };

    typeNextCharacter();
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <div className="cale-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="cale-loading__content">
        <CaleMascot
          context="general"
          outfitOverride="racing"
          size={76}
          className="cale-loading__mascot"
          eager
        />
        <svg
          className="cale-loading__heartbeat"
          viewBox="0 0 340 100"
          role="img"
          aria-label="Animasi heartbeat"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            className="cale-loading__heartbeat-base"
            d="M 5 50 H 112 L 128 50 L 145 12 L 166 88 L 183 50 H 335"
            fill="none"
            pathLength="100"
          />
          <path
            className="cale-loading__heartbeat-trace"
            d="M 5 50 H 112 L 128 50 L 145 12 L 166 88 L 183 50 H 335"
            fill="none"
            pathLength="100"
          />
        </svg>
        <p className="cale-loading__message">
          <span aria-hidden="true">{typedMessage}</span>
          <span className="cale-loading__cursor" aria-hidden="true" />
          <span className="cale-loading__sr-only">{MESSAGE}</span>
        </p>
      </div>
    </div>
  );
}
