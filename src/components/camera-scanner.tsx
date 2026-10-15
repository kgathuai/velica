"use client";

/* eslint-disable @next/next/no-img-element -- the review preview is an in-memory object URL, which next/image cannot optimise */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CameraIcon,
  CheckIcon,
  CloseIcon,
  RefreshIcon,
  Spinner,
  UploadIcon,
  cx,
} from "@/components/ui";
import { detectDocument, type DetectPoint, type Quad } from "@/lib/document-detect";
import { quadEdgeSizes, warpQuadToRectangle } from "@/lib/perspective";

type CameraFacing = "user" | "environment";

/** A capture always yields the untouched frame plus the document-focused scan. */
export type CameraCapture = {
  original: File;
  scan: File;
};

type CameraScannerProps = {
  title: string;
  hint: string;
  /** Aspect ratio of the composition guide drawn over the viewfinder. */
  aspectRatio: number;
  facingMode: CameraFacing;
  /** Look for a document in the frame and focus the scan on it. */
  lookForDocument?: boolean;
  onClose: () => void;
  onCapture: (capture: CameraCapture) => void;
};

/** Detection runs on a small copy of the frame, which is fast enough to run live. */
const DETECT_WIDTH = 320;
const DETECT_INTERVAL_MS = 250;
/** Cap the flattened scan so a phone never builds a gigantic image. */
const MAX_SCAN_EDGE = 2400;

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("We couldn't process that photo."));
          return;
        }
        resolve(new File([blob], name, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.95,
    );
  });
}

