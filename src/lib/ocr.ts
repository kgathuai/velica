/**
 * Reading text off a scan without a model.
 *
 * Characters are matched against the same glyphs rendered in the document's own
 * font: segment the ink into characters, render the alphabet as templates, and
 * score shapes by overlap. It is best-effort — the form it feeds is editable, so
 * a mis-read is something you correct rather than a failure.
 */

import {
  cropMaskToInk,
  shapeSimilarity,
  type GlyphBox,
  type Mask,
} from "@/lib/font-match";

export type GlyphTemplate = { char: string; mask: Mask };

export const OCR_CHARACTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-/.,:;()&%#'\"+@";

/** A smaller, distinctive set used only to decide which font is being read. */
export const OCR_FONT_PROBE = "aeostnriAEOSTNRI0123456789";

export function maskHasInk(mask: Mask): boolean {
  for (let index = 0; index < mask.data.length; index += 1) {
    if (mask.data[index] === 1) {
      return true;
    }
  }
  return false;
}

/**
 * Splits a page into lines using a row projection.
 *
 * This has to happen *before* character segmentation: a column projection over a
 * whole page sees ink in almost every column (from different lines), so it would
 * return paragraphs rather than characters.
 */
export function segmentLines(mask: Mask, minHeight = 3): GlyphBox[] {
  const rows = new Uint32Array(mask.height);

  for (let y = 0; y < mask.height; y += 1) {
    let count = 0;
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.data[y * mask.width + x] === 1) {
        count += 1;
      }
    }
    rows[y] = count;
  }

  const boxes: GlyphBox[] = [];
  let start = -1;

  const close = (endY: number) => {
    if (start < 0 || endY - start < minHeight) {
      start = -1;
      return;
    }

    let minX = mask.width;
    let maxX = -1;

    for (let y = start; y < endY; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        if (mask.data[y * mask.width + x] === 1) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }

    if (maxX >= minX) {
      boxes.push({ x: minX, y: start, width: maxX - minX + 1, height: endY - start });
    }

    start = -1;
  };

  for (let y = 0; y < mask.height; y += 1) {
    if (rows[y] > 0) {
      if (start < 0) {
        start = y;
      }
    } else {
      close(y);
    }
  }
  close(mask.height);

  return boxes;
}

/** The typical height of a line, used to size templates and the rewritten text. */
export function medianLineHeight(boxes: GlyphBox[]): number {
  if (boxes.length === 0) {
    return 0;
  }

  const heights = boxes.map((box) => box.height).sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)];
}

/**
 * Converts a `[ymin, xmin, ymax, xmax]` box on a 0-1000 scale — what vision
 * models return — into pixels. Models read far better than they localise, so
 * anything implausible is rejected and the caller falls back to local detection.
 */
export function boxFromNormalized(
  raw: unknown,
  width: number,
  height: number,
): GlyphBox | null {
  if (!Array.isArray(raw) || raw.length !== 4) {
    return null;
  }

  const numbers = raw.map((entry) => Number(entry));
  if (!numbers.every((entry) => Number.isFinite(entry))) {
    return null;
  }

  const [ymin, xmin, ymax, xmax] = numbers;
  if (ymax <= ymin || xmax <= xmin) {
    return null;
  }

  const x = (xmin / 1000) * width;
  const y = (ymin / 1000) * height;
  const w = ((xmax - xmin) / 1000) * width;
  const h = ((ymax - ymin) / 1000) * height;

  if (w < 4 || h < 4 || x < 0 || y < 0) {
    return null;
  }

  return { x, y, width: w, height: h };
}

/** best character for one glyph, by shape overlap. */
export function matchGlyph(
  glyph: Mask,
  templates: GlyphTemplate[],
): { char: string; score: number } {
  const target = cropMaskToInk(glyph);

  if (target.width < 2 || target.height < 2) {
    return { char: "?", score: 0 };
  }

  let best = { char: "?", score: 0 };

  for (const template of templates) {
    // Templates are expected to be pre-cropped; shapeSimilarity handles resizing.
    const score = shapeSimilarity(target, template.mask);
    if (score > best.score) {
      best = { char: template.char, score };
    }
  }

  return best;
}

/**
 * A word gap shows up as a wider-than-usual space between character boxes, so
 * spaces are inferred from the gaps rather than needing a space template.
 */
export function transcribeLine(
  glyphMasks: Mask[],
  boxes: GlyphBox[],
  templates: GlyphTemplate[],
): { text: string; confidence: number } {
  if (glyphMasks.length === 0) {
    return { text: "", confidence: 0 };
  }

  const widths = boxes.map((box) => box.width).sort((a, b) => a - b);
  const median = widths[Math.floor(widths.length / 2)] || 1;

  let text = "";
  let totalScore = 0;
  let matched = 0;

  for (let index = 0; index < glyphMasks.length; index += 1) {
    if (index > 0) {
      const previous = boxes[index - 1];
      const gap = boxes[index].x - (previous.x + previous.width);
      if (gap > median * 0.45) {
        text += " ";
      }
    }

    const match = matchGlyph(glyphMasks[index], templates);
    text += match.char;
    totalScore += match.score;
    matched += 1;
  }

  return {
    text: text.replace(/\s+/g, " ").trim(),
    confidence: matched > 0 ? totalScore / matched : 0,
  };
}
