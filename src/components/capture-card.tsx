"use client";

/* eslint-disable @next/next/no-img-element -- previews are in-memory base64 data URLs, which next/image cannot optimise */

import { useRef, type ReactNode } from "react";
import { CameraIcon, RefreshIcon, TrashIcon, UploadIcon, cx } from "@/components/ui";

type CaptureCardProps = {
  id: string;
  label: string;
  help: string;
  icon: ReactNode;
  previewSrc: string;
  fileName: string;
  /** True when the current image differs from the untouched capture. */
  edited?: boolean;
  error?: string;
  onOpenCamera: () => void;
  onPickFile: (file: File) => void;
  onEdit: () => void;
  onRevert: () => void;
  onClear: () => void;
};

function PencilIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m14 6 4 4" />
    </svg>
  );
}

export default function CaptureCard({
  id,
  label,
  help,
  icon,
  previewSrc,
  fileName,
  edited = false,
  error,
  onOpenCamera,
  onPickFile,
  onEdit,
  onRevert,
  onClear,
}: CaptureCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const captured = Boolean(previewSrc);

  return (
    <section className={cx("card flex flex-col overflow-hidden", error && "border-red-500/50")}>
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{label}</h3>
          <p className="mt-0.5 text-xs text-slate-400">{help}</p>
        </div>
        {captured && (
          <span
            className={cx(
              "animate-pop rounded-full px-2 py-0.5 text-[11px] font-semibold",
              edited ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300",
            )}
          >
            {edited ? "Edited" : "Ready"}
          </span>
        )}
      </div>

      <div className="p-4">
        {captured ? (
          <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-black">
            <img
              src={previewSrc}
              alt={`${label} preview`}
              className="mx-auto block h-auto max-h-[320px] w-auto max-w-full"
            />
          </div>
        ) : (
          <button
            type="button"
            id={id}
            onClick={onOpenCamera}
            className="flex min-h-[172px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 px-4 py-8 text-slate-400 transition hover:border-sky-500/60 hover:bg-slate-950/70 hover:text-sky-300"
          >
            <span className="text-sky-300">{icon}</span>
            <span className="text-xs font-semibold">Tap to take a photo</span>
            <span className="text-[11px] text-slate-500">or upload one from your device</span>
          </button>
        )}
      </div>

      <div className="mt-auto flex flex-wrap gap-2 px-4 pb-4">
        {captured ? (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="btn btn-primary flex-1 !py-2.5 text-xs"
            >
              <PencilIcon />
              Edit
            </button>
            <button
              type="button"
              onClick={onOpenCamera}
              className="btn btn-secondary !py-2.5 text-xs"
            >
              <RefreshIcon className="h-3.5 w-3.5" />
              Retake
            </button>
            <button
              type="button"
              onClick={onClear}
              aria-label={`Remove ${label}`}
              className="btn btn-ghost !px-2.5 !py-2.5 text-xs"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onOpenCamera}
              className="btn btn-primary flex-1 !py-2.5 text-xs"
            >
              <CameraIcon className="h-3.5 w-3.5" />
              Open camera
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="btn btn-secondary !py-2.5 text-xs"
            >
              <UploadIcon className="h-3.5 w-3.5" />
              Upload
            </button>
          </>
        )}
      </div>

      {edited && (
        <div className="flex items-center justify-between gap-2 px-4 pb-4">
          <span className="text-[11px] text-slate-500">Editing this version</span>
          <button
            type="button"
            onClick={onRevert}
            className="text-[11px] font-semibold text-sky-300 hover:text-sky-200"
          >
            Revert to original
          </button>
        </div>
      )}

      {fileName && !edited && (
        <p className="truncate px-4 pb-4 text-[11px] text-slate-500">{fileName}</p>
      )}

      {error && <p className="px-4 pb-4 text-xs font-medium text-red-300">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onPickFile(file);
          }
          event.target.value = "";
        }}
      />
    </section>
  );
}
