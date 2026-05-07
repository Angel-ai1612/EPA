/**
 * @fileoverview EPA Rule Engine — deterministic, zero-AI fact layer.
 * All election rules are evaluated here. AI is never consulted for facts.
 * @module ruleEngine
 */

import type {
  RulePack, UserInput, UserState, TimelineStep, SimulateResponse,
  EligibilityCondition, EligibilityRule, ScenarioRule, LocalizedString,
  ResponseMeta,
} from "../../shared/src/types";
import { createHash } from "crypto";

// ─── Rule Pack Registry ───────────────────────────────────────────────────────
const rulePacks: Map<string, RulePack> = new Map();

/**
 * Register a jurisdiction rule pack into the in-memory registry.
 * Must be called at server startup before any API requests are handled.
 */
export function registerRulePack(pack: RulePack): void {
  rulePacks.set(pack.jurisdictionId, pack);
}

/**
 * Retrieve a registered rule pack by jurisdiction ID.
 * @returns The rule pack, or null if not found.
 */
export function getRulePack(jurisdictionId: string): RulePack | null {
  return rulePacks.get(jurisdictionId) ?? null;
}

/**
 * Get all registered jurisdiction IDs.
 */
export function getRegisteredJurisdictions(): string[] {
  return Array.from(rulePacks.keys());
}

// ─── Eligibility Engine ───────────────────────────────────────────────────────

/**
 * Recursively evaluate a single eligibility condition against user input.
 * Supports: ageGroup, citizenship, not, and, or — composable boolean logic.
 */
export function evaluateCondition(condition: EligibilityCondition, input: UserInput): boolean {
  if (condition.ageGroup && !condition.ageGroup.includes(input.ageGroup)) return false;
  if (condition.citizenship && !condition.citizenship.includes(input.citizenship)) return false;
  if (condition.not && evaluateCondition(condition.not, input)) return false;
  if (condition.and && !condition.and.every(c => evaluateCondition(c, input))) return false;
  if (condition.or && !condition.or.some(c => evaluateCondition(c, input))) return false;
  return true; // empty condition = always match
}

/**
 * Evaluate all eligibility rules in a rule pack against the user's input.
 * Returns a UserState with eligible flag, reasons, and blocking reasons.
 * A single ineligible match makes the user ineligible (AND semantics across rules).
 */
export function evaluateEligibility(input: UserInput, pack: RulePack): UserState {
  const matchedRules: EligibilityRule[] = pack.rules.eligibility.filter(rule =>
    evaluateCondition(rule.condition, input)
  );

  const ineligibleRules   = matchedRules.filter(r => r.result === "ineligible");
  const eligible          = ineligibleRules.length === 0;
  const eligibilityReasons: LocalizedString[] = matchedRules
    .filter(r => r.result === "eligible" || r.result === "conditional")
    .map(r => r.reason);
  const blockingReasons: LocalizedString[] = ineligibleRules.map(r => r.reason);

  return { ...input, eligible, eligibilityReasons, blockingReasons };
}

// ─── Timeline Engine ──────────────────────────────────────────────────────────

/**
 * Resolve relative deadlines (e.g. "-30d") against the election date.
 * Marks each deadline as isPast if the resolved date is in the past.
 */
export function resolveDeadline(step: TimelineStep, electionDate?: string): TimelineStep {
  if (step.deadline.type === "relative_to_election" && electionDate) {
    const election = new Date(electionDate);
    if (!isNaN(election.getTime())) {
      const match = step.deadline.value.match(/^(-?\d+)d$/);
      if (match) {
        const days = parseInt(match[1], 10);
        const resolved = new Date(election);
        resolved.setDate(resolved.getDate() + days);
        return {
          ...step,
          deadline: {
            ...step.deadline,
            value: resolved.toISOString().split("T")[0],
            isPast: resolved < new Date(),
          },
        };
      }
    }
  }
  const d = new Date(step.deadline.value);
  const isPast = !isNaN(d.getTime()) && d < new Date();
  return {
    ...step,
    deadline: {
      ...step.deadline,
      isPast,
    },
  };
}

/**
 * Generate a personalised, ordered voting timeline for an eligible user.
 * Steps are filtered based on registration status and sorted by order.
 * Returns an empty array for ineligible users.
 */
export function generateTimeline(userState: UserState, pack: RulePack): TimelineStep[] {
  if (!userState.eligible) return [];

  return pack.rules.timeline
    .filter(step => {
      if (step.stepId === "register"          && userState.registrationStatus === "registered") return false;
      if (step.stepId === "check_voter_list"  && userState.registrationStatus === "registered") return false;
      return true;
    })
    .map(step  => resolveDeadline(step, pack.electionDate))
    .sort((a, b) => a.order - b.order);
}

