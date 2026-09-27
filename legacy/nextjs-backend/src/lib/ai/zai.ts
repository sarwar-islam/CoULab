// ============================================================================
// AI orchestrator wrapper (T5/T6/T7) — z-ai-web-dev-sdk, backend only.
//
// Design rules (case PDF):
//  - Four thin, separately-testable functions — NOT an agent framework.
//  - Every call returns a structured result + a logged reasoning summary.
//  - Failure handling: if the AI service is unavailable the module MUST fail
//    visibly and safely (explicit AI_UNAVAILABLE state), never silently
//    fabricate content.
//  - Guardrail: AI may explain/check published rules; it does NOT decide
//    eligibility. Sensitive/ambiguous intake is handed to a human.
// ============================================================================

import ZAI from "z-ai-web-dev-sdk";

export interface AiTextResult {
  text: string;
  aiAvailable: boolean;
  failureReason?: string;
}

export async function aiChat(
  systemPrompt: string,
  userPrompt: string,
  opts: { temperature?: number } = {},
): Promise<AiTextResult> {
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: opts.temperature ?? 0.3,
    });
    const text = completion.choices[0]?.message?.content ?? "";
    if (!text.trim()) {
      return { text: "", aiAvailable: false, failureReason: "EMPTY_AI_RESPONSE" };
    }
    return { text, aiAvailable: true };
  } catch (err) {
    return {
      text: "",
      aiAvailable: false,
      failureReason: err instanceof Error ? err.message : "AI_UNAVAILABLE",
    };
  }
}

/** Best-effort JSON extraction from a model response. */
export function parseJsonLoose<T>(text: string): T | null {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
