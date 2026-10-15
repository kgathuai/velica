/**
 * The pure edit model: annotations, the geometry for rotating/flipping them, and
 * the colour-adjustment maths. No DOM here so the logic stays testable.
 */

export type Point = { x: number; y: number };

export type Annotation =
  | { kind: "pen"; color: string; width: number; alpha: number; points: Point[] }
  | { kind: "redact"; color: string; x: number; y: number; w: number; h: number }
  | { kind: "pixelate"; x: number; y: number; w: number; h: number; size: number }
  | { kind: "blur"; x: number; y: number; w: number; h: number; radius: number }
  | {
      kind: "text";
      color: string;
      x: number;
      y: number;
      text: string;
      size: number;
      /** Font stack, so text can match the document it is written on. */
      stack?: string;
      weight?: number;
      letterSpacing?: number;
    };

/** Whole-image colour adjustments. Multipliers default to 1, amounts to 0. */
export type Adjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  sepia: number;
  invert: number;
};

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  grayscale: 0,
  sepia: 0,
  invert: 0,
};

/** Applied to the running value rather than replacing it. */
export const MULTIPLIER_KEYS = ["brightness", "contrast", "saturation"] as const;

export type BaseOp =
  | { kind: "rotate"; clockwise: boolean }
  | { kind: "flip"; axis: "horizontal" | "vertical" }
  | { kind: "adjust"; patch: Partial<Adjustments> }
  /** Erase strokes; the marked pixels are refilled from their surroundings. */
  | { kind: "erase"; strokes: Point[][]; radius: number }
  /** An image placed onto the scan, positioned in canvas pixels. */
  | {
      kind: "overlay";
      image: HTMLImageElement;
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
    }
  /** A whole new bitmap (an AI edit); replaces everything before it. */
  | { kind: "raster"; image: HTMLImageElement }
  /**
   * Rewrites a line of the document: the old text is erased and refilled, then
   * the new value is written in the document's own style.
   */
  | {
      kind: "replaceText";
      fieldId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
      stack: string;
      weight: number;
      size: number;
      color: string;
    };

