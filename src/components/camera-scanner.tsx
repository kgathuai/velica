"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CameraFacing = "user" | "environment";

type CameraScannerProps = {
  title: string;
  hint: string;
  aspectRatio: number;
  facingMode: CameraFacing;
  onClose: () => void;
  onCapture: (file: File) => void;
};

function stopStream(stream: MediaStream | null) {
  if (!stream) {
    return;
  }
  stream.getTracks().forEach((track) => track.stop());
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
  const [cameraError, setCameraError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function openCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });

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
          // Ignore unsupported focus constraints on some devices.
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setCameraError("Unable to access camera. You can use file upload as fallback.");
      }
    }

    void openCamera();

    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [facingMode]);

  const frameStyle = useMemo(
    () => ({
      aspectRatio: `${aspectRatio}`,
    }),
    [aspectRatio],
  );

  function handleCapture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("Camera is not ready yet. Try again in a moment.");
      return;
    }

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const sourceRatio = sourceWidth / sourceHeight;

    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;
    let cropX = 0;
    let cropY = 0;

    if (sourceRatio > aspectRatio) {
      cropWidth = Math.floor(sourceHeight * aspectRatio);
      cropX = Math.floor((sourceWidth - cropWidth) / 2);
    } else {
      cropHeight = Math.floor(sourceWidth / aspectRatio);
      cropY = Math.floor((sourceHeight - cropHeight) / 2);
    }

    const canvas = document.createElement("canvas");
    canvas.width = cropWidth;
    canvas.height = cropHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCameraError("Failed to capture image.");
      return;
    }

    ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError("Failed to create image file.");
          return;
        }

        const file = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
        onCapture(file);
        stopStream(streamRef.current);
        streamRef.current = null;
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
            <p className="text-sm text-slate-300">{hint}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopStream(streamRef.current);
              streamRef.current = null;
              onClose();
            }}
            className="rounded-lg border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="relative mt-4 overflow-hidden rounded-xl border border-slate-700 bg-black">
          <video ref={videoRef} className="h-auto w-full object-cover" muted playsInline />

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-full w-full bg-black/45 [mask-image:radial-gradient(circle_at_center,transparent_35%,black_36%)]" />
          </div>

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div
              style={frameStyle}
              className="w-full max-w-[88%] rounded-xl border-2 border-sky-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            />
          </div>
        </div>

        {cameraError && <p className="mt-3 text-sm text-red-300">{cameraError}</p>}

        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleCapture}
            className="rounded-xl bg-sky-500 px-4 py-2 font-semibold text-slate-950 hover:bg-sky-400"
          >
            Capture
          </button>
        </div>
      </div>
    </div>
  );
}
