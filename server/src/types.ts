// ─── Translation Keys ───────────────────────────────────────────────────────
export type TranslationKey = string;

export interface LocalizedString {
  en: string;
  te?: string;
  hi?: string;
}

// ─── Jurisdiction ────────────────────────────────────────────────────────────
export type JurisdictionId = string; // e.g. "IN-AP", "IN-TG"

export interface JurisdictionMeta {
  id: JurisdictionId;
  country: string;
  state: string;
  authority: string;
  authorityUrl: string;
}

// ─── User State ──────────────────────────────────────────────────────────────
export type AgeGroup = "under_18" | "18_to_25" | "26_to_60" | "over_60";
export type CitizenshipStatus = "citizen" | "nri" | "non_citizen";
export type RegistrationStatus = "registered" | "not_registered" | "unknown";

export interface UserInput {
  jurisdictionId: JurisdictionId;
  ageGroup: AgeGroup;
  citizenship: CitizenshipStatus;
  registrationStatus: RegistrationStatus;
  isFirstTimeVoter: boolean;
}

export interface UserState extends UserInput {
  eligible: boolean;
  eligibilityReasons: LocalizedString[];
  blockingReasons: LocalizedString[];
}

// ─── Timeline ────────────────────────────────────────────────────────────────
export type StepStatus = "required" | "optional" | "blocking" | "completed" | "skipped";
export type DeadlineType = "absolute" | "relative_to_election" | "dynamic";

export interface DeadlineSpec {
  type: DeadlineType;
  value: string;        // ISO date | "-30d" | "TBD"
  label: LocalizedString;
  isPast?: boolean;
}

export interface TimelineStep {
  stepId: string;
  order: number;
  label: LocalizedString;
  description: LocalizedString;
  consequence: LocalizedString;  // what happens if skipped
  deadline: DeadlineSpec;
  status: StepStatus;
  channel: "online" | "offline" | "both";
  prerequisiteStepIds: string[];
  source: SourceRef;
  documentIds?: string[];  // required docs for this step
}

export interface SourceRef {
  label: string;
  url: string;
  lastUpdated: string;
}

// ─── Documents ───────────────────────────────────────────────────────────────
export interface DocumentRequirement {
  docId: string;
  label: LocalizedString;
  description: LocalizedString;
  alternatives?: LocalizedString[];
  officialLink?: string;
}

// ─── Scenarios (What-if) ─────────────────────────────────────────────────────
export interface ScenarioRule {
  scenarioId: string;
  triggerKeywords: string[];
  intentTags: string[];  // matched by AI classifier
  conditions: ScenarioCondition[];
  outcomes: ScenarioOutcome[];
  confidenceThreshold: number;
  fallbackMessage: LocalizedString;
}

export interface ScenarioCondition {
  field: keyof UserState;
  operator: "eq" | "neq" | "in";
  value: unknown;
}

export interface ScenarioOutcome {
  label: LocalizedString;
  description: LocalizedString;
  steps: string[];  // stepIds still applicable
  urgency: "low" | "medium" | "high" | "critical";
  source: SourceRef;
}

// ─── Rule Pack ───────────────────────────────────────────────────────────────
export interface RulePack {
  jurisdictionId: JurisdictionId;
  authority: string;
  authorityUrl: string;
  lastUpdated: string;
  version: string;
  effectiveFrom: string;   // election date
  electionDate?: string;   // used for deadline calculation
  rules: {
    eligibility: EligibilityRule[];
    timeline: TimelineStep[];
    scenarios: ScenarioRule[];
    documents: DocumentRequirement[];
  };
}

export interface EligibilityRule {
  ruleId: string;
  condition: EligibilityCondition;
  result: "eligible" | "ineligible" | "conditional";
  reason: LocalizedString;
  source: SourceRef;
}

export interface EligibilityCondition {
  ageGroup?: AgeGroup[];
  citizenship?: CitizenshipStatus[];
  not?: EligibilityCondition;
  and?: EligibilityCondition[];
  or?: EligibilityCondition[];
}

// ─── API Contracts ────────────────────────────────────────────────────────────
export interface StateRequest {
  input: UserInput;
}

export interface StateResponse {
  userState: UserState;
  meta: ResponseMeta;
}

export interface TimelineRequest {
  jurisdictionId: JurisdictionId;
  userState: UserState;
}

export interface TimelineResponse {
  steps: TimelineStep[];
  documents: DocumentRequirement[];
  meta: ResponseMeta;
}

export interface SimulateRequest {
  query: string;
  userState: UserState;
  jurisdictionId: JurisdictionId;
}

export interface SimulateResponse {
  scenarioId?: string;
  outcomes: ScenarioOutcome[];
  affectedSteps: TimelineStep[];
  confidence: number;
  usedFallback: boolean;
  fallbackMessage?: LocalizedString;
  meta: ResponseMeta;
}

export interface ChatRequest {
  message: string;
  history: ChatMessage[];
  userState: UserState;
  timeline: TimelineStep[];
  jurisdictionId: JurisdictionId;
}

export interface ChatResponse {
  reply: string;
  language: string;
  usedFallback: boolean;
  meta: ResponseMeta;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ResponseMeta {
  ruleVersion: string;
  jurisdiction: JurisdictionId;
  responseHash: string;
  sources: SourceRef[];
  timestamp: string;
}

// ─── Intent Classification ────────────────────────────────────────────────────
export type IntentTag =
  | "ELIGIBILITY_CHECK"
  | "TIMELINE_QUERY"
  | "MISSED_DEADLINE"
  | "LOST_DOCUMENT"
  | "RELOCATION"
  | "FIRST_TIME_VOTER"
  | "POLLING_LOCATION"
  | "ACCESSIBILITY_NEED"
  | "GENERAL_QUESTION"
  | "OFF_TOPIC";

export interface ClassifiedIntent {
  tags: IntentTag[];
  isMultiIntent: boolean;
  language: string;
  confidence: number;
  sanitizedInput: string;
}
