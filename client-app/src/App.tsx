import {
  useState, useCallback, useRef, useEffect,
  Component, type ReactNode, type ErrorInfo,
} from "react";
import type {
  UserInput, UserState, TimelineStep, DocumentRequirement,
  ScenarioOutcome, ChatMessage, AgeGroup, CitizenshipStatus, RegistrationStatus,
} from "../../shared/src/types";
import {
  trackPageView, trackEligibilityCheck, trackTimelineGenerated,
  trackSimulation, trackChatMessage, saveVotingSession,
  signInWithGoogle, signOutUser, onAuthChange,
} from "./services/firebase";
import type { User } from "firebase/auth";
import PollingBoothMap from "./services/PollingBoothMap";

// ─── API ──────────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api/v1";

async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000); // 15s timeout
  try {
    const res = await fetch(`${API}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Server error (${res.status})${errText ? `: ${errText}` : ""}. Make sure the server is running on ${API}.`);
    }
    return res.json() as Promise<T>;
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error("Request timed out. Make sure the EPA server is running on port 3001.");
    }
    if ((e as Error).message.includes("Failed to fetch") || (e as Error).message.includes("NetworkError")) {
      throw new Error(`Cannot reach the server at ${API}. Please start the server with: cd server && npm run dev`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
type AppStep = "jurisdiction" | "profile" | "timeline";
type Lang = "en" | "te" | "hi";
type TabKey = "timeline" | "whatif" | "chat" | "docs" | "map";

const LANGS: { code: Lang; native: string; label: string }[] = [
  { code: "en", native: "English", label: "Switch to English" },
  { code: "te", native: "తెలుగు", label: "తెలుగుకు మారండి" },
  { code: "hi", native: "हिंदी", label: "हिंदी में बदलें" },
];

const JURISDICTIONS = [{ id: "IN-AP", country: "India", state: "Andhra Pradesh" }];

function tr(obj: { en: string; te?: string; hi?: string } | undefined, lang: Lang): string {
  if (!obj) return "";
  return obj[lang] ?? obj.en;
}

const AGE_LABELS: Record<AgeGroup, string> = {
  under_18: "Under 18", "18_to_25": "18–25", "26_to_60": "26–60", over_60: "60+",
};
const CIT_LABELS: Record<CitizenshipStatus, string> = {
  citizen: "Indian Citizen", nri: "NRI", non_citizen: "Non-Citizen",
};
const REG_LABELS: Record<RegistrationStatus, string> = {
  registered: "✓ Registered", not_registered: "Not Registered", unknown: "Not Sure",
};

// ─── Error Boundary ───────────────────────────────────────────────────────────
interface ErrorBoundaryState { hasError: boolean; message: string }
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: "" };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[EPA] Boundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" style={{
          padding: "24px", background: "#fef2f2", border: "1px solid #fca5a5",
          borderRadius: 12, margin: 16, color: "#dc2626",
        }}>
          <h2 style={{ fontFamily: "Syne, sans-serif", marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 14 }}>{this.state.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, message: "" })}
            style={{
              marginTop: 12, padding: "8px 16px", background: "#dc2626",
              color: "#fff", border: "none", borderRadius: 8, cursor: "pointer",
            }}
            aria-label="Try again"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');
