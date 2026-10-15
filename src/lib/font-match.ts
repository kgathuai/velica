/**
 * Matching new text to text already on a document, without any model.
 *
 * Colour, size and weight are measured straight from the pixels. The font family
 * is chosen by rendering each candidate and comparing ink shapes, so it is only
 * ever as good as the fonts available. Pure maths over buffers, so it is testable.
 */

export type RgbaImage = { data: Uint8ClampedArray; width: number; height: number };
export type SampleRegion = { x: number; y: number; width: number; height: number };

/** A binary ink mask: 1 where there is text, 0 where there is background. */
export type Mask = { data: Uint8Array; width: number; height: number };

export type FontCandidate = { id: string; label: string; stack: string };

export type InkAnalysis = {
  ink: [number, number, number];
  background: [number, number, number];
  /** Height of the ink bounding box, in pixels. */
  inkHeight: number;
  /** Mean horizontal run length of ink — a proxy for stroke thickness. */
  strokeWidth: number;
  bold: boolean;
  /** Fraction of the region covered by ink. */
  coverage: number;
};

export const TEXT_FONT_CANDIDATES: FontCandidate[] = [
  { id: "system", label: "System UI", stack: "system-ui, -apple-system, sans-serif" },
  { id: "helvetica", label: "Helvetica / Arial", stack: "Helvetica, Arial, sans-serif" },
  { id: "verdana", label: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  { id: "tahoma", label: "Tahoma", stack: "Tahoma, Geneva, sans-serif" },
  { id: "trebuchet", label: "Trebuchet MS", stack: "'Trebuchet MS', sans-serif" },
  { id: "times", label: "Times", stack: "'Times New Roman', Times, serif" },
  { id: "georgia", label: "Georgia", stack: "Georgia, serif" },
  { id: "palatino", label: "Palatino", stack: "'Palatino Linotype', Palatino, serif" },
  { id: "courier", label: "Courier", stack: "'Courier New', Courier, monospace" },
  { id: "menlo", label: "Menlo / Consolas", stack: "Menlo, Consolas, monospace" },
];

export function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Splits a region into ink and background by luminance. Works for dark text on
 * light paper and light text on a dark strip, because it looks at both ends of
 * the range rather than assuming which is which.
 */
export function analyzeInk(
  image: RgbaImage,
  region: SampleRegion,
): InkAnalysis | null {
  const left = Math.max(0, Math.round(region.x));
  const top = Math.max(0, Math.round(region.y));
  const right = Math.min(image.width, Math.round(region.x + region.width));
  const bottom = Math.min(image.height, Math.round(region.y + region.height));

  if (right - left < 3 || bottom - top < 3) {
    return null;
  }

  const luminances: number[] = [];
  let count = 0;

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const pixel = (y * image.width + x) * 4;
      luminances.push(
        luminance(image.data[pixel], image.data[pixel + 1], image.data[pixel + 2]),
      );
      count += 1;
    }
  }

  if (count === 0) {
    return null;
  }

  const sorted = [...luminances].sort((a, b) => a - b);
  const sampleSize = Math.max(1, Math.floor(sorted.length * 0.15));
  const darkest = sorted.slice(0, sampleSize);
  const brightest = sorted.slice(sorted.length - sampleSize);

  const inkLuminance = darkest.reduce((total, value) => total + value, 0) / darkest.length;
  const backgroundLuminance =
    brightest.reduce((total, value) => total + value, 0) / brightest.length;

  const spread = backgroundLuminance - inkLuminance;
  if (spread < 24) {
    // Not enough contrast to be text.
    return null;
  }

  const threshold = inkLuminance + spread * 0.5;

  // Whichever side covers less area is the ink — text never outweighs its paper.
  // This is what makes light-on-dark work as well as the usual dark-on-light.
  let darkCount = 0;
  for (const value of luminances) {
    if (value <= threshold) {
      darkCount += 1;
    }
  }
  const inkIsDark = darkCount <= luminances.length - darkCount;

  let inkR = 0;
  let inkG = 0;
  let inkB = 0;
  let inkCount = 0;
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  let bgCount = 0;

  let minInkX = right;
  let minInkY = bottom;
  let maxInkX = left;
  let maxInkY = top;
  let totalRun = 0;
  let runCount = 0;

  for (let y = top; y < bottom; y += 1) {
    let run = 0;

    for (let x = left; x < right; x += 1) {
      const pixel = (y * image.width + x) * 4;
      const r = image.data[pixel];
      const g = image.data[pixel + 1];
      const b = image.data[pixel + 2];

      const value = luminance(r, g, b);
      const isInk = inkIsDark ? value <= threshold : value >= threshold;

      if (isInk) {
        inkR += r;
        inkG += g;
        inkB += b;
        inkCount += 1;

        if (x < minInkX) minInkX = x;
        if (x > maxInkX) maxInkX = x;
        if (y < minInkY) minInkY = y;
        if (y > maxInkY) maxInkY = y;

        run += 1;
      } else {
        bgR += r;
        bgG += g;
        bgB += b;
        bgCount += 1;

        if (run > 0) {
          totalRun += run;
          runCount += 1;
          run = 0;
        }
      }
    }

    if (run > 0) {
      totalRun += run;
      runCount += 1;
    }
  }

  if (inkCount === 0) {
    return null;
  }

  const inkHeight = maxInkY - minInkY + 1;
  const strokeWidth = runCount > 0 ? totalRun / runCount : 0;

  return {
    ink: [
      inkCount > 0 ? inkR / inkCount : 0,
      inkCount > 0 ? inkG / inkCount : 0,
      inkCount > 0 ? inkB / inkCount : 0,
    ],
    background: [
      bgCount > 0 ? bgR / bgCount : 255,
      bgCount > 0 ? bgG / bgCount : 255,
      bgCount > 0 ? bgB / bgCount : 255,
    ],
    inkHeight,
    strokeWidth,
    // Serif-free text at this ratio reads as bold; tuned against real samples.
    bold: inkHeight > 0 && strokeWidth / inkHeight > 0.115,
    coverage: inkCount / count,
  };
}

