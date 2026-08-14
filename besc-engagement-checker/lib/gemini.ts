import { buildRewritePrompt, parseVariants } from "./aiPrompt";

export class GeminiError extends Error {}

// Hosted API, not self-hosted CPU inference — no cold-start/model-loading
// story here, so a much shorter timeout than the Ollama path is safe and
// keeps a real outage from stalling the response for anywhere near as long.
const REQUEST_TIMEOUT_MS = 20000;

const MAX_OUTPUT_TOKENS = 250;

const DEFAULT_MODEL = "gemini-2.5-flash";

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

export async function generateRewriteCandidatesGemini(
  text: string,
  numVariants = 2,
  charLimit = 280
): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError("GEMINI_API_KEY not configured");
  }
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildRewritePrompt(text, numVariants, charLimit) }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: MAX_OUTPUT_TOKENS },
        }),
        signal: controller.signal,
      }
    );
  } catch (err) {
    if (controller.signal.aborted) {
      throw new GeminiError(`Gemini request timed out after ${(REQUEST_TIMEOUT_MS / 1000).toFixed(0)}s`);
    }
    throw new GeminiError(`Couldn't reach Gemini: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GeminiError(`Gemini returned ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  const data = (await res.json()) as GeminiResponse;
  if (data.promptFeedback?.blockReason) {
    throw new GeminiError(`Gemini blocked the request: ${data.promptFeedback.blockReason}`);
  }

  const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return parseVariants(raw, numVariants);
}
