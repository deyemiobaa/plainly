# Policy Explainer

A lean hackathon MVP that turns a hosted bill into a plain-language digest: what changes, who it affects, and what to watch next.

## What this MVP does

- Serves one sample bill from `public/bills/`
- Shows a public home page and a breakdown page
- Summarizes with Gemini 2.5 Flash when no cached digest exists
- Falls back to `data/summaries/` so the exhibit still works without an API key

## Run it

```bash
npm install
cp .env.example .env.local
# Optional: paste a Gemini API key from https://aistudio.google.com/apikey
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Click the bill card to see the digest. “Read the original document” opens the markdown file in `public/`.

The committed file `data/summaries/youth-employment-bill.json` is used first. Delete that file and set `GEMINI_API_KEY` to generate a live digest; the result is written back so the next load is instant.

## Swap the bill

1. Replace `public/bills/youth-employment-bill.md` (or add another `.md` file).
2. Update the entry in `data/bills.ts` (title, date, teaser, slug, file path).
3. Delete the matching JSON in `data/summaries/` if you want a fresh LLM pass.

## Out of scope for this lean MVP

Auth, admin uploads, user-uploaded bills, African language support, email subscriptions, and a database. Those belong in a later full MVP.