// ─── What-if Simulator ────────────────────────────────────────────────────────

/**
 * Score a query against a keyword list.
 * Uses best-single-match strategy: returns the highest individual match score,
 * not the fraction of all keywords matched (which would unfairly penalise
 * scenarios with many trigger words).
 */
function keywordMatch(query: string, keywords: string[]): number {
  const q     = query.toLowerCase();
  const words = q.split(/\s+/);
  let best    = 0;

  for (const keyword of keywords) {
    const kLower = keyword.toLowerCase();
    const kWords = kLower.split(/\s+/);
    if (q.includes(kLower)) {
      // Full phrase match — score increases with phrase length (more specific = more confident)
      const score = 0.5 + Math.min(0.5, kWords.length * 0.15);
      if (score > best) best = score;
    } else {
      // Partial word overlap
      const overlap = kWords.filter(kw => kw.length >= 4 && words.some(w => w.length >= 4 && (w === kw || w.includes(kw)))).length;
      const partialScore = (overlap / kWords.length) * 0.55;
      if (partialScore > best) best = partialScore;
    }
  }
  return best;
}

/**
 * Match a user's what-if query to a scenario rule using keyword scoring
 * and optional AI intent tags, then return verified outcomes.
 *
 * Falls back gracefully if no scenario matches above the confidence threshold.
 * AI intent tags improve matching accuracy but are never required.
 */
export function simulateScenario(
  query: string,
  userState: UserState,
  pack: RulePack,
  aiIntentTags?: string[]
): Omit<SimulateResponse, "meta"> {
  const scenarios = pack.rules.scenarios;
  let bestMatch: { scenario: ScenarioRule; score: number } | null = null;

  for (const scenario of scenarios) {
    const keywordScore = keywordMatch(query, scenario.triggerKeywords);
    const tagScore     = aiIntentTags
      ? scenario.intentTags.filter(t => aiIntentTags.includes(t)).length / Math.max(scenario.intentTags.length, 1)
      : 0;
    const score = Math.max(keywordScore, tagScore * 0.8);

    const conditionsMet = scenario.conditions.every(cond => {
      const fieldValue = userState[cond.field as keyof UserState];
      if (cond.operator === "eq")  return fieldValue === cond.value;
      if (cond.operator === "neq") return fieldValue !== cond.value;
      if (cond.operator === "in")  return Array.isArray(cond.value) && (cond.value as unknown[]).includes(fieldValue);
      return true;
    });

    if (conditionsMet && score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { scenario, score };
    }
  }

  // Below threshold → fallback with authority link
  if (!bestMatch || bestMatch.score < bestMatch.scenario.confidenceThreshold) {
    const fallback = bestMatch?.scenario.fallbackMessage ?? {
      en: "Unable to find a matching scenario. Please check the official authority or contact the Voter Helpline at 1950.",
      te: "సరిపోలే దృష్టాంతాన్ని కనుగొనలేకపోయాం. దయచేసి 1950లో Voter Helpline సంప్రదించండి.",
      hi: "मेल खाने वाला परिदृश्य नहीं मिला। कृपया 1950 पर Voter Helpline से संपर्क करें।",
    };
    return {
      outcomes: [], affectedSteps: [],
      confidence: bestMatch?.score ?? 0,
      usedFallback: true, fallbackMessage: fallback,
    };
  }

  const { scenario, score } = bestMatch;
  const affectedStepIds     = scenario.outcomes.flatMap(o => o.steps);
  const affectedSteps       = pack.rules.timeline
    .filter(s => affectedStepIds.includes(s.stepId))
    .map(s   => resolveDeadline(s, pack.electionDate));

  return {
    scenarioId:   scenario.scenarioId,
    outcomes:     scenario.outcomes,
    affectedSteps,
    confidence:   score,
    usedFallback: false,
  };
}

// ─── Response Meta Builder ────────────────────────────────────────────────────

/**
 * Build the ResponseMeta object attached to every API response.
 * Includes rule version, jurisdiction, SHA-256 response hash (first 16 chars),
 * and all source attributions from the rule pack.
 *
 * The responseHash enables audit log correlation and tamper detection.
 */
export function buildMeta(pack: RulePack, payload: unknown): ResponseMeta {
  const hash    = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
  const sources = [
    { label: pack.authority,                       url: pack.authorityUrl,              lastUpdated: pack.lastUpdated },
    { label: "National Voters' Service Portal",    url: "https://voters.eci.gov.in",    lastUpdated: pack.lastUpdated },
  ];
  return {
    ruleVersion:  pack.version,
    jurisdiction: pack.jurisdictionId,
    responseHash: hash,
    sources,
    timestamp:    new Date().toISOString(),
  };
}
