const DATABASE_NAME = 'qiju-rental-ai';
const DATABASE_VERSION = 1;
const HISTORY_STORE = 'history';
const CREATED_AT_INDEX = 'createdAt';

export interface HistoryRecord {
  id: string;
  roomImage: Blob;
  referenceImage?: Blob;
  presetStyle?: string;
  resultImage: Blob;
  createdAt: number;
  inputSnapshot: { presetStyle?: string; hasReferenceImage: boolean };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
      store.createIndex(CREATED_AT_INDEX, 'createdAt');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function saveHistoryRecord(record: HistoryRecord): Promise<void> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(HISTORY_STORE, 'readwrite');
    transaction.objectStore(HISTORY_STORE).put(record);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function listHistoryRecords(): Promise<HistoryRecord[]> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(HISTORY_STORE, 'readonly');
    const index = transaction.objectStore(HISTORY_STORE).index(CREATED_AT_INDEX);
    const records = await requestResult(index.getAll()) as HistoryRecord[];

    return records.sort((left, right) => {
      const createdAtDifference = right.createdAt - left.createdAt;
      return createdAtDifference || left.id.localeCompare(right.id);
    });
  } finally {
    database.close();
  }
}

export async function getHistoryRecord(id: string): Promise<HistoryRecord | undefined> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(HISTORY_STORE, 'readonly');
    return await requestResult(transaction.objectStore(HISTORY_STORE).get(id)) as HistoryRecord | undefined;
  } finally {
    database.close();
  }
}

export async function deleteHistoryRecord(id: string): Promise<void> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(HISTORY_STORE, 'readwrite');
    transaction.objectStore(HISTORY_STORE).delete(id);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}
