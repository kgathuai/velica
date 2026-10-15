/**
 * Pure annotation geometry, kept separate from the canvas component so the
 * coordinate maths can be reasoned about (and tested) on its own.
 */

export type Point = { x: number; y: number };

export type Annotation =
  | { kind: "pen"; color: string; width: number; alpha: number; points: Point[] }
  | { kind: "redact"; color: string; x: number; y: number; w: number; h: number }
  | { kind: "text"; color: string; x: number; y: number; text: string; size: number };

/**
 * Maps a point through a quarter turn of a `width` x `height` image.
 * The rotated canvas is `height` x `width`.
 */
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

export function rotateAnnotation(
  annotation: Annotation,
  width: number,
  height: number,
  clockwise: boolean,
): Annotation {
  if (annotation.kind === "pen") {
    return {
      ...annotation,
      points: annotation.points.map((point) => rotatePoint(point, width, height, clockwise)),
    };
  }

  if (annotation.kind === "text") {
    const point = rotatePoint({ x: annotation.x, y: annotation.y }, width, height, clockwise);
    return { ...annotation, x: point.x, y: point.y };
  }

  // A rectangle is defined by two opposite corners; rotate both, then normalise.
  const first = rotatePoint({ x: annotation.x, y: annotation.y }, width, height, clockwise);
  const second = rotatePoint(
    { x: annotation.x + annotation.w, y: annotation.y + annotation.h },
    width,
    height,
    clockwise,
  );

  return {
    ...annotation,
    x: Math.min(first.x, second.x),
    y: Math.min(first.y, second.y),
    w: Math.abs(first.x - second.x),
    h: Math.abs(first.y - second.y),
  };
}
