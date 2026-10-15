# Velica

Scan, save and edit documents — with an optional two-layer identity verification flow.

## The app has two tabs

| Tab | Route | What it does |
| --- | --- | --- |
| **Documents** | `/` | The primary function: photograph a document, it is saved on the device, and it opens straight in the editor. A grid of your saved scans, each editable and deletable. |
| **Verify identity** | `/verify` | The identity workflow: applicant details, ID photo and selfie, then the two-layer check below. |

Scans on the Documents tab never leave the phone — they are stored in the browser's
IndexedDB, so they work with the Mac switched off. The verification tab does use the server.

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

### Optional: AI

Only two things use a model. Add **one key** to `.env.local` and both light up; without it the
app still works and says so.

```bash
AI_API_KEY=your_key                        # Google Gemini by default
AI_READ_MODEL=gemini-2.5-flash             # reading a scan
IMAGE_EDIT_MODEL=gemini-2.5-flash-image    # the AI edit button
# Or point at any OpenAI-compatible endpoint, e.g. OpenRouter:
# AI_BASE_URL=https://openrouter.ai/api/v1
```

Configuration is layered — `AI_*` wins, then `IMAGE_EDIT_*`, then the `QWEN_*` variables the
verification flow already uses. So **if Qwen is already configured, document reading works as
it is** with no new key. See `.env.example`.

**What each one does**

- **Reading a scan** — the vision model transcribes the lines while the app supplies the
  geometry. Models read far better than they localise, so their boxes are treated as a hint:
  the locally detected box is used if theirs is missing or implausible.
- **AI edit** — describes a change and re-renders the picture.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` (or the next available port shown in terminal).

## Document detection when scanning

The scanner looks for the document while the viewfinder is live and outlines it as it finds it
("Document found"). On the shutter, the scan is cropped and perspective-corrected to the
detected corners, so a page photographed at an angle comes out flat and upright.

- **The untouched frame is always kept** as `original`; the flattened document is stored as
  `scan`. Editing works on top of `scan`, and `edited` holds the result.
- Detection is **heuristic, not machine learning** — Otsu threshold, largest blob that is not
  the background, then the blob's four extreme points as corners. It runs in about **1.7 ms** on
  a 320×240 copy of the frame, so it can run live. The warp costs about **20 ms** per capture.
- Both polarities are handled, so a dark document on a light desk works as well as the usual
  light-on-dark.
- If nothing document-shaped is found, the scan falls back to the full frame.

> **Limitation:** a page with a solid dark band spanning its whole width or height can split the
> blob search, and the scan will latch onto one part of it. Text, ruled lines and photos are
> fine; a full-width black bar is not.

### Reading a scan into a form

Opening a scan reads the document automatically. Every line of information found is
**outlined on the picture**, and a **Fields** tab appears below it with one editable box per line.
Change a value and the **picture itself is rewritten**: the old text is erased and refilled from
the surrounding paper, then the new value is drawn in the document's own colour, size and font
(shrinking to fit if it is longer). Each edit is a normal undo step.

The reading is done with **template OCR**, no model and no network:

1. Split the page into lines with a row projection, then each line into characters.
2. Pick the font whose rendered glyphs best explain the page.
3. Render `A–Z a–z 0–9` and punctuation in that font and match each character by shape,
   scoring both overlap and aspect ratio. Word gaps are inferred from wider spaces.

**With an AI key this is replaced by a vision model**, which is much more accurate. The split
of work is deliberate: the model supplies the *text*, the steps above supply the *geometry*, so
the boxes that get written back onto the page are always the locally detected ones.

> **Without a key, expect to correct it.** Character shapes are compared, not understood, so
> lookalikes (`O`/`0`, `l`/`1`, `rn`/`m`) will sometimes be wrong. That is exactly why the
> output is a form you can edit rather than a finished result — the picture is only rewritten
> once you accept a value. Fields read by the model are tagged **AI**; the offline ones show a
> percentage match.

## Where documents are saved

**Scans (Documents tab)** live on the device, in the browser's IndexedDB (`velica-documents`).
Each scan keeps the untouched `original` blob, an optional `edited` blob, and a small data-URL
thumbnail for the grid. Nothing is uploaded, and they survive without the server running.

**Verification records (`/verify` tab)** are stored on the machine running the server, one
folder per verification:

```
.data/records/<verification-id>/
├── record.json            applicant details, layer outcomes, audit trail
├── document.jpg           the untouched capture
├── document-edited.jpg    the annotated version, when edited
├── selfie.jpg
└── selfie-edited.jpg
```

The image extension follows the original format (`jpg`, `png`, `webp`, …). Nothing is
cropped or downscaled. `.data/` is gitignored because it holds identity documents.

## Run it on your phone

The camera only works in a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts),
so `http://<your-ip>:3000` will refuse to open the scanner. Serve it over HTTPS:

