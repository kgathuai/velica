/**
 * Perspective correction: maps the detected document corners onto a flat
 * rectangle, the way a scanner app "flattens" a page photographed at an angle.
 * Pure maths over pixel buffers, so it is testable.
 */

import type { Quad, RgbaImage } from "@/lib/document-detect";

export type WarpPoint = { x: number; y: number };

/** Gauss-Jordan elimination with partial pivoting. */
function solveLinearSystem(matrix: number[][], size: number): number[] | null {
  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    let pivotValue = Math.abs(matrix[column][column]);

    for (let row = column + 1; row < size; row += 1) {
      const value = Math.abs(matrix[row][column]);
      if (value > pivotValue) {
        pivotValue = value;
        pivotRow = row;
      }
    }

    if (pivotValue < 1e-10) {
      return null;
    }

    if (pivotRow !== column) {
      const swap = matrix[column];
      matrix[column] = matrix[pivotRow];
      matrix[pivotRow] = swap;
    }

    const pivot = matrix[column][column];

    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }
      const factor = matrix[row][column] / pivot;
      if (factor === 0) {
        continue;
      }
      for (let k = column; k <= size; k += 1) {
        matrix[row][k] -= factor * matrix[column][k];
      }
    }
  }

  const result: number[] = [];
  for (let index = 0; index < size; index += 1) {
    result.push(matrix[index][size] / matrix[index][index]);
  }
  return result;
}

/**
 * Solves the homography that maps `destination` points onto `source` points.
 * Returns [a,b,c,d,e,f,g,h] where
 *   x = (a·u + b·v + c) / (g·u + h·v + 1)
 *   y = (d·u + e·v + f) / (g·u + h·v + 1)
 */
export function solveHomography(
  destination: WarpPoint[],
  source: WarpPoint[],
): number[] | null {
  if (destination.length !== 4 || source.length !== 4) {
    return null;
  }

  const matrix: number[][] = [];

  for (let index = 0; index < 4; index += 1) {
    const u = destination[index].x;
    const v = destination[index].y;
    const x = source[index].x;
    const y = source[index].y;

    matrix.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    matrix.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }

  return solveLinearSystem(matrix, 8);
}

function distance(a: WarpPoint, b: WarpPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Natural output size for a quad, from its longest opposite edges. */
export function quadEdgeSizes(quad: Quad): { width: number; height: number } {
  return {
    width: Math.max(
      distance(quad.topLeft, quad.topRight),
      distance(quad.bottomLeft, quad.bottomRight),
    ),
    height: Math.max(
      distance(quad.topLeft, quad.bottomLeft),
      distance(quad.topRight, quad.bottomRight),
    ),
  };
}

function sampleBilinear(
  image: RgbaImage,
  x: number,
  y: number,
  target: Uint8ClampedArray,
  offset: number,
): void {
  const clampedX = Math.min(image.width - 1, Math.max(0, x));
  const clampedY = Math.min(image.height - 1, Math.max(0, y));

  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(image.width - 1, x0 + 1);
  const y1 = Math.min(image.height - 1, y0 + 1);

  const fx = clampedX - x0;
  const fy = clampedY - y0;

  const topLeft = (y0 * image.width + x0) * 4;
  const topRight = (y0 * image.width + x1) * 4;
  const bottomLeft = (y1 * image.width + x0) * 4;
  const bottomRight = (y1 * image.width + x1) * 4;

  for (let channel = 0; channel < 4; channel += 1) {
    const top =
      image.data[topLeft + channel] * (1 - fx) + image.data[topRight + channel] * fx;
    const bottom =
      image.data[bottomLeft + channel] * (1 - fx) + image.data[bottomRight + channel] * fx;

    target[offset + channel] = top * (1 - fy) + bottom * fy;
  }
}

/** Flattens the quad into an upright rectangle of the requested size. */
export function warpQuadToRectangle(
  source: RgbaImage,
  quad: Quad,
  outputWidth: number,
  outputHeight: number,
): RgbaImage {
  const width = Math.max(1, Math.round(outputWidth));
  const height = Math.max(1, Math.round(outputHeight));
  const data = new Uint8ClampedArray(width * height * 4);

  const destination = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];

  const sourceCorners = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const homography = solveHomography(destination, sourceCorners);

  if (!homography) {
    return { data, width, height };
  }

  const [a, b, c, d, e, f, g, h] = homography;

  for (let v = 0; v < height; v += 1) {
    for (let u = 0; u < width; u += 1) {
      const denominator = g * u + h * v + 1;
      const sourceX = (a * u + b * v + c) / denominator;
      const sourceY = (d * u + e * v + f) / denominator;
      sampleBilinear(source, sourceX, sourceY, data, (v * width + u) * 4);
    }
  }

  return { data, width, height };
}
