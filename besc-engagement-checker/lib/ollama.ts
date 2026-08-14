export class OllamaError extends Error {}

// Local CPU inference on a self-hosted model can be genuinely slow —
// generous timeout, but still a hard one. Learned this lesson the hard way
// with the Vee3 "loads forever" bug: an external call with no deadline
// leaves the UI spinning with no way out. Sized for the default 14B model on
// CPU; tighten this back up if you drop to a smaller model.
const REQUEST_TIMEOUT_MS = 90000;

export function ollamaConfigured(): boolean {
  return Boolean(process.env.OLLAMA_URL && process.env.OLLAMA_MODEL);
}

function buildPrompt(text: string, numVariants: number): string {
  return `You are optimizing an X (Twitter) post to score higher against a real, published ranking algorithm. Rules that matter, from the actual production weights:
- Ending with a genuine, specific question or clear stance dramatically increases "reply" likelihood (weighted 10-40x higher than a like) — a generic "thoughts?" bolted onto unrelated content doesn't count, it needs to actually fit what the post says.
- ALL-CAPS words, punctuation bursts (!!!, ???), and more than 2 hashtags are penalized as spam signals.
- Generic broadcast phrasing ("like and retweet", "link in bio", "follow for follow") is heavily penalized as spam.
- Keep the total length under 280 characters.
- Never invent facts, numbers, names, or tickers, and never change the meaning of the original post — preserve every specific claim exactly.

Original post:
"""
${text}
"""

Write ${numVariants} alternative versions of this SAME post that are tighter, more direct, and end with a hook genuinely relevant to this specific content. Keep the author's voice and every factual claim identical — only change phrasing and structure.

Output ONLY the alternatives, each on its own line, prefixed with "VARIANT: " and nothing else. No preamble, no explanation, no extra commentary.`;
}

function parseVariants(raw: string, max: number): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^variant:?\s*/i.test(line))
    .map((line) => line.replace(/^variant:?\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, max);
}

export async function generateRewriteCandidates(
  text: string,
  numVariants = 2
): Promise<string[]> {
  const url = process.env.OLLAMA_URL;
  const model = process.env.OLLAMA_MODEL;
  if (!url || !model) {
    throw new OllamaError("OLLAMA_URL/OLLAMA_MODEL not configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${url.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: buildPrompt(text, numVariants),
        stream: false,
        options: { temperature: 0.8 },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new OllamaError(`Ollama request timed out after ${(REQUEST_TIMEOUT_MS / 1000).toFixed(0)}s`);
    }
    throw new OllamaError(`Couldn't reach Ollama: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new OllamaError(`Ollama returned ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  const data = (await res.json()) as { response?: string };
  return parseVariants(data.response ?? "", numVariants);
}
