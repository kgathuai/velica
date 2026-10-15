/**
 * Finds the document inside a camera frame.
 *
 * Heuristic rather than machine learning: threshold the frame (Otsu), take the
 * largest connected blob that is not the background, then read its four extreme
 * points as the corners. That is fast enough to run live in the viewfinder and
 * needs no model. Pure functions over pixel buffers, so it is testable.
 */

export type DetectPoint = { x: number; y: number };

export type Quad = {
  topLeft: DetectPoint;
  topRight: DetectPoint;
  bottomRight: DetectPoint;
  bottomLeft: DetectPoint;
};

export type RgbaImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

/** Reject blobs covering almost the whole frame — that is the background, not a document. */
const MIN_AREA_FRACTION = 0.12;
const MAX_AREA_FRACTION = 0.92;
/** How quad-like the blob must be: quad area divided by blob pixel count. */
const MIN_RECTANGULARITY = 0.55;

function toLuminance(image: RgbaImage): Uint8Array {
  const total = image.width * image.height;
  const luminance = new Uint8Array(total);

  for (let index = 0, pixel = 0; index < total; index += 1, pixel += 4) {
    luminance[index] =
      (image.data[pixel] * 299 + image.data[pixel + 1] * 587 + image.data[pixel + 2] * 114) / 1000;
  }

  return luminance;
}

/** Separable 3-tap blur; enough to stop single noisy pixels splitting a blob. */
function boxBlur(source: Uint8Array, width: number, height: number): Uint8Array {
  const horizontal = new Uint8Array(source.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const left = source[index - (x > 0 ? 1 : 0)];
      const right = source[index + (x < width - 1 ? 1 : 0)];
      horizontal[index] = (left + source[index] * 2 + right) / 4;
    }
  }

  const output = new Uint8Array(source.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const up = horizontal[index - (y > 0 ? width : 0)];
      const down = horizontal[index + (y < height - 1 ? width : 0)];
      output[index] = (up + horizontal[index] * 2 + down) / 4;
    }
  }

  return output;
}

function otsu(luminance: Uint8Array): number {
  const histogram = new Array<number>(256).fill(0);
  for (const value of luminance) {
    histogram[value] += 1;
  }

  const total = luminance.length;
  let sum = 0;
  for (let level = 0; level < 256; level += 1) {
    sum += level * histogram[level];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let threshold = 127;

  for (let level = 0; level < 256; level += 1) {
    weightBackground += histogram[level];
    if (weightBackground === 0) {
      continue;
    }

    const weightForeground = total - weightBackground;
    if (weightForeground === 0) {
      break;
    }

    sumBackground += level * histogram[level];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const between =
      weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (between > best) {
      best = between;
      threshold = level;
    }
  }

  return threshold;
}

type Component = {
  pixels: number[];
  count: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/** Iterative flood fill (4-connected) so a big blob cannot blow the call stack. */
function largestComponent(mask: Uint8Array, width: number, height: number): Component | null {
  const total = width * height;
  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);

  let best: Component | null = null;

  for (let start = 0; start < total; start += 1) {
    if (mask[start] === 0 || visited[start] === 1) {
      continue;
    }

    let top = 0;
    stack[top] = start;
    top += 1;
    visited[start] = 1;

    const pixels: number[] = [];
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    while (top > 0) {
      top -= 1;
      const index = stack[top];
      pixels.push(index);

      const x = index % width;
      const y = (index - x) / width;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x > 0) {
        const neighbour = index - 1;
        if (mask[neighbour] === 1 && visited[neighbour] === 0) {
          visited[neighbour] = 1;
          stack[top] = neighbour;
          top += 1;
        }
      }
      if (x < width - 1) {
        const neighbour = index + 1;
        if (mask[neighbour] === 1 && visited[neighbour] === 0) {
          visited[neighbour] = 1;
          stack[top] = neighbour;
          top += 1;
        }
      }
      if (y > 0) {
        const neighbour = index - width;
        if (mask[neighbour] === 1 && visited[neighbour] === 0) {
          visited[neighbour] = 1;
          stack[top] = neighbour;
          top += 1;
        }
      }
      if (y < height - 1) {
        const neighbour = index + width;
        if (mask[neighbour] === 1 && visited[neighbour] === 0) {
          visited[neighbour] = 1;
          stack[top] = neighbour;
          top += 1;
        }
      }
    }

    if (!best || pixels.length > best.count) {
      best = { pixels, count: pixels.length, minX, minY, maxX, maxY };
    }
  }

  return best;
}

