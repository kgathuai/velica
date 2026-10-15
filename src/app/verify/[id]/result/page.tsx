"use client";

/* eslint-disable @next/next/no-img-element -- verification images arrive as base64 data URLs, which next/image cannot optimise */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  CopyIcon,
  Disclosure,
  Spinner,
  cx,
} from "@/components/ui";
import {
  describeLayer1,
  describeLayer2,
  documentTypeLabels,
  formatWhen,
  layer1Labels,
  layer2Labels,
} from "@/lib/status-display";
import type { VerificationStatusResponse } from "@/lib/types/verification";

function readError(payload: unknown): string | null {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const message = (payload as { error?: unknown }).error;
    return typeof message === "string" ? message : null;
  }
  return null;
}

function toDataUrl(value?: string): string {
  if (!value) {
    return "";
  }
  return value.startsWith("data:image/") ? value : `data:image/jpeg;base64,${value}`;
}

export default function VerificationResultPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [data, setData] = useState<VerificationStatusResponse | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) {
      return;
    }

    let cancelled = false;
    let pollTimer: number | undefined;

    const load = async () => {
      try {
        const response = await fetch(`/api/verify/status?id=${encodeURIComponent(id)}`, {
          cache: "no-store",
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          throw new Error(readError(payload) ?? "We couldn't load this result.");
        }

        if (cancelled) {
          return;
        }

        const next = payload as VerificationStatusResponse;
        setData(next);
        setError("");

        if (next.decision !== "pending" && pollTimer) {
          window.clearInterval(pollTimer);
          pollTimer = undefined;
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Something went wrong.");
        }
      }
    };

    void load();
    pollTimer = window.setInterval(() => {
      void load();
    }, 2500);

    return () => {
      cancelled = true;
      if (pollTimer) {
        window.clearInterval(pollTimer);
      }
    };
  }, [id]);

  const decision = data?.decision ?? "pending";
  const approved = decision === "approved";
  const rejected = decision === "rejected";
  const documentSrc = toDataUrl(data?.documentImageEditedBase64 ?? data?.documentImageBase64);
  const selfieSrc = toDataUrl(data?.selfieImageEditedBase64 ?? data?.selfieImageBase64);

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be blocked; the reference stays visible on screen.
    }
  }

  const hero = approved
    ? {
        icon: <CheckIcon className="h-6 w-6" />,
        title: "Identity verified",
        body: "Your details matched and your selfie confirmed it was you.",
        tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
        badge: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
      }
    : rejected
      ? {
          icon: <CloseIcon className="h-6 w-6" />,
          title: "We couldn't verify you",
          body: data?.reason ?? "The checks didn't pass this time.",
          tone: "border-red-500/30 bg-red-500/10 text-red-200",
          badge: "bg-red-500/15 text-red-300 ring-red-500/30",
        }
      : {
          icon: <ClockIcon className="h-6 w-6" />,
          title: "Still checking",
          body: "This page updates automatically as soon as we have a decision.",
          tone: "border-sky-500/30 bg-sky-500/10 text-sky-200",
          badge: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
        };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <div className={cx("animate-fade-up rounded-2xl border p-5 sm:p-6", hero.tone)}>
        <div className="flex items-start gap-4">
          <span className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-full ring-1", hero.badge)}>
            {hero.icon}
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">{hero.title}</h1>
            <p className="mt-1 text-sm opacity-90">{hero.body}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-5">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate rounded-xl border border-slate-800 bg-slate-900/40 px-3.5 py-2.5 text-[11px] text-slate-400">
          Reference <span className="font-mono text-slate-300">{id}</span>
        </p>
        <button
          type="button"
          onClick={() => void copyReference()}
          className="btn btn-secondary !px-3 !py-2.5 text-xs"
          aria-label="Copy reference number"
        >
          {copied ? <CheckIcon className="h-4 w-4 text-emerald-300" /> : <CopyIcon className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <section className="card mt-5 p-5">
        <h2 className="text-sm font-semibold text-slate-100">What we checked</h2>
        <ul className="mt-4 space-y-3">
          <li className="flex items-start gap-3">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-800 text-slate-300">
              <CheckIcon className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-sm text-slate-200">
                Records check · {layer1Labels[data?.layer1Provider ?? "transunion"]}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">{describeLayer1(data?.layer1Outcome)}</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-800 text-slate-300">
              <CheckIcon className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-sm text-slate-200">
                Selfie check · {layer2Labels[data?.layer2Provider ?? "jumio"]}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {data?.layer1Outcome === "match"
                  ? "Not needed — your details matched straight away."
                  : describeLayer2(data?.layer2Outcome)}
              </p>
            </div>
          </li>
        </ul>
      </section>

      {(documentSrc || selfieSrc) && (
        <section className="card mt-5 p-5">
          <h2 className="text-sm font-semibold text-slate-100">What you sent</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {documentSrc && (
              <figure>
                <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-black">
                  <img
                    src={documentSrc}
                    alt="Submitted document"
                    className="h-auto w-full object-contain"
                  />
                  {data?.duplicateDocumentExactly && (
                    <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-[10px] font-bold tracking-[0.2em] text-white">
                      COPY
                    </span>
                  )}
                </div>
                <figcaption className="mt-2 text-xs text-slate-400">
                  {data ? documentTypeLabels[data.documentType ?? "passport"] : "Document"}
                  {data?.documentImageEditedBase64 ? " · edited" : ""}
                </figcaption>
              </figure>
            )}

            {selfieSrc && (
              <figure>
                <div className="overflow-hidden rounded-xl border border-slate-800 bg-black">
                  <img
                    src={selfieSrc}
                    alt="Submitted selfie"
                    className="h-auto w-full object-contain"
                  />
                </div>
                <figcaption className="mt-2 text-xs text-slate-400">
                  Selfie{data?.selfieImageEditedBase64 ? " · edited" : ""}
                </figcaption>
              </figure>
            )}
          </div>
        </section>
      )}

      <div className="mt-5">
        <Disclosure summary="Technical details" hint="Audit trail">
          {data ? (
            <>
              {data.llmExtraction && (
                <p className="mb-3 text-xs text-slate-400">
                  Document reading confidence:{" "}
                  <span className="text-slate-200">
                    {Math.round(data.llmExtraction.confidence * 100)}%
                  </span>{" "}
                  · {data.llmExtraction.rawSummary}
                </p>
              )}
              <ul className="space-y-2">
                {data.auditTrail.map((entry, index) => (
                  <li
                    key={`${entry.at}-${index}`}
                    className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
                  >
                    <p className="text-xs text-slate-200">{entry.message}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">
                      {entry.layer} · {entry.status} · {formatWhen(entry.at)}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-slate-400">Nothing to show yet.</p>
          )}
        </Disclosure>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        {decision === "pending" && (
          <Link href={`/verify/${id}`} className="btn btn-secondary sm:flex-1">
            <Spinner className="h-4 w-4" />
            Watch progress
          </Link>
        )}
        <Link href="/" className="btn btn-primary sm:flex-1">
          Start a new verification
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    </main>
  );
}
