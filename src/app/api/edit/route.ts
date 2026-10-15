import { NextResponse } from "next/server";
import {
  editModel,
  NOT_CONFIGURED_MESSAGE,
  parseDataUrl,
  resolveProvider,
  type AiProvider,
  type ParsedImage,
} from "@/lib/services/ai-provider";

/**
 * Prompt-driven image editing through an image model — the one feature that
 * cannot work offline. Works with Google Gemini natively, or any
 * OpenAI-compatible endpoint that can return images.
 */

async function editWithGemini(
  provider: AiProvider,
  model: string,
  prompt: string,
  image: ParsedImage,
): Promise<string | null> {
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
  provider: AiProvider,
  model: string,
  prompt: string,
  dataUrl: string,
): Promise<string | null> {
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

  // OpenRouter-style: the image arrives as its own part on the message.
  const firstImage = message?.images?.[0]?.image_url?.url;
  if (firstImage) {
    return firstImage;
  }

  // Others inline it as markdown inside the text.
  const content = typeof message?.content === "string" ? message.content : "";
  const match = /data:image\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=]+/i.exec(content);
  return match ? match[0] : null;
}

export async function POST(request: Request) {
  const provider = resolveProvider();

  if (!provider) {
    return NextResponse.json({ error: NOT_CONFIGURED_MESSAGE }, { status: 503 });
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

  const image = parseDataUrl(dataUrl);
  if (!image) {
    return NextResponse.json({ error: "The image must be a data URL." }, { status: 400 });
  }

  const model = editModel(provider);

  try {
    const result = provider.isGemini
      ? await editWithGemini(provider, model, prompt, image)
      : await editOpenAiCompatible(provider, model, prompt, dataUrl);

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
