/** Small image helpers shared by the scan library. */

export function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("We couldn't read that image."));
    image.src = url;
  });
}

/**
 * Builds a small preview for the library grid. Stored as a data URL because
 * thumbnails are tiny, which avoids managing object-URL lifecycles while rendering.
 */
export async function createThumbnail(blob: Blob, maxEdge = 420): Promise<string> {
  const url = URL.createObjectURL(blob);

  try {
    const image = await loadImageElement(url);
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("We couldn't prepare that preview.");
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export function scanName(date: Date): string {
  const when = date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Scan · ${when}`;
}

/**
 * `crypto.randomUUID` needs a secure context, so it is missing when the app is
 * opened over plain http on a LAN address. Fall back rather than crash.
 */
export function newScanId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `scan-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}
