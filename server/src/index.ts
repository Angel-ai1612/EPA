import express from "express";
import cors from "cors";
import helmet from "helmet";
import { body, validationResult } from "express-validator";
import { piiMiddleware } from "./middleware/piiSanitiser";
import { writeAuditLog } from "./middleware/auditLogger";
import {
  getRulePack, evaluateEligibility, generateTimeline,
  simulateScenario, buildMeta, registerRulePack,
} from "./engine/ruleEngine";
import { classifyIntent, groundedChat } from "./services/aiService";
import { IN_AP_RULE_PACK } from "./engine/rulePacks/IN-AP";
import type {
  StateRequest, TimelineRequest, SimulateRequest, ChatRequest,
} from "./types";

// ─── Register rule packs ──────────────────────────────────────────────────────
registerRulePack(IN_AP_RULE_PACK);

const app = express();

// ─── Security headers (Helmet) ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.anthropic.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // allow Google Maps embeds
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
// In dev: allow all origins so local frontend works without config.
// In production: set ALLOWED_ORIGINS env var (comma-separated) on Render.
const IS_DEV = process.env.NODE_ENV !== "production";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow no-origin requests (curl, server-to-server)
    if (!origin) return cb(null, true);
    // In dev mode: allow everything for easier local development
    if (IS_DEV) return cb(null, true);
    // In production: check allowlist
    if (ALLOWED_ORIGINS.includes(origin) || origin === "https://epa-one.vercel.app") return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.use(express.json({ limit: "50kb" }));
app.use(piiMiddleware);

// ─── Rate limiter (in-memory; use Redis in production) ───────────────────────
const requestCounts = new Map<string, { count: number; reset: number }>();

/**
 * Simple token-bucket rate limiter: 60 requests per minute per IP.
 * Intended to prevent API abuse. In production, replace with Redis-backed limiter.
 */
function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const entry = requestCounts.get(ip);
  if (!entry || entry.reset < now) {
    requestCounts.set(ip, { count: 1, reset: now + 60_000 });
    return next();
  }
  if (entry.count >= 60) {
    res.status(429).json({
      error: "Rate limit exceeded. Please try again in a minute.",
      retryAfter: Math.ceil((entry.reset - now) / 1000),
    });
    return;
  }
  entry.count++;
  next();
}
app.use(rateLimit);

// ─── Input validation helpers ─────────────────────────────────────────────────
function validate(req: express.Request, res: express.Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: "Invalid input", details: errors.array() });
    return false;
  }
  return true;
}

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    packs: Array.from(["IN-AP"]),
    timestamp: new Date().toISOString(),
  });
});

// ─── POST /api/v1/state ───────────────────────────────────────────────────────
app.post(
  "/api/v1/state",
  body("input.jurisdictionId").isString().isLength({ min: 2, max: 20 }).trim(),
  body("input.ageGroup").isIn(["under_18", "18_to_25", "26_to_60", "over_60"]),
  body("input.citizenship").isIn(["citizen", "nri", "non_citizen"]),
  body("input.registrationStatus").isIn(["registered", "not_registered", "unknown"]),
  body("input.isFirstTimeVoter").isBoolean(),
  (req: express.Request, res: express.Response) => {
    if (!validate(req, res)) return;
    const { input } = req.body as StateRequest;
    const pack = getRulePack(input.jurisdictionId);
    if (!pack) {
      res.status(404).json({ error: `No rule pack found for jurisdiction: ${input.jurisdictionId}` });
      return;
    }
    const userState = evaluateEligibility(input, pack);
    const meta = buildMeta(pack, userState);
    writeAuditLog({
      timestamp: new Date().toISOString(), endpoint: "/state",
      jurisdictionId: input.jurisdictionId, ruleVersion: pack.version,
      responseHash: meta.responseHash,
    });
    res.json({ userState, meta });
  }
);

// ─── POST /api/v1/timeline ────────────────────────────────────────────────────
app.post(
  "/api/v1/timeline",
  body("jurisdictionId").isString().isLength({ min: 2, max: 20 }).trim(),
  body("userState").isObject(),
  (req: express.Request, res: express.Response) => {
    if (!validate(req, res)) return;
    const { jurisdictionId, userState } = req.body as TimelineRequest;
    const pack = getRulePack(jurisdictionId);
    if (!pack) {
      res.status(404).json({ error: `No rule pack for: ${jurisdictionId}` });
      return;
    }
    const steps = generateTimeline(userState, pack);
    const documents = pack.rules.documents;
    const meta = buildMeta(pack, steps);
    writeAuditLog({
      timestamp: new Date().toISOString(), endpoint: "/timeline",
      jurisdictionId, ruleVersion: pack.version, responseHash: meta.responseHash,
    });
    res.json({ steps, documents, meta });
  }
);

// ─── POST /api/v1/simulate ────────────────────────────────────────────────────
app.post(
  "/api/v1/simulate",
  body("query").isString().isLength({ min: 1, max: 500 }).trim(),
  body("jurisdictionId").isString().isLength({ min: 2, max: 20 }).trim(),
  body("userState").isObject(),
  async (req: express.Request, res: express.Response) => {
    if (!validate(req, res)) return;
    const { query, userState, jurisdictionId } = req.body as SimulateRequest;
    const pack = getRulePack(jurisdictionId);
    if (!pack) {
      res.status(404).json({ error: `No rule pack for: ${jurisdictionId}` });
      return;
    }
    let aiTags: string[] | undefined;
    try {
      const intent = await classifyIntent(query);
      aiTags = intent.tags;
    } catch { /* keyword-only fallback */ }
    const result = simulateScenario(query, userState, pack, aiTags);
    const meta = buildMeta(pack, result);
    writeAuditLog({
      timestamp: new Date().toISOString(), endpoint: "/simulate", jurisdictionId,
      ruleVersion: pack.version, responseHash: meta.responseHash,
      usedFallback: result.usedFallback, confidence: result.confidence,
    });
    res.json({ ...result, meta });
  }
);

// ─── POST /api/v1/chat ────────────────────────────────────────────────────────
app.post(
  "/api/v1/chat",
  body("message").isString().isLength({ min: 1, max: 1000 }).trim(),
  body("jurisdictionId").isString().isLength({ min: 2, max: 20 }).trim(),
  body("userState").isObject(),
  body("history").isArray({ max: 20 }).optional(),
  async (req: express.Request, res: express.Response) => {
    if (!validate(req, res)) return;
    const { message, history, userState, timeline, jurisdictionId } = req.body as ChatRequest;
    const pack = getRulePack(jurisdictionId);
    const result = await groundedChat(message, history ?? [], userState, timeline ?? [], jurisdictionId);
    const meta = buildMeta(pack ?? IN_AP_RULE_PACK, result);
    writeAuditLog({
      timestamp: new Date().toISOString(), endpoint: "/chat", jurisdictionId,
      ruleVersion: pack?.version ?? "unknown", responseHash: meta.responseHash,
      usedFallback: result.usedFallback,
    });
    res.json({ ...result, meta });
  }
);

// ─── POST /api/v1/intent ─────────────────────────────────────────────────────
app.post(
  "/api/v1/intent",
  body("query").isString().isLength({ min: 1, max: 500 }).trim(),
  async (req: express.Request, res: express.Response) => {
    if (!validate(req, res)) return;
    const { query } = req.body as { query: string };
    const intent = await classifyIntent(query);
    res.json(intent);
  }
);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req: express.Request, res: express.Response) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Global error handler ──────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[EPA] Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => console.log(`EPA server running on :${PORT}`));

export default app;