/** Ink mask for a region, using the midpoint between ink and background. */
export function regionMask(
  image: RgbaImage,
  region: SampleRegion,
  analysis: InkAnalysis,
): Mask {
  const left = Math.max(0, Math.round(region.x));
  const top = Math.max(0, Math.round(region.y));
  const right = Math.min(image.width, Math.round(region.x + region.width));
  const bottom = Math.min(image.height, Math.round(region.y + region.height));

  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const data = new Uint8Array(width * height);

  const inkLuminance = luminance(...analysis.ink);
  const backgroundLuminance = luminance(...analysis.background);
  const threshold = (inkLuminance + backgroundLuminance) / 2;
  const inkIsDark = inkLuminance < backgroundLuminance;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = ((y + top) * image.width + (x + left)) * 4;
      const value = luminance(
        image.data[pixel],
        image.data[pixel + 1],
        image.data[pixel + 2],
      );
      const isInk = inkIsDark ? value <= threshold : value >= threshold;
      data[y * width + x] = isInk ? 1 : 0;
    }
  }

  return { data, width, height };
}

export type GlyphBox = { x: number; y: number; width: number; height: number };

/**
 * Splits a region into individual characters by looking for empty columns.
 * Characters that touch are returned as one box, which is fine for stamping.
 */
export function segmentGlyphs(mask: Mask, minWidth = 2): GlyphBox[] {
  const columns = new Uint32Array(mask.width);

  for (let x = 0; x < mask.width; x += 1) {
    let count = 0;
    for (let y = 0; y < mask.height; y += 1) {
      if (mask.data[y * mask.width + x] === 1) {
        count += 1;
      }
    }
    columns[x] = count;
  }

  const boxes: GlyphBox[] = [];
  let start = -1;

  const closeBox = (endX: number) => {
    if (start < 0 || endX - start < minWidth) {
      start = -1;
      return;
    }

    let minY = mask.height;
    let maxY = -1;
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = start; x < endX; x += 1) {
        if (mask.data[y * mask.width + x] === 1) {
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          break;
        }
      }
    }

    if (maxY >= minY) {
      boxes.push({ x: start, y: minY, width: endX - start, height: maxY - minY + 1 });
    }
    start = -1;
  };

  for (let x = 0; x < mask.width; x += 1) {
    if (columns[x] > 0) {
      if (start < 0) {
        start = x;
      }
    } else {
      closeBox(x);
    }
  }
  closeBox(mask.width);

  return boxes;
}

