"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import CameraScanner from "@/components/camera-scanner";
import CaptureCard from "@/components/capture-card";
import ImageEditor from "@/components/image-editor";
import {
  Alert,
  ArrowRightIcon,
  Field,
  IdCardIcon,
  FaceIcon,
  ShieldCheckIcon,
  Stepper,
  UploadIcon,
  cx,
} from "@/components/ui";
import UploadTile from "@/components/upload-tile";
import {
  getSavedProfiles,
  getSavedProfilesServerSnapshot,
  subscribeToSavedProfiles,
  writeSavedProfiles,
  type SavedProfile,
} from "@/lib/saved-profiles";
import { documentTypeLabels, layer1Labels, layer2Labels } from "@/lib/status-display";
import type { DocumentType, Layer1Provider, Layer2Provider } from "@/lib/types/verification";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const STEPS = [
  { title: "Your details", caption: "Name and ID" },
  { title: "Photos", caption: "ID and selfie" },
  { title: "Confirm", caption: "Check and send" },
];

const ORDERED_FIELDS: Array<keyof FormValues> = [
  "firstName",
  "lastName",
  "dob",
  "documentNumber",
  "documentType",
  "documentImage",
  "selfieImage",
  "consentAcknowledgement",
];

const FIELD_ELEMENT_IDS: Partial<Record<keyof FormValues, string>> = {
  firstName: "firstName",
  lastName: "lastName",
  dob: "dob",
  documentNumber: "documentNumber",
  documentType: "documentType",
  documentImage: "document-capture",
  selfieImage: "selfie-capture",
  consentAcknowledgement: "consentAcknowledgement",
};

type CaptureTarget = "document" | "selfie";

type FormValues = {
  firstName: string;
  lastName: string;
  dob: string;
  documentNumber: string;
  documentType: DocumentType;
  layer1Provider: Layer1Provider;
  layer2Provider: Layer2Provider;
  duplicateDocumentExactly: boolean;
  consentAcknowledgement: boolean;
  /** The untouched capture, kept so edits always stay reversible. */
  documentOriginal: string;
  documentImage: string;
  documentName: string;
  selfieOriginal: string;
  selfieImage: string;
  selfieName: string;
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

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
  documentOriginal: "",
  documentImage: "",
  documentName: "",
  selfieOriginal: "",
  selfieImage: "",
  selfieName: "",
};

function getDocumentAspectRatio(documentType: DocumentType): string {
  return documentType === "passport" ? "1.42" : "1.586";
}

function documentHint(documentType: DocumentType): string {
  if (documentType === "driver_license") {
    return "Line the front of your licence up inside the guide and avoid glare.";
  }
  if (documentType === "id_card") {
    return "Line the front of your ID card up inside the guide.";
  }
  return "Line the photo page of your passport up inside the guide.";
}

function documentHelp(documentType: DocumentType): string {
  if (documentType === "driver_license") {
    return "Front of your licence";
  }
  if (documentType === "id_card") {
    return "Front of your ID card";
  }
  return "Photo page of your passport";
}

/** Reads an image file into a data URL, keeping the original mime type. */
function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string" && result.startsWith("data:")) {
        resolve(result);
      } else {
        reject(new Error("Unsupported image"));
      }
    };
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateStep(step: number, values: FormValues): FieldErrors {
  const errors: FieldErrors = {};

  if (step === 1) {
    if (!values.firstName.trim()) {
      errors.firstName = "Please enter your first name.";
    }
    if (!values.lastName.trim()) {
      errors.lastName = "Please enter your last name.";
    }

    const dob = values.dob.trim();
    if (!dob) {
      errors.dob = "Please enter your date of birth.";
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      errors.dob = "Use the date picker, or type the date as YYYY-MM-DD.";
    } else {
      const timestamp = Date.parse(`${dob}T00:00:00Z`);
      if (Number.isNaN(timestamp)) {
        errors.dob = "That date doesn't look right.";
      } else if (timestamp > Date.now()) {
        errors.dob = "Your date of birth can't be in the future.";
      } else if (timestamp < Date.UTC(1900, 0, 1)) {
        errors.dob = "Please enter a date after 1900.";
      }
    }

    if (!values.documentNumber.trim()) {
      errors.documentNumber = "Please enter your document number.";
    } else if (values.documentNumber.trim().length < 4) {
      errors.documentNumber = "Document numbers are at least 4 characters.";
    }
  }

  if (step === 2) {
    if (!values.documentImage) {
      errors.documentImage = "Add a photo of your ID to continue.";
    }
    if (!values.selfieImage) {
      errors.selfieImage = "Add a selfie to continue.";
    }
  }

  if (step === 3 && !values.consentAcknowledgement) {
    errors.consentAcknowledgement = "Please confirm the declaration before sending.";
  }

  return errors;
}

