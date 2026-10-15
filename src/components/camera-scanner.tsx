"use client";

/* eslint-disable @next/next/no-img-element -- the review preview is an in-memory object URL, which next/image cannot optimise */

import { useEffect, useRef, useState } from "react";
import {
  CameraIcon,
  CheckIcon,
  CloseIcon,
  RefreshIcon,
  Spinner,
  UploadIcon,
  cx,
} from "@/components/ui";

type CameraFacing = "user" | "environment";

type CameraScannerProps = {
  title: string;
  hint: string;
  /** Aspect ratio of the composition guide drawn over the viewfinder. */
  aspectRatio: number;
  facingMode: CameraFacing;
  onClose: () => void;
  onCapture: (file: File) => void;
};

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export default function CameraScanner({
  title,
  hint,
  aspectRatio,
  facingMode,
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
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);

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

  function handleFlipCamera() {
    setReady(false);
    setFrameSize("");
    setError("");
    setFacing((current) => (current === "environment" ? "user" : "environment"));
  }

  function handleCapture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setError("The camera isn't ready yet. Give it a moment and try again.");
      return;
    }

    setCapturing(true);
    setError("");

    // Save the original frame: the full sensor view, no cropping and no downscaling.
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      setCapturing(false);
      setError("We couldn't capture that photo. Please try again.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCapturing(false);
          setError("We couldn't capture that photo. Please try again.");
          return;
        }

        // Hold the shot for review rather than saving it straight away.
        const file = new File([blob], `original-${Date.now()}.jpg`, { type: "image/jpeg" });
        setShot({ file, url: URL.createObjectURL(file) });
        setCapturing(false);
      },
      "image/jpeg",
      0.95,
    );
  }

  function retake() {
    setError("");
    setShot(null);
  }

  function useShot() {
    if (shot) {
      onCapture(shot.file);
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
          {!shot && ready && (
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
            }}
            onPlaying={() => setReady(true)}
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
            onCapture(file);
          }
          event.target.value = "";
        }}
      />
    </div>
  );
}