/** Crops a mask to the smallest box containing ink. */
export function cropMaskToInk(mask: Mask): Mask {
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.data[y * mask.width + x] === 1) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { data: new Uint8Array(1), width: 1, height: 1 };
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const data = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = mask.data[(y + minY) * mask.width + (x + minX)];
    }
  }

  return { data, width, height };
}

/** Copies the pixels of one glyph out of a larger mask. */
export function subMask(mask: Mask, box: GlyphBox): Mask {
  const x0 = Math.max(0, Math.round(box.x));
  const y0 = Math.max(0, Math.round(box.y));
  const x1 = Math.min(mask.width, Math.round(box.x + box.width));
  const y1 = Math.min(mask.height, Math.round(box.y + box.height));

  const width = Math.max(1, x1 - x0);
  const height = Math.max(1, y1 - y0);
  const data = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = mask.data[(y + y0) * mask.width + (x + x0)];
    }
  }

  return { data, width, height };
}

/** Nearest-neighbour resize, which is all a binary mask needs. */
export function resizeMask(mask: Mask, width: number, height: number): Mask {
  const data = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(mask.height - 1, Math.floor((y / height) * mask.height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(mask.width - 1, Math.floor((x / width) * mask.width));
      data[y * width + x] = mask.data[sourceY * mask.width + sourceX];
    }
  }

  return { data, width, height };
}

/** Intersection over union of two equally sized masks, 0..1. */
export function maskSimilarity(first: Mask, second: Mask): number {
  if (first.width !== second.width || first.height !== second.height) {
    return 0;
  }

  let intersection = 0;
  let union = 0;

  for (let index = 0; index < first.data.length; index += 1) {
    const a = first.data[index] === 1;
    const b = second.data[index] === 1;
    if (a && b) intersection += 1;
    if (a || b) union += 1;
  }

  return union === 0 ? 0 : intersection / union;
}

/**
 * Shape score for two cropped masks.
 *
 * Resizing a candidate to the target's box throws away its proportions, which
 * makes a vertical bar and a horizontal bar look identical. Multiplying by how
 * well the aspect ratios agree restores that information.
 */
export function shapeSimilarity(target: Mask, candidate: Mask): number {
  const targetAspect = target.width / Math.max(1, target.height);
  const candidateAspect = candidate.width / Math.max(1, candidate.height);
  const aspect =
    Math.min(targetAspect, candidateAspect) / Math.max(targetAspect, candidateAspect);

  return maskSimilarity(target, resizeMask(candidate, target.width, target.height)) * aspect;
}

/**
 * Picks the candidate font whose rendered glyph shapes best match the sample.
 * The renderer is injected so the selection logic can be tested without a canvas.
 */
export function pickBestFont(
  sample: Mask,
  candidates: FontCandidate[],
  render: (candidate: FontCandidate) => Mask | null,
): { candidate: FontCandidate; score: number } | null {
  const target = cropMaskToInk(sample);
  let best: { candidate: FontCandidate; score: number } | null = null;

  for (const candidate of candidates) {
    const rendered = render(candidate);
    if (!rendered) {
      continue;
    }

    const cropped = cropMaskToInk(rendered);
    const score = shapeSimilarity(target, cropped);
    if (!best || score > best.score) {
      best = { candidate, score };
    }
  }

  return best;
}
