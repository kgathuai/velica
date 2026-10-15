/**
 * A built-in, offline interpreter that turns a plain-English instruction into
 * concrete edit operations. No model, no network: everything is rule-based so it
 * works on the phone, instantly, and never sends your documents anywhere.
 */

import type { Adjustments } from "@/lib/image-annotations";

/** A region of the image as fractions of its width/height. */
export type Area = { x: number; y: number; w: number; h: number };

export type EditOperation =
  | { kind: "rotate"; degrees: 90 | -90 | 180 }
  | { kind: "flip"; axis: "horizontal" | "vertical" }
  | { kind: "adjust"; patch: Partial<Adjustments> }
  | { kind: "region"; effect: "redact" | "pixelate" | "blur"; area: Area; color?: string }
  | { kind: "text"; text: string; area: Area | null; color?: string }
  | { kind: "tool"; tool: "redact" | "pixelate" | "blur" };

export type ParsedPrompt = {
  operations: EditOperation[];
  /** Short descriptions of what will happen, for on-screen feedback. */
  summary: string[];
  /** Set when nothing (or only part) was understood. */
  feedback?: string;
};

const HELP =
  "I didn't catch that. Try things like: rotate left, flip horizontally, black out the bottom, " +
  "pixelate the top right, blur the middle, brighten it, make it black and white, " +
  'or add text "COPY" at the top.';

type Vertical = "top" | "middle" | "bottom";
type Horizontal = "left" | "center" | "right";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Normalises wording so the matchers only have to know one spelling of each idea.
 * Note "black and white" is rewritten *before* clauses are split, otherwise the
 * "and" would tear the phrase in half.
 */
function normalise(input: string): string {
  return ` ${input
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/black[\s-]and[\s-]white/g, " grayscale ")
    .replace(/black[\s-]?out/g, " blackout ")
    .replace(/white[\s-]?out/g, " whiteout ")
    .replace(/grey/g, "gray")
    .replace(/colour/g, "color")
    .replace(/\s+/g, " ")} `;
}

function fractionFrom(clause: string): number | null {
  const percent = /(\d{1,3})\s?%/.exec(clause);
  if (percent) {
    return clamp(Number.parseInt(percent[1], 10) / 100, 0.05, 1);
  }
  if (/\btwo[\s-]?thirds?\b/.test(clause)) {
    return 2 / 3;
  }
  if (/\bhalf\b/.test(clause)) {
    return 0.5;
  }
  if (/\bthird\b/.test(clause)) {
    return 1 / 3;
  }
  if (/\bquarter\b/.test(clause)) {
    return 0.25;
  }
  return null;
}

function verticalFrom(clause: string): Vertical | null {
  if (/\b(top|upper|above|header)/.test(clause)) return "top";
  if (/\b(bottom|lower|below|footer)/.test(clause)) return "bottom";
  if (/\b(middle|center|centre|mid)/.test(clause)) return "middle";
  return null;
}

function horizontalFrom(clause: string): Horizontal | null {
  if (/\bleft/.test(clause)) return "left";
  if (/\bright/.test(clause)) return "right";
  if (/\b(middle|center|centre|mid)/.test(clause)) return "center";
  return null;
}

export function parseArea(clause: string): Area | null {
  if (/\b(whole|entire|everything|full|all of it)\b/.test(clause)) {
    return { x: 0, y: 0, w: 1, h: 1 };
  }

  const vertical = verticalFrom(clause);
  const horizontal = horizontalFrom(clause);

  if (!vertical && !horizontal) {
    return null;
  }

  const fraction = fractionFrom(clause) ?? 1 / 3;

  let y = 0;
  let h = 1;
  let x = 0;
  let w = 1;

  if (vertical) {
    h = fraction;
    y = vertical === "top" ? 0 : vertical === "middle" ? (1 - fraction) / 2 : 1 - fraction;
  }

  if (horizontal) {
    w = fraction;
    x = horizontal === "left" ? 0 : horizontal === "center" ? (1 - fraction) / 2 : 1 - fraction;
  }

  return { x, y, w, h };
}