```bash
brew install mkcert
npm run certs      # issues a locally trusted certificate for this Mac's LAN address
npm run dev:https  # serves HTTPS on 0.0.0.0:3443
```

Then, with the phone on the same Wi-Fi:

1. Open `https://<your-ip>:3443` — `npm run certs` prints the exact URL.
   (Port 3443, not 3000, so it never collides with another dev server.)
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

## Editing captured photos

Each photo has an **Edit** button that opens a full-screen editor. The original is never
overwritten — both versions are kept on disk and you can revert at any time.

Manual tools: draw, highlight, text, black out, pixelate, blur, erase, place an image, plus
undo/redo, rotate and flip. Every change is a recipe replayed from the untouched capture, so
undo is exact and nothing is baked in.

| Tool | What it does |
| --- | --- |
| **Erase** | Paint over something and it is genuinely removed — the gap is refilled from the surrounding pixels (relaxation inpainting), not covered by a box. Works on the app, offline. |
| **Image** | Pick a photo, logo or signature from your device and drop it onto the scan. Drag to position, then Smaller / Bigger / Rotate before placing it. |
| **AI edit** | Describe a change and let an image model make it — e.g. "remove the stamp". This is the only part that needs a key and a network (see above). The result replaces the picture and stays undoable. |

### Matching text to the document

To write on a document so it does not look added, use **Match text**:

1. Drag a box around a patch of the document's existing text.
2. Optionally type the words that are in the box — that lets the font family be matched too.
3. The app takes the **colour**, **size** and **weight** straight from those pixels, and — if you
   typed the words — renders every candidate font and picks the closest glyph shapes.
4. It then hands you the text tool already configured, and a row of **real characters lifted off
   the page**, which you can stamp back down pixel-identically.

Manual controls sit alongside all of this: font family, size, bold, letter spacing, a colour
picker and an **eyedropper** that samples a colour from the page. **Load font** accepts a
`.ttf` / `.otf` / `.woff` file so an exact typeface can be used with no guessing at all.

> **Limit worth knowing:** without AI you cannot render a font the device does not have, so
> family matching is only as good as the candidate list (the common system faces). Colour, size
> and weight are measured directly and are exact. For changing existing text, stamping the
> document's own characters is pixel-perfect by definition — that is the way to get a result
> that is genuinely indistinguishable.

You can also type an instruction and press **Apply**. The prompt is interpreted **on the
device**: there is no model and no network call, so nothing about your documents leaves the
machine, and it works offline.

| Say this | Result |
| --- | --- |
| `rotate left` / `rotate right` / `turn it upside down` | quarter or half turn |
| `flip horizontally` / `mirror it` / `flip vertically` | mirror the image |
| `black out the bottom` / `white out the top third` | cover a region |
| `pixelate the top right` / `blur the middle` | mosaic or blur a region |
| `add text "COPY" at the top` | place a label |
| `make it black and white` / `sepia` / `invert` | colour treatments |
| `brighten it` / `darker` / `more contrast` / `more colourful` | adjustments |

Regions are described by position — `top`, `bottom`, `left`, `right`, `middle`, corners — and
sizes like `half`, `third`, `top 20%`. If you name a redaction without saying where, the editor
hands you the tool so you can drag over the area yourself. Each prompt counts as one undo step.

> Browser note: the colour adjustments are done with a pixel pass rather than
> `CanvasRenderingContext2D.filter`, because Safari ([including iOS](https://caniuse.com/mdn-api_canvasrenderingcontext2d_filter))
> does not support canvas filters.

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
