import type {
  AuditStep,
  DocumentType,
  Layer1Outcome,
  Layer1Provider,
  Layer2Outcome,
  Layer2Provider,
  VerificationStatusResponse,
} from "@/lib/types/verification";

export const documentTypeLabels: Record<DocumentType, string> = {
  passport: "Passport",
  driver_license: "Driver license",
  id_card: "ID card",
};

export const layer1Labels: Record<Layer1Provider, string> = {
  transunion: "TransUnion",
  equifax: "Equifax",
};

export const layer2Labels: Record<Layer2Provider, string> = {
  jumio: "Jumio",
  onfido: "Onfido",
};

export function describeLayer1(outcome?: Layer1Outcome): string {
  switch (outcome) {
    case "match":
      return "Your details matched a trusted record.";
    case "no_match":
      return "We couldn't match your details, so we ran a selfie check.";
    case "flagged":
      return "Your details were flagged, so we ran a selfie check.";
    default:
      return "Comparing your details against trusted records.";
  }
}

export function describeLayer2(outcome?: Layer2Outcome): string {
  switch (outcome) {
    case "verified_match":
      return "Your selfie matched your document.";
    case "fail":
      return "Your selfie didn't match your document.";
    case "fraud":
      return "We detected fraud signals on this submission.";
    default:
      return "Making sure the selfie matches your document.";
  }
}

export type StageState = "done" | "active" | "warn" | "failed" | "pending" | "skipped";

export type Stage = {
  key: string;
  title: string;
  detail: string;
  state: StageState;
};

/**
 * Turns the raw audit trail into a small, human-readable checklist so users see
 * progress instead of internal layer names.
 */
export function buildStages(status: VerificationStatusResponse | null): Stage[] {
  const trail = status?.auditTrail ?? [];
  const hasEntry = (layer: AuditStep["layer"], state: AuditStep["status"]) =>
    trail.some((entry) => entry.layer === layer && entry.status === state);

  const documentStarted = hasEntry("llm", "started");
  const documentDone = hasEntry("llm", "info");
  const layer1 = status?.layer1Outcome;
  const layer2 = status?.layer2Outcome;
  const decided = status ? status.decision !== "pending" : false;

  const recordsState: StageState = layer1
    ? layer1 === "match"
      ? "done"
      : "warn"
    : documentDone
      ? "active"
      : "pending";

  const selfieState: StageState =
    layer1 === "match"
      ? "skipped"
      : layer2 === "verified_match"
        ? "done"
        : layer2
          ? "failed"
          : layer1
            ? "active"
            : "pending";

  const decisionState: StageState = !status
    ? "pending"
    : status.decision === "approved"
      ? "done"
      : status.decision === "rejected"
        ? "failed"
        : layer2 || layer1 === "match"
          ? "active"
          : "pending";

  return [
    {
      key: "received",
      title: "Details received",
      detail: status ? "Your form and photos reached us." : "Sending your details\u2026",
      state: status ? "done" : "active",
    },
    {
      key: "document",
      title: "Reading your document",
      detail: "Pulling the name, date of birth and document number from your photo.",
      state: documentDone ? "done" : documentStarted || status ? "active" : "pending",
    },
    {
      key: "records",
      title: "Checking identity records",
      detail: describeLayer1(layer1),
      state: recordsState,
    },
    {
      key: "selfie",
      title: "Comparing your selfie",
      detail:
        layer1 === "match"
          ? "Not needed \u2014 your details matched straight away."
          : describeLayer2(layer2),
      state: selfieState,
    },
    {
      key: "decision",
      title: "Final decision",
      detail: decided ? (status?.reason ?? "Completed.") : "Almost there.",
      state: decisionState,
    },
  ];
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}
