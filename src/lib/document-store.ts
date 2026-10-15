/**
 * Saved scans live in the browser (IndexedDB), not on the server: they stay
 * available with the Mac switched off, and the images never leave the device.
 */

export type SavedDocument = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** The untouched capture. */
  original: Blob;
  /** The annotated version, once the scan has been edited. */
  edited?: Blob;
  /** Small data-URL preview for the library grid. */
  thumbnail: string;
};

const DB_NAME = "velica-documents";
const STORE = "documents";
const VERSION = 1;

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser can't store scans offline."));
      return;
    }

    const request = indexedDB.open(DB_NAME, VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open the scan library."));
  });
}

function getDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabase().catch((error: unknown) => {
      // Allow a later call to retry rather than caching the failure forever.
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return getDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error("The scan library request failed."));
      }),
  );
}

export async function listDocuments(): Promise<SavedDocument[]> {
  const documents = await run<SavedDocument[]>("readonly", (store) => store.getAll());
  return documents.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function putDocument(document: SavedDocument): Promise<IDBValidKey> {
  return run("readwrite", (store) => store.put(document));
}

export function deleteDocument(id: string): Promise<undefined> {
  return run<undefined>("readwrite", (store) => store.delete(id));
}
