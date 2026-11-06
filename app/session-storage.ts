// Client-side IndexedDB persistence for Cas Sign session
import type { FieldType, SignType } from "../lib/request-document";

const DB_NAME = "CasSignDB";
const STORE_NAME = "sessionStore";
const SESSION_KEY = "current_session";

export type PersistedSession = {
  form: {
    identificationNumber: string;
    documentName: string;
    organizationName: string;
    taxCode: string;
  };
  /** @deprecated kept to restore sessions saved before signType existed. */
  isBusinessSigning: boolean;
  /** "" = không chỉ định, người ký tự chọn. */
  signType?: "" | SignType;
  fileBuffer?: ArrayBuffer;
  originalFileName?: string;
  fields: Array<{
    id: string;
    page: number;
    xRatio: number;
    yRatio: number;
    widthRatio: number;
    heightRatio: number;
    fieldType: FieldType;
  }>;
  status: "draft" | "sent" | "processing" | "completed" | "rejected" | "error";
  message: string;
  signedAt: string;
  isSignedPreview: boolean;
  activeRequestId: string;
  qrContent: string;
  signToken: string;
  qrUrl: string;
  savedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB not supported"));
    }
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Mọi lần ghi (save/clear) chạy tuần tự. Nếu không, hai lần save gần nhau cùng đọc bản cũ
// rồi ghi đè nhau (VD: chọn loại ký rồi gõ MST ngay -> mất signType).
let writeQueue: Promise<void> = Promise.resolve();
const enqueue = (task: () => Promise<void>): Promise<void> => {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
};

export function saveSessionState(session: Partial<PersistedSession>): Promise<void> {
  return enqueue(() => writeSessionState(session));
}

async function writeSessionState(session: Partial<PersistedSession>): Promise<void> {
  try {
    const existing = await loadSessionState();
    const merged: PersistedSession = {
      form: session.form ?? existing?.form ?? { identificationNumber: "", documentName: "", organizationName: "Cas Sign", taxCode: "" },
      isBusinessSigning: session.isBusinessSigning ?? existing?.isBusinessSigning ?? false,
      signType: session.signType ?? existing?.signType,
      fileBuffer: session.fileBuffer !== undefined ? session.fileBuffer : existing?.fileBuffer,
      originalFileName: session.originalFileName ?? existing?.originalFileName ?? "",
      fields: session.fields ?? existing?.fields ?? [],
      status: session.status ?? existing?.status ?? "draft",
      message: session.message ?? existing?.message ?? "",
      signedAt: session.signedAt ?? existing?.signedAt ?? "",
      isSignedPreview: session.isSignedPreview ?? existing?.isSignedPreview ?? false,
      activeRequestId: session.activeRequestId ?? existing?.activeRequestId ?? "",
      qrContent: session.qrContent ?? existing?.qrContent ?? "",
      signToken: session.signToken ?? existing?.signToken ?? "",
      qrUrl: session.qrUrl ?? existing?.qrUrl ?? "",
      savedAt: Date.now(),
    };

    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(merged, SESSION_KEY);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[storage] saveSessionState error", err);
  }
}

export async function loadSessionState(): Promise<PersistedSession | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(SESSION_KEY);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[storage] loadSessionState error", err);
    return null;
  }
}

export function clearSessionState(): Promise<void> {
  return enqueue(removeSessionState);
}

async function removeSessionState(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(SESSION_KEY);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[storage] clearSessionState error", err);
  }
}
