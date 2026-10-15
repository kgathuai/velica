import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { VerificationRecord } from "@/lib/types/verification";

/**
 * Personal data stays on this machine, in the project directory:
 *
 *   .data/records/<id>/record.json    the full verification record
 *   .data/records/<id>/document.jpg   the untouched capture (jpg / png / webp / …)
 *   .data/records/<id>/selfie.jpg
 *
 * `.data/` is gitignored — never commit it, it holds identity documents.
 */

/** Records are created with crypto.randomUUID(). This also blocks `?id=../../` traversal. */
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** Small cache so status polling does not re-read files from disk every 1.5 seconds. */
const cache = new Map<string, VerificationRecord>();

/**
 * Paths are built with the literal `.data/records` segments first so the bundler can
 * scope file tracing to that folder instead of the whole project.
 */
function recordFile(id: string, name: string): string {
  return path.join(process.cwd(), ".data", "records", id, name);
}

function isUsableId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/** Writes the original capture alongside the record so it can be opened in Finder. */
function writeImageFile(id: string, name: string, value?: string): void {
  if (!value) {
    return;
  }

  const dataUrl = /^data:([^;,]+);base64,([\s\S]*)$/i.exec(value);
  const mimeType = dataUrl ? dataUrl[1].toLowerCase() : "image/jpeg";
  const payload = dataUrl ? dataUrl[2] : value;
  const extension = IMAGE_EXTENSIONS[mimeType] ?? "jpg";

  try {
    writeFileSync(recordFile(id, `${name}.${extension}`), Buffer.from(payload, "base64"));
  } catch {
    // A failed image write must not lose the verification record itself.
  }
}

function writeRecordFile(record: VerificationRecord): void {
  try {
    writeFileSync(recordFile(record.id, "record.json"), JSON.stringify(record, null, 2), "utf8");
  } catch {
    // Keep serving from the in-memory copy if the disk is unavailable.
  }
}

export function saveRecord(record: VerificationRecord): void {
  cache.set(record.id, record);

  if (!isUsableId(record.id)) {
    return;
  }

  try {
    mkdirSync(path.join(process.cwd(), ".data", "records", record.id), { recursive: true });
    // The captures never change after creation, so they are only written once.
    writeImageFile(record.id, "document", record.documentImageBase64);
    writeImageFile(record.id, "selfie", record.selfieImageBase64);
    writeImageFile(record.id, "document-edited", record.documentImageEditedBase64);
    writeImageFile(record.id, "selfie-edited", record.selfieImageEditedBase64);
  } catch {
    // Ignore: the record still reaches disk below if possible.
  }

  writeRecordFile(record);
}

export function getRecord(id: string): VerificationRecord | undefined {
  const cached = cache.get(id);
  if (cached) {
    return cached;
  }

  if (!isUsableId(id)) {
    return undefined;
  }

  const file = recordFile(id, "record.json");
  if (!existsSync(file)) {
    return undefined;
  }

  try {
    const record = JSON.parse(readFileSync(file, "utf8")) as VerificationRecord;
    cache.set(id, record);
    return record;
  } catch {
    return undefined;
  }
}

export function updateRecord(
  id: string,
  updater: (current: VerificationRecord) => VerificationRecord,
): VerificationRecord | undefined {
  const current = getRecord(id);
  if (!current) {
    return undefined;
  }

  const next = updater(current);
  cache.set(id, next);

  if (isUsableId(id)) {
    writeRecordFile(next);
  }

  return next;
}
