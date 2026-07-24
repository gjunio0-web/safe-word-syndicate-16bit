// IndexedDB helper for persisting custom audio files across app reloads and server restarts

const DB_NAME = 'ArcadeJukeboxAudioDB';
const STORE_NAME = 'audio_tracks';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAudioTrackBlob(trackId: string, file: File | Blob, fileName: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record = {
      blob: file,
      name: fileName,
      type: file.type,
      updatedAt: Date.now(),
    };

    store.put(record, trackId);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to save audio track to IndexedDB:', err);
  }
}

export async function loadAudioTrackBlobs(): Promise<Record<string, { url: string; name: string }>> {
  const results: Record<string, { url: string; name: string }> = {};
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve) => {
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const trackId = cursor.key as string;
          const record = cursor.value;
          if (record && record.blob) {
            const objectUrl = URL.createObjectURL(record.blob);
            results[trackId] = {
              url: objectUrl,
              name: record.name || 'Custom Track',
            };
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => resolve(results);
    });
  } catch (err) {
    console.warn('Failed to load audio tracks from IndexedDB:', err);
    return results;
  }
}

export async function removeAudioTrackBlob(trackId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(trackId);
  } catch (err) {
    console.warn('Failed to remove audio track from IndexedDB:', err);
  }
}
