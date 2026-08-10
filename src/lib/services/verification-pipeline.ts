import { MockBiometricVerifier } from "@/lib/services/layer2";
import { MockCreditBureauVerifier } from "@/lib/services/layer1";
import { extractIdentityWithQwen } from "@/lib/services/qwen";
import { saveRecord, updateRecord } from "@/lib/services/store";
import type {
  Layer1Provider,
  Layer2Provider,
  VerificationRecord,
} from "@/lib/types/verification";

export function createPendingRecord(input: {
  applicant: VerificationRecord["applicant"];
  documentImageBase64: string;
  selfieImageBase64?: string;
  duplicateDocumentExactly?: boolean;
  layer1Provider?: Layer1Provider;
  layer2Provider?: Layer2Provider;
}): VerificationRecord {
  const id = crypto.randomUUID();

  const record: VerificationRecord = {
    id,
    createdAt: new Date().toISOString(),
    applicant: input.applicant,
    documentImageBase64: input.documentImageBase64,
    selfieImageBase64: input.selfieImageBase64,
    duplicateDocumentExactly: input.duplicateDocumentExactly,
    layer1Provider: input.layer1Provider || "transunion",
    layer2Provider: input.layer2Provider || "jumio",
    decision: "pending",
    auditTrail: [
      {
        layer: "registration",
        status: "started",
        message: "Registration received and verification started.",
        at: new Date().toISOString(),
      },
    ],
  };

  saveRecord(record);
  return record;
}

export async function runVerification(id: string): Promise<void> {
  const initial = updateRecord(id, (record) => ({
    ...record,
    auditTrail: [
      ...record.auditTrail,
      {
        layer: "llm",
        status: "started",
        message: "Running Qwen2.5-VL-72B document extraction.",
        at: new Date().toISOString(),
      },
    ],
  }));

  if (!initial) {
    return;
  }

  const llmExtraction = await extractIdentityWithQwen({
    applicant: initial.applicant,
    documentImageBase64: initial.documentImageBase64,
    duplicateExactly: initial.duplicateDocumentExactly,
  });

  const withLlm = updateRecord(id, (record) => ({
    ...record,
    llmExtraction,
    auditTrail: [
      ...record.auditTrail,
      {
        layer: "llm",
        status: "info",
        message: llmExtraction.rawSummary,
        at: new Date().toISOString(),
      },
    ],
  }));

  if (!withLlm) {
    return;
  }

  const layer1 = new MockCreditBureauVerifier(withLlm.layer1Provider);
  const layer1Outcome = await layer1.verify(withLlm.applicant);

  const afterLayer1 = updateRecord(id, (record) => ({
    ...record,
    layer1Outcome,
    auditTrail: [
      ...record.auditTrail,
      {
        layer: "layer1",
        status: layer1Outcome === "match" ? "passed" : "failed",
        message: `Layer 1 (${record.layer1Provider}) outcome: ${layer1Outcome}`,
        at: new Date().toISOString(),
      },
    ],
  }));

  if (!afterLayer1) {
    return;
  }

  if (layer1Outcome === "match") {
    updateRecord(id, (record) => ({
      ...record,
      decision: "approved",
      reason: "Layer 1 matched trusted records.",
      auditTrail: [
        ...record.auditTrail,
        {
          layer: "system",
          status: "passed",
          message: "Instant pass granted at Layer 1.",
          at: new Date().toISOString(),
        },
      ],
    }));
    return;
  }

  const layer2 = new MockBiometricVerifier(afterLayer1.layer2Provider);
  const layer2Outcome = await layer2.verifyBiometric(afterLayer1);

  updateRecord(id, (record) => {
    const approved = layer2Outcome === "verified_match";
    return {
      ...record,
      layer2Outcome,
      decision: approved ? "approved" : "rejected",
      reason: approved
        ? "Layer 2 biometric check verified identity."
        : "Layer 2 biometric check failed or flagged fraud.",
      auditTrail: [
        ...record.auditTrail,
        {
          layer: "layer2",
          status: approved ? "passed" : "failed",
          message: `Layer 2 (${record.layer2Provider}) outcome: ${layer2Outcome}`,
          at: new Date().toISOString(),
        },
      ],
    };
  });
}
