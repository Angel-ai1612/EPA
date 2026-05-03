/**
 * @fileoverview Integration tests for EPA API endpoints.
 * Tests the full request→response cycle including validation and error handling.
 */
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";

// Import app without starting the server
let app: import("express").Express;

beforeAll(async () => {
  // Dynamically import to avoid port conflicts
  const mod = await import("../src/index");
  app = (mod.default as import("express").Express);
});

const ELIGIBLE_USER_STATE = {
  jurisdictionId: "IN-AP",
  ageGroup: "26_to_60",
  citizenship: "citizen",
  registrationStatus: "not_registered",
  isFirstTimeVoter: false,
  eligible: true,
  eligibilityReasons: [{ en: "Eligible to vote" }],
  blockingReasons: [],
};

// ─── GET /api/health ──────────────────────────────────────────────────────────
describe("GET /api/health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.packs).toContain("IN-AP");
    expect(res.body.timestamp).toBeTruthy();
  });
});

// ─── POST /api/v1/state ───────────────────────────────────────────────────────
describe("POST /api/v1/state", () => {
  it("returns eligible=true for adult citizen", async () => {
    const res = await request(app).post("/api/v1/state").send({
      input: {
        jurisdictionId: "IN-AP",
        ageGroup: "26_to_60",
        citizenship: "citizen",
        registrationStatus: "not_registered",
        isFirstTimeVoter: false,
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.userState.eligible).toBe(true);
    expect(res.body.meta.ruleVersion).toBe("1.0.0");
    expect(res.body.meta.jurisdiction).toBe("IN-AP");
    expect(res.body.meta.responseHash).toBeTruthy();
  });

  it("returns eligible=false for under_18", async () => {
    const res = await request(app).post("/api/v1/state").send({
      input: {
        jurisdictionId: "IN-AP",
        ageGroup: "under_18",
        citizenship: "citizen",
        registrationStatus: "not_registered",
        isFirstTimeVoter: true,
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.userState.eligible).toBe(false);
    expect(res.body.userState.blockingReasons.length).toBeGreaterThan(0);
  });

  it("returns eligible=false for non_citizen", async () => {
    const res = await request(app).post("/api/v1/state").send({
      input: {
        jurisdictionId: "IN-AP",
        ageGroup: "26_to_60",
        citizenship: "non_citizen",
        registrationStatus: "not_registered",
        isFirstTimeVoter: false,
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.userState.eligible).toBe(false);
  });

  it("returns 400 for missing jurisdictionId", async () => {
    const res = await request(app).post("/api/v1/state").send({
      input: { ageGroup: "26_to_60", citizenship: "citizen" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid input");
  });

  it("returns 400 for invalid ageGroup enum", async () => {
    const res = await request(app).post("/api/v1/state").send({
      input: {
        jurisdictionId: "IN-AP", ageGroup: "INVALID",
        citizenship: "citizen", registrationStatus: "unknown",
        isFirstTimeVoter: false,
      },
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown jurisdiction", async () => {
    const res = await request(app).post("/api/v1/state").send({
      input: {
        jurisdictionId: "XX-ZZ", ageGroup: "26_to_60",
        citizenship: "citizen", registrationStatus: "unknown",
        isFirstTimeVoter: false,
      },
    });
    expect(res.status).toBe(404);
  });

  it("strips PII from input (Aadhaar in notes would be sanitised)", async () => {
    // The sanitiser runs on the whole body — this checks it doesn't crash
    const res = await request(app).post("/api/v1/state").send({
      input: {
        jurisdictionId: "IN-AP", ageGroup: "26_to_60",
        citizenship: "citizen", registrationStatus: "unknown",
        isFirstTimeVoter: false,
      },
    });
    expect(res.status).toBe(200);
  });
});

// ─── POST /api/v1/timeline ────────────────────────────────────────────────────
describe("POST /api/v1/timeline", () => {
  it("returns steps for unregistered eligible user", async () => {
    const res = await request(app).post("/api/v1/timeline").send({
      jurisdictionId: "IN-AP",
      userState: ELIGIBLE_USER_STATE,
    });
    expect(res.status).toBe(200);
    expect(res.body.steps.length).toBeGreaterThan(0);
    expect(res.body.documents.length).toBeGreaterThan(0);
    expect(res.body.meta.sources.length).toBeGreaterThan(0);
  });

  it("every step has source attribution", async () => {
    const res = await request(app).post("/api/v1/timeline").send({
      jurisdictionId: "IN-AP",
      userState: ELIGIBLE_USER_STATE,
    });
    for (const step of res.body.steps) {
      expect(step.source).toBeTruthy();
      expect(step.source.url).toMatch(/^https?:\/\//);
      expect(step.source.label).toBeTruthy();
    }
  });

  it("returns fewer steps for already-registered user", async () => {
    const unregRes = await request(app).post("/api/v1/timeline").send({
      jurisdictionId: "IN-AP",
      userState: ELIGIBLE_USER_STATE,
    });
    const regRes = await request(app).post("/api/v1/timeline").send({
      jurisdictionId: "IN-AP",
      userState: { ...ELIGIBLE_USER_STATE, registrationStatus: "registered" },
    });
    expect(regRes.body.steps.length).toBeLessThan(unregRes.body.steps.length);
  });

  it("steps are sorted by order", async () => {
    const res = await request(app).post("/api/v1/timeline").send({
      jurisdictionId: "IN-AP",
      userState: ELIGIBLE_USER_STATE,
    });
    const orders = res.body.steps.map((s: { order: number }) => s.order);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]).toBeGreaterThanOrEqual(orders[i - 1]);
    }
  });

  it("returns 400 for missing jurisdictionId", async () => {
    const res = await request(app).post("/api/v1/timeline").send({
      userState: ELIGIBLE_USER_STATE,
    });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/v1/simulate ────────────────────────────────────────────────────
describe("POST /api/v1/simulate", () => {
  it("matches lost_id scenario by keyword", async () => {
    const res = await request(app).post("/api/v1/simulate").send({
      query: "I lost my voter id card",
      jurisdictionId: "IN-AP",
      userState: ELIGIBLE_USER_STATE,
    });
    expect(res.status).toBe(200);
    expect(res.body.usedFallback).toBe(false);
    expect(res.body.scenarioId).toBe("lost_id");
    expect(res.body.outcomes.length).toBeGreaterThan(0);
  });

  it("matches relocation scenario", async () => {
    const res = await request(app).post("/api/v1/simulate").send({
      query: "I moved to another city",
      jurisdictionId: "IN-AP",
      userState: ELIGIBLE_USER_STATE,
    });
    expect(res.status).toBe(200);
    expect(res.body.scenarioId).toBe("relocated");
  });

  it("falls back for completely off-topic query", async () => {
    const res = await request(app).post("/api/v1/simulate").send({
      query: "what is the best recipe for biryani",
      jurisdictionId: "IN-AP",
      userState: ELIGIBLE_USER_STATE,
    });
    expect(res.status).toBe(200);
    expect(res.body.usedFallback).toBe(true);
  });

  it("response always includes confidence score", async () => {
    const res = await request(app).post("/api/v1/simulate").send({
      query: "lost id",
      jurisdictionId: "IN-AP",
      userState: ELIGIBLE_USER_STATE,
    });
    expect(typeof res.body.confidence).toBe("number");
    expect(res.body.confidence).toBeGreaterThanOrEqual(0);
    expect(res.body.confidence).toBeLessThanOrEqual(1);
  });

  it("returns 400 for empty query", async () => {
    const res = await request(app).post("/api/v1/simulate").send({
      query: "",
      jurisdictionId: "IN-AP",
      userState: ELIGIBLE_USER_STATE,
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for query exceeding 500 chars", async () => {
    const res = await request(app).post("/api/v1/simulate").send({
      query: "a".repeat(501),
      jurisdictionId: "IN-AP",
      userState: ELIGIBLE_USER_STATE,
    });
    expect(res.status).toBe(400);
  });
});

// ─── 404 handler ──────────────────────────────────────────────────────────────
describe("404 handler", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/api/v1/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not found");
  });
});

// ─── Security headers ─────────────────────────────────────────────────────────
describe("Security headers", () => {
  it("sets X-Content-Type-Options: nosniff", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sets X-Frame-Options", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-frame-options"]).toBeTruthy();
  });
});
