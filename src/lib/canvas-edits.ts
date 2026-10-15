/**
 * Canvas-side execution of the edit model: pixel adjustments, region blurs and
 * mosaics, and replaying base operations from the untouched original.
 *
 * Everything here avoids `ctx.filter`, which Safari does not support — the
 * adjustments are done with a real pixel pass so they work on an iPhone.
 */

import {
  boxBlurPass,
  DEFAULT_ADJUSTMENTS,
  isDefaultAdjustments,
  reduceAdjustments,
  type Adjustments,
  type Annotation,
  type BaseOp,
  type Point,
} from "@/lib/image-annotations";
import { inpaint, maskFromStrokes } from "@/lib/inpaint";

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/**
 * Applies brightness/contrast/saturation/grayscale/sepia/invert in one pass.
 * All the amounts are blended towards the target, so they compose predictably.
 */
export function applyAdjustments(canvas: HTMLCanvasElement, adjustments: Adjustments): void {
  if (isDefaultAdjustments(adjustments)) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const { width, height } = canvas;
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;

  const { brightness, contrast, saturation, grayscale, sepia, invert } = adjustments;

  for (let index = 0; index < data.length; index += 4) {
    let r = data[index];
    let g = data[index + 1];
    let b = data[index + 2];

    if (brightness !== 1) {
      r *= brightness;
      g *= brightness;
      b *= brightness;
    }

    if (contrast !== 1) {
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;
    }

    if (saturation !== 1) {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = luma + (r - luma) * saturation;
      g = luma + (g - luma) * saturation;
      b = luma + (b - luma) * saturation;
    }

    if (grayscale > 0) {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r += (luma - r) * grayscale;
      g += (luma - g) * grayscale;
      b += (luma - b) * grayscale;
    }

    if (sepia > 0) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r += (sr - r) * sepia;
      g += (sg - g) * sepia;
      b += (sb - b) * sepia;
    }

    if (invert > 0) {
      r += (255 - 2 * r) * invert;
      g += (255 - 2 * g) * invert;
      b += (255 - 2 * b) * invert;
    }

    data[index] = r < 0 ? 0 : r > 255 ? 255 : r;
    data[index + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    data[index + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }

  context.putImageData(image, 0, 0);
}

export function blurCanvas(canvas: HTMLCanvasElement, radius: number): void {
  const context = canvas.getContext("2d");
  if (!context || radius < 1) {
    return;
  }

  const { width, height } = canvas;
  const image = context.getImageData(0, 0, width, height);
  const first = new Uint8ClampedArray(image.data.length);
  const second = new Uint8ClampedArray(image.data.length);

  boxBlurPass(image.data, first, width, height, Math.round(radius), true);
  boxBlurPass(first, second, width, height, Math.round(radius), false);

  image.data.set(second);
  context.putImageData(image, 0, 0);
}

function rotateCanvas(source: HTMLCanvasElement, clockwise: boolean): HTMLCanvasElement {
  const target = createCanvas(source.height, source.width);
  const context = target.getContext("2d");
  if (!context) {
    return source;
  }

  context.translate(target.width / 2, target.height / 2);
  context.rotate(clockwise ? Math.PI / 2 : -Math.PI / 2);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return target;
}

function flipCanvas(
  source: HTMLCanvasElement,
  axis: "horizontal" | "vertical",
): HTMLCanvasElement {
  const target = createCanvas(source.width, source.height);
  const context = target.getContext("2d");
  if (!context) {
    return source;
  }

  context.translate(axis === "horizontal" ? target.width : 0, axis === "vertical" ? target.height : 0);
  context.scale(axis === "horizontal" ? -1 : 1, axis === "vertical" ? -1 : 1);
  context.drawImage(source, 0, 0);
  return target;
}

/**
 * Rebuilds the image from the untouched original by replaying the base ops, so
 * undo is exact and nothing is ever destructively baked.
 */
export function buildBaseCanvas(original: HTMLImageElement, baseOps: BaseOp[]): HTMLCanvasElement {
  let canvas = createCanvas(original.naturalWidth, original.naturalHeight);
  canvas.getContext("2d")?.drawImage(original, 0, 0);

  for (const op of baseOps) {
    if (op.kind === "rotate") {
      canvas = rotateCanvas(canvas, op.clockwise);
    } else if (op.kind === "flip") {
      canvas = flipCanvas(canvas, op.axis);
    } else if (op.kind === "erase") {
      eraseFromCanvas(canvas, op.strokes, op.radius);
    } else if (op.kind === "overlay") {
      drawPlacedImage(canvas, op.image, op.x, op.y, op.width, op.height, op.rotation);
    } else if (op.kind === "raster") {
      canvas = createCanvas(op.image.naturalWidth, op.image.naturalHeight);
      canvas.getContext("2d")?.drawImage(op.image, 0, 0);
    } else if (op.kind === "replaceText") {
      replaceTextOnCanvas(canvas, op);
    }
  }

  const patches = baseOps
    .filter((op): op is Extract<BaseOp, { kind: "adjust" }> => op.kind === "adjust")
    .map((op) => op.patch);

  const adjustments = patches.length > 0 ? reduceAdjustments(patches) : DEFAULT_ADJUSTMENTS;
  applyAdjustments(canvas, adjustments);

  return canvas;
}

/** Draws a placed image, rotated about its own centre. */
export function drawPlacedImage(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
): void {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
}

/** Removes the painted pixels and refills them from what surrounds them. */function eraseFromCanvas(canvas: HTMLCanvasElement, strokes: Point[][], radius: number): void {
  const context = canvas.getContext("2d");
  if (!context || strokes.length === 0) {
    return;
  }

  const built = maskFromStrokes(strokes, radius, canvas.width, canvas.height);
  if (!built) {
    return;
  }

  const image = context.getImageData(0, 0, canvas.width, canvas.height);

  // Bigger holes need more relaxation passes to carry colour inwards.
  const span = Math.max(
    built.bounds.maxX - built.bounds.minX,
    built.bounds.maxY - built.bounds.minY,
  );
  const iterations = Math.min(220, Math.max(60, Math.round(span * 1.5)));

  inpaint(image.data, canvas.width, canvas.height, built.mask, built.bounds, iterations);
  context.putImageData(image, 0, 0);
}

/**
 * Rewrites one line of a document: erase the existing text (refilling from the
 * surrounding paper) and draw the replacement in the same font, colour and size,
 * shrinking it if the new value is longer than the space it replaces.
 */
function replaceTextOnCanvas(
  canvas: HTMLCanvasElement,
  op: Extract<BaseOp, { kind: "replaceText" }>,
): void {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const padding = Math.max(2, Math.round(op.height * 0.4));
  const centreY = op.y + op.height / 2;

  // One wide stroke across the line is enough to mask the old glyphs.
  eraseFromCanvas(
    canvas,
    [
      [
        { x: op.x - padding, y: centreY },
        { x: op.x + op.width + padding, y: centreY },
      ],
    ],
    op.height / 2 + padding,
  );

  const available = op.width + padding * 2;
  context.save();
  context.fillStyle = op.color;
  context.textBaseline = "middle";

  let size = op.size;
  context.font = `${op.weight} ${size}px ${op.stack}`;
  const measured = context.measureText(op.text).width;

  if (measured > available && measured > 0) {
    size = Math.max(6, Math.floor((size * available) / measured));
  }

  context.font = `${op.weight} ${size}px ${op.stack}`;
  context.fillText(op.text, op.x, centreY);
  context.restore();
}

export function drawAnnotation(
  context: CanvasRenderingContext2D,
  annotation: Annotation,
  base: HTMLCanvasElement,
): void {
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  if (annotation.kind === "pen") {
    context.globalAlpha = annotation.alpha;
    context.strokeStyle = annotation.color;
    context.fillStyle = annotation.color;
    context.lineWidth = annotation.width;

    if (annotation.points.length === 1) {
      const [point] = annotation.points;
      context.beginPath();
      context.arc(point.x, point.y, annotation.width / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      annotation.points.forEach((point, index) => {
        if (index === 0) {
          context.moveTo(point.x, point.y);
        } else {
          context.lineTo(point.x, point.y);
        }
      });
      context.stroke();
    }
  } else if (annotation.kind === "redact") {
    context.fillStyle = annotation.color;
    context.fillRect(annotation.x, annotation.y, annotation.w, annotation.h);
  } else if (annotation.kind === "pixelate") {
    const blocks = Math.max(3, Math.round(Math.max(annotation.w, annotation.h) / annotation.size));
    const tinyWidth = Math.max(1, Math.min(blocks, Math.round(annotation.w)));
    const tinyHeight = Math.max(1, Math.round(tinyWidth * (annotation.h / annotation.w)));
    const tiny = createCanvas(tinyWidth, tinyHeight);
    const tinyContext = tiny.getContext("2d");

    if (tinyContext) {
      tinyContext.drawImage(
        base,
        annotation.x,
        annotation.y,
        annotation.w,
        annotation.h,
        0,
        0,
        tinyWidth,
        tinyHeight,
      );

      context.imageSmoothingEnabled = false;
      context.drawImage(tiny, 0, 0, tinyWidth, tinyHeight, annotation.x, annotation.y, annotation.w, annotation.h);
      context.imageSmoothingEnabled = true;
    }
  } else if (annotation.kind === "blur") {
    const regionWidth = Math.max(1, Math.round(annotation.w));
    const regionHeight = Math.max(1, Math.round(annotation.h));
    const scratch = createCanvas(regionWidth, regionHeight);
    const scratchContext = scratch.getContext("2d");

    if (scratchContext) {
      scratchContext.drawImage(
        base,
        annotation.x,
        annotation.y,
        annotation.w,
        annotation.h,
        0,
        0,
        regionWidth,
        regionHeight,
      );
      blurCanvas(scratch, annotation.radius);
      context.drawImage(scratch, 0, 0, regionWidth, regionHeight, annotation.x, annotation.y, annotation.w, annotation.h);
    }
  } else {
    context.font = `${annotation.weight ?? 600} ${annotation.size}px ${
      annotation.stack ?? "ui-sans-serif, system-ui, -apple-system, sans-serif"
    }`;
    context.textBaseline = "top";

    // Canvas letterSpacing is not everywhere yet; set it only when supported.
    if (typeof annotation.letterSpacing === "number" && "letterSpacing" in context) {
      (context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        `${annotation.letterSpacing}px`;
    }

    // A dark outline keeps the text readable over any photo.
    context.lineWidth = Math.max(2, annotation.size / 10);
    context.strokeStyle = "rgba(0, 0, 0, 0.65)";
    context.strokeText(annotation.text, annotation.x, annotation.y);
    context.fillStyle = annotation.color;
    context.fillText(annotation.text, annotation.x, annotation.y);
  }

  context.restore();
}
