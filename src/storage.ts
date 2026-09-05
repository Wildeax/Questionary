import type { SavedQuizState } from "../shared/types.ts";

const DB_NAME = "QuestionaryDB";
const DB_VERSION = 1;
const STORE = "quizzes";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(new Error("Failed to open database"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction([STORE], mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).finally(() => db.close())
  );
}

export async function saveQuizProgress(state: SavedQuizState): Promise<void> {
  await withStore("readwrite", (store) => store.put(state));
}

export async function getSavedQuiz(id: string): Promise<SavedQuizState | null> {
  try {
    return ((await withStore("readonly", (store) => store.get(id))) as SavedQuizState | undefined) ?? null;
  } catch (error) {
    console.warn("Failed to load saved quiz:", error);
    return null;
  }
}

/** Most recent unfinished local-mode quiz. Older saves without a source count as local. */
export async function loadLatestLocalQuiz(): Promise<SavedQuizState | null> {
  try {
    const all = (await withStore("readonly", (store) => store.getAll())) as SavedQuizState[];
    return (
      all
        .filter((s) => (s.source ?? "local") === "local" && !s.completed)
        .sort((a, b) => b.timestamp - a.timestamp)[0] ?? null
    );
  } catch (error) {
    console.warn("Failed to load saved progress:", error);
    return null;
  }
}

export async function clearQuizProgress(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}
