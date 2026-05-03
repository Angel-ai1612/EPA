# Election Path Assistant (EPA) v4.2

> Deterministic-first civic tech. Logic Sandwich architecture.
> Zero AI-generated facts. All election rules come from verified rule packs.

---

## Architecture

```
Client (React) → API Gateway (Express) → Rule Engine → AI Interface (Claude Haiku)
                                              ↑
                                         Rule Packs (IN-AP, ...)
```

**The Logic Sandwich:**
1. **Intent Layer** — AI classifies query (never makes facts)
2. **Truth Layer** — Deterministic rule engine returns verified steps/deadlines/scenarios
3. **Interface Layer** — AI simplifies the verified output only

---

## Quick Start

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Set environment variables

```bash
# server/.env
ANTHROPIC_API_KEY=your_key_here
PORT=3001
```

> The app works without `ANTHROPIC_API_KEY` — AI features gracefully fall back to rule-only output.

### 3. Start development servers

**Terminal 1 — Server:**
```bash
npm run dev:server
# Runs on http://localhost:3001
```

**Terminal 2 — Client:**
```bash
npm run dev:client
# Runs on http://localhost:5173
```

---

## Project Structure

```
epa/
├── shared/src/types.ts          # All TypeScript contracts
├── server/
│   ├── src/
│   │   ├── types.ts             # (copy of shared types)
│   │   ├── engine/
│   │   │   ├── ruleEngine.ts    # Core: eligibility + timeline + what-if
│   │   │   └── rulePacks/
│   │   │       └── IN-AP.ts     # Andhra Pradesh rule pack (ECI sourced)
│   │   ├── services/
│   │   │   └── aiService.ts     # Intent classifier + grounded chat
│   │   ├── middleware/
│   │   │   ├── piiSanitiser.ts  # Strips Aadhaar, phone, email, PAN
│   │   │   └── auditLogger.ts   # JSONL audit trail
│   │   └── index.ts             # Express API + rate limiting
└── client-app/
    └── src/App.tsx              # Full SPA: onboarding + timeline + what-if + chat
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/state` | Evaluate eligibility from user input |
| POST | `/api/v1/timeline` | Generate verified voting timeline |
| POST | `/api/v1/simulate` | What-if scenario simulation |
| POST | `/api/v1/chat` | Grounded AI chat (scoped to rule output) |
| GET | `/api/health` | Health check |

---

## Adding a New Jurisdiction

1. Create `server/src/engine/rulePacks/IN-TG.ts` (copy IN-AP as template)
2. Update all fields: `jurisdictionId`, `authority`, `electionDate`, rules
3. Register in `server/src/index.ts`:
   ```ts
   import { IN_TG_RULE_PACK } from "./engine/rulePacks/IN-TG";
   registerRulePack(IN_TG_RULE_PACK);
   ```
4. Add to `JURISDICTIONS` array in `client-app/src/App.tsx`

---

## Security

- **PII Stripping**: Aadhaar (12-digit), phone numbers, emails, PAN, passport removed from all inputs before AI processing
- **Rate Limiting**: 60 requests/minute per IP (in-memory; use Redis in production)
- **AI Guardrails**: AI receives locked `allowedScope` context; response validated before display
- **Audit Logging**: Every request logged to `server/logs/audit-YYYY-MM-DD.jsonl`

---

## Rule Pack Sources

All rules for `IN-AP` are sourced from:
- [Election Commission of India](https://eci.gov.in)
- [National Voters' Service Portal](https://voters.eci.gov.in)

Last updated: April 2026. Rule pack version: `1.0.0`.
