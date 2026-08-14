import { WEIGHTS, BOILERPLATE_PHRASES } from "./scoring";

export class OllamaError extends Error {}

// Local CPU inference on a self-hosted model can be genuinely slow —
// generous timeout, but still a hard one. Learned this lesson the hard way
// with the Vee3 "loads forever" bug: an external call with no deadline
// leaves the UI spinning with no way out. Sized for the default 14B model on
// CPU; tighten this back up if you drop to a smaller model.
const REQUEST_TIMEOUT_MS = 100000;

// Unbounded generation is the other half of the timeout risk: nothing was
// capping how many tokens the model could produce before stopping on its
// own, so a verbose response could run long regardless of the timeout. Two
// short rewrite variants need well under this many tokens.
const MAX_OUTPUT_TOKENS = 250;

export function ollamaConfigured(): boolean {
  return Boolean(process.env.OLLAMA_URL && process.env.OLLAMA_MODEL);
}

const HEALTH_CHECK_TIMEOUT_MS = 8000;

// A generate-request timeout is ambiguous on its own: it can't tell you
// whether the model was genuinely slow, or the request never actually
// reached the server at all (wrong URL, private networking not enabled,
// service down) and just happened to hang until the same deadline. This
// hits Ollama's lightweight /api/tags endpoint first, with its own short
// timeout, so a connectivity failure is reported as exactly that instead of
// masquerading as "the model is slow" — and confirms the configured model
// is actually loaded before spending up to REQUEST_TIMEOUT_MS finding out
// it isn't.
async function checkOllamaHealth(url: string, model: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${url.replace(/\/$/, "")}/api/tags`, { signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new OllamaError(
        `Ollama isn't reachable at all: the connectivity check itself timed out after ${(HEALTH_CHECK_TIMEOUT_MS / 1000).toFixed(0)}s. This points at a networking problem (wrong OLLAMA_URL, private networking not enabled between the two services, or the ollama service is down/still starting), not a slow model.`
      );
    }
    throw new OllamaError(
      `Can't reach Ollama at ${url}: ${(err as Error).message}. Check OLLAMA_URL and that private networking is enabled on both services.`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new OllamaError(
      `Ollama responded to the connectivity check with HTTP ${res.status} — it's reachable but not healthy.`
    );
  }

  const data = (await res.json().catch(() => ({}))) as { models?: { name?: string; model?: string }[] };
  const available = (data.models ?? []).map((m) => m.name ?? m.model ?? "").filter(Boolean);
  if (available.length > 0 && !available.includes(model)) {
    throw new OllamaError(
      `Ollama is reachable, but model "${model}" isn't loaded there. Available: ${available.join(", ")}. Check OLLAMA_MODEL matches exactly what was pulled.`
    );
  }
}

// Pulls the real weights straight from scoring.ts (the same numbers the
// deterministic optimizer and every risk/tip cite) instead of a hand-picked
// subset baked into prose — so the model is chasing the actual ranked
// hierarchy of what matters, and this can't quietly drift out of sync with
// the real scorer as weights change. Kept as terse as possible: on CPU,
// prefill time scales directly with prompt length, and a real deploy log
// showed 683 input tokens from the old, more verbose version of this prompt
// alone, before generation even starts.
function buildPrompt(text: string, numVariants: number, charLimit: number): string {
  const boilerplateSample = BOILERPLATE_PHRASES.slice(0, 3).join('", "');
  return `Rewrite an X post to score higher on a weighted-action ranking algorithm. Weights (weight x probability, summed):
+${WEIGHTS.shareViaCopyLink} share-via-copy-link (highest weight; needs a concrete hook/stat/story, not vague)
+${WEIGHTS.reply}/+${WEIGHTS.reply + WEIGHTS.bidirectionalReplyBoost} reply (end with a specific question fitting THIS content, not generic "thoughts?")
+${WEIGHTS.quote} quote, +${WEIGHTS.shareViaDm} DM-share, +${WEIGHTS.followAuthor} follow, +${WEIGHTS.share} share, +${WEIGHTS.retweet} repost, +${WEIGHTS.favorite} like (lowest, don't chase)
${WEIGHTS.report} report, ${WEIGHTS.muteAuthor} mute, ${WEIGHTS.notInterested} not-interested, ${WEIGHTS.blockAuthor} block: triggered by ALL-CAPS, !!!/???, >2 hashtags, boilerplate like "${boilerplateSample}", shortened links.
Also avoid filler words (very/just/actually/I think) and passive voice; open with the point, not a wind-up. Max ${charLimit.toLocaleString()} chars. Never invent facts/names/numbers; preserve every claim exactly.

Post:
"""
${text}
"""

Write ${numVariants} tighter rewrites of this SAME post, same voice and facts, each ending with a hook relevant to this content. Output only lines starting "VARIANT: ", nothing else.`;
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
  numVariants = 2,
  charLimit = 280
): Promise<string[]> {
  const url = process.env.OLLAMA_URL;
  const model = process.env.OLLAMA_MODEL;
  if (!url || !model) {
    throw new OllamaError("OLLAMA_URL/OLLAMA_MODEL not configured");
  }

  await checkOllamaHealth(url, model);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${url.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: buildPrompt(text, numVariants, charLimit),
        stream: false,
        options: { temperature: 0.8, num_predict: MAX_OUTPUT_TOKENS },
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