export function describeArea(area: Area): string {
  if (area.w >= 0.999 && area.h >= 0.999) {
    return "the whole image";
  }

  const horizontal = area.w >= 0.999 ? null : area.x <= 0.001 ? "left" : area.x + area.w >= 0.999 ? "right" : "middle";
  const vertical = area.h >= 0.999 ? null : area.y <= 0.001 ? "top" : area.y + area.h >= 0.999 ? "bottom" : "middle";

  const size =
    Math.abs(area.h - 0.5) < 0.02 && horizontal === null
      ? "half"
      : Math.abs(area.h - 1 / 3) < 0.02 && horizontal === null
        ? "third"
        : null;

  const parts = [vertical, horizontal].filter(Boolean).join(" ");

  if (size && vertical) {
    return `the ${vertical} ${size}`;
  }

  return `the ${parts || "middle"}`;
}

function matchRotate(clause: string): EditOperation | null {
  if (!/\b(rotat|turn|spin|orient)/.test(clause)) {
    return null;
  }
  if (/\b(180|upside down)\b/.test(clause)) {
    return { kind: "rotate", degrees: 180 };
  }
  if (/\b(left|anticlockwise|counterclockwise|counter|anti|ccw)\b/.test(clause)) {
    return { kind: "rotate", degrees: -90 };
  }
  if (/\b(right|clockwise|cw|sideways|landscape)\b/.test(clause)) {
    return { kind: "rotate", degrees: 90 };
  }
  if (/\bportrait\b/.test(clause)) {
    return { kind: "rotate", degrees: -90 };
  }
  return null;
}

function matchFlip(clause: string): EditOperation | null {
  if (!/\b(flip|mirror|reflect)/.test(clause)) {
    return null;
  }
  // "vertically" must be matched by the stem, not \bvertical\b.
  if (/\b(vertical|top to bottom|upside)/.test(clause)) {
    return { kind: "flip", axis: "vertical" };
  }
  // "mirror it" with no axis means the usual left-to-right mirror.
  return { kind: "flip", axis: "horizontal" };
}

function matchAdjustment(clause: string): EditOperation | null {
  if (/\b(grayscale|monochrome|desaturat|no color|without color)/.test(clause)) {
    return { kind: "adjust", patch: { grayscale: 1 } };
  }
  if (/\b(sepia|vintage|old photo|aged)/.test(clause)) {
    return { kind: "adjust", patch: { sepia: 1 } };
  }
  if (/\b(invert|negative)/.test(clause)) {
    return { kind: "adjust", patch: { invert: 1 } };
  }

  const stronger = /\b(much|a lot|really|very|way)\b/.test(clause);
  const lowering = /\b(less|lower|reduce|decrease|down|darker|darken|dim|dimmed)\b/.test(clause);
  const raising = /\b(more|increase|up|raise|brighter|brighten|lighter|lighten|boost)\b/.test(clause);
  const downward = lowering && !raising;

  if (/\bcontrast/.test(clause)) {
    return { kind: "adjust", patch: { contrast: downward ? 0.8 : 1.25 } };
  }
  if (/\b(bright|light|exposure|washed out)/.test(clause)) {
    return {
      kind: "adjust",
      patch: { brightness: downward ? (stronger ? 0.6 : 0.8) : stronger ? 1.5 : 1.25 },
    };
  }
  if (/\b(dark|dim)/.test(clause)) {
    return { kind: "adjust", patch: { brightness: stronger ? 0.6 : 0.8 } };
  }
  if (/\b(saturat|vivid|vibrant|colorful)/.test(clause)) {
    return { kind: "adjust", patch: { saturation: downward ? 0.6 : 1.3 } };
  }
  if (/\b(muted|dull|faded|less color)/.test(clause)) {
    return { kind: "adjust", patch: { saturation: 0.6 } };
  }

  return null;
}

function matchRegionEffect(
  clause: string,
): { effect: "redact" | "pixelate" | "blur"; color?: string } | null {
  if (/\bwhiteout/.test(clause)) {
    return { effect: "redact", color: "#ffffff" };
  }
  if (/\b(pixelat|mosaic|block out)/.test(clause)) {
    return { effect: "pixelate" };
  }
  if (/\b(blur|smudge|fuzz)/.test(clause)) {
    return { effect: "blur" };
  }
  if (/\b(blackout|redact|censor|hid|cover|mask|obscur|remove|delet)/.test(clause)) {
    return { effect: "redact", color: "#000000" };
  }
  return null;
}

