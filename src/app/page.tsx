"use client";

/* eslint-disable @next/next/no-img-element -- scan previews are small data URLs, which next/image cannot optimise */

import { useEffect, useState } from "react";
import AppTabs from "@/components/app-tabs";
import CameraScanner from "@/components/camera-scanner";
import ImageEditor from "@/components/image-editor";
import {
  Alert,
  CameraIcon,
  PencilIcon,
  ShieldCheckIcon,
  Spinner,
  TrashIcon,
} from "@/components/ui";
import {
  deleteDocument,
  listDocuments,
  putDocument,
  type SavedDocument,
} from "@/lib/document-store";
import { createThumbnail, dataUrlToBlob, newScanId, scanName } from "@/lib/image-files";
import { formatWhen } from "@/lib/status-display";

/** Document-ish frame for the capture guide; the whole photo is kept regardless. */
const DOCUMENT_ASPECT_RATIO = 1.414;

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [editing, setEditing] = useState<{ doc: SavedDocument; url: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const stored = await listDocuments();
        if (!cancelled) {
          setDocuments(stored);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "We couldn't open your scans.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setDocuments(await listDocuments());
  }

  function openEditor(doc: SavedDocument) {
    setEditing((current) => {
      if (current) {
        URL.revokeObjectURL(current.url);
      }
      return { doc, url: URL.createObjectURL(doc.edited ?? doc.original) };
    });
  }

  function closeEditor() {
    setEditing((current) => {
      if (current) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  }

  /** Take a photo → save it on the device → open it for editing. */
  async function handleCaptured(file: File) {
    setScanning(false);
    setError("");

    try {
      const now = new Date();
      const scan: SavedDocument = {
        id: newScanId(),
        name: scanName(now),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        original: file,
        thumbnail: await createThumbnail(file),
      };

      await putDocument(scan);
      await refresh();
      openEditor(scan);
    } catch (captureError) {
      setError(
        captureError instanceof Error ? captureError.message : "We couldn't save that scan.",
      );
    }
  }

  async function handleEditorSave(dataUrl: string) {
    const current = editing;
    if (!current) {
      return;
    }

    try {
      const blob = await dataUrlToBlob(dataUrl);
      const updated: SavedDocument = {
        ...current.doc,
        edited: blob,
        thumbnail: await createThumbnail(blob),
        updatedAt: new Date().toISOString(),
      };

      await putDocument(updated);
      closeEditor();
      await refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "We couldn't save your changes.",
      );
    }
  }

  async function remove(doc: SavedDocument) {
    if (!window.confirm(`Delete “${doc.name}”? This can't be undone.`)) {
      return;
    }

    try {
      await deleteDocument(doc.id);
      await refresh();
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : "We couldn't delete that scan.",
      );
    }
  }

  return (
    <>
      {scanning && (
        <CameraScanner
          title="Scan a document"
          hint="Fill the frame with the document — the whole photo is saved, nothing is cropped."
          aspectRatio={DOCUMENT_ASPECT_RATIO}
          facingMode="environment"
          onCapture={(file) => void handleCaptured(file)}
          onClose={() => setScanning(false)}
        />
      )}

      {editing && (
        <ImageEditor
          title="Edit your scan"
          source={editing.url}
          onCancel={closeEditor}
          onSave={(dataUrl) => void handleEditorSave(dataUrl)}
        />
      )}

      <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        <header className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30">
            <ShieldCheckIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight text-slate-100">Velica</p>
            <p className="text-xs text-slate-400">Scan, save and edit documents</p>
          </div>
        </header>

        <div className="mt-6">
          <AppTabs />
        </div>

        {error && (
          <div className="mt-5">
            <Alert>{error}</Alert>
          </div>
        )}

        <button
          type="button"
          onClick={() => setScanning(true)}
          className="btn btn-primary mt-6 w-full !py-4"
        >
          <CameraIcon className="h-5 w-5" />
          Scan a document
        </button>
        <p className="mt-2 text-center text-xs text-slate-500">
          Photograph any document. It is saved on this device and opens in the editor straight
          away.
        </p>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-100">Your scans</h2>
            {documents.length > 0 && (
              <span className="text-xs text-slate-500">
                {documents.length} saved on this device
              </span>
            )}
          </div>

          {loading ? (
            <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
              <Spinner className="h-4 w-4" />
              Loading your scans…
            </p>
          ) : documents.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-8 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-slate-800 text-slate-500">
                <CameraIcon className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-semibold text-slate-200">No scans yet</p>
              <p className="mt-1 text-xs text-slate-400">
                Tap “Scan a document” to take your first one.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {documents.map((doc) => (
                <article key={doc.id} className="card overflow-hidden">
                  <div className="relative bg-black">
                    <img
                      src={doc.thumbnail}
                      alt={`Preview of ${doc.name}`}
                      className="block h-40 w-full object-contain"
                    />
                    {doc.edited && (
                      <span className="absolute right-2 top-2 rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-bold tracking-wide text-slate-950">
                        EDITED
                      </span>
                    )}
                  </div>

                  <div className="p-3">
                    <p className="truncate text-xs font-semibold text-slate-100">{doc.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {formatWhen(doc.createdAt)}
                    </p>

                    <div className="mt-2.5 flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEditor(doc)}
                        className="btn btn-secondary flex-1 !px-2 !py-1.5 text-[11px]"
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(doc)}
                        aria-label={`Delete ${doc.name}`}
                        className="btn btn-ghost !px-2 !py-1.5 text-[11px]"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
