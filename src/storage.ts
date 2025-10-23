import type { SavedQuizState } from "./types";

// IndexedDB configuration
const DB_NAME = "QuestionaryDB";
const DB_VERSION = 1;
const QUIZZES_STORE = "quizzes";

// IndexedDB helper functions
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.warn("IndexedDB error:", request.error);
      reject(new Error("Failed to open database"));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create quizzes store if it doesn't exist
      if (!db.objectStoreNames.contains(QUIZZES_STORE)) {
        const store = db.createObjectStore(QUIZZES_STORE, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

// Save quiz progress to IndexedDB
export async function saveQuizProgress(state: SavedQuizState): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([QUIZZES_STORE], "readwrite");
    const store = transaction.objectStore(QUIZZES_STORE);

    // Add/update the quiz state
    await new Promise<void>((resolve, reject) => {
      const request = store.put(state);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  } catch (error) {
    console.warn("Failed to save quiz progress:", error);
    throw new Error("Failed to save quiz progress. Please try again.");
  }
}

// Load the most recent quiz progress
export async function loadQuizProgress(): Promise<SavedQuizState | null> {
  try {
    const db = await openDB();
    const transaction = db.transaction([QUIZZES_STORE], "readonly");
    const store = transaction.objectStore(QUIZZES_STORE);
    const index = store.index("timestamp");

    // Get the most recent quiz (by timestamp)
    const request = index.openCursor(null, "prev");

    return new Promise<SavedQuizState | null>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          resolve(cursor.value as SavedQuizState);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        reject(request.error);
      };
    }).finally(() => {
      db.close();
    });
  } catch (error) {
    console.warn("Failed to load quiz progress:", error);
    return null;
  }
}

// Get all saved quizzes
export async function getAllSavedQuizzes(): Promise<SavedQuizState[]> {
  try {
    const db = await openDB();
    const transaction = db.transaction([QUIZZES_STORE], "readonly");
    const store = transaction.objectStore(QUIZZES_STORE);
    const index = store.index("timestamp");

    // Get all quizzes sorted by timestamp (newest first)
    const request = index.openCursor(null, "prev");

    return new Promise<SavedQuizState[]>((resolve, reject) => {
      const results: SavedQuizState[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          results.push(cursor.value as SavedQuizState);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => {
        reject(request.error);
      };
    }).finally(() => {
      db.close();
    });
  } catch (error) {
    console.warn("Failed to get saved quizzes:", error);
    return [];
  }
}

// Clear a specific quiz progress
export async function clearQuizProgress(quizId: string): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([QUIZZES_STORE], "readwrite");
    const store = transaction.objectStore(QUIZZES_STORE);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(quizId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  } catch (error) {
    console.warn("Failed to clear quiz progress:", error);
    throw new Error("Failed to clear quiz progress.");
  }
}

// Clear all quiz progress (for cleanup)
export async function clearAllQuizProgress(): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([QUIZZES_STORE], "readwrite");
    const store = transaction.objectStore(QUIZZES_STORE);

    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  } catch (error) {
    console.warn("Failed to clear all quiz progress:", error);
    throw new Error("Failed to clear all quiz progress.");
  }
}

// Check if IndexedDB is available
export function isStorageAvailable(): boolean {
  try {
    const test = "__storage_test__";
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

// Legacy functions for backward compatibility (now unused)
export function saveQuizState(): void {
  // Legacy function - no longer used
}

export function loadQuizState() {
  // Legacy function - no longer used
  return null;
}

export function clearQuizState(): void {
  // Legacy function - no longer used
}

export function hasSavedQuizState(): boolean {
  // Legacy function - no longer used
  return false;
}
