import { z } from "zod";

export const verifyStartSchema = z.object({
  firstName: z.string().min(1, "First name is required and must not be empty"),
  lastName: z.string().min(1, "Last name is required and must not be empty"),
  dob: z.string().min(4, "Date of birth is required (minimum 4 characters)"),
  documentNumber: z.string().min(4, "Document number is required"),
  documentType: z.enum(["passport", "driver_license", "id_card"]),
  documentImageBase64: z.string().min(16, "Document image is required"),
  documentImageEditedBase64: z.string().optional(),
  selfieImageBase64: z.string().optional(),
  selfieImageEditedBase64: z.string().optional(),
  duplicateDocumentExactly: z.boolean().optional(),
  layer1Provider: z.enum(["transunion", "equifax"]).optional(),
  layer2Provider: z.enum(["jumio", "onfido"]).optional(),
}).strict();

export type VerifyStartInput = z.infer<typeof verifyStartSchema>;

export function getMissingAndInvalidFields(
  fieldErrors: Partial<Record<keyof VerifyStartInput, string[]>>,
): {
  missing: string[];
  invalid: { field: string; message: string }[];
} {
  const missing: string[] = [];
  const invalid: { field: string; message: string }[] = [];
  const requiredFields = ["firstName", "lastName", "dob", "documentNumber", "documentType", "documentImageBase64"];

  Object.entries(fieldErrors).forEach(([field, errors]) => {
    if (errors && errors.length > 0) {
      invalid.push({ field, message: errors[0] });
      if (requiredFields.includes(field)) {
        missing.push(field);
      }
    }
  });

  return { missing, invalid };
}
