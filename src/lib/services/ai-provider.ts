/**
 * One place to resolve the AI provider, shared by reading and editing.
 *
 * Configuration is layered so a single key is usually enough: the AI_* vars win,
 * then the feature-specific ones, then the QWEN_* vars already used by the
 * verification flow. Google Gemini is the default because it needs only a key.
 */

export type AiProvider = {
  baseUrl: string;
  apiKey: string;
  isGemini: boolean;
};

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export function resolveProvider(): AiProvider | null {
  const apiKey =
    process.env.AI_API_KEY ??
    process.env.IMAGE_EDIT_API_KEY ??
    process.env.QWEN_API_KEY;

  if (!apiKey) {
    return null;
  }

  const baseUrl = (
    process.env.AI_BASE_URL ??
    process.env.IMAGE_EDIT_BASE_URL ??
    process.env.QWEN_BASE_URL ??
    GEMINI_BASE_URL
  ).replace(/\/$/, "");

  return {
    baseUrl,
    apiKey,
    isGemini: baseUrl.includes("generativelanguage.googleapis.com"),
  };
}

/** Vision model used to transcribe a document. */
export function readModel(provider: AiProvider): string {
  return (
    process.env.AI_READ_MODEL ??
    process.env.QWEN_MODEL ??
    (provider.isGemini ? "gemini-2.5-flash" : "google/gemini-2.5-flash")
  );
}

/** Image model used to re-render a picture from a prompt. */
export function editModel(provider: AiProvider): string {
  return (
    process.env.IMAGE_EDIT_MODEL ??
    (provider.isGemini ? "gemini-2.5-flash-image" : "google/gemini-2.5-flash-image-preview")
  );
}

export const NOT_CONFIGURED_MESSAGE =
  "AI isn't set up yet. Add AI_API_KEY (or IMAGE_EDIT_API_KEY) to .env.local, " +
  "then restart the server. See the README.";

export type ParsedImage = { mimeType: string; base64: string };

export function parseDataUrl(value: string): ParsedImage | null {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/i.exec(value);
  return match ? { mimeType: match[1], base64: match[2] } : null;
}

/** Sends an image plus a prompt and returns the model's text reply. */
export async function askWithImage(
  provider: AiProvider,
  model: string,
  prompt: string,
  image: ParsedImage,
): Promise<string> {
  if (provider.isGemini) {
    const response = await fetch(`${provider.baseUrl}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": provider.apiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: image.mimeType, data: image.base64 } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`The model refused the request (${response.status}).`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    return (payload.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();
  }

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`The model refused the request (${response.status}).`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return (payload.choices?.[0]?.message?.content ?? "").trim();
}

/** Pulls the first JSON value out of a reply that may be wrapped in prose or fences. */
export function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const attempts = [cleaned];

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    attempts.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    attempts.push(cleaned.slice(firstBracket, lastBracket + 1));
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // Try the next shape.
    }
  }

  return null;
}
