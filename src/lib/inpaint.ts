/**
 * Hole filling for the eraser tool.
 *
 * Pixels marked in the mask are rebuilt by diffusing the surrounding colours
 * inwards (Gauss-Seidel relaxation). That genuinely removes what was there and
 * blends with the background, unlike a black box. No model, no network.
 */

export type MaskBounds = { minX: number; minY: number; maxX: number; maxY: number };

export type MaskPoint = { x: number; y: number };

/**
 * Rasterises brush strokes into a mask. Returns null when nothing was painted,
 * which lets the caller skip the work entirely.
 */
export function maskFromStrokes(
  strokes: MaskPoint[][],
  radius: number,
  width: number,
  height: number,
): { mask: Uint8Array; bounds: MaskBounds } | null {
  const mask = new Uint8Array(width * height);
  const radiusSquared = radius * radius;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let painted = false;

  const paint = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }
    const index = y * width + x;
    if (mask[index] === 1) {
      return;
    }
    mask[index] = 1;
    painted = true;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  const stamp = (x: number, y: number) => {
    const left = Math.max(0, Math.floor(x - radius));
    const right = Math.min(width - 1, Math.ceil(x + radius));
    const top = Math.max(0, Math.floor(y - radius));
    const bottom = Math.min(height - 1, Math.ceil(y + radius));

    for (let py = top; py <= bottom; py += 1) {
      for (let px = left; px <= right; px += 1) {
        const dx = px - x;
        const dy = py - y;
        if (dx * dx + dy * dy <= radiusSquared) {
          paint(px, py);
        }
      }
    }
  };

  for (const stroke of strokes) {
    if (stroke.length === 1) {
      stamp(stroke[0].x, stroke[0].y);
      continue;
    }

    for (let index = 1; index < stroke.length; index += 1) {
      const from = stroke[index - 1];
      const to = stroke[index];
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 2)));

      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        stamp(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
      }
    }
  }

  if (!painted) {
    return null;
  }

  return { mask, bounds: { minX, minY, maxX, maxY } };
}

/**
 * Fills masked pixels from the surrounding pixels. Iterating only the masked
 * bounding box keeps the cost proportional to the erased area, not the image.
 */
export function inpaint(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Uint8Array,
  bounds: MaskBounds,
  iterations: number,
): void {
  const left = Math.max(0, bounds.minX - 1);
  const right = Math.min(width - 1, bounds.maxX + 1);
  const top = Math.max(0, bounds.minY - 1);
  const bottom = Math.min(height - 1, bounds.maxY + 1);

  const regionWidth = right - left + 1;
  const regionHeight = bottom - top + 1;

  if (regionWidth <= 0 || regionHeight <= 0) {
    return;
  }

  // Seed the hole with the average of the surrounding pixels so relaxation
  // starts close to the answer instead of from black.
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const index = y * width + x;
      if (mask[index] === 1) {
        continue;
      }
      const pixel = index * 4;
      sumR += data[pixel];
      sumG += data[pixel + 1];
      sumB += data[pixel + 2];
      count += 1;
    }
  }

  if (count === 0) {
    return;
  }

  const seedR = sumR / count;
  const seedG = sumG / count;
  const seedB = sumB / count;

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const index = y * width + x;
      if (mask[index] !== 1) {
        continue;
      }
      const pixel = index * 4;
      data[pixel] = seedR;
      data[pixel + 1] = seedG;
      data[pixel + 2] = seedB;
    }
  }

  // Gauss-Seidel: updating in place converges roughly twice as fast as Jacobi.
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const index = y * width + x;
        if (mask[index] !== 1) {
          continue;
        }

        let r = 0;
        let g = 0;
        let b = 0;
        let neighbours = 0;

        if (x > 0) {
          const neighbour = (index - 1) * 4;
          r += data[neighbour];
          g += data[neighbour + 1];
          b += data[neighbour + 2];
          neighbours += 1;
        }
        if (x < width - 1) {
          const neighbour = (index + 1) * 4;
          r += data[neighbour];
          g += data[neighbour + 1];
          b += data[neighbour + 2];
          neighbours += 1;
        }
        if (y > 0) {
          const neighbour = (index - width) * 4;
          r += data[neighbour];
          g += data[neighbour + 1];
          b += data[neighbour + 2];
          neighbours += 1;
        }
        if (y < height - 1) {
          const neighbour = (index + width) * 4;
          r += data[neighbour];
          g += data[neighbour + 1];
          b += data[neighbour + 2];
          neighbours += 1;
        }

        if (neighbours === 0) {
          continue;
        }

        const pixel = index * 4;
        data[pixel] = r / neighbours;
        data[pixel + 1] = g / neighbours;
        data[pixel + 2] = b / neighbours;
      }
    }
  }
}