/** A restorable point in the edit history. Small: ops and vectors only, no pixels. */
export type EditState = {
  baseOps: BaseOp[];
  annotations: Annotation[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function rotatePoint(
  point: Point,
  width: number,
  height: number,
  clockwise: boolean,
): Point {
  return clockwise
    ? { x: height - point.y, y: point.x }
    : { x: point.y, y: width - point.x };
}

function flipPoint(
  point: Point,
  width: number,
  height: number,
  axis: "horizontal" | "vertical",
): Point {
  return axis === "horizontal"
    ? { x: width - point.x, y: point.y }
    : { x: point.x, y: height - point.y };
}

/**
 * Box-shaped annotations share x/y/w/h, so one branch remaps them all by moving
 * both corners and re-normalising.
 */
function remapBox<T extends { x: number; y: number; w: number; h: number }>(
  annotation: T,
  transform: (point: Point) => Point,
): T {
  const first = transform({ x: annotation.x, y: annotation.y });
  const second = transform({ x: annotation.x + annotation.w, y: annotation.y + annotation.h });

  return {
    ...annotation,
    x: Math.min(first.x, second.x),
    y: Math.min(first.y, second.y),
    w: Math.abs(first.x - second.x),
    h: Math.abs(first.y - second.y),
  };
}

export function rotateAnnotation(
  annotation: Annotation,
  width: number,
  height: number,
  clockwise: boolean,
): Annotation {
  const transform = (point: Point) => rotatePoint(point, width, height, clockwise);

  if (annotation.kind === "pen") {
    return { ...annotation, points: annotation.points.map(transform) };
  }

  if (annotation.kind === "text") {
    const point = transform({ x: annotation.x, y: annotation.y });
    return { ...annotation, x: point.x, y: point.y };
  }

  return remapBox(annotation, transform);
}

export function flipAnnotation(
  annotation: Annotation,
  width: number,
  height: number,
  axis: "horizontal" | "vertical",
): Annotation {
  const transform = (point: Point) => flipPoint(point, width, height, axis);

  if (annotation.kind === "pen") {
    return { ...annotation, points: annotation.points.map(transform) };
  }

  if (annotation.kind === "text") {
    // The anchor moves but the glyphs stay readable rather than mirroring.
    const point = transform({ x: annotation.x, y: annotation.y });
    return { ...annotation, x: point.x, y: point.y };
  }

  return remapBox(annotation, transform);
}

export function isDefaultAdjustments(adjustments: Adjustments): boolean {
  return (
    adjustments.brightness === 1 &&
    adjustments.contrast === 1 &&
    adjustments.saturation === 1 &&
    adjustments.grayscale === 0 &&
    adjustments.sepia === 0 &&
    adjustments.invert === 0
  );
}

export function applyAdjustmentPatch(
  current: Adjustments,
  patch: Partial<Adjustments>,
): Adjustments {
  const next = { ...current };

  for (const key of Object.keys(patch) as Array<keyof Adjustments>) {
    const value = patch[key];
    if (typeof value !== "number" || Number.isNaN(value)) {
      continue;
    }

    if (key === "brightness" || key === "contrast" || key === "saturation") {
      next[key] = clamp(current[key] * value, 0, 4);
    } else {
      next[key] = clamp(current[key] + value, 0, 1);
    }
  }

  return next;
}

export function reduceAdjustments(patches: Array<Partial<Adjustments>>): Adjustments {
  return patches.reduce<Adjustments>(
    (accumulated, patch) => applyAdjustmentPatch(accumulated, patch),
    DEFAULT_ADJUSTMENTS,
  );
}

/** Human-readable list of the non-default adjustments, for prompt feedback. */
export function describeAdjustments(adjustments: Adjustments): string[] {
  const parts: string[] = [];

  if (adjustments.grayscale >= 0.99) {
    parts.push("black and white");
  }
  if (adjustments.sepia >= 0.99) {
    parts.push("sepia");
  }
  if (adjustments.invert >= 0.99) {
    parts.push("inverted");
  }
  if (adjustments.brightness !== 1) {
    parts.push(adjustments.brightness > 1 ? "brighter" : "darker");
  }
  if (adjustments.contrast !== 1) {
    parts.push(adjustments.contrast > 1 ? "more contrast" : "less contrast");
  }
  if (adjustments.saturation !== 1) {
    parts.push(adjustments.saturation > 1 ? "more colour" : "less colour");
  }

  return parts;
}

/**
 * One separable box-blur pass over RGBA data using a sliding window, so the cost
 * is O(pixels) instead of O(pixels x radius). Two passes (horizontal then
 * vertical) approximate a gaussian. Kept here, DOM-free, so it can be tested.
 */
export function boxBlurPass(
  input: Uint8ClampedArray,
  output: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
): void {
  const window = radius * 2 + 1;
  const length = horizontal ? width : height;
  const lines = horizontal ? height : width;

  const at = (line: number, position: number) =>
    horizontal ? (line * width + position) * 4 : (position * width + line) * 4;

  for (let line = 0; line < lines; line += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;

    // Prime the window, clamping at the edges so borders do not darken.
    for (let offset = -radius; offset <= radius; offset += 1) {
      const index = at(line, Math.min(length - 1, Math.max(0, offset)));
      r += input[index];
      g += input[index + 1];
      b += input[index + 2];
      a += input[index + 3];
    }

    for (let position = 0; position < length; position += 1) {
      const index = at(line, position);
      output[index] = r / window;
      output[index + 1] = g / window;
      output[index + 2] = b / window;
      output[index + 3] = a / window;

      const leaving = at(line, Math.min(length - 1, Math.max(0, position - radius)));
      const entering = at(line, Math.min(length - 1, Math.max(0, position + radius + 1)));

      r += input[entering] - input[leaving];
      g += input[entering + 1] - input[leaving + 1];
      b += input[entering + 2] - input[leaving + 2];
      a += input[entering + 3] - input[leaving + 3];
    }
  }
}
