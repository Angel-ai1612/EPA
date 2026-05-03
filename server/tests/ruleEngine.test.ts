import { describe, it, expect, beforeEach } from "vitest";
import {
  registerRulePack, getRulePack,
  evaluateEligibility, generateTimeline,
  simulateScenario, buildMeta,
} from "../src/engine/ruleEngine";
import { sanitizePII } from "../src/middleware/piiSanitiser";
import type { RulePack, UserInput } from "../src/types";

// ─── Minimal test rule pack ───────────────────────────────────────────────────
const TEST_PACK: RulePack = {
  jurisdictionId: "TEST-01",
  authority: "Test Authority",
  authorityUrl: "https://test.example.com",
  lastUpdated: "2026-01-01",
  version: "0.0.1",
  effectiveFrom: "2026-06-01",
  electionDate: "2026-06-01",
  rules: {
    eligibility: [
      {
        ruleId: "underage",
        condition: { ageGroup: ["under_18"] },
        result: "ineligible",
        reason: { en: "Must be 18+", te: "18+ ఉండాలి", hi: "18+ होना चाहिए" },
        source: { label: "Test", url: "https://test.example.com", lastUpdated: "2026-01-01" },
      },
      {
        ruleId: "non_citizen",
        condition: { citizenship: ["non_citizen"] },
        result: "ineligible",
        reason: { en: "Citizens only", te: "పౌరులు మాత్రమే", hi: "केवल नागरिक" },
        source: { label: "Test", url: "https://test.example.com", lastUpdated: "2026-01-01" },
      },
      {
        ruleId: "eligible",
        condition: {
          and: [
            { ageGroup: ["18_to_25", "26_to_60", "over_60"] },
            { citizenship: ["citizen", "nri"] },
          ],
        },
        result: "eligible",
        reason: { en: "Eligible to vote" },
        source: { label: "Test", url: "https://test.example.com", lastUpdated: "2026-01-01" },
      },
    ],
    timeline: [
      {
        stepId: "check_list",
        order: 1,
        label: { en: "Check voter list" },
        description: { en: "Verify your name on the roll" },
        consequence: { en: "Cannot vote if not on list" },
        deadline: { type: "absolute", value: "2026-05-01", label: { en: "May 1, 2026" } },
        status: "required",
        channel: "online",
        prerequisiteStepIds: [],
        source: { label: "Test", url: "https://test.example.com", lastUpdated: "2026-01-01" },
      },
      {
        stepId: "register",
        order: 2,
        label: { en: "Register to vote" },
        description: { en: "Submit Form 6" },
        consequence: { en: "Cannot vote without registration" },
        deadline: { type: "relative_to_election", value: "-30d", label: { en: "30 days before election" } },
        status: "blocking",
        channel: "both",
        prerequisiteStepIds: ["check_list"],
        source: { label: "Test", url: "https://test.example.com", lastUpdated: "2026-01-01" },
      },
      {
        stepId: "cast_vote",
        order: 3,
        label: { en: "Cast your vote" },
        description: { en: "Vote on election day" },
        consequence: { en: "Miss this election cycle" },
        deadline: { type: "absolute", value: "2026-06-01", label: { en: "June 1, 2026" } },
        status: "required",
        channel: "offline",
        prerequisiteStepIds: ["register"],
        source: { label: "Test", url: "https://test.example.com", lastUpdated: "2026-01-01" },
      },
    ],
    scenarios: [
      {
        scenarioId: "lost_id",
        triggerKeywords: ["lost id", "no id", "missing card"],
        intentTags: ["LOST_DOCUMENT"],
        conditions: [],
        outcomes: [
          {
            label: { en: "Use alternate ID" },
            description: { en: "12 alternate IDs accepted" },
            steps: ["cast_vote"],
            urgency: "medium",
            source: { label: "Test", url: "https://test.example.com", lastUpdated: "2026-01-01" },
          },
        ],
        confidenceThreshold: 0.45,
        fallbackMessage: { en: "Please contact helpline" },
      },
    ],
    documents: [
      {
        docId: "voter_id",
        label: { en: "Voter ID (EPIC)" },
        description: { en: "Your photo identity card" },
        alternatives: [{ en: "Aadhaar" }, { en: "Passport" }],
      },
    ],
  },
};

const ELIGIBLE_INPUT: UserInput = {
  jurisdictionId: "TEST-01",
  ageGroup: "26_to_60",
  citizenship: "citizen",
  registrationStatus: "not_registered",
  isFirstTimeVoter: false,
};

const ELIGIBLE_STATE = {
  ...ELIGIBLE_INPUT,
  eligible: true,
  eligibilityReasons: [{ en: "Eligible to vote" }],
  blockingReasons: [],
};

