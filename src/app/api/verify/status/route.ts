import { NextResponse } from "next/server";
import { getRecord } from "@/lib/services/store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      {
        error: "Validation failed",
        missingFields: ["id"],
        message: "The 'id' query parameter is required to retrieve verification status",
        example: "/api/verify/status?id=verification-id-here",
      },
      { status: 400 },
    );
  }

  const record = getRecord(id);

  if (!record) {
    return NextResponse.json({ error: "Verification not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: record.id,
    createdAt: record.createdAt,
    decision: record.decision,
    reason: record.reason,
    duplicateDocumentExactly: record.duplicateDocumentExactly,
    documentImageBase64: record.documentImageBase64,
    documentImageEditedBase64: record.documentImageEditedBase64,
    selfieImageBase64: record.selfieImageBase64,
    selfieImageEditedBase64: record.selfieImageEditedBase64,
    documentType: record.applicant.documentType,
    layer1Provider: record.layer1Provider,
    layer2Provider: record.layer2Provider,
    layer1Outcome: record.layer1Outcome,
    layer2Outcome: record.layer2Outcome,
    auditTrail: record.auditTrail,
    llmExtraction: record.llmExtraction,
  });
}
