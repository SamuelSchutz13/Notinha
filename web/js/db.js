// IndexedDB store of notes, keyed by the 44-digit access key.
const open = () => new Promise((resolve, reject) => {
  const req = indexedDB.open('notinha', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('notas', { keyPath: 'chave' });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export async function getAll() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction('notas').objectStore('notas').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removeOne(chave) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notas', 'readwrite');
    tx.objectStore('notas').delete(chave);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// One transaction: either every note is saved or none is.
export async function putMany(notes) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notas', 'readwrite');
    for (const n of notes) tx.objectStore('notas').put(n);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
