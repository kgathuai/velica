import type { VerificationRecord } from "@/lib/types/verification";

const verificationStore = new Map<string, VerificationRecord>();

export function saveRecord(record: VerificationRecord): void {
  verificationStore.set(record.id, record);
}

export function getRecord(id: string): VerificationRecord | undefined {
  return verificationStore.get(id);
}

export function updateRecord(
  id: string,
  updater: (current: VerificationRecord) => VerificationRecord,
): VerificationRecord | undefined {
  const current = verificationStore.get(id);
  if (!current) {
    return undefined;
  }
  const next = updater(current);
  verificationStore.set(id, next);
  return next;
}