export function parseEditPrompt(input: string): ParsedPrompt {
  const original = input.trim();
  if (!original) {
    return { operations: [], summary: [], feedback: HELP };
  }

  // Pull quoted strings out of the untouched input so capitalisation survives.
  const quoted: string[] = [];
  const quotePattern = /["'\u201c\u201d\u2018\u2019]([^"'\u201c\u201d\u2018\u2019]{1,80})["'\u201c\u201d\u2018\u2019]/g;
  let quoteMatch: RegExpExecArray | null;
  while ((quoteMatch = quotePattern.exec(original)) !== null) {
    quoted.push(quoteMatch[1].trim());
  }

  const sayingMatch = /\b(?:saying|that says|which says|reading|reads)\s+(.+)$/i.exec(original);
  if (sayingMatch && quoted.length === 0) {
    quoted.push(sayingMatch[1].trim().replace(/^["'\u201c\u201d]|["'\u201c\u201d]$/g, ""));
  }

  const normalised = normalise(original);
  const clauses = normalised
    .split(/,|;|\band\b|\bthen\b|\balso\b|\bplus\b|\bwith\b/)
    .map((clause) => clause.trim())
    .filter(Boolean);

  const operations: EditOperation[] = [];
  const summary: string[] = [];
  const unmatched: string[] = [];
  let textIndex = 0;
  let askedForRegion = false;

  for (const clause of clauses) {
    // Text first: the phrase "add text ..." should not be read as an adjustment.
    if (/\b(text|word|label|caption|write|says|saying)\b/.test(clause)) {
      const value = quoted[textIndex];
      if (value) {
        textIndex += 1;
        const area = parseArea(clause);
        operations.push({ kind: "text", text: value, area });
        summary.push(`add “${value}”${area ? ` to ${describeArea(area)}` : " at the top"}`);
        continue;
      }
    }

    const region = matchRegionEffect(clause);
    if (region) {
      const area = parseArea(clause);
      if (area) {
        operations.push({ kind: "region", effect: region.effect, area, color: region.color });
        const verb =
          region.effect === "redact"
            ? region.color === "#ffffff"
              ? "white out"
              : "black out"
            : region.effect === "pixelate"
              ? "pixelate"
              : "blur";
        summary.push(`${verb} ${describeArea(area)}`);
      } else {
        // Understood the action but not the place — hand them the tool instead.
        operations.push({ kind: "tool", tool: region.effect });
        askedForRegion = true;
      }
      continue;
    }

    const rotate = matchRotate(clause);
    if (rotate) {
      operations.push(rotate);
      summary.push(
        rotate.kind === "rotate" && rotate.degrees === 180
          ? "rotate 180°"
          : rotate.kind === "rotate" && rotate.degrees === -90
            ? "rotate left"
            : "rotate right",
      );
      continue;
    }

    const flip = matchFlip(clause);
    if (flip) {
      operations.push(flip);
      summary.push(`flip ${flip.kind === "flip" ? flip.axis : "horizontal"}`);
      continue;
    }

    const adjustment = matchAdjustment(clause);
    if (adjustment) {
      operations.push(adjustment);
      const patch = adjustment.kind === "adjust" ? adjustment.patch : {};
      if (patch.grayscale) summary.push("black and white");
      else if (patch.sepia) summary.push("sepia");
      else if (patch.invert) summary.push("invert colours");
      else if (patch.brightness && patch.brightness > 1) summary.push("brighten");
      else if (patch.brightness) summary.push("darken");
      else if (patch.contrast && patch.contrast > 1) summary.push("more contrast");
      else if (patch.contrast) summary.push("less contrast");
      else if (patch.saturation && patch.saturation > 1) summary.push("more colour");
      else if (patch.saturation) summary.push("less colour");
      continue;
    }

    if (/\b(crop|trim|cut)\b/.test(clause)) {
      unmatched.push("crop");
      continue;
    }

    if (clause.length > 2) {
      unmatched.push(clause);
    }
  }

  let feedback: string | undefined;
  if (askedForRegion) {
    feedback = "Understood — now drag over the part you want to hide.";
  } else if (operations.length === 0) {
    feedback = HELP;
  } else if (unmatched.length > 0) {
    feedback = `Applied ${summary.length} change${summary.length === 1 ? "" : "s"}. I skipped: ${unmatched.join(", ")}.`;
  }

  return { operations, summary, feedback };
}
