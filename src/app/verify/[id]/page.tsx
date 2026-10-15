"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Disclosure, RefreshIcon, Spinner, StageIcon, cx } from "@/components/ui";
import { buildStages, formatWhen } from "@/lib/status-display";
import type { VerificationStatusResponse } from "@/lib/types/verification";

function readError(payload: unknown): string | null {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const message = (payload as { error?: unknown }).error;
    return typeof message === "string" ? message : null;
  }
  return null;
}

export default function VerificationProgressPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [status, setStatus] = useState<VerificationStatusResponse | null>(null);
  const [error, setError] = useState("");
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/verify/status?id=${encodeURIComponent(id)}`, {
          cache: "no-store",
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          throw new Error(readError(payload) ?? "We couldn't load this verification.");
        }

        if (cancelled) {
          return;
        }

        const next = payload as VerificationStatusResponse;
        setStatus(next);
        setError("");

        if (next.decision !== "pending") {
          router.replace(`/verify/${id}/result`);
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(pollError instanceof Error ? pollError.message : "Something went wrong.");
        }
      }
    };

    void poll();
    const pollTimer = window.setInterval(() => {
      void poll();
    }, 1500);
    const slowTimer = window.setTimeout(() => setSlow(true), 20000);

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
      window.clearTimeout(slowTimer);
    };
  }, [id, router, attempt]);

  const stages = buildStages(status);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30">
          <Spinner className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white sm:text-xl">
            Checking your identity
          </h1>
          <p className="text-xs text-slate-400">Keep this page open — it updates by itself.</p>
        </div>
      </header>

      <p className="mt-4 truncate rounded-xl border border-slate-800 bg-slate-900/40 px-3.5 py-2.5 text-[11px] text-slate-400">
        Reference <span className="font-mono text-slate-300">{id || "loading…"}</span>
      </p>

      <ol className="mt-6 space-y-3">
        {stages.map((stage) => (
          <li
            key={stage.key}
            className={cx(
              "flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-3.5 transition",
              stage.state === "pending" && "opacity-55",
              stage.state === "active" && "border-sky-500/40 bg-sky-500/5",
            )}
          >
            <StageIcon state={stage.state} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100">{stage.title}</p>
              <p className="mt-0.5 text-xs text-slate-400">{stage.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      {error && (
        <div className="mt-5 space-y-3">
          <Alert>{error}</Alert>
          <button
            type="button"
            onClick={() => {
              setError("");
              setAttempt((current) => current + 1);
            }}
            className="btn btn-secondary w-full"
          >
            <RefreshIcon className="h-4 w-4" />
            Try again
          </button>
        </div>
      )}

      {!error && slow && (
        <p className="mt-5 text-xs text-slate-400">
          This is taking longer than usual. You can leave this page — your reference number above
          will still work.
        </p>
      )}

      <div className="mt-6">
        <Disclosure summary="Technical details" hint="What happened behind the scenes">
          {status ? (
            <ul className="space-y-2">
              {status.auditTrail.map((entry, index) => (
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
              {status.llmExtraction && (
                <li className="text-xs text-slate-400">
                  Document reading confidence:{" "}
                  {Math.round(status.llmExtraction.confidence * 100)}%
                </li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">Nothing to show yet.</p>
          )}
        </Disclosure>
      </div>
    </main>
  );
}
