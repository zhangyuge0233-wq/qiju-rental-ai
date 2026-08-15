import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  deleteHistoryRecord,
  getHistoryRecord,
  listHistoryRecords,
  saveHistoryRecord,
  type HistoryRecord,
} from '../../src/lib/history-db';

function record(id: string, createdAt: number): HistoryRecord {
  return {
    id,
    roomImage: new Blob([`room-${id}`], { type: 'image/jpeg' }),
    referenceImage: new Blob([`reference-${id}`], { type: 'image/png' }),
    presetStyle: '现代简约',
    resultImage: new Blob([`result-${id}`], { type: 'image/webp' }),
    createdAt,
    inputSnapshot: { presetStyle: '现代简约', hasReferenceImage: true },
  };
}

describe('history database', () => {
  let originalIndexedDB: IDBFactory | undefined;

  beforeEach(() => {
    originalIndexedDB = globalThis.indexedDB;
    globalThis.indexedDB = new IDBFactory();
  });

  afterEach(() => {
    globalThis.indexedDB = originalIndexedDB as IDBFactory;
  });

  it('keeps complete records and Blob MIME/content after a round trip', async () => {
    // A store that drops Blob fields or replaces them with strings must fail this test.
    const saved = record('round-trip', 1);

    await saveHistoryRecord(saved);
    const loaded = await getHistoryRecord('round-trip');

    expect(loaded).toMatchObject({
      id: 'round-trip',
      presetStyle: '现代简约',
      createdAt: 1,
      inputSnapshot: { presetStyle: '现代简约', hasReferenceImage: true },
    });
    expect(loaded?.roomImage.type).toBe('image/jpeg');
    expect(await loaded?.roomImage.text()).toBe('room-round-trip');
    expect(loaded?.referenceImage?.type).toBe('image/png');
    expect(await loaded?.referenceImage?.text()).toBe('reference-round-trip');
    expect(loaded?.resultImage.type).toBe('image/webp');
    expect(await loaded?.resultImage.text()).toBe('result-round-trip');
  });

  it('lists by creation time descending with a deterministic tie-breaker', async () => {
    // Returning insertion order or an unstable tie order must fail this test.
    await saveHistoryRecord(record('older', 1));
    await saveHistoryRecord(record('beta', 2));
    await saveHistoryRecord(record('alpha', 2));
    await saveHistoryRecord(record('newer', 3));

    expect((await listHistoryRecords()).map((item) => item.id)).toEqual([
      'newer',
      'alpha',
      'beta',
      'older',
    ]);
  });

  it('deletes only the requested complete record', async () => {
    // Deleting the wrong key or reporting before the deletion commits must fail this test.
    await saveHistoryRecord(record('keep', 1));
    await saveHistoryRecord(record('remove', 2));

    await deleteHistoryRecord('remove');

    expect(await getHistoryRecord('remove')).toBeUndefined();
    expect((await listHistoryRecords()).map((item) => item.id)).toEqual(['keep']);
  });

  it('creates the required versioned history store and createdAt index', async () => {
    // A database with a renamed store, wrong version, or missing sort index must fail this test.
    await saveHistoryRecord(record('schema', 1));

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('qiju-rental-ai');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    expect(database.version).toBe(1);
    expect(Array.from(database.objectStoreNames)).toEqual(['history']);
    const transaction = database.transaction('history', 'readonly');
    expect(Array.from(transaction.objectStore('history').indexNames)).toEqual(['createdAt']);
    database.close();
  });
});