export function quadArea(quad: Quad): number {
  const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  let sum = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }

  return Math.abs(sum) / 2;
}

function quadFromComponent(component: Component, width: number): Quad {
  let topLeft = { x: 0, y: 0 };
  let topRight = { x: 0, y: 0 };
  let bottomRight = { x: 0, y: 0 };
  let bottomLeft = { x: 0, y: 0 };

  let minSum = Number.POSITIVE_INFINITY;
  let maxSum = Number.NEGATIVE_INFINITY;
  let minDiff = Number.POSITIVE_INFINITY;
  let maxDiff = Number.NEGATIVE_INFINITY;

  for (const index of component.pixels) {
    const x = index % width;
    const y = (index - x) / width;
    const sum = x + y;
    const diff = x - y;

    if (sum < minSum) {
      minSum = sum;
      topLeft = { x, y };
    }
    if (sum > maxSum) {
      maxSum = sum;
      bottomRight = { x, y };
    }
    if (diff > maxDiff) {
      maxDiff = diff;
      topRight = { x, y };
    }
    if (diff < minDiff) {
      minDiff = diff;
      bottomLeft = { x, y };
    }
  }

  return { topLeft, topRight, bottomRight, bottomLeft };
}

function bestQuadInMask(
  mask: Uint8Array,
  width: number,
  height: number,
): { quad: Quad; score: number } | null {
  const component = largestComponent(mask, width, height);
  if (!component) {
    return null;
  }

  const frameArea = width * height;
  const areaFraction = component.count / frameArea;

  if (areaFraction < MIN_AREA_FRACTION || areaFraction > MAX_AREA_FRACTION) {
    return null;
  }

  // A blob touching every edge is the background, not the document.
  const touchesAllEdges =
    component.minX === 0 &&
    component.minY === 0 &&
    component.maxX === width - 1 &&
    component.maxY === height - 1;

  if (touchesAllEdges) {
    return null;
  }

  const quad = quadFromComponent(component, width);
  const rectangularity = quadArea(quad) / component.count;

  if (rectangularity < MIN_RECTANGULARITY) {
    return null;
  }

  const quadFraction = quadArea(quad) / frameArea;
  if (quadFraction < MIN_AREA_FRACTION) {
    return null;
  }

  return { quad, score: quadFraction * rectangularity };
}

/**
 * Returns the document corners in pixel coordinates, or null when nothing
 * document-shaped is found. Tries both polarities so a dark document on a light
 * surface works as well as the usual light-on-dark.
 */
export function detectDocument(image: RgbaImage): Quad | null {
  if (image.width < 8 || image.height < 8) {
    return null;
  }

  const total = image.width * image.height;
  const blurred = boxBlur(toLuminance(image), image.width, image.height);
  const threshold = otsu(blurred);

  const bright = new Uint8Array(total);
  const dark = new Uint8Array(total);

  for (let index = 0; index < total; index += 1) {
    if (blurred[index] > threshold) {
      bright[index] = 1;
    } else {
      dark[index] = 1;
    }
  }

  const candidates = [
    bestQuadInMask(bright, image.width, image.height),
    bestQuadInMask(dark, image.width, image.height),
  ].filter((candidate): candidate is { quad: Quad; score: number } => candidate !== null);

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((best, current) => (current.score > best.score ? current : best)).quad;
}
