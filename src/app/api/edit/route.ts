import { NextResponse } from "next/server";

/**
 * Prompt-driven image editing through an image model. This is the one feature
 * that cannot work offline, so it is opt-in: without IMAGE_EDIT_API_KEY the
 * route explains what to set rather than failing obscurely.
 *
 * Works with either shape:
 *   - Google Gemini native  (generativelanguage.googleapis.com)
 *   - any OpenAI-compatible chat endpoint that can return images
 */

const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-image";
const DEFAULT_OPENAI_MODEL = "google/gemini-2.5-flash-image-preview";

type ParsedImage = { mimeType: string; base64: string };

function parseDataUrl(value: string): ParsedImage | null {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/i.exec(value);
  return match ? { mimeType: match[1], base64: match[2] } : null;
}

async function editWithGemini(
  baseUrl: string,
  model: string,
  apiKey: string,
  prompt: string,
  image: ParsedImage,
): Promise<string | null> {
  const response = await fetch(`${baseUrl}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
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
    throw new Error(`The image model refused the request (${response.status}).`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType?: string; data?: string };
          inline_data?: { mime_type?: string; data?: string };
        }>;
      };
    }>;
  };

  for (const part of payload.candidates?.[0]?.content?.parts ?? []) {
    const inline = part.inlineData ?? part.inline_data;
    if (inline?.data) {
      const mime = part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? "image/png";
      return `data:${mime};base64,${inline.data}`;
    }
  }

  return null;
}

async function editOpenAiCompatible(
  baseUrl: string,
  model: string,
  apiKey: string,
  prompt: string,
  dataUrl: string,
): Promise<string | null> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`The image model refused the request (${response.status}).`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        images?: Array<{ image_url?: { url?: string } }>;
      };
    }>;
  };

  const message = payload.choices?.[0]?.message;

  // OpenRouter-style: the image is a separate part on the message.
  const firstImage = message?.images?.[0]?.image_url?.url;
  if (firstImage) {
    return firstImage;
  }

  // Others inline the image as markdown inside the text.
  const content = typeof message?.content === "string" ? message.content : "";
  const match = /data:image\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=]+/i.exec(content);
  return match ? match[0] : null;
}

export async function POST(request: Request) {
  const apiKey = process.env.IMAGE_EDIT_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "AI editing isn't set up yet. Add IMAGE_EDIT_API_KEY (and optionally IMAGE_EDIT_MODEL) " +
          "to .env.local, then restart the server. See the README.",
      },
      { status: 503 },
    );
  }

  let body: { image?: string; prompt?: string };
  try {
    body = (await request.json()) as { image?: string; prompt?: string };
  } catch {
    return NextResponse.json({ error: "That request wasn't valid JSON." }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  const dataUrl = body.image ?? "";

  if (!prompt || !dataUrl) {
    return NextResponse.json(
      { error: "A prompt and an image are both required." },
      { status: 400 },
    );
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return NextResponse.json({ error: "The image must be a data URL." }, { status: 400 });
  }

  const baseUrl = (process.env.IMAGE_EDIT_BASE_URL ?? DEFAULT_GEMINI_BASE_URL).replace(/\/$/, "");
  const isGemini = baseUrl.includes("generativelanguage.googleapis.com");
  const model =
    process.env.IMAGE_EDIT_MODEL ?? (isGemini ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENAI_MODEL);

  try {
    const result = isGemini
      ? await editWithGemini(baseUrl, model, apiKey, prompt, parsed)
      : await editOpenAiCompatible(baseUrl, model, apiKey, prompt, dataUrl);

    if (!result) {
      return NextResponse.json(
        { error: "The model replied but didn't include an image." },
        { status: 502 },
      );
    }

    return NextResponse.json({ image: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The AI edit failed." },
      { status: 502 },
    );
  }
}
