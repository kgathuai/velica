export type Layer1Provider = "transunion" | "equifax";
export type Layer1Outcome = "match" | "no_match" | "flagged";

export type Layer2Provider = "jumio" | "onfido";
export type Layer2Outcome = "verified_match" | "fail" | "fraud";

export type VerificationDecision = "approved" | "rejected" | "pending";

export type AuditStep = {
  layer: "registration" | "layer1" | "layer2" | "llm" | "system";
  status: "started" | "passed" | "failed" | "info";
  message: string;
  at: string;
};

export type IdentityProfile = {
  firstName: string;
  lastName: string;
  dob: string;
  documentNumber: string;
  documentType: "passport" | "driver_license" | "id_card";
};

export type LlmExtraction = {
  confidence: number;
  extracted: Partial<IdentityProfile>;
  rawSummary: string;
};

export type VerificationRecord = {
  id: string;
  createdAt: string;
  applicant: IdentityProfile;
  documentImageBase64: string;
  selfieImageBase64?: string;
  duplicateDocumentExactly?: boolean;
  layer1Provider: Layer1Provider;
  layer2Provider: Layer2Provider;
  layer1Outcome?: Layer1Outcome;
  layer2Outcome?: Layer2Outcome;
  decision: VerificationDecision;
  reason?: string;
  llmExtraction?: LlmExtraction;
  auditTrail: AuditStep[];
};