export default function Home() {
  const router = useRouter();
  const profiles = useSyncExternalStore(
    subscribeToSavedProfiles,
    getSavedProfiles,
    getSavedProfilesServerSnapshot,
  );

  const [step, setStep] = useState(1);
  const [values, setValues] = useState<FormValues>(initialFormValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<CaptureTarget | null>(null);
  const [editingTarget, setEditingTarget] = useState<CaptureTarget | null>(null);
  const [profileName, setProfileName] = useState("");
  const [selectedProfileName, setSelectedProfileName] = useState("");
  const [profileMessage, setProfileMessage] = useState("");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => {
      if (!previous[key]) {
        return previous;
      }
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }

  function focusFirstError(errors: FieldErrors) {
    const field = ORDERED_FIELDS.find((candidate) => errors[candidate]);
    if (!field) {
      return;
    }
    const element = document.getElementById(FIELD_ELEMENT_IDS[field] ?? "");
    element?.focus();
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleFilePicked(target: CaptureTarget, file: File) {
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image. Please choose a JPG or PNG photo.");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setError(
        `That image is ${formatMegabytes(file.size)}. Please use one smaller than ${formatMegabytes(MAX_IMAGE_BYTES)}.`,
      );
      return;
    }

    try {
      const dataUrl = await readImageAsDataUrl(file);
      setValues((previous) =>
        target === "document"
          ? {
              ...previous,
              documentOriginal: dataUrl,
              documentImage: dataUrl,
              documentName: file.name,
            }
          : { ...previous, selfieOriginal: dataUrl, selfieImage: dataUrl, selfieName: file.name },
      );
      setFieldErrors((previous) => {
        const key: keyof FormValues = target === "document" ? "documentImage" : "selfieImage";
        if (!previous[key]) {
          return previous;
        }
        const next = { ...previous };
        delete next[key];
        return next;
      });
      setError("");
    } catch {
      setError("We couldn't read that image. Please try a different one.");
    }
  }

  function goNext() {
    const errors = validateStep(step, values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError(
        step === 2 ? "Add both photos so we can verify you." : "Please check the highlighted fields.",
      );
      focusFirstError(errors);
      return;
    }

    setFieldErrors({});
    setError("");
    setNotice("");
    setStep((previous) => Math.min(previous + 1, 3));
  }

  function goBack() {
    setError("");
    setNotice("");
    setFieldErrors({});
    setStep((previous) => Math.max(previous - 1, 1));
  }

  function goToStep(next: number) {
    setError("");
    setNotice("");
    setFieldErrors({});
    setStep(next);
  }

  async function handleSubmit() {
    const detailsErrors = validateStep(1, values);
    const photoErrors = validateStep(2, values);
    const consentErrors = validateStep(3, values);
    const errors = { ...detailsErrors, ...photoErrors, ...consentErrors };

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Please check the highlighted fields.");

      const firstInvalidStep = Object.keys(detailsErrors).length
        ? 1
        : Object.keys(photoErrors).length
          ? 2
          : 3;

      if (firstInvalidStep !== step) {
        setStep(firstInvalidStep);
        window.setTimeout(() => focusFirstError(errors), 80);
      } else {
        focusFirstError(errors);
      }
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/verify/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          dob: values.dob.trim(),
          documentNumber: values.documentNumber.trim(),
          documentType: values.documentType,
          layer1Provider: values.layer1Provider,
          layer2Provider: values.layer2Provider,
          duplicateDocumentExactly: values.duplicateDocumentExactly,
          // Send the untouched capture as a data URL so the original mime type survives.
          // The untouched capture is archived on disk; the edited one is what gets checked.
          documentImageBase64: values.documentOriginal || values.documentImage,
          documentImageEditedBase64: documentEdited ? values.documentImage : undefined,
          selfieImageBase64: values.selfieOriginal || values.selfieImage,
          selfieImageEditedBase64: selfieEdited ? values.selfieImage : undefined,
        }),
      });

      const data = (await response.json()) as { verificationId?: string; error?: string };

      if (!response.ok || !data.verificationId) {
        throw new Error(data.error || "We couldn't start the verification. Please try again.");
      }

      router.push(`/verify/${data.verificationId}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong. Please try again.",
      );
      setLoading(false);
    }
  }

  function saveCurrentProfile() {
    const trimmedName = profileName.trim();
    if (!trimmedName) {
      setProfileMessage("Give the profile a name first.");
      return;
    }

    const profile: SavedProfile = {
      name: trimmedName,
      values: {
        firstName: values.firstName,
        lastName: values.lastName,
        dob: values.dob,
        documentNumber: values.documentNumber,
        documentType: values.documentType,
        layer1Provider: values.layer1Provider,
        layer2Provider: values.layer2Provider,
        duplicateDocumentExactly: values.duplicateDocumentExactly,
      },
    };

    const existingIndex = profiles.findIndex(
      (candidate) => candidate.name.toLowerCase() === trimmedName.toLowerCase(),
    );
    const nextProfiles = [...profiles];

    if (existingIndex >= 0) {
      nextProfiles[existingIndex] = profile;
    } else {
      nextProfiles.push(profile);
    }

    writeSavedProfiles(nextProfiles);
    setSelectedProfileName(trimmedName);
    setProfileMessage(`Saved “${trimmedName}”.`);
  }

  function loadSelectedProfile() {
    const selected = profiles.find((candidate) => candidate.name === selectedProfileName);
    if (!selected) {
      setProfileMessage("Choose a profile to load first.");
      return;
    }

    setValues((previous) => ({
      ...previous,
      ...selected.values,
      documentOriginal: "",
      documentImage: "",
      documentName: "",
      selfieOriginal: "",
      selfieImage: "",
      selfieName: "",
      consentAcknowledgement: false,
    }));
    setFieldErrors({});
    setError("");
    setProfileName(selected.name);
    setProfileMessage(`Loaded “${selected.name}”. Add fresh photos to continue.`);
  }

  function deleteSelectedProfile() {
    if (!selectedProfileName) {
      setProfileMessage("Choose a profile to delete first.");
      return;
    }

    writeSavedProfiles(profiles.filter((candidate) => candidate.name !== selectedProfileName));
    setProfileMessage(`Deleted “${selectedProfileName}”.`);

    if (profileName === selectedProfileName) {
      setProfileName("");
    }
    setSelectedProfileName("");
  }

  const documentPreview = values.documentImage;
  const selfiePreview = values.selfieImage;
  const documentEdited =
    Boolean(values.documentOriginal) && values.documentImage !== values.documentOriginal;
  const selfieEdited =
    Boolean(values.selfieOriginal) && values.selfieImage !== values.selfieOriginal;
  const primaryLabel = step < 3 ? "Continue" : "Submit verification";

  return (
    <>
      {scannerTarget && (
        <CameraScanner
          key={scannerTarget}
          title={scannerTarget === "document" ? "Photograph your ID" : "Take a selfie"}
          hint={
            scannerTarget === "document"
              ? documentHint(values.documentType)
              : "Centre your face inside the guide, look at the camera and keep the light on your face."
          }
          aspectRatio={
            scannerTarget === "document" ? Number(getDocumentAspectRatio(values.documentType)) : 1
          }
          facingMode={scannerTarget === "document" ? "environment" : "user"}
          onCapture={async (file) => {
            if (scannerTarget === "document") {
              await handleFilePicked("document", file);
              if (!values.selfieImage) {
                setScannerTarget("selfie");
                setNotice("ID photo captured. Now take a quick selfie.");
                return;
              }
            } else {
              await handleFilePicked("selfie", file);
              setNotice("Selfie captured. Everything is ready to send.");
            }
            setScannerTarget(null);
          }}
          onClose={() => setScannerTarget(null)}
        />
      )}

      {editingTarget && (
        <ImageEditor
          title={editingTarget === "document" ? "Edit your ID photo" : "Edit your selfie"}
          source={editingTarget === "document" ? values.documentImage : values.selfieImage}
          onCancel={() => setEditingTarget(null)}
          onSave={(dataUrl) => {
            if (editingTarget === "document") {
              setField("documentImage", dataUrl);
            } else {
              setField("selfieImage", dataUrl);
            }
            setNotice("Edit saved. Your original is still kept.");
            setEditingTarget(null);
          }}
        />
      )}

      <main className="mx-auto w-full max-w-2xl px-4 pb-32 pt-8 sm:px-6 sm:pt-12">
        <header className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30">
            <ShieldCheckIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight text-slate-100">Velica Verify</p>
            <p className="text-xs text-slate-400">Takes about a minute · nothing is shared</p>
          </div>
        </header>

        <div className="mt-6">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Verify your identity
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Add your details, a photo of your ID and a selfie. We check your details against
            identity records, then confirm your selfie matches your document.
          </p>
        </div>

        <div className="mt-6">
          <Stepper items={STEPS} current={step} onSelect={goToStep} />
        </div>

        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (step < 3) {
              goNext();
            } else {
              void handleSubmit();
            }
          }}
        >
          <div className="card p-5 sm:p-6">
            {error && (
              <div className="mb-5">
                <Alert>{error}</Alert>
              </div>
            )}

            {!error && notice && (
              <div className="mb-5">
                <Alert tone="info">{notice}</Alert>
              </div>
            )}

            {step === 1 && (
              <div className="animate-fade-up">
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30">
                      <UploadIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-100">
                        Already have the photos?
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        Upload your ID photo and selfie straight from your device — or take them
                        with the camera on the next step. Either way you can edit them afterwards.
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <UploadTile
                      label="ID photo"
                      icon={<IdCardIcon className="h-4 w-4" />}
                      previewSrc={values.documentImage}
                      fileName={values.documentName}
                      onPickFile={(file) => void handleFilePicked("document", file)}
                      onClear={() => {
                        setField("documentOriginal", "");
                        setField("documentImage", "");
                        setField("documentName", "");
                      }}
                    />
                    <UploadTile
                      label="Selfie"
                      icon={<FaceIcon className="h-4 w-4" />}
                      previewSrc={values.selfieImage}
                      fileName={values.selfieName}
                      onPickFile={(file) => void handleFilePicked("selfie", file)}
                      onClear={() => {
                        setField("selfieOriginal", "");
                        setField("selfieImage", "");
                        setField("selfieName", "");
                      }}
                    />
                  </div>
                </div>

                <h2 className="mt-6 text-sm font-semibold text-slate-100">Tell us about you</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Use the details exactly as they appear on your ID.
                </p>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <Field id="firstName" label="First name" error={fieldErrors.firstName}>
                    <input
                      id="firstName"
                      name="firstName"
                      className="field"
                      autoComplete="given-name"
                      placeholder="Jane"
                      value={values.firstName}
                      aria-invalid={Boolean(fieldErrors.firstName)}
                      aria-describedby={fieldErrors.firstName ? "firstName-error" : undefined}
                      onChange={(event) => setField("firstName", event.target.value)}
                    />
                  </Field>

                  <Field id="lastName" label="Last name" error={fieldErrors.lastName}>
                    <input
                      id="lastName"
                      name="lastName"
                      className="field"
                      autoComplete="family-name"
                      placeholder="Doe"
                      value={values.lastName}
                      aria-invalid={Boolean(fieldErrors.lastName)}
                      aria-describedby={fieldErrors.lastName ? "lastName-error" : undefined}
                      onChange={(event) => setField("lastName", event.target.value)}
                    />
                  </Field>

                  <Field id="dob" label="Date of birth" error={fieldErrors.dob}>
                    <input
                      id="dob"
                      name="dob"
                      type="date"
                      min="1900-01-01"
                      className="field"
                      autoComplete="bday"
                      value={values.dob}
                      aria-invalid={Boolean(fieldErrors.dob)}
                      aria-describedby={fieldErrors.dob ? "dob-error" : undefined}
                      onChange={(event) => setField("dob", event.target.value)}
                    />
                  </Field>

                  <Field
                    id="documentNumber"
                    label="Document number"
                    hint="The number printed on your ID"
                    error={fieldErrors.documentNumber}
                  >
                    <input
                      id="documentNumber"
                      name="documentNumber"
                      className="field"
                      autoComplete="off"
                      autoCapitalize="characters"
                      placeholder="X1234567"
                      value={values.documentNumber}
                      aria-invalid={Boolean(fieldErrors.documentNumber)}
                      aria-describedby={
                        fieldErrors.documentNumber ? "documentNumber-error" : undefined
                      }
                      onChange={(event) => setField("documentNumber", event.target.value)}
                    />
                  </Field>

                  <div className="sm:col-span-2">
                    <Field id="documentType" label="Document type">
                      <select
                        id="documentType"
                        name="documentType"
                        className="field"
                        value={values.documentType}
                        onChange={(event) =>
                          setField("documentType", event.target.value as DocumentType)
                        }
                      >
                        <option value="passport">Passport</option>
                        <option value="driver_license">Driver license</option>
                        <option value="id_card">ID card</option>
                      </select>
                    </Field>
                  </div>
                </div>

                <details className="group mt-5 rounded-xl border border-slate-800 bg-slate-900/40">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-semibold text-slate-300 [&::-webkit-details-marker]:hidden">
                    Saved profiles
                    <span className="text-xs font-normal text-slate-500">Reuse your details</span>
                  </summary>
                  <div className="border-t border-slate-800 px-4 py-4">
                    <p className="text-xs text-slate-400">
                      Saved profiles keep your typed details in this browser. Photos are never
                      stored and must be taken again each time.
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        className="field sm:flex-1"
                        placeholder="Profile name, e.g. Jane passport"
                        value={profileName}
                        onChange={(event) => setProfileName(event.target.value)}
                      />
                      <button
                        type="button"
                        onClick={saveCurrentProfile}
                        className="btn btn-secondary !py-2.5 text-xs"
                      >
                        Save
                      </button>
                    </div>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <select
                        className="field sm:flex-1"
                        value={selectedProfileName}
                        onChange={(event) => setSelectedProfileName(event.target.value)}
                      >
                        <option value="">Select a saved profile</option>
                        {profiles.map((profile) => (
                          <option key={profile.name} value={profile.name}>
                            {profile.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={loadSelectedProfile}
                        className="btn btn-secondary !py-2.5 text-xs"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={deleteSelectedProfile}
                        className="btn btn-danger !py-2.5 text-xs"
                      >
                        Delete
                      </button>
                    </div>
                    {profileMessage && (
                      <p className="mt-2 text-xs text-sky-300">{profileMessage}</p>
                    )}
                  </div>
                </details>
              </div>
            )}

            {step === 2 && (
              <div className="animate-fade-up">
                <h2 className="text-sm font-semibold text-slate-100">Add your photos</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Both photos are needed. Your original is kept exactly as taken — tap Edit to draw,
                  add text or black anything out, and the original stays available.
                </p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <CaptureCard
                    id="document-capture"
                    label="Your ID"
                    help={documentHelp(values.documentType)}
                    icon={<IdCardIcon className="h-7 w-7" />}
                    previewSrc={documentPreview}
                    fileName={values.documentName}
                    edited={documentEdited}
                    error={fieldErrors.documentImage}
                    onOpenCamera={() => setScannerTarget("document")}
                    onPickFile={(file) => void handleFilePicked("document", file)}
                    onEdit={() => setEditingTarget("document")}
                    onRevert={() => setField("documentImage", values.documentOriginal)}
                    onClear={() => {
                      setField("documentOriginal", "");
                      setField("documentImage", "");
                    }}
                  />

                  <CaptureCard
                    id="selfie-capture"
                    label="Your selfie"
                    help="Front camera, plain background"
                    icon={<FaceIcon className="h-7 w-7" />}
                    previewSrc={selfiePreview}
                    fileName={values.selfieName}
                    edited={selfieEdited}
                    error={fieldErrors.selfieImage}
                    onOpenCamera={() => setScannerTarget("selfie")}
                    onPickFile={(file) => void handleFilePicked("selfie", file)}
                    onEdit={() => setEditingTarget("selfie")}
                    onRevert={() => setField("selfieImage", values.selfieOriginal)}
                    onClear={() => {
                      setField("selfieOriginal", "");
                      setField("selfieImage", "");
                    }}
                  />
                </div>

                <details className="group mt-5 rounded-xl border border-slate-800 bg-slate-900/40">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-200 [&::-webkit-details-marker]:hidden">
                    <span className="flex flex-wrap items-center gap-2">
                      Advanced options
                      <span className="text-xs font-normal text-slate-500">
                        Providers and testing tools
                      </span>
                    </span>
                    <span className="text-xs text-slate-500 group-open:hidden">Show</span>
                    <span className="hidden text-xs text-slate-500 group-open:inline">Hide</span>
                  </summary>

                  <div className="grid gap-4 border-t border-slate-800 px-4 py-4 sm:grid-cols-2">
                    <Field id="layer1Provider" label="Records check provider">
                      <select
                        id="layer1Provider"
                        className="field"
                        value={values.layer1Provider}
                        onChange={(event) =>
                          setField("layer1Provider", event.target.value as Layer1Provider)
                        }
                      >
                        <option value="transunion">TransUnion</option>
                        <option value="equifax">Equifax</option>
                      </select>
                    </Field>

                    <Field id="layer2Provider" label="Selfie check provider">
                      <select
                        id="layer2Provider"
                        className="field"
                        value={values.layer2Provider}
                        onChange={(event) =>
                          setField("layer2Provider", event.target.value as Layer2Provider)
                        }
                      >
                        <option value="jumio">Jumio</option>
                        <option value="onfido">Onfido</option>
                      </select>
                    </Field>

                    <label className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-300 sm:col-span-2">
                      <input
                        id="duplicateDocumentExactly"
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-sky-500"
                        checked={values.duplicateDocumentExactly}
                        onChange={(event) =>
                          setField("duplicateDocumentExactly", event.target.checked)
                        }
                      />
                      <span>
                        <span className="block font-semibold text-slate-200">
                          Mark this document as an exact copy
                        </span>
                        <span className="mt-0.5 block text-slate-400">
                          Demo option: skips reading the document and stamps the result preview as a
                          copy.
                        </span>
                      </span>
                    </label>
                  </div>
                </details>
              </div>
            )}

            {step === 3 && (
              <div className="animate-fade-up">
                <h2 className="text-sm font-semibold text-slate-100">Check and send</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Make sure everything is correct — you can go back to change anything.
                </p>

                <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Your details
                      </dt>
                      <button
                        type="button"
                        onClick={() => goToStep(1)}
                        className="text-[11px] font-semibold text-sky-300 hover:text-sky-200"
                      >
                        Edit
                      </button>
                    </div>
                    <dd className="mt-2 space-y-1 text-sm text-slate-200">
                      <p>
                        {values.firstName} {values.lastName}
                      </p>
                      <p className="text-xs text-slate-400">Born {values.dob}</p>
                      <p className="text-xs text-slate-400">
                        {documentTypeLabels[values.documentType]} · {values.documentNumber}
                      </p>
                    </dd>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Your photos
                      </dt>
                      <button
                        type="button"
                        onClick={() => goToStep(2)}
                        className="text-[11px] font-semibold text-sky-300 hover:text-sky-200"
                      >
                        Edit
                      </button>
                    </div>
                    <dd className="mt-2 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                        <span>ID photo</span>
                        <span className="text-emerald-300">Ready</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                        <span>Selfie</span>
                        <span className="text-emerald-300">Ready</span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Checks: {layer1Labels[values.layer1Provider]} ·{" "}
                        {layer2Labels[values.layer2Provider]}
                        {values.duplicateDocumentExactly ? " · copy flagged" : ""}
                      </p>
                    </dd>
                  </div>
                </dl>

                <label
                  className={cx(
                    "mt-4 flex items-start gap-3 rounded-xl border p-4 text-xs",
                    fieldErrors.consentAcknowledgement
                      ? "border-red-500/50 bg-red-950/20 text-red-200"
                      : "border-slate-800 bg-slate-950/40 text-slate-300",
                  )}
                >
                  <input
                    id="consentAcknowledgement"
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-sky-500"
                    checked={values.consentAcknowledgement}
                    onChange={(event) =>
                      setField("consentAcknowledgement", event.target.checked)
                    }
                  />
                  <span>
                    I confirm these details and photos are mine and can be used to verify my
                    identity.
                  </span>
                </label>
                {fieldErrors.consentAcknowledgement && (
                  <p className="mt-2 text-xs font-medium text-red-300">
                    {fieldErrors.consentAcknowledgement}
                  </p>
                )}
              </div>
            )}
          </div>

          <div
            className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800 bg-slate-950/90 backdrop-blur"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 pt-3 sm:px-6">
              <button
                type="button"
                onClick={goBack}
                disabled={step === 1 || loading}
                className="btn btn-secondary"
              >
                Back
              </button>

              <button type="submit" disabled={loading} className="btn btn-primary min-w-[11rem]">
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
                    Sending…
                  </>
                ) : (
                  <>
                    {primaryLabel}
                    <ArrowRightIcon className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </main>
    </>
  );
}