// ─── Rule Pack Registry ───────────────────────────────────────────────────────
describe("registerRulePack / getRulePack", () => {
  beforeEach(() => { registerRulePack(TEST_PACK); });

  it("registers and retrieves a rule pack by ID", () => {
    const pack = getRulePack("TEST-01");
    expect(pack).not.toBeNull();
    expect(pack?.jurisdictionId).toBe("TEST-01");
    expect(pack?.version).toBe("0.0.1");
  });

  it("returns null for unknown jurisdiction", () => {
    expect(getRulePack("UNKNOWN-99")).toBeNull();
  });
});

// ─── Eligibility Engine ───────────────────────────────────────────────────────
describe("evaluateEligibility", () => {
  beforeEach(() => { registerRulePack(TEST_PACK); });

  it("marks an adult citizen as eligible", () => {
    const state = evaluateEligibility(ELIGIBLE_INPUT, TEST_PACK);
    expect(state.eligible).toBe(true);
    expect(state.blockingReasons).toHaveLength(0);
    expect(state.eligibilityReasons.length).toBeGreaterThan(0);
  });

  it("marks under_18 as ineligible", () => {
    const input: UserInput = { ...ELIGIBLE_INPUT, ageGroup: "under_18" };
    const state = evaluateEligibility(input, TEST_PACK);
    expect(state.eligible).toBe(false);
    expect(state.blockingReasons[0].en).toMatch(/18/);
  });

  it("marks non_citizen as ineligible", () => {
    const input: UserInput = { ...ELIGIBLE_INPUT, citizenship: "non_citizen" };
    const state = evaluateEligibility(input, TEST_PACK);
    expect(state.eligible).toBe(false);
    expect(state.blockingReasons[0].en).toMatch(/citizen/i);
  });

  it("under_18 non_citizen has two blocking reasons", () => {
    const input: UserInput = { ...ELIGIBLE_INPUT, ageGroup: "under_18", citizenship: "non_citizen" };
    const state = evaluateEligibility(input, TEST_PACK);
    expect(state.eligible).toBe(false);
    expect(state.blockingReasons).toHaveLength(2);
  });

  it("NRI adult is eligible (conditional)", () => {
    const input: UserInput = { ...ELIGIBLE_INPUT, citizenship: "nri" };
    const state = evaluateEligibility(input, TEST_PACK);
    expect(state.eligible).toBe(true);
  });

  it("preserves all user input fields in returned state", () => {
    const state = evaluateEligibility(ELIGIBLE_INPUT, TEST_PACK);
    expect(state.jurisdictionId).toBe("TEST-01");
    expect(state.ageGroup).toBe("26_to_60");
    expect(state.isFirstTimeVoter).toBe(false);
  });
});

// ─── Timeline Engine ──────────────────────────────────────────────────────────
describe("generateTimeline", () => {
  beforeEach(() => { registerRulePack(TEST_PACK); });

  it("returns steps for an eligible unregistered user", () => {
    const steps = generateTimeline(ELIGIBLE_STATE, TEST_PACK);
    expect(steps.length).toBeGreaterThan(0);
  });

  it("returns empty array for ineligible user", () => {
    const ineligible = { ...ELIGIBLE_STATE, eligible: false };
    const steps = generateTimeline(ineligible, TEST_PACK);
    expect(steps).toHaveLength(0);
  });

  it("skips register step when already registered", () => {
    const registered = {
      ...ELIGIBLE_STATE,
      registrationStatus: "registered" as const,
    };
    const steps = generateTimeline(registered, TEST_PACK);
    const ids = steps.map(s => s.stepId);
    expect(ids).not.toContain("register");
    // check_list has no skip rule in test pack (only IN-AP skips check_voter_list)
  });

  it("returns steps sorted by order ascending", () => {
    const steps = generateTimeline(ELIGIBLE_STATE, TEST_PACK);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].order).toBeGreaterThanOrEqual(steps[i - 1].order);
    }
  });

  it("resolves relative deadline from election date", () => {
    const steps = generateTimeline(ELIGIBLE_STATE, TEST_PACK);
    const reg = steps.find(s => s.stepId === "register");
    if (reg) {
      // -30d from 2026-06-01 = 2026-05-02
      expect(reg.deadline.value).toBe("2026-05-02");
    }
  });

  it("marks past deadlines as isPast=true", () => {
    const steps = generateTimeline(ELIGIBLE_STATE, TEST_PACK);
    // check_list deadline is 2026-05-01 — check if it's past
    const step = steps.find(s => s.stepId === "check_list");
    if (step) {
      const isPastExpected = new Date("2026-05-01") < new Date();
      expect(step.deadline.isPast).toBe(isPastExpected);
    }
  });
});

