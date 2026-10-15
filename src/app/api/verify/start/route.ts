import { NextResponse } from "next/server";
import { createPendingRecord, runVerification } from "@/lib/services/verification-pipeline";
import { verifyStartSchema, getMissingAndInvalidFields } from "@/lib/validation/verify";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = verifyStartSchema.safeParse(body);

    if (!parsed.success) {
      const errorDetails = parsed.error.flatten();
      const { invalid } = getMissingAndInvalidFields(errorDetails.fieldErrors);
      const requiredFields = ["firstName", "lastName", "dob", "documentNumber", "documentType", "documentImageBase64"];
      const actuallyMissing = requiredFields.filter((field) => !body.hasOwnProperty(field));

      return NextResponse.json(
        {
          error: "Verification payload validation failed",
          missingFields: actuallyMissing.length > 0 ? actuallyMissing : undefined,
          invalidFields: invalid.length > 0 ? invalid : undefined,
          requiredFields: requiredFields,
          details: errorDetails,
        },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const record = createPendingRecord({
      applicant: {
        firstName: input.firstName,
        lastName: input.lastName,
        dob: input.dob,
        documentNumber: input.documentNumber,
        documentType: input.documentType,
      },
      documentImageBase64: input.documentImageBase64,
      documentImageEditedBase64: input.documentImageEditedBase64,
      selfieImageBase64: input.selfieImageBase64,
      selfieImageEditedBase64: input.selfieImageEditedBase64,
      duplicateDocumentExactly: input.duplicateDocumentExactly,
      layer1Provider: input.layer1Provider,
      layer2Provider: input.layer2Provider,
    });

    void runVerification(record.id);

    return NextResponse.json({
      verificationId: record.id,
      decision: record.decision,
      next: `/verify/${record.id}`,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to start verification process" },
      { status: 500 },
    );
  }
}