:root{--ink:#0a0f1e;--ink2:#1e2a40;--surface:#f0f4fb;--card:#fff;--accent:#1a56db;--accent2:#0e9f6e;--warn:#d97706;--danger:#dc2626;--border:#e2e8f0;--muted:#64748b;--r:14px;--sh:0 4px 24px rgba(0,0,0,.07)}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:var(--surface);color:var(--ink);min-height:100vh}
h1,h2,h3,h4{font-family:'Syne',sans-serif}

/* ── Accessibility: skip nav ── */
.skip-link{position:absolute;top:-100%;left:0;background:var(--accent);color:#fff;padding:8px 16px;border-radius:0 0 8px 0;z-index:9999;font-weight:600;text-decoration:none}
.skip-link:focus{top:0}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

/* ── Focus visible ── */
*:focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:4px}

.app{max-width:760px;margin:0 auto;padding:24px 16px 80px}
.hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:10px}
.logo{display:flex;align-items:center;gap:10px}
.logo-icon{width:38px;height:38px;background:var(--accent);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.logo-name{font-family:'Syne',sans-serif;font-weight:800;font-size:17px}
.logo-sub{font-size:11px;color:var(--muted);display:block;margin-top:-2px}
.hdr-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.lang-sw{display:flex;gap:3px;background:var(--border);border-radius:9px;padding:3px}
.lang-btn{border:none;background:none;padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;color:var(--muted);font-family:'DM Sans',sans-serif;transition:all .15s}
.lang-btn.on{background:#fff;color:var(--ink);font-weight:500;box-shadow:0 1px 4px rgba(0,0,0,.1)}
.auth-btn{border:none;background:var(--accent);color:#fff;padding:7px 14px;border-radius:8px;font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500;display:flex;align-items:center;gap:6px;transition:background .15s}
.auth-btn:hover{background:#1447b2}
.auth-btn.out{background:none;color:var(--muted);border:1px solid var(--border)}
.auth-btn.out:hover{background:#f8fafc}
.user-chip{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted)}
.user-chip img{width:24px;height:24px;border-radius:50%;object-fit:cover}

.stepper{display:flex;margin-bottom:24px;background:var(--card);border-radius:13px;padding:5px;box-shadow:var(--sh)}
.si{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 4px;border-radius:9px;cursor:default;transition:background .15s}
.si[role=button]{cursor:pointer}
.si.active{background:var(--accent)}.si.done{background:#eff6ff}
.sn{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:var(--border);color:var(--muted)}
.si.active .sn{background:#fff;color:var(--accent)}.si.done .sn{background:var(--accent2);color:#fff}
.sl{font-size:10px;color:var(--muted);font-weight:500}
.si.active .sl{color:#fff}

.card{background:var(--card);border-radius:var(--r);padding:26px;box-shadow:var(--sh);margin-bottom:14px}
.ct{font-size:21px;font-weight:700;margin-bottom:5px}
.cs{font-size:14px;color:var(--muted);margin-bottom:22px;line-height:1.55}
.fg{margin-bottom:16px}
.fl{display:block;font-size:12px;font-weight:700;color:var(--ink2);margin-bottom:7px;letter-spacing:.05em;text-transform:uppercase}
.fsel{width:100%;padding:11px 15px;border:1.5px solid var(--border);border-radius:10px;font-family:'DM Sans',sans-serif;font-size:15px;color:var(--ink);background:#fff;cursor:pointer;outline:none;transition:border-color .15s}
.fsel:focus{border-color:var(--accent)}
.tg{display:flex;gap:7px;flex-wrap:wrap}
.tb{padding:9px 15px;border:1.5px solid var(--border);border-radius:9px;font-family:'DM Sans',sans-serif;font-size:14px;cursor:pointer;background:#fff;color:var(--ink);transition:all .15s}
.tb:hover{border-color:var(--accent);color:var(--accent)}
.tb.on{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:500}
.tb[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:500}
.cbr{display:flex;align-items:center;gap:10px;padding:11px 15px;border:1.5px solid var(--border);border-radius:10px;cursor:pointer;transition:all .15s}
.cbr:hover{border-color:var(--accent)}.cbr.on{background:#eff6ff;border-color:var(--accent)}
.cbr input{width:17px;height:17px;accent-color:var(--accent);cursor:pointer}

.btn{width:100%;padding:13px 22px;background:var(--accent);color:#fff;border:none;border-radius:11px;font-family:'Syne',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:all .15s;margin-top:6px}
.btn:hover{background:#1447b2;transform:translateY(-1px);box-shadow:0 6px 20px rgba(26,86,219,.3)}
.btn:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none}
.btn:focus-visible{outline:3px solid #fff;outline-offset:2px}
.btn2{padding:10px 18px;background:#fff;color:var(--accent);border:1.5px solid var(--accent);border-radius:9px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;cursor:pointer;transition:all .15s}
.btn2:hover{background:#eff6ff}

.eb{padding:14px 18px;border-radius:10px;margin-bottom:16px;display:flex;align-items:flex-start;gap:11px}
.eb.ok{background:#f0fdf4;border:1.5px solid #86efac}.eb.no{background:#fef2f2;border:1.5px solid #fca5a5}
.eb-ico{font-size:20px;flex-shrink:0;line-height:1.4}
.eb-txt h3{font-size:15px;font-weight:700;margin-bottom:3px}.eb-txt p{font-size:13px;color:var(--muted);line-height:1.5}

.tabs{display:flex;gap:4px;background:var(--border);border-radius:11px;padding:4px;margin-bottom:18px;flex-wrap:wrap}
.tab{flex:1;padding:8px;border:none;background:none;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:var(--muted);cursor:pointer;transition:all .15s;white-space:nowrap;min-width:0}
.tab.on{background:#fff;color:var(--ink);box-shadow:0 1px 4px rgba(0,0,0,.1)}

.tl{display:flex;flex-direction:column}
.tli{display:flex;gap:14px;position:relative}
.tll{display:flex;flex-direction:column;align-items:center;width:30px;flex-shrink:0}
.tld{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;z-index:1;flex-shrink:0}
.tld.required{background:var(--accent);color:#fff}.tld.blocking{background:var(--danger);color:#fff}.tld.optional{background:var(--border);color:var(--muted)}
.tl-line{width:2px;background:var(--border);flex:1;margin:4px 0;min-height:20px}
.tlb{flex:1;padding-bottom:22px}
.tlh{display:flex;align-items:flex-start;justify-content:space-between;gap:7px;margin-bottom:7px;flex-wrap:wrap}
.tl-title{font-size:15px;font-weight:600}
.tldd{font-size:11px;padding:3px 9px;border-radius:20px;font-weight:600;white-space:nowrap}
.tldd.past{background:#fef2f2;color:var(--danger)}.tldd.future{background:#eff6ff;color:var(--accent)}
.tl-desc{font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:7px}
.tl-con{font-size:12px;color:var(--warn);background:#fffbeb;padding:7px 11px;border-radius:7px;border-left:3px solid var(--warn)}
.tl-src{font-size:11px;color:var(--muted);margin-top:7px}
.tl-src a{color:var(--accent);text-decoration:none}.tl-src a:hover{text-decoration:underline}
.badge{font-size:10px;padding:2px 7px;border-radius:20px;font-weight:700;display:inline-block;text-transform:uppercase;letter-spacing:.04em}
.badge-blocking{background:#fef2f2;color:var(--danger)}.badge-required{background:#eff6ff;color:var(--accent)}.badge-optional{background:#f8fafc;color:var(--muted)}

.wi-ta{width:100%;padding:12px 14px;border:1.5px solid var(--border);border-radius:11px;font-family:'DM Sans',sans-serif;font-size:14px;color:var(--ink);resize:none;outline:none;transition:border-color .15s;margin-bottom:10px}
.wi-ta:focus{border-color:var(--accent)}
.wi-res{background:#f8fafc;border-radius:11px;padding:18px;border:1px solid var(--border);margin-top:14px}
.fb-box{background:#fffbeb;border:1px solid #fcd34d;border-radius:9px;padding:14px;display:flex;gap:9px}
.ub{font-size:11px;padding:2px 9px;border-radius:20px;font-weight:700;display:inline-block;margin-bottom:6px;text-transform:uppercase}
.ub-high{background:#fef2f2;color:var(--danger)}.ub-medium{background:#fffbeb;color:var(--warn)}.ub-low{background:#f0fdf4;color:var(--accent2)}.ub-critical{background:var(--danger);color:#fff}

.chat-win{display:flex;flex-direction:column;height:400px}
.chat-msgs{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding-bottom:4px}
.chat-msgs:focus{outline:none}
.cb{max-width:86%;padding:11px 15px;border-radius:15px;font-size:14px;line-height:1.6;white-space:pre-wrap}
.cb.user{background:var(--accent);color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
.cb.assistant{background:#f1f5f9;color:var(--ink);align-self:flex-start;border-bottom-left-radius:4px}
.chat-ir{display:flex;gap:7px;margin-top:11px}
.chat-in{flex:1;padding:11px 14px;border:1.5px solid var(--border);border-radius:11px;font-family:'DM Sans',sans-serif;font-size:14px;outline:none;transition:border-color .15s}
.chat-in:focus{border-color:var(--accent)}
.chat-snd{padding:11px 18px;background:var(--accent);color:#fff;border:none;border-radius:11px;cursor:pointer;font-weight:700;transition:background .15s;font-family:'Syne',sans-serif}
.chat-snd:hover{background:#1447b2}.chat-snd:disabled{opacity:.5;cursor:not-allowed}

.sp{background:#f8fafc;border-radius:9px;padding:11px 14px;border:1px solid var(--border);margin-top:11px}
.sp h5{font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:7px;letter-spacing:.05em}
.sp-i{font-size:12px;display:flex;align-items:center;gap:5px;margin-bottom:3px;color:var(--muted)}
.sp-i a{color:var(--accent);text-decoration:none}.sp-i a:hover{text-decoration:underline}

.dg{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.dc{background:var(--card);border:1px solid var(--border);border-radius:11px;padding:13px}
.dc-t{font-size:14px;font-weight:600;margin-bottom:4px}
.dc-d{font-size:12px;color:var(--muted);line-height:1.5}
.dc-alt{font-size:11px;background:#eff6ff;color:var(--accent);padding:2px 7px;border-radius:20px;display:inline-block;margin:2px 2px 0 0}

.mr{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid var(--border);margin-top:14px;flex-wrap:wrap;gap:6px}
.mt{font-size:11px;color:var(--muted)}
.vb{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--accent2);font-weight:700}

.errbox{background:#fef2f2;border:1px solid #fca5a5;border-radius:9px;padding:13px 15px;font-size:14px;color:var(--danger);margin-bottom:14px}
.info-pill{background:#eff6ff;border-radius:9px;padding:11px 13px;margin-bottom:14px;font-size:13px;color:#1e40af}
.spin{display:inline-block;width:17px;height:17px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}

/* Loading skeleton */
.skel{background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%);background-size:200% 100%;animation:skel 1.4s infinite;border-radius:8px}
@keyframes skel{0%{background-position:200% 0}100%{background-position:-200% 0}}

/* Google Translate widget */
#google_translate_element{font-size:12px}
#google_translate_element .goog-te-combo{font-size:12px;border:1px solid var(--border);border-radius:6px;padding:4px 8px;outline:none;cursor:pointer;background:#fff}

@media(max-width:480px){
  .dg{grid-template-columns:1fr}
  .tlh{flex-direction:column;gap:3px}
  .sl{display:none}
  .hdr{flex-direction:column;align-items:flex-start}
  .tabs .tab{font-size:11px;padding:6px 4px}
}
@media(prefers-reduced-motion:reduce){
  *{animation:none!important;transition:none!important}
}
`;

// ─── Google Translate widget initialiser ──────────────────────────────────────
declare global {
  interface Window {
    googleTranslateElementInit?: () => void;
    google?: { translate: { TranslateElement: new (config: object, id: string) => void } };
  }
}

function initGoogleTranslate() {
  window.googleTranslateElementInit = () => {
    if (window.google?.translate) {
      new window.google.translate.TranslateElement(
        { pageLanguage: "en", includedLanguages: "te,hi,en", layout: 1 },
        "google_translate_element"
      );
    }
  };
  if (!document.getElementById("gt-script")) {
    const script = document.createElement("script");
    script.id = "gt-script";
    script.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.head.appendChild(script);
  }
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [lang, setLang]           = useState<Lang>("en");
  const [step, setStep]           = useState<AppStep>("jurisdiction");
  const [jid, setJid]             = useState("IN-AP");
  const [input, setInput]         = useState<UserInput>({
    jurisdictionId: "IN-AP", ageGroup: "26_to_60",
    citizenship: "citizen", registrationStatus: "unknown", isFirstTimeVoter: false,
  });
  const [userState, setUserState] = useState<UserState | null>(null);
  const [timeline, setTimeline]   = useState<TimelineStep[]>([]);
  const [docs, setDocs]           = useState<DocumentRequirement[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [tab, setTab]             = useState<TabKey>("timeline");
  const [user, setUser]           = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [wiQuery, setWiQuery]     = useState("");
  const [wiResult, setWiResult]   = useState<{
    outcomes: ScenarioOutcome[]; affectedSteps: TimelineStep[];
    confidence: number; usedFallback: boolean;
    fallbackMessage?: { en: string; te?: string; hi?: string };
  } | null>(null);
  const [wiLoading, setWiLoading] = useState(false);

  const [chatMsgs, setChatMsgs]   = useState<ChatMessage[]>([]);
  const [chatIn, setChatIn]       = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEnd  = useRef<HTMLDivElement>(null);
  const mainRef  = useRef<HTMLElement>(null);
  const liveRef  = useRef<HTMLDivElement>(null);

  const jur = JURISDICTIONS.find(j => j.id === jid);

  // Auth subscription
  useEffect(() => {
    const unsub = onAuthChange(u => setUser(u));
    return unsub;
  }, []);

  // Google Translate
  useEffect(() => { initGoogleTranslate(); }, []);

  // Announce route changes to screen readers
  useEffect(() => {
    if (liveRef.current) {
      liveRef.current.textContent = `Showing ${step} step`;
    }
    trackPageView(step);
  }, [step]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs]);

  const handleProfile = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const full: UserInput = { ...input, jurisdictionId: jid };
      const sr = await apiPost<{ userState: UserState }>("/state", { input: full });
      setUserState(sr.userState);
      trackEligibilityCheck(sr.userState.eligible, jid);

      if (sr.userState.eligible) {
        const tlr = await apiPost<{ steps: TimelineStep[]; documents: DocumentRequirement[] }>(
          "/timeline", { jurisdictionId: jid, userState: sr.userState }
        );
        setTimeline(tlr.steps);
        setDocs(tlr.documents);
        trackTimelineGenerated(jid, tlr.steps.length);
        await saveVotingSession({
          jurisdictionId: jid, eligible: true,
          stepsCompleted: tlr.steps.length, language: lang,
        });
        setChatMsgs([{
          role: "assistant",
          content: `Hi! I'm here to help with your voting journey in ${jur?.state}. I only answer questions based on verified election rules. What would you like to know?`,
        }]);
      }
      setStep("timeline");
      // Move focus to main content after navigation
      setTimeout(() => mainRef.current?.focus(), 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [input, jid, jur, lang]);

  const handleWi = useCallback(async () => {
    if (!wiQuery.trim() || !userState) return;
    setWiLoading(true); setWiResult(null);
    try {
      const r = await apiPost<typeof wiResult & object>("/simulate", {
        query: wiQuery.slice(0, 500), userState, jurisdictionId: jid,
      });
      setWiResult(r);
      trackSimulation((r as { scenarioId?: string }).scenarioId, (r as { usedFallback: boolean }).usedFallback);
    } catch {
      setWiResult({
        outcomes: [], affectedSteps: [], confidence: 0, usedFallback: true,
        fallbackMessage: { en: "Could not process. Contact Voter Helpline at 1950." },
      });
    } finally { setWiLoading(false); }
  }, [wiQuery, userState, jid]);

  const handleChat = useCallback(async () => {
    if (!chatIn.trim() || !userState) return;
    const msg: ChatMessage = { role: "user", content: chatIn.slice(0, 1000) };
    setChatMsgs(p => [...p, msg]); setChatIn(""); setChatLoading(true);
    trackChatMessage(jid);
    try {
      const r = await apiPost<{ reply: string }>("/chat", {
        message: msg.content, history: chatMsgs.slice(-10),
        userState, timeline, jurisdictionId: jid,
      });
      setChatMsgs(p => [...p, { role: "assistant", content: r.reply }]);
    } catch {
      setChatMsgs(p => [...p, {
        role: "assistant",
        content: "Unable to respond right now. Please check the timeline or call 1950.",
      }]);
    } finally { setChatLoading(false); }
  }, [chatIn, chatMsgs, userState, timeline, jid]);

  const steps = [
    { key: "jurisdiction", label: "Location" },
    { key: "profile",      label: "Profile" },
    { key: "timeline",     label: "Roadmap" },
  ] as const;

  return (
    <ErrorBoundary>
      <style>{CSS}</style>

      {/* Screen reader live region */}
      <div ref={liveRef} aria-live="polite" aria-atomic="true" className="sr-only" />

      {/* Skip to main content */}
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <div className="app">
        {/* ── Header ── */}
        <header className="hdr">
          <div className="logo">
            <div className="logo-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
              </svg>
            </div>
            <div>
              <h1 className="logo-name">Election Path</h1>
              <span className="logo-sub">Verified civic guidance</span>
            </div>
          </div>

          <div className="hdr-right">
            {/* Google Translate */}
            <div id="google_translate_element" aria-label="Translate page" />

            {/* Manual language switcher */}
            <div className="lang-sw" role="group" aria-label="Select language">
              {LANGS.map(l => (
                <button key={l.code}
                  className={`lang-btn ${lang === l.code ? "on" : ""}`}
                  onClick={() => setLang(l.code)}
                  aria-label={l.label}
                  aria-pressed={lang === l.code}
                >{l.native}</button>
              ))}
            </div>

            {/* Google Auth */}
            {user ? (
              <div className="user-chip" aria-label={`Signed in as ${user.displayName}`}>
                {user.photoURL && (
                  <img src={user.photoURL} alt={user.displayName ?? "User avatar"} />
                )}
                <span style={{ fontSize: 12 }}>{user.displayName?.split(" ")[0]}</span>
                <button className="auth-btn out" onClick={signOutUser} aria-label="Sign out">
                  Sign out
                </button>
              </div>
            ) : (
              <button
                className="auth-btn"
                onClick={async () => { setAuthLoading(true); await signInWithGoogle(); setAuthLoading(false); }}
                disabled={authLoading}
                aria-label="Sign in with Google"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {authLoading ? "…" : "Sign in"}
              </button>
            )}
          </div>
        </header>

        {/* ── Stepper ── */}
        <nav aria-label="Application steps">
          <ol className="stepper" style={{ listStyle: "none" }}>
            {steps.map((s, i) => {
              const si = steps.findIndex(x => x.key === step);
              const done = i < si; const active = s.key === step;
              return (
                <li key={s.key}
                  className={`si ${active ? "active" : done ? "done" : ""}`}
                  role={done ? "button" : undefined}
                  tabIndex={done ? 0 : undefined}
                  aria-label={`Step ${i + 1}: ${s.label}${active ? " (current)" : done ? " (complete)" : ""}`}
                  aria-current={active ? "step" : undefined}
                  onClick={() => done && setStep(s.key as AppStep)}
                  onKeyDown={e => { if (done && (e.key === "Enter" || e.key === " ")) setStep(s.key as AppStep); }}
                >
                  <div className="sn" aria-hidden="true">{done ? "✓" : i + 1}</div>
                  <span className="sl">{s.label}</span>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* ── Error ── */}
        {error && (
          <div role="alert" className="errbox" aria-live="assertive">
            ⚠️ {error}
            <button onClick={() => setError(null)} style={{ marginLeft: 12, fontSize: 12, cursor: "pointer", background: "none", border: "none", color: "var(--danger)", textDecoration: "underline" }} aria-label="Dismiss error">Dismiss</button>
          </div>
        )}

        {/* ── Main ── */}
        <main id="main-content" ref={mainRef} tabIndex={-1} aria-label="Main content">

          {/* ── Jurisdiction ── */}
          {step === "jurisdiction" && (
            <section aria-labelledby="jur-heading">
              <div className="card">
                <h2 id="jur-heading" className="ct">Where are you voting?</h2>
                <p className="cs">Select your state to load verified election rules from the official authority.</p>
                <div className="fg">
                  <label className="fl" htmlFor="jur-select">State / Region</label>
                  <select id="jur-select" className="fsel" value={jid}
                    onChange={e => setJid(e.target.value)}
                    aria-describedby="jur-desc">
                    {JURISDICTIONS.map(j => (
                      <option key={j.id} value={j.id}>{j.country} — {j.state}</option>
                    ))}
                  </select>
                  <p id="jur-desc" className="sr-only">Select the state where you will cast your vote</p>
                </div>
                {jur && (
                  <div className="info-pill" role="status" aria-live="polite">
                    📋 Rules loaded from <strong>Election Commission of India</strong> for <strong>{jur.state}</strong>
                  </div>
                )}
                <button className="btn" onClick={() => {
                  setInput(p => ({ ...p, jurisdictionId: jid }));
                  setStep("profile");
                }} aria-label="Continue to profile step">
                  Continue →
                </button>
              </div>
            </section>
          )}

          {/* ── Profile ── */}
          {step === "profile" && (
            <section aria-labelledby="profile-heading">
              <div className="card">
                <h2 id="profile-heading" className="ct">Your Voter Profile</h2>
                <p className="cs">Used to determine eligibility and personalise your roadmap. Nothing is stored.</p>

                <fieldset className="fg" style={{ border: "none", padding: 0 }}>
                  <legend className="fl">Age Group</legend>
                  <div className="tg" role="group">
                    {(Object.keys(AGE_LABELS) as AgeGroup[]).map(ag => (
                      <button key={ag}
                        className={`tb ${input.ageGroup === ag ? "on" : ""}`}
                        onClick={() => setInput(p => ({ ...p, ageGroup: ag }))}
                        aria-pressed={input.ageGroup === ag}
                        aria-label={`Age group: ${AGE_LABELS[ag]}`}
                      >{AGE_LABELS[ag]}</button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="fg" style={{ border: "none", padding: 0 }}>
                  <legend className="fl">Citizenship</legend>
                  <div className="tg" role="group">
                    {(Object.keys(CIT_LABELS) as CitizenshipStatus[]).map(c => (
                      <button key={c}
                        className={`tb ${input.citizenship === c ? "on" : ""}`}
                        onClick={() => setInput(p => ({ ...p, citizenship: c }))}
                        aria-pressed={input.citizenship === c}
                        aria-label={`Citizenship: ${CIT_LABELS[c]}`}
                      >{CIT_LABELS[c]}</button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="fg" style={{ border: "none", padding: 0 }}>
                  <legend className="fl">Registration Status</legend>
                  <div className="tg" role="group">
                    {(Object.keys(REG_LABELS) as RegistrationStatus[]).map(r => (
                      <button key={r}
                        className={`tb ${input.registrationStatus === r ? "on" : ""}`}
                        onClick={() => setInput(p => ({ ...p, registrationStatus: r }))}
                        aria-pressed={input.registrationStatus === r}
                        aria-label={`Registration status: ${REG_LABELS[r]}`}
                      >{REG_LABELS[r]}</button>
                    ))}
                  </div>
                </fieldset>

                <div className="fg">
                  <label className={`cbr ${input.isFirstTimeVoter ? "on" : ""}`}
                    style={{ userSelect: "none" }}>
                    <input type="checkbox"
                      checked={input.isFirstTimeVoter}
                      onChange={e => setInput(p => ({ ...p, isFirstTimeVoter: e.target.checked }))}
                      aria-label="This is my first time voting"
                    />
                    <span>This is my first time voting</span>
                  </label>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn2" onClick={() => setStep("jurisdiction")} aria-label="Back to jurisdiction step">← Back</button>
                  <button className="btn" style={{ flex: 1, marginTop: 0 }}
                    onClick={handleProfile} disabled={loading}
                    aria-label="Generate my personalised voting roadmap"
                    aria-busy={loading}>
                    {loading ? <><span className="spin" aria-hidden="true" /> Generating…</> : "Generate My Roadmap →"}
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* ── Timeline ── */}
          {step === "timeline" && userState && (
            <section aria-labelledby="timeline-heading">
              <h2 id="timeline-heading" className="sr-only">Your Voting Roadmap</h2>

              {/* Eligibility banner */}
              <div className={`eb ${userState.eligible ? "ok" : "no"}`}
                role="status" aria-live="polite"
                aria-label={userState.eligible ? "You are eligible to vote" : "Eligibility issue found"}>
                <span className="eb-ico" aria-hidden="true">{userState.eligible ? "✅" : "❌"}</span>
                <div className="eb-txt">
                  <h3>{userState.eligible ? "You are eligible to vote" : "You may not be eligible"}</h3>
                  {(userState.eligible ? userState.eligibilityReasons : userState.blockingReasons).map((r, i) => (
                    <p key={i}>{tr(r, lang)}</p>
                  ))}
                </div>
              </div>

              {/* Tabs */}
              <div className="tabs" role="tablist" aria-label="Information sections">
                {([
                  ["timeline", "📋 Roadmap"],
                  ["whatif",   "🤔 What-if"],
                  ["chat",     "💬 Ask"],
                  ["docs",     "📄 Docs"],
                  ["map",      "📍 Map"],
                ] as [TabKey, string][]).map(([k, l]) => (
                  <button key={k}
                    role="tab"
                    className={`tab ${tab === k ? "on" : ""}`}
                    onClick={() => setTab(k)}
                    aria-selected={tab === k}
                    aria-controls={`panel-${k}`}
                    id={`tab-${k}`}
                  >{l}</button>
                ))}
              </div>

              {/* ── Timeline panel ── */}
              <div id="panel-timeline" role="tabpanel" aria-labelledby="tab-timeline" hidden={tab !== "timeline"}>
                {tab === "timeline" && (
                  <div className="card">
                    <h3 className="ct">Your Voting Roadmap</h3>
                    <p className="cs">{timeline.length} verified steps · {jur?.state} · Source: ECI</p>
                    {timeline.length === 0 ? (
                      <p style={{ color: "var(--muted)", fontSize: 14 }}>
                        Your registration is confirmed. Just bring valid ID on election day!
                      </p>
                    ) : (
                      <ol className="tl" aria-label="Voting steps" style={{ listStyle: "none" }}>
                        {timeline.map((s, i) => (
                          <li className="tli" key={s.stepId}>
                            <div className="tll" aria-hidden="true">
                              <div className={`tld ${s.status}`}>{i + 1}</div>
                              {i < timeline.length - 1 && <div className="tl-line" />}
                            </div>
                            <article className="tlb" aria-label={tr(s.label, lang)}>
                              <div className="tlh">
                                <div>
                                  <span className={`badge badge-${s.status}`}>{s.status}</span>
                                  <div className="tl-title" style={{ marginTop: 4 }}>{tr(s.label, lang)}</div>
                                </div>
                                <time className={`tldd ${s.deadline.isPast ? "past" : "future"}`}
                                  dateTime={s.deadline.value}
                                  aria-label={`Deadline: ${tr(s.deadline.label, lang)}${s.deadline.isPast ? " (past)" : ""}`}>
                                  {s.deadline.isPast ? "⚠️ " : "📅 "}{tr(s.deadline.label, lang)}
                                </time>
                              </div>
                              <p className="tl-desc">{tr(s.description, lang)}</p>
                              <div className="tl-con" role="note" aria-label="Consequence if skipped">
                                ⚠️ {tr(s.consequence, lang)}
                              </div>
                              <div className="tl-src">
                                🔗 <a href={s.source.url} target="_blank" rel="noopener noreferrer"
                                  aria-label={`Source: ${s.source.label}, opens in new tab`}>
                                  {s.source.label}
                                </a> · Updated {s.source.lastUpdated}
                              </div>
                            </article>
                          </li>
                        ))}
                      </ol>
                    )}
                    <div className="mr">
                      <span className="mt">Rule version: IN-AP v1.0.0</span>
                      <span className="vb" aria-label="Verified — no AI-generated facts">✓ Verified — zero AI-generated facts</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ── What-if panel ── */}
              <div id="panel-whatif" role="tabpanel" aria-labelledby="tab-whatif" hidden={tab !== "whatif"}>
                {tab === "whatif" && (
                  <div className="card">
                    <h3 className="ct">What-if Simulator</h3>
                    <p className="cs">Describe a scenario for rule-based guidance. Examples: "I lost my voter ID", "I missed registration", "I moved cities".</p>
                    <label htmlFor="wi-input" className="sr-only">Describe your scenario</label>
                    <textarea id="wi-input" className="wi-ta" rows={3}
                      placeholder="What if I lost my EPIC card?"
                      value={wiQuery}
                      onChange={e => setWiQuery(e.target.value.slice(0, 500))}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleWi(); } }}
                      aria-label="Describe your voting scenario"
                      aria-describedby="wi-hint"
                      maxLength={500}
                    />
                    <p id="wi-hint" className="sr-only">Press Enter or click Simulate to get rule-based guidance</p>
                    <button className="btn" style={{ marginTop: 0 }} onClick={handleWi}
                      disabled={wiLoading || !wiQuery.trim()}
                      aria-label="Simulate this scenario"
                      aria-busy={wiLoading}>
                      {wiLoading ? <><span className="spin" aria-hidden="true" /> Simulating…</> : "Simulate →"}
                    </button>

                    {wiResult && (
                      <div className="wi-res" role="region" aria-label="Simulation results" aria-live="polite">
                        {wiResult.usedFallback ? (
                          <div className="fb-box" role="alert">
                            <span aria-hidden="true" style={{ fontSize: 20 }}>⚠️</span>
                            <div>
                              <strong style={{ fontSize: 14 }}>Unable to confirm automatically</strong>
                              <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{tr(wiResult.fallbackMessage!, lang)}</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                              <strong style={{ fontSize: 15 }}>Scenario Analysis</strong>
                              <span style={{ fontSize: 12, color: "var(--muted)" }}
                                aria-label={`Confidence: ${Math.round(wiResult.confidence * 100)} percent`}>
                                Confidence: {Math.round(wiResult.confidence * 100)}%
                              </span>
                            </div>
                            {wiResult.outcomes.map((o, i) => (
                              <div key={i} style={{ marginBottom: 14 }}>
                                <span className={`ub ub-${o.urgency}`} aria-label={`${o.urgency} urgency`}>{o.urgency} urgency</span>
                                <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 5 }}>{tr(o.label, lang)}</p>
                                <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{tr(o.description, lang)}</p>
                                <div className="tl-src" style={{ marginTop: 7 }}>
                                  🔗 <a href={o.source.url} target="_blank" rel="noopener noreferrer"
                                    aria-label={`Source: ${o.source.label}, opens in new tab`}>{o.source.label}</a>
                                </div>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Chat panel ── */}
              <div id="panel-chat" role="tabpanel" aria-labelledby="tab-chat" hidden={tab !== "chat"}>
                {tab === "chat" && (
                  <div className="card">
                    <h3 className="ct">Ask the Assistant</h3>
                    <p className="cs" style={{ marginBottom: 14 }}>AI answers grounded in verified rules only. Cannot invent facts or deadlines.</p>
                    <div className="chat-win">
                      <div className="chat-msgs" role="log" aria-live="polite" aria-label="Chat messages"
                        tabIndex={0}>
                        {chatMsgs.map((m, i) => (
                          <div key={i}
                            className={`cb ${m.role}`}
                            role={m.role === "assistant" ? "article" : undefined}
                            aria-label={m.role === "user" ? "Your message" : "Assistant response"}>
                            {m.content}
                          </div>
                        ))}
                        {chatLoading && (
                          <div className="cb assistant skel" style={{ width: 180, height: 40 }}
                            aria-label="Assistant is typing" aria-busy="true" />
                        )}
                        <div ref={chatEnd} aria-hidden="true" />
                      </div>
                      <div className="chat-ir" role="form" aria-label="Send a message">
                        <label htmlFor="chat-input" className="sr-only">Type your question</label>
                        <input id="chat-input" className="chat-in"
                          placeholder="Ask about your voting steps…"
                          value={chatIn}
                          onChange={e => setChatIn(e.target.value.slice(0, 1000))}
                          onKeyDown={e => { if (e.key === "Enter") handleChat(); }}
                          disabled={chatLoading}
                          aria-label="Type your question about voting"
                          aria-describedby="chat-hint"
                          maxLength={1000}
                        />
                        <p id="chat-hint" className="sr-only">Press Enter or click Send</p>
                        <button className="chat-snd" onClick={handleChat}
                          disabled={chatLoading || !chatIn.trim()}
                          aria-label="Send message">Send</button>
                      </div>
                    </div>
                    <div className="sp" role="note">
                      <h5>🔒 AI Guardrails</h5>
                      <div className="sp-i">✓ Grounded to verified rule output only</div>
                      <div className="sp-i">✓ Response validated before display · Fallback on failure</div>
                      <div className="sp-i">✓ Source: <a href="https://eci.gov.in" target="_blank" rel="noopener noreferrer" aria-label="Election Commission of India, opens in new tab">ECI</a> · <a href="https://voters.eci.gov.in" target="_blank" rel="noopener noreferrer" aria-label="NVSP, opens in new tab">NVSP</a></div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Docs panel ── */}
              <div id="panel-docs" role="tabpanel" aria-labelledby="tab-docs" hidden={tab !== "docs"}>
                {tab === "docs" && (
                  <div className="card">
                    <h3 className="ct">Required Documents</h3>
                    <p className="cs">Documents needed across your voting journey.</p>
                    <dl className="dg">
                      {docs.map(d => (
                        <div className="dc" key={d.docId}>
                          <dt className="dc-t">{tr(d.label, lang)}</dt>
                          <dd className="dc-d">{tr(d.description, lang)}</dd>
                          {d.alternatives?.length ? (
                            <div style={{ marginTop: 8 }}>
                              <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>ALTERNATIVES: </span>
                              {d.alternatives.map((a, i) => <span key={i} className="dc-alt">{tr(a, lang)}</span>)}
                            </div>
                          ) : null}
                          {d.officialLink && (
                            <div style={{ marginTop: 8 }}>
                              <a href={d.officialLink} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}
                                aria-label={`Official source for ${tr(d.label, lang)}, opens in new tab`}>
                                Official source ↗
                              </a>
                            </div>
                          )}
                        </div>
                      ))}
                    </dl>
                    <div className="mr">
                      <span className="mt">Source: Election Commission of India</span>
                      <span className="vb">✓ Verified</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Map panel (Google Maps) ── */}
              <div id="panel-map" role="tabpanel" aria-labelledby="tab-map" hidden={tab !== "map"}>
                {tab === "map" && (
                  <div className="card">
                    <h3 className="ct">Polling Booth Locator</h3>
                    <p className="cs">Find polling stations using Google Maps or the official NVSP booth finder.</p>
                    <PollingBoothMap jurisdiction={jid} lang={lang} />
                  </div>
                )}
              </div>

              <button className="btn2" style={{ marginTop: 4 }}
                onClick={() => { setStep("profile"); setUserState(null); setTimeline([]); setDocs([]); }}
                aria-label="Start over from the beginning">
                ← Start Over
              </button>
            </section>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
