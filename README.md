# Velica Verify

Document verification MVP with a two-layer identity workflow and Qwen2.5-VL-72B extraction.

## Verification Flow

1. User submits registration details plus document image (and optional selfie).
2. LLM extraction runs through Qwen2.5-VL-72B (OpenAI-compatible API).
3. Layer 1 database check runs (TransUnion/Equifax mock adapter).
4. If Layer 1 is `match`: instant approval.
5. If Layer 1 is `no_match` or `flagged`: Layer 2 biometric check runs (Jumio/Onfido mock adapter).
6. Final status is approved/rejected with an audit trail.

## Tech Stack

- Next.js 16 App Router + TypeScript
- Tailwind CSS 4
- Zod validation
- In-memory verification store (MVP)

## Environment Variables

Create `.env.local` in project root:

```bash
QWEN_BASE_URL=https://your-openai-compatible-endpoint/v1
QWEN_API_KEY=your_api_key
QWEN_MODEL=Qwen/Qwen2.5-VL-72B-Instruct
```

If `QWEN_BASE_URL` or `QWEN_API_KEY` is missing, the app uses a safe fallback extraction for local development.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` (or the next available port shown in terminal).

## API Endpoints

- `POST /api/verify/start`
	- Starts verification and returns `verificationId`
- `GET /api/verify/status?id=<verificationId>`
	- Returns current status, decision, and audit trail

## Validation Scripts

```bash
npm run lint
npm run typecheck
npm run build
```
