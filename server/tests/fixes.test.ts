import { describe, it, expect } from "vitest";
import { evaluateEligibility, resolveDeadline } from "../src/engine/ruleEngine";
import { sanitizePII } from "../src/middleware/piiSanitiser";
import type { RulePack, UserInput } from "../../shared/src/types";

describe("Rule Engine Fixes", () => {
  const MOCK_PACK: RulePack = {
    jurisdictionId: "TEST",
    authority: "Test",
    authorityUrl: "http://test.com",
    lastUpdated: "2024-01-01",
    version: "1.0.0",
    effectiveFrom: "2024-01-01",
    electionDate: "2024-05-13",
    rules: {
      eligibility: [
        {
          ruleId: "implicit_and",
          condition: {
            ageGroup: ["18_to_25"],
            citizenship: ["citizen"]
          },
          result: "eligible",
          reason: { en: "Match" },
          source: { label: "Test", url: "http://test.com", lastUpdated: "2024-01-01" }
        }
      ],
      timeline: [],
      scenarios: [],
      documents: []
    }
  };

  it("evaluateCondition supports implicit AND (multiple fields in one condition)", () => {
    const matchInput: UserInput = {
      jurisdictionId: "TEST",
      ageGroup: "18_to_25",
      citizenship: "citizen",
      registrationStatus: "unknown",
      isFirstTimeVoter: false
    };
    const mismatchInput: UserInput = {
      jurisdictionId: "TEST",
      ageGroup: "18_to_25",
      citizenship: "nri",
      registrationStatus: "unknown",
      isFirstTimeVoter: false
    };

    const matchState = evaluateEligibility(matchInput, MOCK_PACK);
    expect(matchState.eligible).toBe(true);
    expect(matchState.eligibilityReasons).toHaveLength(1);

    const mismatchState = evaluateEligibility(mismatchInput, MOCK_PACK);
    // It's not in ineligibleRules, but it also won't match any eligibleRules.
    // Actually evaluateEligibility filters rules that match.
    // If it doesn't match the only rule, matchedRules will be empty.
    // ineligibleRules will be empty -> eligible = true (default when no ineligible rules match).
    // This depends on how the rule pack is structured.
    // In EPA, usually there's an explicit ineligible rule.

    // Let's test evaluateCondition indirectly by adding an ineligible rule with implicit AND.
    const INELIGIBLE_PACK: RulePack = {
        ...MOCK_PACK,
        rules: {
            ...MOCK_PACK.rules,
            eligibility: [
                {
                    ruleId: "blocking_and",
                    condition: {
                        ageGroup: ["under_18"],
                        citizenship: ["citizen"]
                    },
                    result: "ineligible",
                    reason: { en: "Blocked" },
                    source: { label: "Test", url: "http://test.com", lastUpdated: "2024-01-01" }
                }
            ]
        }
    };

    const blockInput: UserInput = {
        jurisdictionId: "TEST",
        ageGroup: "under_18",
        citizenship: "citizen",
        registrationStatus: "unknown",
        isFirstTimeVoter: false
    };
    const allowInput: UserInput = {
        jurisdictionId: "TEST",
        ageGroup: "under_18",
        citizenship: "non_citizen",
        registrationStatus: "unknown",
        isFirstTimeVoter: false
    };

    expect(evaluateEligibility(blockInput, INELIGIBLE_PACK).eligible).toBe(false);
    expect(evaluateEligibility(allowInput, INELIGIBLE_PACK).eligible).toBe(true);
  });

  it("resolveDeadline handles invalid dates gracefully", () => {
    const step: any = {
      stepId: "test",
      deadline: {
        type: "absolute",
        value: "TBD",
        label: { en: "To be decided" }
      }
    };
    const resolved = resolveDeadline(step);
    expect(resolved.deadline.isPast).toBe(false);
  });
});

describe("PII Sanitiser Fixes", () => {
  it("redacts Indian Passport numbers (1 letter + 7 digits)", () => {
    expect(sanitizePII("Passport: Z1234567")).toBe("Passport: [PASSPORT]");
    expect(sanitizePII("Passport: A1234567")).toBe("Passport: [PASSPORT]");
  });

  it("does not redact non-passport strings", () => {
    expect(sanitizePII("Passport: ABC12345")).toBe("Passport: ABC12345");
  });
});
