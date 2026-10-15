"use client";

/* eslint-disable @next/next/no-img-element -- thumbnails are in-memory base64 data URLs, which next/image cannot optimise */

import { useRef, type ReactNode } from "react";
import { CameraIcon, TrashIcon, UploadIcon } from "@/components/ui";

type UploadTileProps = {
  label: string;
  icon: ReactNode;
  previewSrc: string;
  fileName: string;
  onOpenCamera: () => void;
  onPickFile: (file: File) => void;
  onClear: () => void;
};

/** One photo slot: take it with the camera or pick a file, with a thumbnail of the result. */
export default function UploadTile({
  label,
  icon,
  previewSrc,
  fileName,
  onOpenCamera,
  onPickFile,
  onClear,
}: UploadTileProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chosen = Boolean(previewSrc);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
      <div className="flex items-center gap-2.5">
        {chosen ? (
          <img
            src={previewSrc}
            alt={`${label} preview`}
            className="h-10 w-10 shrink-0 rounded-md border border-slate-700 object-cover"
          />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-slate-800 text-slate-500">
            {icon}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-200">{label}</p>
          <p className="truncate text-[11px] text-slate-500">
            {fileName || (chosen ? "Photo added" : "Not added yet")}
          </p>
        </div>

        {chosen && (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Remove ${label}`}
            className="btn btn-ghost h-8 w-8 shrink-0 !px-0"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onOpenCamera}
          className="btn btn-primary flex-1 !px-2 !py-1.5 text-[11px]"
        >
          <CameraIcon className="h-3.5 w-3.5" />
          Take photo
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="btn btn-secondary flex-1 !px-2 !py-1.5 text-[11px]"
        >
          <UploadIcon className="h-3.5 w-3.5" />
          {chosen ? "Replace" : "Upload"}
        </button>
      </div>

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
    </div>
  );
}
