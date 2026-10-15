import type {
  DocumentType,
  Layer1Provider,
  Layer2Provider,
} from "@/lib/types/verification";

export type SavedProfileValues = {
  firstName: string;
  lastName: string;
  dob: string;
  documentNumber: string;
  documentType: DocumentType;
  layer1Provider: Layer1Provider;
  layer2Provider: Layer2Provider;
  duplicateDocumentExactly: boolean;
};

export type SavedProfile = {
  name: string;
  values: SavedProfileValues;
};

const STORAGE_KEY = "velica.savedProfiles.v1";

/** Stable empty snapshot so `useSyncExternalStore` never sees a new reference. */
const EMPTY: SavedProfile[] = [];

let cachedProfiles: SavedProfile[] = EMPTY;
let cachedSource = "";
const listeners = new Set<() => void>();

function parseProfiles(raw: string): SavedProfile[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return EMPTY;
    }

    return parsed.filter((item): item is SavedProfile => {
      if (typeof item !== "object" || item === null) {
        return false;
      }
      const candidate = item as Partial<SavedProfile>;
      return typeof candidate.name === "string" && typeof candidate.values === "object";
    });
  } catch {
    return EMPTY;
  }
}

/**
 * Reads saved profiles straight from localStorage, caching the parsed array so
 * repeated calls return a stable reference (required by useSyncExternalStore).
 */
export function getSavedProfiles(): SavedProfile[] {
  if (typeof window === "undefined") {
    return EMPTY;
  }

  let raw = "";
  try {
    raw = window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return EMPTY;
  }

  if (raw === cachedSource) {
    return cachedProfiles;
  }

  cachedSource = raw;
  cachedProfiles = raw ? parseProfiles(raw) : EMPTY;
  return cachedProfiles;
}

export function getSavedProfilesServerSnapshot(): SavedProfile[] {
  return EMPTY;
}

export function subscribeToSavedProfiles(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function writeSavedProfiles(profiles: SavedProfile[]): void {
  cachedProfiles = profiles;
  cachedSource = JSON.stringify(profiles);

  try {
    window.localStorage.setItem(STORAGE_KEY, cachedSource);
  } catch {
    // Storage can be unavailable (private mode, quota). Keep the in-memory copy.
  }

  listeners.forEach((listener) => listener());
}
