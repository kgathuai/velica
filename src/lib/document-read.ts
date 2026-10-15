/**
 * Reading text out of an ink mask with the offline shape matcher.
 *
 * Shared by the whole-page read and the selected-area read, so both go down
 * exactly the same path — lines first, then characters inside each line.
 */

import { segmentGlyphs, subMask, type GlyphBox, type Mask } from "@/lib/font-match";
import { buildGlyphTemplates, OCR_CHARACTERS } from "@/lib/font-render";
import { medianLineHeight, segmentLines, transcribeLine } from "@/lib/ocr";

/** One line of a mask, with its characters located but not yet identified. */
export type MaskLine = {
  /** Box relative to the mask it came from. */
  box: GlyphBox;
  /** The line's own slice of the mask, for extracting characters. */
  mask: Mask;
  /** Character boxes, relative to `mask`. */
  glyphs: GlyphBox[];
};

export function segmentMaskIntoLines(mask: Mask): MaskLine[] {
  return segmentLines(mask, 3)
    .map((lineBox) => {
      const lineMask = subMask(mask, lineBox);
      const glyphs = segmentGlyphs(lineMask, 2).filter(
        (glyph) => glyph.height >= Math.max(3, lineBox.height * 0.3),
      );
      return { box: lineBox, mask: lineMask, glyphs };
    })
    .filter((line) => line.glyphs.length > 0);
}

export type ReadLine = {
  box: GlyphBox;
  text: string;
  confidence: number;
};

/** Reads every line of a mask once the font is known. */
export function readLinesFromMask(mask: Mask, stack: string, weight: number): ReadLine[] {
  const lines = segmentMaskIntoLines(mask);

  if (lines.length === 0) {
    return [];
  }

  const lineHeight = Math.max(6, medianLineHeight(lines.map((line) => line.box)));
  const templates = buildGlyphTemplates(stack, weight, lineHeight, OCR_CHARACTERS);

  return lines.map((line) => {
    const glyphMasks = line.glyphs.map((glyph) => subMask(line.mask, glyph));
    const { text, confidence } = transcribeLine(glyphMasks, line.glyphs, templates);
    return { box: line.box, text, confidence };
  });
}
