# Velica Verify

Document verification MVP with a two-layer identity workflow and Qwen2.5-VL-72B extraction.

## Verification Flow

1. User submits registration details plus a document image and selfie.
2. LLM extraction runs through Qwen2.5-VL-72B (OpenAI-compatible API).
3. Layer 1 database check runs (TransUnion/Equifax mock adapter).
4. If Layer 1 is `match`: instant approval.
5. If Layer 1 is `no_match` or `flagged`: Layer 2 biometric check runs (Jumio/Onfido mock adapter).
6. Final status is approved/rejected with an audit trail.

## Tech Stack

- Next.js 16 App Router + TypeScript
- Tailwind CSS 4
- Zod validation
- Verification records saved to disk under `.data/records/` (gitignored)

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

## Where documents are saved

Captures are stored on the machine running the server, one folder per verification:

```
.data/records/<verification-id>/
├── record.json    applicant details, layer outcomes, audit trail
├── document.jpg   the untouched capture
└── selfie.jpg
```

The image extension follows the original format (`jpg`, `png`, `webp`, …). Nothing is
cropped or downscaled. `.data/` is gitignored because it holds identity documents.

## Run it on your phone

The camera only works in a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts),
so `http://<your-ip>:3000` will refuse to open the scanner. Serve it over HTTPS:

```bash
brew install mkcert
npm run certs      # issues a locally trusted certificate for this Mac's LAN address
npm run dev:https  # serves HTTPS on 0.0.0.0:3000
```

Then, with the phone on the same Wi-Fi:

1. Open `https://<your-ip>:3000` — `npm run certs` prints the exact URL.
2. Trust the mkcert root certificate, otherwise the browser blocks the connection:
   - Send `rootCA.pem` (from `mkcert -CAROOT`) to the phone.
   - **iOS:** Settings → Profile Downloaded → Install, then Settings → General → About →
     Certificate Trust Settings → enable full trust for mkcert.
   - **Android:** Settings → Security → Encryption & credentials → Install a certificate →
     CA certificate.
3. Share → Add to Home Screen to install it as an app.

> `next start` has no HTTPS flag in Next.js 16, which is why HTTPS serving uses `next dev`.
> For production mode, or to reach the app from outside your network, put it behind
> `tailscale serve` (real certificate, no trust steps) or a local `caddy` reverse proxy.

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
