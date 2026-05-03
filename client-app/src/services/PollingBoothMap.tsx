import { useState, useCallback } from "react";
import { trackEvent } from "./firebase";

interface PollingBoothMapProps {
  jurisdiction: string;
  /** User's approximate area — never their exact address */
  area?: string;
  lang?: "en" | "te" | "hi";
}

const LABELS = {
  en: {
    title: "Find Your Polling Booth",
    subtitle: "Search for polling stations near you",
    placeholder: "Enter your area or constituency",
    search: "Search",
    tip: "Tip: You can also SMS 'EPIC <your EPIC number>' to 1950",
    mapAlt: "Google Map showing polling stations",
    official: "Official NVSP Booth Finder",
    open: "Open Map",
  },
  te: {
    title: "మీ పోలింగ్ బూత్ కనుగొనండి",
    subtitle: "మీ సమీపంలో పోలింగ్ కేంద్రాలను శోధించండి",
    placeholder: "మీ ప్రాంతం లేదా నియోజకవర్గం నమోదు చేయండి",
    search: "శోధించు",
    tip: "చిట్కా: మీరు 1950కి 'EPIC <మీ EPIC నంబర్>' SMS కూడా చేయవచ్చు",
    mapAlt: "పోలింగ్ కేంద్రాలను చూపించే Google మ్యాప్",
    official: "అధికారిక NVSP బూత్ ఫైండర్",
    open: "మ్యాప్ తెరవండి",
  },
  hi: {
    title: "अपना मतदान केंद्र खोजें",
    subtitle: "अपने नजदीकी मतदान केंद्र खोजें",
    placeholder: "अपना क्षेत्र या निर्वाचन क्षेत्र दर्ज करें",
    search: "खोजें",
    tip: "टिप: आप 1950 पर 'EPIC <आपका EPIC नंबर>' SMS भी कर सकते हैं",
    mapAlt: "मतदान केंद्र दिखाने वाला Google मानचित्र",
    official: "आधिकारिक NVSP बूथ खोजक",
    open: "मानचित्र खोलें",
  },
};

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY ?? "";

export default function PollingBoothMap({ jurisdiction, lang = "en" }: PollingBoothMapProps) {
  const [query, setQuery] = useState("");
  const [mapSrc, setMapSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lbl = LABELS[lang];

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    setLoading(true);
    const q = encodeURIComponent(`polling booth ${query} ${jurisdiction === "IN-AP" ? "Andhra Pradesh" : ""}`);
    if (MAPS_API_KEY && MAPS_API_KEY !== "") {
      setMapSrc(
        `https://www.google.com/maps/embed/v1/search?key=${MAPS_API_KEY}&q=${q}&zoom=14`
      );
    } else {
      // Fallback: open Google Maps in new tab (no API key needed)
      window.open(`https://www.google.com/maps/search/${q}`, "_blank", "noopener,noreferrer");
    }
    trackEvent("polling_booth_searched", { jurisdiction, query_length: query.length });
    setLoading(false);
  }, [query, jurisdiction]);

  return (
    <div role="region" aria-labelledby="map-title" style={{ marginTop: 8 }}>
      <h4 id="map-title" style={{
        fontSize: 15, fontWeight: 600, marginBottom: 4, color: "var(--ink)",
      }}>{lbl.title}</h4>
      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>{lbl.subtitle}</p>

      {/* Search row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }} role="search">
        <label htmlFor="booth-search" className="sr-only">{lbl.placeholder}</label>
        <input
          id="booth-search"
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value.slice(0, 100))}
          onKeyDown={e => { if (e.key === "Enter") handleSearch(); }}
          placeholder={lbl.placeholder}
          aria-label={lbl.placeholder}
          maxLength={100}
          style={{
            flex: 1, padding: "10px 14px", border: "1.5px solid var(--border)",
            borderRadius: 10, fontFamily: "inherit", fontSize: 14, outline: "none",
          }}
        />
        <button
          onClick={handleSearch}
          disabled={!query.trim() || loading}
          aria-label={lbl.search}
          style={{
            padding: "10px 18px", background: "var(--accent)", color: "#fff",
            border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600,
            fontSize: 14, opacity: !query.trim() ? 0.55 : 1,
          }}
        >
          {loading ? "…" : lbl.search}
        </button>
      </div>

      {/* Google Maps Embed */}
      {mapSrc && (
        <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", marginBottom: 10 }}>
          <iframe
            src={mapSrc}
            width="100%"
            height="300"
            style={{ border: 0, display: "block" }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={lbl.mapAlt}
            aria-label={lbl.mapAlt}
          />
        </div>
      )}

      {/* No API key — show direct links instead */}
      {!mapSrc && (
        <div style={{
          display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8,
        }}>
          <a
            href="https://voters.eci.gov.in/booth-locator"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={lbl.official}
            style={{
              fontSize: 13, color: "var(--accent)", textDecoration: "none",
              padding: "8px 14px", border: "1px solid var(--accent)",
              borderRadius: 8, display: "inline-block",
            }}
          >
            🗳️ {lbl.official} ↗
          </a>
          <button
            onClick={() => {
              const q = encodeURIComponent(`polling booth ${jurisdiction === "IN-AP" ? "Andhra Pradesh" : ""}`);
              window.open(`https://www.google.com/maps/search/${q}`, "_blank", "noopener,noreferrer");
              trackEvent("maps_opened", { jurisdiction });
            }}
            style={{
              fontSize: 13, color: "var(--accent)", background: "none",
              border: "1px solid var(--accent)", borderRadius: 8,
              padding: "8px 14px", cursor: "pointer",
            }}
            aria-label={lbl.open}
          >
            📍 {lbl.open} ↗
          </button>
        </div>
      )}

      <p style={{ fontSize: 12, color: "var(--muted)" }} role="note">{lbl.tip}</p>
    </div>
  );
}
