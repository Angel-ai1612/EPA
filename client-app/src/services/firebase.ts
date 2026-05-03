/**
 * @fileoverview Firebase + Google Services integration for EPA.
 * All Firebase calls are fully guarded — the app works completely without
 * valid Firebase credentials (demo/offline mode).
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, logEvent, type Analytics } from "firebase/analytics";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut,
  onAuthStateChanged, type User, type Auth,
} from "firebase/auth";
import {
  getFirestore, collection, addDoc, serverTimestamp, type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            ?? "",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        ?? "",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         ?? "",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     ?? "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             ?? "",
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID     ?? "",
};

// All are nullable — guarded at every call site
let fbApp:     FirebaseApp | null = null;
let fbAuth:    Auth        | null = null;
let fbDb:      Firestore   | null = null;
let fbAnalytics: Analytics | null = null;

const isConfigured = !!firebaseConfig.apiKey && !!firebaseConfig.projectId;

if (isConfigured) {
  try {
    fbApp  = initializeApp(firebaseConfig);
    fbAuth = getAuth(fbApp);
    fbDb   = getFirestore(fbApp);
    if (typeof window !== "undefined" && firebaseConfig.measurementId) {
      fbAnalytics = getAnalytics(fbApp);
    }
  } catch (e) {
    console.warn("[Firebase] Init failed — running in offline mode:", e);
    fbApp = fbAuth = fbDb = fbAnalytics = null;
  }
} else {
  console.info("[Firebase] No credentials — running in offline mode. Set VITE_FIREBASE_* env vars to enable.");
}

// ─── Analytics ────────────────────────────────────────────────────────────────
/** Log an analytics event. Safe no-op when Firebase is not configured. */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  try { if (fbAnalytics) logEvent(fbAnalytics, name, params); } catch { /* swallow */ }
}

export function trackPageView(page: string): void {
  trackEvent("page_view", { page_title: page, page_path: `/${page}` });
}
export function trackEligibilityCheck(eligible: boolean, jurisdiction: string): void {
  trackEvent("eligibility_check", { eligible, jurisdiction });
}
export function trackTimelineGenerated(jurisdiction: string, stepCount: number): void {
  trackEvent("timeline_generated", { jurisdiction, step_count: stepCount });
}
export function trackSimulation(scenarioId: string | undefined, usedFallback: boolean): void {
  trackEvent("scenario_simulated", { scenario_id: scenarioId ?? "unknown", used_fallback: usedFallback });
}
export function trackChatMessage(jurisdiction: string): void {
  trackEvent("chat_message_sent", { jurisdiction });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("profile");
googleProvider.addScope("email");

/** Sign in with Google. Returns null and logs a warning if Firebase is not configured. */
export async function signInWithGoogle(): Promise<User | null> {
  if (!fbAuth) {
    console.warn("[Auth] Firebase not configured — sign-in unavailable.");
    return null;
  }
  try {
    const result = await signInWithPopup(fbAuth, googleProvider);
    trackEvent("login", { method: "google" });
    return result.user;
  } catch (e) {
    console.warn("[Auth] Sign-in failed:", e);
    return null;
  }
}

/** Sign out. No-op if Firebase not configured. */
export async function signOutUser(): Promise<void> {
  if (!fbAuth) return;
  try { await signOut(fbAuth); trackEvent("logout"); } catch { /* swallow */ }
}

/**
 * Subscribe to auth state changes.
 * Returns an unsubscribe function. If Firebase is not configured,
 * immediately calls callback(null) and returns a no-op unsubscribe.
 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (!fbAuth) {
    // Call immediately with null so the component renders correctly
    callback(null);
    return () => {};
  }
  try {
    return onAuthStateChanged(fbAuth, callback);
  } catch (e) {
    console.warn("[Auth] onAuthStateChanged failed:", e);
    callback(null);
    return () => {};
  }
}

// ─── Firestore ────────────────────────────────────────────────────────────────
/** Save an anonymous voting session. No PII stored. No-op if Firestore not available. */
export async function saveVotingSession(data: {
  jurisdictionId: string;
  eligible: boolean;
  stepsCompleted: number;
  language: string;
}): Promise<void> {
  if (!fbDb) return;
  try {
    await addDoc(collection(fbDb, "sessions"), {
      ...data,
      createdAt: serverTimestamp(),
    });
  } catch { /* non-critical */ }
}

export { fbAuth as auth, fbDb as db, fbAnalytics as analytics };
