import OpenAI from "openai";

/**
 * NVIDIA Integrate API client (OpenAI-compatible), with automatic fallback
 * to the z-ai-web-dev-sdk when NVIDIA is unavailable or timing out.
 *
 *   Primary: NVIDIA Integrate API  →  z-ai/glm-5.3-flash
 *   Fallback: z-ai-web-dev-sdk      →  whatever model the SDK picks
 *
 * Used as the SpeakFix agent's "brain" — both for the report-mode conversation
 * (buildAgentSystemPrompt) and the resolve-mode conversation
 * (buildResolveSystemPrompt), plus the cautious resolution check.
 *
 * Server-only. Never import this from a client component.
 *
 * Note on the glm-5.3 family: these are "thinking" models, they produce a
 * `reasoning_content` field first (the chain of thought) and then the
 * `content` field (the actual answer). We need enough `max_tokens` for
 * BOTH, otherwise the response gets cut off mid-thought and `content`
 * comes back as null. We only return `content` to callers.
 */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const NVIDIA_BASE_URL = requireEnv("NVIDIA_BASE_URL");
export const NVIDIA_API_KEY = requireEnv("NVIDIA_API_KEY");
export const NVIDIA_MODEL = requireEnv("NVIDIA_MODEL");

let client: OpenAI | null = null;


export function getNvidiaClient(): OpenAI {
  if (client) return client;
  client = new OpenAI({
    baseURL: NVIDIA_BASE_URL,
    apiKey: NVIDIA_API_KEY,
    
    timeout: 6_000,
    maxRetries: 1,
  });
  return client;
}


async function fallbackZaiChat(
  messages: { role: "system" | "user" | "assistant"; content: string }[]
): Promise<string> {
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const res = await zai.chat.completions.create({
      messages,
      thinking: { type: "disabled" },
    });
    return res.choices[0]?.message?.content ?? "";
  } catch (err) {
    console.error("[nvidia-llm] fallback also failed:", err instanceof Error ? err.message : String(err));
    return "";
  }
}

/**
 * Chat completion against the NVIDIA-hosted z-ai/glm-5.3-flash model, with
 * automatic fallback to the z-ai-web-dev-sdk when NVIDIA is unavailable or
 * times out. Returns the assistant's text `content` (not the
 * reasoning_content) or "" on failure.
 */
export async function nvidiaChatCompletion(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const isVercel = Boolean(process.env.VERCEL);
  if (isVercel) {
    return fallbackZaiChat(messages);
  }

  const openai = getNvidiaClient();
  try {
    const completion = await openai.chat.completions.create({
      model: NVIDIA_MODEL,
      messages,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 2048,
      top_p: 1,
      stream: false,
    });
    const content = completion.choices[0]?.message?.content ?? "";
    if (content.trim()) return content;
    console.warn("[nvidia-llm] empty content, falling back to z-ai SDK");
  } catch (err) {
    console.error("[nvidia-llm] chat completion failed:", err instanceof Error ? err.message : String(err));
  }
  return fallbackZaiChat(messages);
}
