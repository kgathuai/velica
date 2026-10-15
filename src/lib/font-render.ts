/**
 * Canvas-side half of font matching: renders candidate fonts to ink masks,
 * loads font files, and lifts real characters off the page for stamping.
 */

import {
  cropMaskToInk,
  maskSimilarity,
  pickBestFont,
  resizeMask,
  type FontCandidate,
  type GlyphBox,
  type Mask,
} from "@/lib/font-match";

function inkMaskFromCanvas(canvas: HTMLCanvasElement): Mask | null {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = new Uint8Array(canvas.width * canvas.height);

  for (let index = 0; index < data.length; index += 1) {
    data[index] = image.data[index * 4 + 3] > 128 ? 1 : 0;
  }

  return { data, width: canvas.width, height: canvas.height };
}

/**
 * Renders `text` and returns its ink mask, sized so the ink is exactly
 * `targetInkHeight` tall — which is how a candidate is compared fairly with the
 * document sample regardless of the nominal font size.
 */
export function renderTextMask(
  text: string,
  stack: string,
  weight: number,
  targetInkHeight: number,
): Mask | null {
  if (!text.trim() || targetInkHeight < 4) {
    return null;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  const draw = (size: number): Mask | null => {
    context.font = `${weight} ${size}px ${stack}`;
    const metrics = context.measureText(text);
    const width = Math.max(1, Math.ceil(metrics.width) + 12);
    const height = Math.max(1, Math.ceil(size * 1.8));

    // Resizing the canvas resets the context, so the font is set again after.
    canvas.width = width;
    canvas.height = height;
    context.font = `${weight} ${size}px ${stack}`;
    context.textBaseline = "top";
    context.fillStyle = "#000000";
    context.fillText(text, 6, 6);

    return inkMaskFromCanvas(canvas);
  };

  const probe = draw(100);
  if (!probe) {
    return null;
  }

  const probeInk = cropMaskToInk(probe);
  if (probeInk.height < 2) {
    return null;
  }

  const size = Math.max(4, Math.round((100 * targetInkHeight) / probeInk.height));
  return draw(size);
}

export type FontMatch = {
  candidate: FontCandidate;
  weight: number;
  score: number;
};

/**
 * Tries every candidate at regular and bold, and returns the closest shape.
 * Weight is encoded into the candidate id so the tested selection function can
 * stay generic.
 */
export function matchFont(
  sample: Mask,
  text: string,
  inkHeight: number,
  candidates: FontCandidate[],
): FontMatch | null {
  const weighted: FontCandidate[] = candidates.flatMap((candidate) => [
    { id: `${candidate.id}@400`, label: candidate.label, stack: candidate.stack },
    { id: `${candidate.id}@700`, label: candidate.label, stack: candidate.stack },
  ]);

  const best = pickBestFont(sample, weighted, (option) => {
    const weight = option.id.endsWith("@700") ? 700 : 400;
    return renderTextMask(text, option.stack, weight, inkHeight);
  });

  if (!best) {
    return null;
  }

  const weight = best.candidate.id.endsWith("@700") ? 700 : 400;
  const original =
    candidates.find((candidate) => best.candidate.id.startsWith(`${candidate.id}@`)) ??
    best.candidate;

  return { candidate: original, weight, score: best.score };
}

/** Adds a font file to the document so canvas can render with it. */
export async function loadFontFile(file: File): Promise<FontCandidate> {
  const buffer = await file.arrayBuffer();
  const family = `Velica-${Date.now().toString(36)}`;
  const face = new FontFace(family, buffer);
  await face.load();
  document.fonts.add(face);

  return {
    id: family,
    label: file.name.replace(/\.[^.]+$/, "") || family,
    stack: `"${family}"`,
  };
}

/**
 * Lifts a character off the page as a transparent-background image, so stamped
 * copies are the document's own ink rather than an approximation.
 */
export function extractGlyphImage(
  source: HTMLCanvasElement,
  box: GlyphBox,
  background: [number, number, number],
  threshold = 60,
): string | null {
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, width, height);

  const image = context.getImageData(0, 0, width, height);
  const data = image.data;

  for (let index = 0; index < data.length; index += 4) {
    const distance = Math.hypot(
      data[index] - background[0],
      data[index + 1] - background[1],
      data[index + 2] - background[2],
    );

    // Pixels close to the paper colour become transparent so stamps composite.
    data[index + 3] = distance < threshold ? 0 : 255;
  }

  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Turns a data URL into a loaded image, ready to be drawn. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("We couldn't read that image."));
    image.src = url;
  });
}

export { cropMaskToInk, maskSimilarity, resizeMask };
