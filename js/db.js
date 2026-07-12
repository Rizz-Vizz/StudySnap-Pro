const SSP_DB_NAME = 'StudySnapProVault';
const SSP_DB_VERSION = 3;

const SSP_STORES = {
  NOTES: 'notes',
  GROUPS: 'groups',
  SETTINGS: 'settings'
};

let _db = null;

function initDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SSP_DB_NAME, SSP_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const d = event.target.result;

      if (!d.objectStoreNames.contains(SSP_STORES.NOTES)) {
        const ns = d.createObjectStore(SSP_STORES.NOTES, { keyPath: 'id' });
        ns.createIndex('groupId',     'groupId',     { unique: false });
        ns.createIndex('lastUpdated', 'lastUpdated', { unique: false });
        ns.createIndex('starred',     'starred',     { unique: false });
      }

      if (!d.objectStoreNames.contains(SSP_STORES.GROUPS)) {
        const gs = d.createObjectStore(SSP_STORES.GROUPS, { keyPath: 'id' });
        gs.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!d.objectStoreNames.contains(SSP_STORES.SETTINGS)) {
        d.createObjectStore(SSP_STORES.SETTINGS, { keyPath: 'key' });
      }
    };

    request.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    request.onerror  = (e) => { console.error('[SSP DB]', e.target.error); reject(e.target.error); };
  });
}

function _store(name, mode = 'readonly') {
  return _db.transaction([name], mode).objectStore(name);
}

function _calcWordCount(html) {
  try {
    const t = document.createElement('div');
    t.innerHTML = html || '';
    const text = t.innerText.trim();
    return text ? text.split(/\s+/).filter(w => w.length > 0).length : 0;
  } catch (_) { return 0; }
}

function saveNote(note) {
  return new Promise((resolve, reject) => {
    if (!_db) return reject(new Error('DB not initialised'));
    const now = Date.now();
    const n = {
      tags: [], pinned: false, starred: false, groupId: null, color: null,
      ...note,
      lastUpdated: now,
      createdAt: note.createdAt || now,
      wordCount: _calcWordCount(note.html)
    };
    const req = _store(SSP_STORES.NOTES, 'readwrite').put(n);
    req.onsuccess = () => resolve(n);
    req.onerror   = () => reject(req.error);
  });
}

function loadNote(id) {
  return new Promise((resolve, reject) => {
    if (!_db) return resolve(null);
    const req = _store(SSP_STORES.NOTES).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = () => reject(req.error);
  });
}

function deleteNote(id) {
  return new Promise((resolve, reject) => {
    if (!_db) return resolve(false);
    const req = _store(SSP_STORES.NOTES, 'readwrite').delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror   = () => reject(req.error);
  });
}

function listNotes() {
  return new Promise((resolve, reject) => {
    if (!_db) return resolve([]);
    const req = _store(SSP_STORES.NOTES).getAll();
    req.onsuccess = () => {
      const sorted = (req.result || []).sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return (b.lastUpdated || 0) - (a.lastUpdated || 0);
      });
      resolve(sorted);
    };
    req.onerror = () => reject(req.error);
  });
}

function listNotesByGroup(groupId) {
  return new Promise((resolve, reject) => {
    if (!_db) return resolve([]);
    const req = _store(SSP_STORES.NOTES).getAll();
    req.onsuccess = () => {
      const notes = (req.result || [])
        .filter(n => n.groupId === groupId)
        .sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
      resolve(notes);
    };
    req.onerror = () => reject(req.error);
  });
}

function searchNotes(query) {
  return new Promise((resolve, reject) => {
    if (!_db) return resolve([]);
    const q = (query || '').toLowerCase().trim();
    if (!q) return listNotes().then(resolve).catch(reject);
    const req = _store(SSP_STORES.NOTES).getAll();
    req.onsuccess = () => {
      const tmp = document.createElement('div');
      const results = (req.result || []).filter(n => {
        tmp.innerHTML = n.html || '';
        return (n.title || '').toLowerCase().includes(q) ||
               tmp.innerText.toLowerCase().includes(q) ||
               (n.tags || []).some(t => t.toLowerCase().includes(q)) ||
               (n.videoTitle || '').toLowerCase().includes(q);
      });
      results.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

function updateNoteFields(id, fields) {
  return loadNote(id).then(n => {
    if (!n) return null;
    return saveNote({ ...n, ...fields });
  });
}

function saveGroup(group) {
  return new Promise((resolve, reject) => {
    if (!_db) return reject(new Error('DB not initialised'));
    const g = { ...group, createdAt: group.createdAt || Date.now() };
    const req = _store(SSP_STORES.GROUPS, 'readwrite').put(g);
    req.onsuccess = () => resolve(g);
    req.onerror   = () => reject(req.error);
  });
}

function loadGroup(id) {
  return new Promise((resolve, reject) => {
    if (!_db) return resolve(null);
    const req = _store(SSP_STORES.GROUPS).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = () => reject(req.error);
  });
}

async function deleteGroup(id) {

  const notes = await listNotesByGroup(id);
  for (const n of notes) await updateNoteFields(n.id, { groupId: null });
  return new Promise((resolve, reject) => {
    const req = _store(SSP_STORES.GROUPS, 'readwrite').delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror   = () => reject(req.error);
  });
}

function listGroups() {
  return new Promise((resolve, reject) => {
    if (!_db) return resolve([]);
    const req = _store(SSP_STORES.GROUPS).getAll();
    req.onsuccess = () => {
      resolve((req.result || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
    };
    req.onerror = () => reject(req.error);
  });
}

function getSetting(key, fallback = null) {
  return new Promise((resolve) => {
    if (!_db) return resolve(fallback);
    const req = _store(SSP_STORES.SETTINGS).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : fallback);
    req.onerror   = () => resolve(fallback);
  });
}

function setSetting(key, value) {
  return new Promise((resolve, reject) => {
    if (!_db) return resolve(null);
    const req = _store(SSP_STORES.SETTINGS, 'readwrite').put({ key, value });
    req.onsuccess = () => resolve(value);
    req.onerror   = () => reject(req.error);
  });
}

async function exportAllData() {
  await initDB();
  const [notes, groups] = await Promise.all([listNotes(), listGroups()]);
  return { exportedAt: Date.now(), appVersion: '5.0.0', dbVersion: SSP_DB_VERSION, notes, groups };
}

async function importAllData(payload) {
  if (!payload || (!Array.isArray(payload.notes) && !Array.isArray(payload.groups))) {
    throw new Error('Invalid backup file — expected { notes, groups }');
  }
  await initDB();
  let noteCount = 0, groupCount = 0;
  for (const g of (payload.groups || [])) { if (g?.id) { await saveGroup(g); groupCount++; } }
  for (const n of (payload.notes  || [])) { if (n?.id) { await saveNote(n);  noteCount++;  } }
  return { noteCount, groupCount };
}
