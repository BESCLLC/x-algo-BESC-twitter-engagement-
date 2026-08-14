# BESC Engagement Checker

Score a draft post before you publish it on X — grounded in the **real, open-sourced
For You algorithm** that lives in this repository, not vibes-based social media advice.

Paste a draft, pick your media type, optionally attach a link, and get:

- A live **BESC Score** (0-100) computed from the same `RankingScorer` formula X uses:
  `Final Score = Σ (weight_i × P(action_i))`, using the actual production weights
  mirrored in [`home-mixer/params/param.rs`](../home-mixer/params/param.rs) (reply = 5.0,
  share-via-copy-link = 20.0, report = -234.0, etc).
- A full **signal breakdown** — every action (like, reply, repost, quote, share, block,
  mute, report...) with its real weight, an estimated probability, and its contribution
  to the final score.
- **Visibility-filtering risk flags** tied to actual rules in
  [`visibility-filtering/rules/`](../visibility-filtering/rules/) and
  [`botmaker-rules/scarecrow/bot/`](../botmaker-rules/scarecrow/bot/) — shortened/redirect
  links, copy-paste boilerplate phrasing, sensitive-media interstitials, and more.
- Actionable, weight-ranked **tips** to raise your score.

## Honesty about what this is

X's real ranking uses **Phoenix**, a learned model that reads a viewer's actual action
history to predict `P(action | post, viewer)`. We don't have that model, your account's
history, or a specific viewer here — so this tool estimates action propensities from
surface-level features of your draft (length, hooks, links, formatting, etc.) and then
blends them using the **real production weights**. The weights and the visibility-filtering
rule citations are accurate to this repo; the probability estimates are a transparent
heuristic proxy for Phoenix, not the model itself. Treat the score as directional
coaching, not a guarantee — see `lib/scoring.ts` for the fully commented, from-scratch
implementation and exact source citations for every number.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + Framer Motion
- Single Node service — API route (`/api/analyze`) and frontend ship together

## Local development

```bash
npm install
npm run dev
```

## Deploying on Railway

This is a standard Next.js app — Railway's Nixpacks builder detects it automatically.

1. Create a new Railway project from this repo (or this subdirectory, if deploying as
   a monorepo service — set the service's **root directory** to `besc-engagement-checker/`).
2. Railway runs `npm install && npm run build` and starts with `npm run start`, which
   binds to Railway's injected `PORT` automatically (see `package.json`'s `start` script).
3. No environment variables or external services are required — everything runs
   server-side in this one process.

`railway.json` pins the build/start commands explicitly if you want them version-controlled.
