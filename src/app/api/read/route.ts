import { NextResponse } from "next/server";
import {
  askWithImage,
  extractJson,
  NOT_CONFIGURED_MESSAGE,
  parseDataUrl,
  readModel,
  resolveProvider,
} from "@/lib/services/ai-provider";

/**
 * Reads a scanned document with a vision model.
 *
 * Boxes are requested on a 0-1000 scale and are treated as a hint: the client
 * already knows where the lines are from local detection, so a missing or
 * implausible box falls back to that rather than being trusted blindly.
 */

const PROMPT = [
  "You are transcribing a scanned document.",
  "Transcribe every line of text exactly as it appears, in reading order from top to bottom.",
  "Do not translate, correct, summarise or explain. Preserve numbers, punctuation and capitalisation exactly.",
  "Return ONLY minified JSON in this shape:",
  '{"lines":[{"text":"the line of text","box":[ymin,xmin,ymax,xmax]}]}',
  "box values are integers from 0 to 1000 measured on the image, where ymin/xmin is the top-left of that line and ymax/xmax is the bottom-right.",
  "Give one entry per visual line. If a line cannot be located, use [0,0,0,0].",
].join(" ");

type ReadLine = { text: string; box?: [number, number, number, number] };

function toBox(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 4) {
    return undefined;
  }

  const numbers = value.map((entry) => Number(entry));
  if (!numbers.every((entry) => Number.isFinite(entry))) {
    return undefined;
  }

  return [numbers[0], numbers[1], numbers[2], numbers[3]];
}

function toLines(payload: unknown): ReadLine[] {
  const container =
    payload && typeof payload === "object" && "lines" in payload
      ? (payload as { lines?: unknown }).lines
      : payload;

  if (!Array.isArray(container)) {
    return [];
  }

  const lines: ReadLine[] = [];

  for (const entry of container) {
    if (typeof entry === "string") {
      const text = entry.trim();
      if (text) {
        lines.push({ text });
      }
      continue;
    }

    if (entry && typeof entry === "object") {
      const record = entry as { text?: unknown; box?: unknown; line?: unknown };
      const text = String(record.text ?? record.line ?? "").trim();
      if (text) {
        lines.push({ text, box: toBox(record.box) });
      }
    }
  }

  return lines;
}

export async function POST(request: Request) {
  const provider = resolveProvider();

  if (!provider) {
    return NextResponse.json({ error: NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  let body: { image?: string };
  try {
    body = (await request.json()) as { image?: string };
  } catch {
    return NextResponse.json({ error: "That request wasn't valid JSON." }, { status: 400 });
  }

  const dataUrl = body.image ?? "";
  const image = dataUrl ? parseDataUrl(dataUrl) : null;

  if (!image) {
    return NextResponse.json(
      { error: "An image data URL is required." },
      { status: 400 },
    );
  }

  const model = readModel(provider);

  try {
    const reply = await askWithImage(provider, model, PROMPT, image);
    const lines = toLines(extractJson(reply));

    if (lines.length === 0) {
      return NextResponse.json(
        {
          error:
            "The model replied but no lines could be read from it. Try again, or use the offline reader.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ lines, model });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reading the document failed." },
      { status: 502 },
    );
  }
}