function sameQuad(a: Quad | null, b: Quad | null): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }

  const near = (first: DetectPoint, second: DetectPoint) =>
    Math.abs(first.x - second.x) < 0.01 && Math.abs(first.y - second.y) < 0.01;

  return (
    near(a.topLeft, b.topLeft) &&
    near(a.topRight, b.topRight) &&
    near(a.bottomRight, b.bottomRight) &&
    near(a.bottomLeft, b.bottomLeft)
  );
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export default function CameraScanner({
  title,
  hint,
  aspectRatio,
  facingMode,
  lookForDocument = false,
  onClose,
  onCapture,
}: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [facing, setFacing] = useState<CameraFacing>(facingMode);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [frameSize, setFrameSize] = useState("");
  const [error, setError] = useState("");
  /** Held for review before it is handed to the form. */
  const [shot, setShot] = useState<{ original: File; scan: File; url: string } | null>(null);
  /** Detected document corners, normalised to 0..1 of the frame. */
  const [detected, setDetected] = useState<Quad | null>(null);
  /** Where the video actually sits inside its box, so the overlay lines up. */
  const [videoBox, setVideoBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          setError("This browser can't open the camera. Upload a photo instead.");
        }
      });
      return () => {
        cancelled = true;
      };
    }

    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      .then(async (stream) => {
        if (cancelled) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];

        try {
          await track.applyConstraints({
            advanced: [{ focusMode: "continuous" } as unknown as MediaTrackConstraintSet],
          });
        } catch {
          // Continuous autofocus is not supported on every device.
        }

        if (cancelled) {
          stopStream(stream);
          return;
        }

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            // Some browsers only allow playback once the element is painted.
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("We couldn't start the camera. Upload a photo instead.");
        }
      });

    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [facing]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (shot) {
        setShot(null);
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, shot]);

  // Release the preview URL whenever the shot is replaced or the scanner closes.
  useEffect(() => {
    if (!shot) {
      return;
    }
    return () => URL.revokeObjectURL(shot.url);
  }, [shot]);

  /** Keeps the overlay aligned with the video, which letterboxes inside its box. */
  const measureVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      return;
    }

    const rect = video.getBoundingClientRect();
    const scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);
    const width = video.videoWidth * scale;
    const height = video.videoHeight * scale;

    setVideoBox({
      left: (rect.width - width) / 2,
      top: (rect.height - height) / 2,
      width,
      height,
    });
  }, []);

  useEffect(() => {
    window.addEventListener("resize", measureVideo);
    return () => window.removeEventListener("resize", measureVideo);
  }, [measureVideo]);

  // Look for a document in the frame while the viewfinder is live.
  useEffect(() => {
    if (!lookForDocument || !ready || shot) {
      return;
    }

    let cancelled = false;

    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      let canvas = detectCanvasRef.current;
      if (!canvas) {
        canvas = document.createElement("canvas");
        detectCanvasRef.current = canvas;
      }

      const scale = DETECT_WIDTH / video.videoWidth;
      canvas.width = DETECT_WIDTH;
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      let quad: Quad | null = null;
      try {
        quad = detectDocument(context.getImageData(0, 0, canvas.width, canvas.height));
      } catch {
        quad = null;
      }

      if (cancelled) {
        return;
      }

      const normalised = quad
        ? {
            topLeft: { x: quad.topLeft.x / canvas.width, y: quad.topLeft.y / canvas.height },
            topRight: { x: quad.topRight.x / canvas.width, y: quad.topRight.y / canvas.height },
            bottomRight: {
              x: quad.bottomRight.x / canvas.width,
              y: quad.bottomRight.y / canvas.height,
            },
            bottomLeft: {
              x: quad.bottomLeft.x / canvas.width,
              y: quad.bottomLeft.y / canvas.height,
            },
          }
        : null;

      // Reusing the previous reference avoids re-rendering on every tick.
      setDetected((previous) => (sameQuad(previous, normalised) ? previous : normalised));
    }, DETECT_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [lookForDocument, ready, shot]);

  function handleFlipCamera() {
    setReady(false);
    setFrameSize("");
    setError("");
    setFacing((current) => (current === "environment" ? "user" : "environment"));
  }

  async function handleCapture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setError("The camera isn't ready yet. Give it a moment and try again.");
      return;
    }

    setCapturing(true);
    setError("");

    try {
      const width = video.videoWidth;
      const height = video.videoHeight;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("We couldn't capture that photo.");
      }

      // The untouched frame is always kept, cropped or not.
      context.drawImage(video, 0, 0, width, height);
      const original = await canvasToFile(canvas, `original-${Date.now()}.jpg`);

      let scan = original;

      if (lookForDocument && detected) {
        const quad: Quad = {
          topLeft: { x: detected.topLeft.x * width, y: detected.topLeft.y * height },
          topRight: { x: detected.topRight.x * width, y: detected.topRight.y * height },
          bottomRight: { x: detected.bottomRight.x * width, y: detected.bottomRight.y * height },
          bottomLeft: { x: detected.bottomLeft.x * width, y: detected.bottomLeft.y * height },
        };

        const sizes = quadEdgeSizes(quad);
        const shrink = Math.min(1, MAX_SCAN_EDGE / Math.max(sizes.width, sizes.height));

        const warped = warpQuadToRectangle(
          context.getImageData(0, 0, width, height),
          quad,
          sizes.width * shrink,
          sizes.height * shrink,
        );

        const scanCanvas = document.createElement("canvas");
        scanCanvas.width = warped.width;
        scanCanvas.height = warped.height;

        const scanContext = scanCanvas.getContext("2d");
        if (scanContext) {
          const flattened = scanContext.createImageData(warped.width, warped.height);
          flattened.data.set(warped.data);
          scanContext.putImageData(flattened, 0, 0);
        }

        scan = await canvasToFile(scanCanvas, `scan-${Date.now()}.jpg`);
      }

      // Show the document-focused version, since that is the one that gets used.
      setShot({ original, scan, url: URL.createObjectURL(scan) });
    } catch (captureError) {
      setError(
        captureError instanceof Error
          ? captureError.message
          : "We couldn't capture that photo. Please try again.",
      );
    } finally {
      setCapturing(false);
    }
  }

  function retake() {
    setError("");
    setShot(null);
  }

  function useShot() {
    if (shot) {
      onCapture({ original: shot.original, scan: shot.scan });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-6">
        <div>
          <h2 className="text-base font-semibold text-white">
            {shot ? "Check your photo" : title}
          </h2>
          <p className="mt-0.5 max-w-sm text-xs text-slate-400">
            {shot
              ? "Make sure it's sharp, well lit and everything you need is visible."
              : hint}
          </p>
          {!shot && ready && lookForDocument && (
            <p className="mt-1 text-[11px] text-sky-300/90">
              {detected
                ? "Document found — the scan will be cropped to its edges"
                : "Looking for a document…"}
            </p>
          )}
          {!shot && ready && !lookForDocument && (
            <p className="mt-1 text-[11px] text-emerald-300/90">
              Original kept{frameSize ? ` · ${frameSize}` : ""} · nothing is cropped
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn btn-ghost h-10 w-10 !px-0"
          aria-label="Close camera"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-4">
        <div className="relative flex min-h-[240px] w-full max-w-xl items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-black">
          {/* Kept mounted while reviewing, so the stream stays live and Retake is instant. */}
          <video
            ref={videoRef}
            className={cx(
              "block max-h-[62vh] w-full bg-black object-contain",
              shot && "invisible",
            )}
            muted
            playsInline
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (video.videoWidth && video.videoHeight) {
                setFrameSize(`${video.videoWidth}×${video.videoHeight}`);
              }
              measureVideo();
            }}
            onPlaying={() => {
              setReady(true);
              measureVideo();
            }}
          />

          {shot ? (
            <img
              src={shot.url}
              alt="The photo you just took"
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : (
            <>
              {!ready && (
                <div className="absolute inset-0 grid place-items-center bg-slate-950/80">
                  <span className="flex items-center gap-2 text-xs text-slate-300">
                    <Spinner className="h-4 w-4" />
                    Starting camera…
                  </span>
                </div>
              )}

              {capturing && <span className="animate-flash absolute inset-0 bg-white" />}

              {/* Composition guide: where to place the subject. The whole frame is saved. */}
              <div className="pointer-events-none absolute inset-0 grid place-items-center p-5">
                <div
                  className="h-3/4 max-w-full rounded-xl border-2 border-dashed border-white/45"
                  style={{ aspectRatio: `${aspectRatio}` }}
                />
              </div>

              <span className="pointer-events-none absolute left-3 top-3 h-7 w-7 rounded-tl-lg border-l-2 border-t-2 border-sky-300/90" />
              <span className="pointer-events-none absolute right-3 top-3 h-7 w-7 rounded-tr-lg border-r-2 border-t-2 border-sky-300/90" />
              <span className="pointer-events-none absolute bottom-3 left-3 h-7 w-7 rounded-bl-lg border-b-2 border-l-2 border-sky-300/90" />
              <span className="pointer-events-none absolute bottom-3 right-3 h-7 w-7 rounded-br-lg border-b-2 border-r-2 border-sky-300/90" />

              {detected && videoBox && (
                <svg
                  className="pointer-events-none absolute"
                  style={{
                    left: videoBox.left,
                    top: videoBox.top,
                    width: videoBox.width,
                    height: videoBox.height,
                  }}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <polygon
                    points={[
                      detected.topLeft,
                      detected.topRight,
                      detected.bottomRight,
                      detected.bottomLeft,
                    ]
                      .map((point) => `${point.x * 100},${point.y * 100}`)
                      .join(" ")}
                    fill="rgba(56,189,248,0.14)"
                    stroke="#7dd3fc"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="px-6 pb-2 text-center text-xs font-medium text-red-300" role="alert">
          {error}
        </p>
      )}

      {shot ? (
        <footer className="flex items-center gap-3 px-6 pb-8 pt-2">
          <button type="button" onClick={retake} className="btn btn-secondary flex-1">
            <RefreshIcon className="h-4 w-4" />
            Retake
          </button>
          <button type="button" onClick={useShot} className="btn btn-primary flex-1">
            <CheckIcon className="h-4 w-4" />
            Use this photo
          </button>
        </footer>
      ) : (
        <footer className="flex items-center justify-between gap-4 px-8 pb-8 pt-2">
          <button
            type="button"
            onClick={handleFlipCamera}
            className="btn btn-secondary h-11 w-11 rounded-full !px-0"
            aria-label="Switch between front and back camera"
          >
            <RefreshIcon className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={handleCapture}
            disabled={!ready || capturing}
            className="grid h-16 w-16 place-items-center rounded-full bg-white text-slate-900 shadow-2xl transition active:scale-95 disabled:opacity-40"
            aria-label="Take photo"
          >
            {capturing ? (
              <Spinner className="h-6 w-6" />
            ) : (
              <span className="grid h-12 w-12 place-items-center rounded-full border-4 border-slate-900/80">
                <CameraIcon className="h-5 w-5" />
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-secondary h-11 w-11 rounded-full !px-0"
            aria-label="Upload a photo instead"
          >
            <UploadIcon className="h-5 w-5" />
          </button>
        </footer>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onCapture({ original: file, scan: file });
          }
          event.target.value = "";
        }}
      />
    </div>
  );
}
