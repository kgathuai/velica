"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type ResultResponse = {
  id: string;
  decision: "pending" | "approved" | "rejected";
  reason?: string;
  duplicateDocumentExactly?: boolean;
  documentImageBase64?: string;
  selfieImageBase64?: string;
  layer1Outcome?: string;
  layer2Outcome?: string;
  llmExtraction?: {
    confidence: number;
    rawSummary: string;
    extracted: Record<string, string | undefined>;
  };
  auditTrail: Array<{ layer: string; status: string; message: string; at: string }>;
};

export default function VerificationResultPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || "";
  const [data, setData] = useState<ResultResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) {
      return;
    }

    const load = async () => {
      try {
        const res = await fetch(`/api/verify/status?id=${id}`, { cache: "no-store" });
        const payload = (await res.json()) as ResultResponse | { error: string };
        if (!res.ok) {
          throw new Error("error" in payload ? payload.error : "Unable to load result");
        }
        setData(payload as ResultResponse);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unexpected error");
      }
    };

    void load();
  }, [id]);

  const approved = useMemo(() => data?.decision === "approved", [data]);
  const documentSrc = useMemo(() => {
    if (!data?.documentImageBase64) {
      return "";
    }

    if (data.documentImageBase64.startsWith("data:image/")) {
      return data.documentImageBase64;
    }

    return `data:image/jpeg;base64,${data.documentImageBase64}`;
  }, [data?.documentImageBase64]);

  const selfieSrc = useMemo(() => {
    if (!data?.selfieImageBase64) {
      return "";
    }

    if (data.selfieImageBase64.startsWith("data:image/")) {
      return data.selfieImageBase64;
    }

    return `data:image/jpeg;base64,${data.selfieImageBase64}`;
  }, [data?.selfieImageBase64]);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <section className="mx-auto max-w-3xl rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6">
        <h1 className="text-2xl font-semibold">Verification Result</h1>
        <p className="mt-2 text-neutral-300">Request ID: {id || "loading"}</p>

        {error && <p className="mt-4 rounded bg-red-950/60 px-3 py-2 text-red-300">{error}</p>}

        {data && (
          <>
            <p
              className={`mt-5 rounded px-3 py-2 text-sm font-semibold ${
                approved ? "bg-emerald-950/60 text-emerald-300" : "bg-red-950/60 text-red-300"
              }`}
            >
              {approved ? "APPROVED" : "REJECTED"}
            </p>
            <p className="mt-3 text-neutral-200">{data.reason || "No reason provided."}</p>

            {documentSrc && (
              <div className="mt-4 rounded-lg border border-neutral-800 p-3">
                <p className="text-xs uppercase text-neutral-400">Document Preview</p>
                <div className="relative mt-3 overflow-hidden rounded-md border border-neutral-700">
                  <img
                    src={documentSrc}
                    alt="Submitted document"
                    className="h-auto w-full object-contain"
                  />
                  {data.duplicateDocumentExactly && (
                    <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/65 px-2 py-1 text-[10px] font-bold tracking-[0.2em] text-white">
                      COPY
                    </span>
                  )}
                </div>
              </div>
            )}

            {selfieSrc && (
              <div className="mt-4 rounded-lg border border-neutral-800 p-3">
                <p className="text-xs uppercase text-neutral-400">Selfie Preview</p>
                <div className="mt-3 overflow-hidden rounded-md border border-neutral-700">
                  <img
                    src={selfieSrc}
                    alt="Submitted selfie"
                    className="h-auto w-full object-contain"
                  />
                </div>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-neutral-800 p-3">
                <p className="text-xs uppercase text-neutral-400">Layer 1</p>
                <p className="mt-1">{data.layer1Outcome || "pending"}</p>
              </div>
              <div className="rounded-lg border border-neutral-800 p-3">
                <p className="text-xs uppercase text-neutral-400">Layer 2</p>
                <p className="mt-1">{data.layer2Outcome || "not required"}</p>
              </div>
            </div>

            {data.llmExtraction && (
              <div className="mt-4 rounded-lg border border-neutral-800 p-3">
                <p className="text-xs uppercase text-neutral-400">Qwen2.5-VL-72B Extraction</p>
                <p className="mt-1 text-sm text-neutral-200">
                  Confidence: {(data.llmExtraction.confidence * 100).toFixed(0)}%
                </p>
                <p className="mt-1 text-sm text-neutral-300">{data.llmExtraction.rawSummary}</p>
              </div>
            )}

            <div className="mt-6 space-y-2">
              {data.auditTrail.map((entry, idx) => (
                <article key={`${entry.at}-${idx}`} className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
                  <p className="text-sm">{entry.message}</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {entry.layer} • {entry.status} • {new Date(entry.at).toLocaleString()}
                  </p>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
