# Ollama service (Railway)

A standalone Railway service running [Ollama](https://ollama.com) with a model
baked into the image at build time. `besc-engagement-checker` calls this over
Railway's private network to generate creative rewrite candidates — every
candidate still gets scored and gated through the app's own deterministic
scorer, so this only ever *suggests*, never decides.

## Setup (Railway dashboard)

1. **New Service → Deploy from GitHub repo** → pick this same repo
   (`BESCLLC/x-algo-BESC-twitter-engagement-`).
2. **Name the service `ollama`** — this becomes its internal hostname
   (`ollama.railway.internal`). Using a different name works too, just adjust
   `OLLAMA_URL` in step 5 to match.
3. **Settings → Source → Root Directory**: set to `ollama-service`. Railway
   will auto-detect the `Dockerfile` here and build it directly — no
   `railway.json` needed.
4. **Sizing**: the default model is `qwen2.5:14b-instruct` (~9GB on disk at
   Ollama's default quantization) — give this service at least **16GB RAM**
   (Settings → Resources, or your plan's equivalent) to leave headroom for
   inference on top of the weights themselves. CPU inference at this size
   will be noticeably slower per request (many seconds, not instant) — that's
   expected. If it's too slow or OOMs, drop to `llama3.1:8b` (~8GB RAM) or
   `llama3.2:3b` (~4GB RAM) by editing the `ARG MODEL` line in `Dockerfile`.
5. **Deploy.** The first build pulls the model into the image layer — at 14B
   size this can take a while (progress shows in the build log — watch for
   `ollama pull` output; make sure your Railway build timeout is generous
   enough). Every deploy after that reuses the baked-in model, so restarts
   are instant.
6. Once it's live, go to the **besc-engagement-checker** service's Variables
   and add:
   - `OLLAMA_URL=http://ollama.railway.internal:11434`
   - `OLLAMA_MODEL=qwen2.5:14b-instruct` (match whatever `ARG MODEL` you built with)

If the app can't reach it, double check **Private Networking** is enabled on
both services (Railway project settings) — it's on by default for services
created in the same project, but worth a quick check.
