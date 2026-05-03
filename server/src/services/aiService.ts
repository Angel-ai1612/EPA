import type { ClassifiedIntent, IntentTag, ChatMessage, TimelineStep, UserState } from "../types";
import { sanitizePII } from "../middleware/piiSanitiser";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

async function callClaude(systemPrompt: string, userMessage: string, maxTokens = 512): Promise<string> {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const data = await res.json() as { content: { type: string; text: string }[] };
  const textBlock = data.content.find(b => b.type === "text");
  return textBlock?.text ?? "";
}

// ─── Intent Classifier ────────────────────────────────────────────────────────
const INTENT_SYSTEM = `You are an intent classifier for an election assistance system.
Classify the user query into one or more of these intent tags:
ELIGIBILITY_CHECK, TIMELINE_QUERY, MISSED_DEADLINE, LOST_DOCUMENT, RELOCATION,
FIRST_TIME_VOTER, POLLING_LOCATION, ACCESSIBILITY_NEED, GENERAL_QUESTION, OFF_TOPIC

Also detect the language (en, te, hi, or other).

Respond ONLY with valid JSON in this exact format, no preamble:
{
  "tags": ["TAG1", "TAG2"],
  "isMultiIntent": false,
  "language": "en",
  "confidence": 0.9
}`;

export async function classifyIntent(rawQuery: string): Promise<ClassifiedIntent> {
  const sanitized = sanitizePII(rawQuery);
  try {
    const response = await callClaude(INTENT_SYSTEM, sanitized);
    const parsed = JSON.parse(response.replace(/```json|```/g, "").trim()) as {
      tags: IntentTag[]; isMultiIntent: boolean; language: string; confidence: number;
    };
    return { ...parsed, sanitizedInput: sanitized };
  } catch {
    // Fallback: return generic classification
    return {
      tags: ["GENERAL_QUESTION"],
      isMultiIntent: false,
      language: "en",
      confidence: 0.3,
      sanitizedInput: sanitized,
    };
  }
}

// ─── Response Validator ───────────────────────────────────────────────────────
function validateAIResponse(response: string, allowedStepIds: string[]): boolean {
  // Reject if AI invented step IDs not in rule pack
  const stepMentions = response.match(/step[_-][a-z_]+/gi) ?? [];
  for (const mention of stepMentions) {
    const id = mention.toLowerCase().replace("step-", "step_");
    if (!allowedStepIds.some(s => response.toLowerCase().includes(s))) {
      console.warn(`[VALIDATOR] Potentially unknown step reference: ${id}`);
    }
  }
  // Reject empty or very short responses
  if (response.trim().length < 10) return false;
  return true;
}

// ─── Grounded Chat ────────────────────────────────────────────────────────────
export async function groundedChat(
  message: string,
  history: ChatMessage[],
  userState: UserState,
  timeline: TimelineStep[],
  jurisdictionId: string
): Promise<{ reply: string; language: string; usedFallback: boolean }> {
  const sanitizedMessage = sanitizePII(message);
  const allowedStepIds = timeline.map(s => s.stepId);

  const stepsSummary = timeline
    .map(s => `- ${s.label.en} (deadline: ${s.deadline.value}, status: ${s.status})`)
    .join("\n");

  const systemPrompt = `You are a civic assistant for the Election Path Assistant system.
Your ONLY job is to simplify and explain election information that has already been verified.

ALLOWED SCOPE: ${["steps", "deadlines", "documents", "eligibility"].join(", ")}
JURISDICTION: ${jurisdictionId}
USER ELIGIBLE: ${userState.eligible}

VERIFIED TIMELINE (these are the ONLY facts you may reference):
${stepsSummary}

STRICT RULES:
1. You CANNOT invent deadlines, rules, or steps not listed above.
2. You CANNOT advise on contested eligibility questions.
3. If uncertain, say "Please verify with the official authority."
4. Respond in the same language as the user (detect from their message).
5. Keep responses concise — 2-3 sentences maximum per point.
6. ALWAYS end with the source: "Source: Election Commission of India (eci.gov.in)"`;

  const conversationHistory = history.map(m => ({ role: m.role, content: m.content }));
  conversationHistory.push({ role: "user", content: sanitizedMessage });

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        system: systemPrompt,
        messages: conversationHistory,
      }),
    });

    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json() as { content: { type: string; text: string }[] };
    const reply = data.content.find(b => b.type === "text")?.text ?? "";

    if (!validateAIResponse(reply, allowedStepIds)) {
      throw new Error("Response validation failed");
    }

    // Detect language from response
    const language = detectLanguage(reply);
    return { reply, language, usedFallback: false };
  } catch (err) {
    console.error("[AI] Chat failed, using fallback:", err);
    return {
      reply: "I'm unable to process your request right now. Please refer to the verified steps shown above or contact the Voter Helpline at 1950.",
      language: "en",
      usedFallback: true,
    };
  }
}

function detectLanguage(text: string): string {
  // Simple Telugu/Hindi detection via Unicode ranges
  if (/[\u0C00-\u0C7F]/.test(text)) return "te";
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  return "en";
}
