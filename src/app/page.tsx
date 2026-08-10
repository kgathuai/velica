"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DocType = "passport" | "driver_license" | "id_card";

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError("");

    try {
      const documentFile = formData.get("documentFile") as File | null;
      const selfieFile = formData.get("selfieFile") as File | null;

      if (!documentFile || documentFile.size === 0) {
        throw new Error("Please upload a document image.");
      }

      const payload = {
        firstName: String(formData.get("firstName") || ""),
        lastName: String(formData.get("lastName") || ""),
        dob: String(formData.get("dob") || ""),
        documentNumber: String(formData.get("documentNumber") || ""),
        documentType: String(formData.get("documentType") || "passport") as DocType,
        layer1Provider: String(formData.get("layer1Provider") || "transunion"),
        layer2Provider: String(formData.get("layer2Provider") || "jumio"),
        duplicateDocumentExactly: String(formData.get("duplicateDocumentExactly") || "") === "on",
        documentImageBase64: await fileToBase64(documentFile),
        selfieImageBase64:
          selfieFile && selfieFile.size > 0 ? await fileToBase64(selfieFile) : undefined,
      };

      const res = await fetch("/api/verify/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as { verificationId?: string; error?: string };

      if (!res.ok || !data.verificationId) {
        throw new Error(data.error || "Failed to start verification");
      }

      router.push(`/verify/${data.verificationId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#0b1324,#030712_65%)] text-slate-100 px-4 py-10 sm:px-8">
      <section className="mx-auto w-full max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-sky-950/30 sm:p-8">
        <p className="inline-flex rounded-full border border-sky-700/50 bg-sky-950/50 px-3 py-1 text-xs tracking-wide text-sky-300">
          Velica Verify
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          User Registration Screen
        </h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Layer 1 checks identity against bureau data. If no match or flagged, Layer 2 runs biometric AI verification.
        </p>

        <form
          action={async (formData) => {
            await handleSubmit(formData);
          }}
          className="mt-8 grid gap-4 sm:grid-cols-2"
        >
          <input required name="firstName" placeholder="First Name" className="field" />
          <input required name="lastName" placeholder="Last Name" className="field" />
          <input required name="dob" placeholder="DOB (YYYY-MM-DD)" className="field" />
          <input required name="documentNumber" placeholder="Document Number" className="field" />

          <select name="documentType" className="field">
            <option value="passport">Passport</option>
            <option value="driver_license">Driver License</option>
            <option value="id_card">ID Card</option>
          </select>

          <select name="layer1Provider" className="field">
            <option value="transunion">Layer 1: TransUnion</option>
            <option value="equifax">Layer 1: Equifax</option>
          </select>

          <select name="layer2Provider" className="field">
            <option value="jumio">Layer 2: Jumio</option>
            <option value="onfido">Layer 2: Onfido</option>
          </select>

          <div className="sm:col-span-2 grid gap-2 rounded-xl border border-slate-800 p-4">
            <label className="text-sm text-slate-300" htmlFor="documentFile">
              Document Image (required, you can use camera)
            </label>
            <input
              required
              id="documentFile"
              name="documentFile"
              type="file"
              accept="image/*"
              capture="environment"
              className="block w-full text-sm"
            />

            <label className="mt-2 text-sm text-slate-300" htmlFor="selfieFile">
              Selfie Image (optional, use front camera)
            </label>
            <input
              id="selfieFile"
              name="selfieFile"
              type="file"
              accept="image/*"
              capture="user"
              className="block w-full text-sm"
            />

            <label className="mt-2 flex items-center gap-2 text-sm text-slate-300" htmlFor="duplicateDocumentExactly">
              <input
                id="duplicateDocumentExactly"
                name="duplicateDocumentExactly"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-700 bg-slate-900"
              />
              Duplicate the document exactly as shared
            </label>
          </div>

          {error && (
            <p className="sm:col-span-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>
          )}

          <button
            disabled={loading}
            type="submit"
            className="sm:col-span-2 rounded-xl bg-sky-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Starting Verification..." : "Start Verification"}
          </button>
        </form>
      </section>
    </main>
  );
}
