# EPA Build Plan

## Phase 1 — Foundation
- [x] Project structure
- [x] Shared TypeScript types (shared/src/types.ts)
- [x] Rule pack schema + IN-AP data (22 rules: 4 eligibility, 5 timeline, 3 scenarios, 3 documents)
- [x] Rule engine: eligibility + timeline + what-if simulator
- [x] TypeScript compiles cleanly — zero errors

## Phase 2 — Server
- [x] Express API: /state, /timeline, /simulate, /chat, /intent, /health
- [x] PII sanitiser (Aadhaar, phone, email, PAN, passport)
- [x] Rate limiter (60 req/min per IP)
- [x] Audit logger (JSONL per day)
- [x] Fallback handler (AI timeout → rule output)

## Phase 3 — Client
- [x] Onboarding: jurisdiction → profile (3-step flow)
- [x] Timeline view with source panel and verified badge
- [x] What-if simulator with confidence display
- [x] Grounded chat with AI guardrail panel
- [x] Documents tab
- [x] i18n: English + Telugu + Hindi

## Phase 4 — AI Integration
- [x] Intent classifier (Claude Haiku, graceful fallback)
- [x] AI interface layer with grounding contract + allowedScope
- [x] Response validator (rejects out-of-scope AI output)

## Phase 5 — Verification
- [x] health ✓
- [x] /state eligible=true for citizen 26-60 ✓
- [x] /state eligible=false for under_18 ✓
- [x] /timeline returns 5 steps for unregistered citizen ✓
- [x] /simulate lost_id → scenario=lost_id, conf=0.60, fallback=False ✓
- [x] /simulate relocated → scenario=relocated, conf=0.65, fallback=False ✓
- [x] /simulate missed_reg → scenario=missed_registration, conf=0.80, fallback=False ✓
- [x] /simulate off-topic → fallback=True ✓
- [x] Client builds clean (vite, 214KB, 220ms) ✓
- [x] Server TypeScript compiles clean — zero errors ✓

## Review
All phases complete. System operates deterministically without ANTHROPIC_API_KEY —
AI features degrade gracefully to rule-only output. Zero hallucination risk in the
core eligibility + timeline flow.
