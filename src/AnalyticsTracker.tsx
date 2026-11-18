import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const measurementId = (import.meta.env as ImportMetaEnv & { VITE_GA_MEASUREMENT_ID?: string }).VITE_GA_MEASUREMENT_ID?.trim();

export function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    const sendPageView = () => {
      if (!measurementId || localStorage.getItem("caleris-analytics-consent") !== "granted") return;
      if (!document.getElementById("caleris-ga-script")) {
        window.dataLayer = window.dataLayer || [];
        window.gtag = window.gtag || function (...args: unknown[]) { window.dataLayer?.push(args); };
        const script = document.createElement("script");
        script.id = "caleris-ga-script";
        script.async = true;
        script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
        document.head.appendChild(script);
        window.gtag("js", new Date());
        window.gtag("config", measurementId, { send_page_view: false });
      }
      window.gtag?.("event", "page_view", { page_path: location.pathname + location.search });
    };
    const onConsentChange = () => sendPageView();
    sendPageView();
    window.addEventListener("caleris-analytics-consent-changed", onConsentChange);
    return () => window.removeEventListener("caleris-analytics-consent-changed", onConsentChange);
  }, [location.pathname, location.search]);

  return null;
}

export function AnalyticsConsentSettings() {
  const [consent, setConsent] = React.useState<"granted" | "denied">(() =>
    localStorage.getItem("caleris-analytics-consent") === "granted" ? "granted" : "denied"
  );
  const update = (value: "granted" | "denied") => {
    localStorage.setItem("caleris-analytics-consent", value);
    setConsent(value);
    window.dispatchEvent(new Event("caleris-analytics-consent-changed"));
  };
  return <div className="admin-section">
    <h2>Analytics Privacy</h2>
    <p className="field-hint">CALERIS hanya mengirim statistik kunjungan jika kamu mengizinkan. Tanpa Measurement ID atau persetujuan, tidak ada analytics yang dimuat.</p>
    <div className="admin-actions">
      <button className={consent === "granted" ? "action primary" : "action"} onClick={() => update("granted")}>Izinkan analytics</button>
      <button className={consent === "denied" ? "action primary" : "action"} onClick={() => update("denied")}>Tolak analytics</button>
    </div>
    <span className="field-hint">Status: {consent === "granted" ? "Diizinkan" : "Tidak diizinkan"}</span>
  </div>;
}
