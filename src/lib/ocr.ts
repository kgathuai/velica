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

export type DetectedLine = {
  /** Bounding box of the whole line, in canvas pixels. */
  box: GlyphBox;
  /** The characters found in it, left to right. */
  glyphs: GlyphBox[];
};

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
 * Groups character boxes into lines by vertical overlap. Boxes are matched to
 * the line whose band their centre falls in, which copes with slightly ragged
 * baselines without needing a deskew step.
 */
export function groupIntoLines(glyphs: GlyphBox[]): DetectedLine[] {
  if (glyphs.length === 0) {
    return [];
  }

  const sorted = [...glyphs].sort(
    (a, b) => a.y + a.height / 2 - (b.y + b.height / 2),
  );

  const lines: Array<{ glyphs: GlyphBox[]; top: number; bottom: number }> = [];

  for (const glyph of sorted) {
    const top = glyph.y;
    const bottom = glyph.y + glyph.height;
    const centre = (top + bottom) / 2;
    const slack = Math.max(2, glyph.height * 0.4);

    const line = lines.find(
      (candidate) => centre >= candidate.top - slack && centre <= candidate.bottom + slack,
    );

    if (line) {
      line.glyphs.push(glyph);
      line.top = Math.min(line.top, top);
      line.bottom = Math.max(line.bottom, bottom);
    } else {
      lines.push({ glyphs: [glyph], top, bottom });
    }
  }

  return lines.map((line) => {
    const ordered = [...line.glyphs].sort((a, b) => a.x - b.x);
    const minX = Math.min(...ordered.map((glyph) => glyph.x));
    const maxX = Math.max(...ordered.map((glyph) => glyph.x + glyph.width));
    const minY = Math.min(...ordered.map((glyph) => glyph.y));
    const maxY = Math.max(...ordered.map((glyph) => glyph.y + glyph.height));

    return {
      glyphs: ordered,
      box: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    };
  });
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
