# Policy Explainer

A lean hackathon MVP that turns hosted policy PDFs into a chapter-by-chapter public digest.

## What this MVP does

- Serves real documents from `public/bills/`
- Lists those files on `/process` and summarizes on demand
- Splits a PDF into chapters, asks Gemini 3.8 Flash per chapter, and stores JSON
- Lets anyone open `/` and the bill page to read the saved digest (no live LLM on visit)

## Run it

```bash
npm install
cp .env.example .env.local
# Paste a Gemini API key from https://aistudio.google.com/apikey
npm run dev
```

1. Open [http://localhost:3000/process](http://localhost:3000/process)
2. Click **Summarize** and watch the log under the card (a 300-page budget can take several minutes). **Continue** resumes saved chapters; **Start over** re-runs from scratch.
3. Open [http://localhost:3000](http://localhost:3000) and read the breakdown

## Swap or add a document

1. Drop a `.pdf`, `.md`, or `.txt` file into `public/bills/`
2. Optionally add title/date/teaser in `data/bills.ts`
3. Run **Summarize** on `/process`

The digest is written to `data/summaries/{slug}.json`.

## Out of scope for this lean MVP

Auth, admin uploads, user-uploaded bills, African language support, email subscriptions, and a separate backend worker. Those belong in a later full MVP.
