"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type StatusResponse = {
  id: string;
  decision: "pending" | "approved" | "rejected";
  reason?: string;
  layer1Outcome?: string;
  layer2Outcome?: string;
  auditTrail: Array<{ layer: string; status: string; message: string; at: string }>;
};

export default function VerificationProgressPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id || "";
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!id) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/verify/status?id=${id}`, { cache: "no-store" });
        const data = (await res.json()) as StatusResponse | { error: string };

        if (!res.ok) {
          const message = "error" in data ? data.error : "Verification lookup failed";
          throw new Error(message);
        }

        if (cancelled) {
          return;
        }

        const safeData = data as StatusResponse;
        setStatus(safeData);

        if (safeData.decision !== "pending") {
          router.replace(`/verify/${id}/result`);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unexpected error");
        }
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 1800);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, router]);

  const stage = useMemo(() => {
    if (!status) {
      return "Initializing";
    }
    if (status.layer2Outcome) {
      return "Layer 2 complete";
    }
    if (status.layer1Outcome) {
      return "Layer 1 complete";
    }
    return "Running checks";
  }, [status]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <section className="mx-auto max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <h1 className="text-2xl font-semibold">Verification In Progress</h1>
        <p className="mt-2 text-slate-300">Request ID: {id || "loading"}</p>
        <p className="mt-4 rounded bg-slate-800 px-3 py-2 text-sm text-emerald-300">Current stage: {stage}</p>

        {error && (
          <p className="mt-4 rounded bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>
        )}

        <div className="mt-6 space-y-3">
          {(status?.auditTrail || []).map((item, idx) => (
            <article key={`${item.at}-${idx}`} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-sm text-slate-200">{item.message}</p>
              <p className="mt-1 text-xs text-slate-400">
                {item.layer} • {item.status} • {new Date(item.at).toLocaleTimeString()}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
