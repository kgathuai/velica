"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type DocType = "passport" | "driver_license" | "id_card";

type FormValues = {
  firstName: string;
  lastName: string;
  dob: string;
  documentNumber: string;
  documentType: DocType;
  layer1Provider: "transunion" | "equifax";
  layer2Provider: "jumio" | "onfido";
  duplicateDocumentExactly: boolean;
  consentAcknowledgement: boolean;
  documentFile: File | null;
  selfieFile: File | null;
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

type SavedProfile = {
  name: string;
  values: Pick<
    FormValues,
    "firstName" | "lastName" | "dob" | "documentNumber" | "documentType" | "layer1Provider" | "layer2Provider" | "duplicateDocumentExactly"
  >;
};

const SAVED_PROFILES_KEY = "velica.savedProfiles.v1";

const initialFormValues: FormValues = {
  firstName: "",
  lastName: "",
  dob: "",
  documentNumber: "",
  documentType: "passport",
  layer1Provider: "transunion",
  layer2Provider: "jumio",
  duplicateDocumentExactly: false,
  consentAcknowledgement: false,
  documentFile: null,
  selfieFile: null,
};

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function validateStep(step: number, values: FormValues): FieldErrors {
  const errors: FieldErrors = {};

  if (step === 1) {
    if (!values.firstName.trim()) {
      errors.firstName = "First name is required.";
    }
    if (!values.lastName.trim()) {
      errors.lastName = "Last name is required.";
    }
    if (!values.dob.trim()) {
      errors.dob = "Date of birth is required.";
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(values.dob.trim())) {
      errors.dob = "Use YYYY-MM-DD format.";
    }
    if (!values.documentNumber.trim()) {
      errors.documentNumber = "Document number is required.";
    } else if (values.documentNumber.trim().length < 4) {
      errors.documentNumber = "Document number must be at least 4 characters.";
    }
  }

  if (step === 2) {
    if (!values.documentFile) {
      errors.documentFile = "Document image is required.";
    }
    if (!values.selfieFile) {
      errors.selfieFile = "Selfie image is required.";
    }
  }

  if (step === 3) {
    if (!values.consentAcknowledgement) {
      errors.consentAcknowledgement = "You must confirm the declaration before submitting.";
    }
  }

  return errors;
}

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<FormValues>(initialFormValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [profileName, setProfileName] = useState("");
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [selectedProfileName, setSelectedProfileName] = useState("");
  const [profileMessage, setProfileMessage] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem(SAVED_PROFILES_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as SavedProfile[];
      if (Array.isArray(parsed)) {
        setProfiles(parsed);
      }
    } catch {
      localStorage.removeItem(SAVED_PROFILES_KEY);
    }
  }, []);

  function persistProfiles(nextProfiles: SavedProfile[]) {
    setProfiles(nextProfiles);
    localStorage.setItem(SAVED_PROFILES_KEY, JSON.stringify(nextProfiles));
  }

  function saveCurrentProfile() {
    const trimmedName = profileName.trim();
    if (!trimmedName) {
      setProfileMessage("Enter a profile name before saving.");
      return;
    }

    const profileValues: SavedProfile["values"] = {
      firstName: values.firstName,
      lastName: values.lastName,
      dob: values.dob,
      documentNumber: values.documentNumber,
      documentType: values.documentType,
      layer1Provider: values.layer1Provider,
      layer2Provider: values.layer2Provider,
      duplicateDocumentExactly: values.duplicateDocumentExactly,
    };

    const existingIndex = profiles.findIndex((p) => p.name.toLowerCase() === trimmedName.toLowerCase());
    const nextProfiles = [...profiles];
    const newProfile: SavedProfile = { name: trimmedName, values: profileValues };

    if (existingIndex >= 0) {
      nextProfiles[existingIndex] = newProfile;
    } else {
      nextProfiles.push(newProfile);
    }

    persistProfiles(nextProfiles);
    setSelectedProfileName(trimmedName);
    setProfileMessage(`Profile \"${trimmedName}\" saved.`);
  }

  function loadSelectedProfile() {
    if (!selectedProfileName) {
      setProfileMessage("Select a profile to load.");
      return;
    }

    const selected = profiles.find((p) => p.name === selectedProfileName);
    if (!selected) {
      setProfileMessage("Selected profile was not found.");
      return;
    }

    setValues((prev) => ({
      ...prev,
      ...selected.values,
      documentFile: null,
      selfieFile: null,
      consentAcknowledgement: false,
    }));
    setFieldErrors({});
    setProfileName(selected.name);
    setProfileMessage(`Profile \"${selected.name}\" loaded. Please capture fresh images.`);
  }

  function deleteSelectedProfile() {
    if (!selectedProfileName) {
      setProfileMessage("Select a profile to delete.");
      return;
    }

    const nextProfiles = profiles.filter((p) => p.name !== selectedProfileName);
    persistProfiles(nextProfiles);
    setProfileMessage(`Profile \"${selectedProfileName}\" deleted.`);
    setSelectedProfileName("");
    if (profileName === selectedProfileName) {
      setProfileName("");
    }
  }

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) {
        return prev;
      }
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function goNext(): void {
    const errors = validateStep(step, values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setStep((prev) => Math.min(prev + 1, 3));
  }

  function goBack(): void {
    setError("");
    setFieldErrors({});
    setStep((prev) => Math.max(prev - 1, 1));
  }

  async function handleSubmit(): Promise<void> {
    setLoading(true);
    setError("");

    try {
      const finalErrors = {
        ...validateStep(1, values),
        ...validateStep(2, values),
        ...validateStep(3, values),
      };

      if (Object.keys(finalErrors).length > 0) {
        setFieldErrors(finalErrors);
        setStep(3);
        throw new Error("Please fix validation errors before submitting.");
      }

      if (!values.documentFile || !values.selfieFile) {
        throw new Error("Please upload both document and selfie images.");
      }

      const payload = {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        dob: values.dob.trim(),
        documentNumber: values.documentNumber.trim(),
        documentType: values.documentType,
        layer1Provider: values.layer1Provider,
        layer2Provider: values.layer2Provider,
        duplicateDocumentExactly: values.duplicateDocumentExactly,
        documentImageBase64: await fileToBase64(values.documentFile),
        selfieImageBase64: await fileToBase64(values.selfieFile),
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#0b1324,#030712_65%)] px-4 py-10 text-slate-100 sm:px-8">
      <section className="mx-auto w-full max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-sky-950/30 sm:p-8">
        <p className="inline-flex rounded-full border border-sky-700/50 bg-sky-950/50 px-3 py-1 text-xs tracking-wide text-sky-300">
          Velica Verify
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Identity Verification Form</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Complete all sections below. Layer 1 checks identity against bureau data, and Layer 2 performs biometric verification when required.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((num) => {
            const active = step === num;
            const done = step > num;

            return (
              <div
                key={num}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  active
                    ? "border-sky-500 bg-sky-900/30 text-sky-200"
                    : done
                      ? "border-emerald-700 bg-emerald-950/30 text-emerald-300"
                      : "border-slate-800 bg-slate-900/40 text-slate-400"
                }`}
              >
                Step {num}: {num === 1 ? "Applicant" : num === 2 ? "Capture" : "Review"}
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs uppercase tracking-wide text-sky-300">Saved Profiles</p>
          <p className="mt-1 text-xs text-slate-400">
            Save form details for reuse. Images are not stored and must be captured again each time.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Profile name (e.g., John Doe Passport)"
              className="field w-full"
            />
            <button
              type="button"
              onClick={saveCurrentProfile}
              className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
            >
              Save Profile
            </button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <select
              value={selectedProfileName}
              onChange={(e) => setSelectedProfileName(e.target.value)}
              className="field w-full"
            >
              <option value="">Select saved profile</option>
              {profiles.map((profile) => (
                <option key={profile.name} value={profile.name}>
                  {profile.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={loadSelectedProfile}
              className="rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Load
            </button>

            <button
              type="button"
              onClick={deleteSelectedProfile}
              className="rounded-xl border border-red-700 px-4 py-2 text-sm text-red-300 hover:bg-red-950/40"
            >
              Delete
            </button>
          </div>

          {profileMessage && <p className="mt-2 text-xs text-sky-300">{profileMessage}</p>}
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (step < 3) {
              goNext();
              return;
            }
            await handleSubmit();
          }}
          className="mt-8 grid gap-4 sm:grid-cols-2"
        >
          {step === 1 && (
            <div className="sm:col-span-2 grid gap-2 rounded-xl border border-slate-800 p-4">
              <p className="text-xs uppercase tracking-wide text-sky-300">Step 1: Applicant details</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <input
                    name="firstName"
                    placeholder="First Name"
                    className="field w-full"
                    value={values.firstName}
                    onChange={(e) => setField("firstName", e.target.value)}
                  />
                  {fieldErrors.firstName && <p className="mt-1 text-xs text-red-300">{fieldErrors.firstName}</p>}
                </div>

                <div>
                  <input
                    name="lastName"
                    placeholder="Last Name"
                    className="field w-full"
                    value={values.lastName}
                    onChange={(e) => setField("lastName", e.target.value)}
                  />
                  {fieldErrors.lastName && <p className="mt-1 text-xs text-red-300">{fieldErrors.lastName}</p>}
                </div>

                <div>
                  <input
                    name="dob"
                    placeholder="DOB (YYYY-MM-DD)"
                    className="field w-full"
                    value={values.dob}
                    onChange={(e) => setField("dob", e.target.value)}
                  />
                  {fieldErrors.dob && <p className="mt-1 text-xs text-red-300">{fieldErrors.dob}</p>}
                </div>

                <div>
                  <input
                    name="documentNumber"
                    placeholder="Document Number"
                    className="field w-full"
                    value={values.documentNumber}
                    onChange={(e) => setField("documentNumber", e.target.value)}
                  />
                  {fieldErrors.documentNumber && <p className="mt-1 text-xs text-red-300">{fieldErrors.documentNumber}</p>}
                </div>

                <div>
                  <select
                    name="documentType"
                    className="field w-full"
                    value={values.documentType}
                    onChange={(e) => setField("documentType", e.target.value as DocType)}
                  >
                    <option value="passport">Passport</option>
                    <option value="driver_license">Driver License</option>
                    <option value="id_card">ID Card</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <>
              <div className="sm:col-span-2 grid gap-2 rounded-xl border border-slate-800 p-4">
                <p className="text-xs uppercase tracking-wide text-sky-300">Step 2: Verification route</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <select
                    name="layer1Provider"
                    className="field"
                    value={values.layer1Provider}
                    onChange={(e) => setField("layer1Provider", e.target.value as "transunion" | "equifax")}
                  >
                    <option value="transunion">Layer 1: TransUnion</option>
                    <option value="equifax">Layer 1: Equifax</option>
                  </select>

                  <select
                    name="layer2Provider"
                    className="field"
                    value={values.layer2Provider}
                    onChange={(e) => setField("layer2Provider", e.target.value as "jumio" | "onfido")}
                  >
                    <option value="jumio">Layer 2: Jumio</option>
                    <option value="onfido">Layer 2: Onfido</option>
                  </select>
                </div>
              </div>

              <div className="sm:col-span-2 grid gap-2 rounded-xl border border-slate-800 p-4">
                <p className="text-xs uppercase tracking-wide text-sky-300">Step 2: Captures</p>
                <label className="text-sm text-slate-300" htmlFor="documentFile">
                  Document Image (required, you can use camera)
                </label>
                <input
                  id="documentFile"
                  name="documentFile"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="block w-full text-sm"
                  onChange={(e) => setField("documentFile", e.target.files?.[0] || null)}
                />
                {values.documentFile && <p className="text-xs text-slate-400">Selected: {values.documentFile.name}</p>}
                {fieldErrors.documentFile && <p className="text-xs text-red-300">{fieldErrors.documentFile}</p>}

                <label className="mt-2 text-sm text-slate-300" htmlFor="selfieFile">
                  Selfie Image (required, use front camera)
                </label>
                <input
                  id="selfieFile"
                  name="selfieFile"
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="block w-full text-sm"
                  onChange={(e) => setField("selfieFile", e.target.files?.[0] || null)}
                />
                {values.selfieFile && <p className="text-xs text-slate-400">Selected: {values.selfieFile.name}</p>}
                {fieldErrors.selfieFile && <p className="text-xs text-red-300">{fieldErrors.selfieFile}</p>}

                <label className="mt-2 flex items-center gap-2 text-sm text-slate-300" htmlFor="duplicateDocumentExactly">
                  <input
                    id="duplicateDocumentExactly"
                    name="duplicateDocumentExactly"
                    type="checkbox"
                    checked={values.duplicateDocumentExactly}
                    onChange={(e) => setField("duplicateDocumentExactly", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                  />
                  Enable copy watermark in result preview
                </label>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="sm:col-span-2 grid gap-4 rounded-xl border border-slate-800 p-4">
              <p className="text-xs uppercase tracking-wide text-sky-300">Step 3: Review before submit</p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <p className="text-xs uppercase text-slate-400">Applicant</p>
                  <p className="mt-1 text-sm">{values.firstName} {values.lastName}</p>
                  <p className="text-sm text-slate-300">DOB: {values.dob}</p>
                  <p className="text-sm text-slate-300">Document #: {values.documentNumber}</p>
                  <p className="text-sm text-slate-300">Type: {values.documentType.replace("_", " ")}</p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <p className="text-xs uppercase text-slate-400">Verification route</p>
                  <p className="mt-1 text-sm text-slate-300">Layer 1: {values.layer1Provider}</p>
                  <p className="text-sm text-slate-300">Layer 2: {values.layer2Provider}</p>
                  <p className="text-sm text-slate-300">
                    Copy watermark: {values.duplicateDocumentExactly ? "Enabled" : "Disabled"}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <p className="text-xs uppercase text-slate-400">Selected files</p>
                <p className="mt-1 text-sm text-slate-300">Document: {values.documentFile?.name || "Not selected"}</p>
                <p className="text-sm text-slate-300">Selfie: {values.selfieFile?.name || "Not selected"}</p>
              </div>

              <label className="flex items-start gap-2 text-sm text-slate-300" htmlFor="consentAcknowledgement">
                <input
                  id="consentAcknowledgement"
                  name="consentAcknowledgement"
                  type="checkbox"
                  checked={values.consentAcknowledgement}
                  onChange={(e) => setField("consentAcknowledgement", e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900"
                />
                <span>
                  I confirm the submitted details and images belong to me and are provided for identity verification.
                </span>
              </label>
              {fieldErrors.consentAcknowledgement && (
                <p className="text-xs text-red-300">{fieldErrors.consentAcknowledgement}</p>
              )}
            </div>
          )}

          {error && (
            <p className="sm:col-span-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>
          )}

          <div className="sm:col-span-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 1 || loading}
              className="rounded-xl border border-slate-700 px-5 py-3 text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={loading}
                className="rounded-xl bg-sky-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            ) : (
              <button
                disabled={loading}
                type="submit"
                className="rounded-xl bg-sky-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Starting Verification..." : "Submit Verification"}
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