// ─── What-if Simulator ────────────────────────────────────────────────────────
describe("simulateScenario", () => {
  beforeEach(() => { registerRulePack(TEST_PACK); });

  it("matches lost_id scenario by exact keyword", () => {
    const result = simulateScenario("I have a missing card", ELIGIBLE_STATE, TEST_PACK);
    expect(result.usedFallback).toBe(false);
    expect(result.scenarioId).toBe("lost_id");
    expect(result.confidence).toBeGreaterThan(0.45);
  });

  it("matches by partial keyword overlap", () => {
    const result = simulateScenario("missing voter card", ELIGIBLE_STATE, TEST_PACK);
    expect(result.usedFallback).toBe(false);
  });

  it("matches via AI intent tag", () => {
    const result = simulateScenario("what to do", ELIGIBLE_STATE, TEST_PACK, ["LOST_DOCUMENT"]);
    expect(result.usedFallback).toBe(false);
    expect(result.scenarioId).toBe("lost_id");
  });

  it("falls back for off-topic query", () => {
    const result = simulateScenario("what is the weather today in delhi", ELIGIBLE_STATE, TEST_PACK);
    expect(result.usedFallback).toBe(true);
    expect(result.outcomes).toHaveLength(0);
  });

  it("includes affected steps in result", () => {
    const result = simulateScenario("lost id", ELIGIBLE_STATE, TEST_PACK);
    expect(result.affectedSteps.length).toBeGreaterThan(0);
  });

  it("confidence is between 0 and 1", () => {
    const result = simulateScenario("lost id", ELIGIBLE_STATE, TEST_PACK);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

// ─── buildMeta ────────────────────────────────────────────────────────────────
describe("buildMeta", () => {
  it("returns correct jurisdiction and version", () => {
    const meta = buildMeta(TEST_PACK, { test: true });
    expect(meta.jurisdiction).toBe("TEST-01");
    expect(meta.ruleVersion).toBe("0.0.1");
  });

  it("generates a consistent hash for same payload", () => {
    const m1 = buildMeta(TEST_PACK, { key: "value" });
    const m2 = buildMeta(TEST_PACK, { key: "value" });
    expect(m1.responseHash).toBe(m2.responseHash);
  });

  it("generates different hash for different payload", () => {
    const m1 = buildMeta(TEST_PACK, { key: "a" });
    const m2 = buildMeta(TEST_PACK, { key: "b" });
    expect(m1.responseHash).not.toBe(m2.responseHash);
  });

  it("includes sources array with authority", () => {
    const meta = buildMeta(TEST_PACK, {});
    expect(meta.sources.length).toBeGreaterThan(0);
    expect(meta.sources[0].label).toBe("Test Authority");
  });

  it("includes ISO timestamp", () => {
    const meta = buildMeta(TEST_PACK, {});
    expect(() => new Date(meta.timestamp)).not.toThrow();
  });
});

// ─── PII Sanitiser ────────────────────────────────────────────────────────────
describe("sanitizePII", () => {
  it("redacts 12-digit Aadhaar numbers", () => {
    expect(sanitizePII("My Aadhaar is 123456789012")).toBe("My Aadhaar is [AADHAAR]");
  });

  it("redacts Indian mobile numbers", () => {
    expect(sanitizePII("Call me at 9876543210")).toBe("Call me at [PHONE]");
  });

  it("redacts email addresses", () => {
    expect(sanitizePII("Email me at test@example.com")).toBe("Email me at [EMAIL]");
  });

  it("redacts PAN numbers", () => {
    expect(sanitizePII("My PAN is ABCDE1234F")).toBe("My PAN is [PAN]");
  });

  it("does not alter clean text", () => {
    const clean = "I lost my voter id card near the polling booth";
    expect(sanitizePII(clean)).toBe(clean);
  });

  it("redacts multiple PII types in one string", () => {
    const raw = "Name: Ravi, Phone: 9876543210, Aadhaar: 123456789012";
    const clean = sanitizePII(raw);
    expect(clean).not.toContain("9876543210");
    expect(clean).not.toContain("123456789012");
    expect(clean).toContain("[PHONE]");
    expect(clean).toContain("[AADHAAR]");
  });

  it("handles empty string safely", () => {
    expect(sanitizePII("")).toBe("");
  });

  it("does not redact 11-digit numbers (not Aadhaar length)", () => {
    const input = "Ref: 12345678901 items";
    const result = sanitizePII(input);
    expect(result).toBe(input);
  });
});
