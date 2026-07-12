'use strict';

const grid = document.getElementById('cards-grid');
const emptyState = document.getElementById('empty-state');
const filterChips = document.getElementById('filter-chips');
const searchInput = document.getElementById('global-search');
const sortSelect = document.getElementById('sort-select');
const mainHeading = document.getElementById('main-heading');
const mainSubtitle = document.getElementById('main-subtitle');
const viewBtns = document.querySelectorAll('.view-btn');

const bulkBar = document.getElementById('bulk-bar');
const bulkCount = document.getElementById('bulk-count');
let selectedCards = new Set();

const editorPanel = document.getElementById('editor-panel');
const epTitle = document.getElementById('ep-title');
const epEditor = document.getElementById('ep-editor');
const epCloseBtn = document.getElementById('ep-close');
const epSaveStatus = document.getElementById('ep-save-status');
const epStarBtn = document.getElementById('ep-star-btn');
const epDeleteBtn = document.getElementById('ep-delete-btn');
const epVideoInfo = document.getElementById('ep-video-info');
const epCreated = document.getElementById('ep-created');
const epWordCount = document.getElementById('ep-word-count');
const epGroupSelect = document.getElementById('ep-group-select');
const epTagsList = document.getElementById('ep-tags-list');
let currentNoteId = null;
let saveTimer = null;

let allNotes = [];
let allGroups = [];
let currentFilter = { type: 'all', val: null }; 
let currentSearch = '';
let currentSort = 'recent';
let currentTags = new Set();
let isListView = false;

function esc(s) { const d = document.createElement('div'); d.innerText = String(s ?? ''); return d.innerHTML; }
function safeFilename(n) { return (n || 'notes').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'notes'; }

function showToast(msg, type = 'info', ms = 3000) {
  const box = document.getElementById('h-toast-box');
  const t = document.createElement('div');
  t.className = `h-toast ${type}`;
  t.textContent = msg;
  box.appendChild(t);
  if (ms > 0) setTimeout(() => { t.style.opacity=0; setTimeout(()=>t.remove(),200); }, ms);
  return t;
}

const toastStyle = document.createElement('style');
toastStyle.textContent = `
#h-toast-box { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); z-index:9999; display:flex; flex-direction:column; gap:8px; pointer-events:none; }
.h-toast { background:var(--bg-card); color:var(--text); border:1px solid var(--border); padding:8px 16px; border-radius:20px; font-size:13px; box-shadow:var(--shadow-md); transition:opacity 0.2s; animation:toastIn 0.2s ease; }
.h-toast.success { border-color:var(--success); color:var(--success); }
.h-toast.error { border-color:var(--danger); color:var(--danger); }
@keyframes toastIn { from { transform:translateY(10px); opacity:0; } to { transform:translateY(0); opacity:1; } }
`;
document.head.appendChild(toastStyle);

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
document.querySelectorAll('.modal-backdrop').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
});

let confirmCallback = null;
function doConfirm(title, msg, okLabel, isDanger = true) {
  return new Promise(resolve => {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = msg;
    const okBtn = document.getElementById('confirm-ok');
    okBtn.textContent = okLabel;
    okBtn.className = isDanger ? 'ctrl-btn danger' : 'ctrl-btn primary';
    openModal('confirm-modal');
    confirmCallback = resolve;
  });
}
document.getElementById('confirm-cancel').addEventListener('click', () => { closeModal('confirm-modal'); if (confirmCallback) confirmCallback(false); });
document.getElementById('confirm-ok').addEventListener('click', () => { closeModal('confirm-modal'); if (confirmCallback) confirmCallback(true); });

async function boot() {
  await initDB();

  const theme = await getSetting('theme', 'dark');
  document.documentElement.setAttribute('data-theme', theme);
  isListView = await getSetting('historyView', 'grid') === 'list';
  updateViewToggle();

  await refreshData();

  setupSidebar();
  setupEditor();
}

async function refreshData() {
  allNotes = await listNotes();
  allGroups = await listGroups();

  updateSidebarStats();
  renderGroupsList();
  renderTagsList();
  updateGroupDropdowns();
  renderCards();
}

function updateSidebarStats() {
  document.getElementById('stat-notes').textContent = allNotes.length;
  document.getElementById('stat-words').textContent = allNotes.reduce((sum, n) => sum + (n.wordCount || 0), 0).toLocaleString();
  document.getElementById('stat-groups').textContent = allGroups.length;

  document.getElementById('badge-all').textContent = allNotes.length;
  document.getElementById('badge-starred').textContent = allNotes.filter(n => n.starred).length;

  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  document.getElementById('badge-recent').textContent = allNotes.filter(n => n.lastUpdated > sevenDaysAgo).length;
  document.getElementById('badge-ungrouped').textContent = allNotes.filter(n => !n.groupId).length;
}

function setupSidebar() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      setFilter(btn.dataset.filter, null);
    });
  });

  searchInput.addEventListener('input', e => {
    currentSearch = e.target.value.toLowerCase();
    renderCards();
  });

  sortSelect.addEventListener('change', e => {
    currentSort = e.target.value;
    renderCards();
  });

  viewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      isListView = btn.dataset.view === 'list';
      setSetting('historyView', btn.dataset.view);
      updateViewToggle();
      renderCards();
    });
  });

  document.getElementById('sb-theme-btn').addEventListener('click', async () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    await setSetting('theme', next);
  });

  document.getElementById('sb-backup-btn').addEventListener('click', async () => {
    const data = await exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `studysnap-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    showToast('Backup downloaded ✓', 'success');
  });

  document.getElementById('sb-restore-btn').addEventListener('click', () => document.getElementById('sb-restore-input').click());
  document.getElementById('sb-restore-input').addEventListener('change', async function() {
    const f = this.files[0]; this.value = '';
    if (!f) return;
    try {
      const p = JSON.parse(await f.text());
      const { noteCount } = await importAllData(p);
      showToast(`Restored ${noteCount} notes ✓`, 'success');
      refreshData();
    } catch (_) { showToast('Invalid file format.', 'error'); }
  });
}

function updateViewToggle() {
  viewBtns.forEach(b => b.classList.toggle('active', (b.dataset.view === 'list') === isListView));
  if (isListView) grid.classList.add('list-view');
  else grid.classList.remove('list-view');
}

function setFilter(type, val) {
  currentFilter = { type, val };
  currentTags.clear();

  document.querySelectorAll('.nav-item, .group-nav-item').forEach(el => el.classList.remove('active'));

  if (type === 'group') {
    const el = document.querySelector(`.group-nav-item[data-id="${val}"]`);
    if (el) el.classList.add('active');
    const g = allGroups.find(g => g.id === val);
    mainHeading.textContent = g ? `${g.icon} ${g.name}` : 'Group';
    mainSubtitle.textContent = g ? `Notes in this group` : '';
  } else {
    const el = document.querySelector(`.nav-item[data-filter="${type}"]`);
    if (el) el.classList.add('active');

    const titles = {
      'all': 'All Notes',
      'starred': 'Starred Notes',
      'recent': 'Recent Notes',
      'ungrouped': 'Ungrouped'
    };
    mainHeading.textContent = titles[type] || 'Notes';
    mainSubtitle.textContent = type === 'recent' ? 'Notes edited in the last 7 days' : '';
  }

  clearBulkSelection();
  renderCards();
  renderTagsList();
}

const SWATCHES = ['#6d5acd', '#5b6ef5', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#d946ef'];
let editingGroupId = null;
let selectedColor = SWATCHES[0];

function renderGroupsList() {
  const list = document.getElementById('groups-list');
  list.innerHTML = '';

  allGroups.forEach(g => {
    const count = allNotes.filter(n => n.groupId === g.id).length;
    const btn = document.createElement('div');
    btn.className = `group-nav-item ${currentFilter.type === 'group' && currentFilter.val === g.id ? 'active' : ''}`;
    btn.dataset.id = g.id;
    btn.innerHTML = `
      <span class="group-dot" style="background:${g.color}"></span>
      <span class="group-name-text">${g.icon} ${esc(g.name)}</span>
      <span class="nav-badge">${count}</span>
      <div class="group-ctx-btns">
        <button class="group-ctx-btn edit-grp" title="Edit">✎</button>
        <button class="group-ctx-btn del-grp" title="Delete">🗑️</button>
      </div>
    `;

    btn.addEventListener('click', e => {
      if (e.target.closest('.group-ctx-btn')) return;
      setFilter('group', g.id);
    });

    btn.querySelector('.edit-grp').addEventListener('click', () => openGroupModal(g.id));
    btn.querySelector('.del-grp').addEventListener('click', async () => {
      const ok = await doConfirm('Delete Group?', `Delete "${esc(g.name)}"? Notes will not be deleted, just ungrouped.`, 'Delete Group');
      if (ok) {
        await deleteGroup(g.id);
        if (currentFilter.val === g.id) setFilter('all', null);
        await refreshData();
      }
    });

    list.appendChild(btn);
  });
}

function renderTagsList() {
  const list = document.getElementById('tags-list');
  if (!list) return;
  list.innerHTML = '';

  const counts = new Map();
  allNotes.forEach(n => (n.tags || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));

  const tags = Array.from(counts.keys()).sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));

  if (!tags.length) {
    list.innerHTML = `<div style="font-size:11px;color:var(--muted);padding:4px 10px;">No tags yet — add tags from a note.</div>`;
    return;
  }

  tags.forEach(tag => {
    const btn = document.createElement('div');
    btn.className = `group-nav-item ${currentTags.has(tag) ? 'active' : ''}`;
    btn.innerHTML = `
      <span class="group-name-text">#${esc(tag)}</span>
      <span class="nav-badge">${counts.get(tag)}</span>
    `;
    btn.addEventListener('click', () => {
      if (currentTags.has(tag)) currentTags.delete(tag);
      else currentTags.add(tag);
      renderCards();
      renderTagsList();
    });
    list.appendChild(btn);
  });
}

function openGroupModal(groupId = null) {
  editingGroupId = groupId;
  const title = document.getElementById('group-modal-title');
  const nameInput = document.getElementById('group-name-input');
  const iconInput = document.getElementById('group-icon-input');

  if (groupId) {
    const g = allGroups.find(g => g.id === groupId);
    title.textContent = 'Edit Group';
    nameInput.value = g.name;
    iconInput.value = g.icon || '📁';
    selectedColor = g.color;
  } else {
    title.textContent = 'Create Group';
    nameInput.value = '';
    iconInput.value = '📁';
    selectedColor = SWATCHES[0];
  }

  renderColorSwatches();
  openModal('group-modal');
  nameInput.focus();
}

function renderColorSwatches() {
  const container = document.getElementById('color-swatches');
  container.innerHTML = '';
  container.style.display = 'flex';
  container.style.gap = '8px';
  container.style.marginTop = '4px';
  container.style.marginBottom = '16px';

  SWATCHES.forEach(c => {
    const btn = document.createElement('button');
    btn.style.width = '24px';
    btn.style.height = '24px';
    btn.style.borderRadius = '50%';
    btn.style.border = 'none';
    btn.style.background = c;
    btn.style.cursor = 'pointer';
    btn.style.boxShadow = c === selectedColor ? '0 0 0 2px var(--bg-el), 0 0 0 4px var(--accent)' : 'none';
    btn.addEventListener('click', () => { selectedColor = c; renderColorSwatches(); });
    container.appendChild(btn);
  });
}

document.getElementById('new-group-btn').addEventListener('click', () => openGroupModal());
document.getElementById('group-cancel').addEventListener('click', () => closeModal('group-modal'));
document.getElementById('group-save').addEventListener('click', async () => {
  const name = document.getElementById('group-name-input').value.trim();
  const icon = document.getElementById('group-icon-input').value.trim() || '📁';
  if (!name) { showToast('Please enter a group name', 'error'); return; }

  const group = {
    id: editingGroupId || 'group_' + Date.now(),
    name,
    icon,
    color: selectedColor,
    createdAt: editingGroupId ? (allGroups.find(g=>g.id===editingGroupId)?.createdAt || Date.now()) : Date.now()
  };

  await saveGroup(group);
  closeModal('group-modal');
  await refreshData();
  showToast(editingGroupId ? 'Group updated' : 'Group created', 'success');
});

function updateGroupDropdowns() {
  const sel = document.getElementById('ep-group-select');
  sel.innerHTML = '<option value="">No Group</option>';
  allGroups.forEach(g => {
    sel.innerHTML += `<option value="${g.id}">${g.icon} ${esc(g.name)}</option>`;
  });
}

function excerpt(html) {
  if (!html) return 'Empty note...';
  const d = document.createElement('div');
  d.innerHTML = html;
  d.querySelectorAll('.ssp-img-actions, .ssp-img-act, .ssp-ts, .ep-img-actions, .ep-img-act').forEach(el => el.remove());
  return d.innerText.trim().replace(/\s+/g, ' ').substring(0, 150) || 'Empty note...';
}

function renderCards() {
  let filtered = allNotes;

  if (currentFilter.type === 'starred') filtered = filtered.filter(n => n.starred);
  else if (currentFilter.type === 'recent') {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(n => n.lastUpdated > sevenDaysAgo);
  }
  else if (currentFilter.type === 'ungrouped') filtered = filtered.filter(n => !n.groupId);
  else if (currentFilter.type === 'group') filtered = filtered.filter(n => n.groupId === currentFilter.val);

  if (currentTags.size > 0) {
    filtered = filtered.filter(n => Array.from(currentTags).every(t => (n.tags || []).includes(t)));
  }

  if (currentSearch) {
    filtered = filtered.filter(n => 
      (n.title && n.title.toLowerCase().includes(currentSearch)) || 
      (n.videoTitle && n.videoTitle.toLowerCase().includes(currentSearch)) ||
      (n.tags && n.tags.some(t => t.toLowerCase().includes(currentSearch)))
    );
  }

  filtered.sort((a, b) => {
    if (currentSort === 'recent') return (b.lastUpdated || 0) - (a.lastUpdated || 0);
    if (currentSort === 'oldest') return (a.lastUpdated || 0) - (b.lastUpdated || 0);
    if (currentSort === 'words') return (b.wordCount || 0) - (a.wordCount || 0);
    if (currentSort === 'title') return (a.title || '').localeCompare(b.title || '');
    return 0;
  });

  renderFilterChips();

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    document.getElementById('empty-new-btn').onclick = createNewNote;
    return;
  }

  emptyState.classList.add('hidden');
  grid.innerHTML = '';

  filtered.forEach(n => {
    const group = allGroups.find(g => g.id === n.groupId);
    const borderColor = group ? group.color : 'transparent';
    const dateStr = new Date(n.lastUpdated || n.createdAt || Date.now()).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'});

    const card = document.createElement('div');
    card.className = `note-card ${selectedCards.has(n.id) ? 'selected' : ''}`;
    if (n.id === currentNoteId) card.style.borderColor = 'var(--accent)';
    card.style.borderTopColor = borderColor;

    let tagsHtml = '';
    if (n.tags && n.tags.length > 0) {
      tagsHtml = `<div class="card-tags">` + n.tags.map(t => `<span class="card-tag" data-tag="${esc(t)}">#${esc(t)}</span>`).join('') + `</div>`;
    }

    card.innerHTML = `
      <input type="checkbox" class="card-check" ${selectedCards.has(n.id) ? 'checked' : ''}>
      <div class="card-header">
        <div class="card-title">${esc(n.title || 'Untitled Note')}</div>
        <div class="card-star ${n.starred ? 'visible' : ''}">⭐</div>
      </div>
      <div class="card-excerpt">${esc(excerpt(n.html))}</div>
      ${tagsHtml}
      <div class="card-footer">
        <span>${dateStr}</span>
        <span>${n.wordCount || 0}w</span>
      </div>
    `;

    const chk = card.querySelector('.card-check');
    chk.addEventListener('click', e => e.stopPropagation());
    chk.addEventListener('change', e => {
      if (e.target.checked) selectedCards.add(n.id);
      else selectedCards.delete(n.id);
      updateBulkBar();
      card.classList.toggle('selected', e.target.checked);
    });

    card.querySelectorAll('.card-tag').forEach(tb => {
      tb.addEventListener('click', e => {
        e.stopPropagation();
        currentTags.add(tb.dataset.tag);
        renderCards();
      });
    });

    card.addEventListener('click', () => {
      if (selectedCards.size > 0) {
        chk.checked = !chk.checked;
        chk.dispatchEvent(new Event('change'));
        return;
      }
      openNoteEditor(n.id);
    });

    grid.appendChild(card);
  });
}

function renderFilterChips() {
  filterChips.innerHTML = '';
  currentTags.forEach(tag => {
    const chip = document.createElement('div');
    chip.className = 'filter-chip';
    chip.innerHTML = `#${esc(tag)} <span class="chip-x">×</span>`;
    chip.querySelector('.chip-x').addEventListener('click', () => {
      currentTags.delete(tag);
      renderCards();
    });
    filterChips.appendChild(chip);
  });
}

function updateBulkBar() {
  if (selectedCards.size > 0) {
    bulkBar.classList.remove('hidden');
    bulkCount.textContent = `${selectedCards.size} selected`;
  } else {
    bulkBar.classList.add('hidden');
  }
}
function clearBulkSelection() {
  selectedCards.clear();
  updateBulkBar();
  document.querySelectorAll('.note-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.card-check').forEach(c => c.checked = false);
}
document.getElementById('bulk-cancel').addEventListener('click', clearBulkSelection);

document.getElementById('bulk-delete').addEventListener('click', async () => {
  const ok = await doConfirm('Delete Notes?', `Are you sure you want to delete ${selectedCards.size} notes?`, 'Delete', true);
  if (ok) {
    for (let id of selectedCards) await deleteNote(id);
    if (selectedCards.has(currentNoteId)) closeEditor();
    clearBulkSelection();
    await refreshData();
    showToast('Notes deleted', 'success');
  }
});

document.getElementById('bulk-star').addEventListener('click', async () => {
  for (let id of selectedCards) {
    const n = allNotes.find(x => x.id === id);
    if (n) await saveNote({ ...n, starred: !n.starred });
  }
  clearBulkSelection();
  await refreshData();
});

document.getElementById('bulk-move').addEventListener('click', () => {
  const list = document.getElementById('move-groups-list');
  list.innerHTML = `<button class="ctrl-btn" style="text-align:left;width:100%" data-id="">❌ No Group</button>`;
  allGroups.forEach(g => {
    list.innerHTML += `<button class="ctrl-btn" style="text-align:left;width:100%" data-id="${g.id}">${g.icon} ${esc(g.name)}</button>`;
  });

  openModal('move-modal');

  list.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async () => {
      const gid = btn.dataset.id || null;
      for (let id of selectedCards) {
        const n = allNotes.find(x => x.id === id);
        if (n) await saveNote({ ...n, groupId: gid });
      }
      closeModal('move-modal');
      clearBulkSelection();
      await refreshData();
      showToast('Notes moved', 'success');
    });
  });
});
document.getElementById('move-cancel').addEventListener('click', () => closeModal('move-modal'));

async function createNewNote() {
  const n = { id: 'note_' + Date.now(), title: 'Untitled Note', html: '', tags: [], createdAt: Date.now(), lastUpdated: Date.now(), groupId: currentFilter.type === 'group' ? currentFilter.val : null };
  await saveNote(n);
  await refreshData();
  openNoteEditor(n.id);
}
document.getElementById('new-note-main').addEventListener('click', createNewNote);

function noteHasContent(html) {
  if (!html) return false;
  const d = document.createElement('div'); d.innerHTML = html;
  const text = (d.textContent || '').trim();
  if (text.length > 0) return true;
  if (d.querySelector('img,table,hr')) return true;
  return false;
}

async function discardIfEmpty(id) {
  if (!id) return;
  const n = allNotes.find(x => x.id === id);
  if (!n) return;
  const html = (id === currentNoteId) ? epEditor.innerHTML : n.html;
  if (!noteHasContent(html)) {
    await deleteNote(id);
    allNotes = allNotes.filter(x => x.id !== id);
    renderCards();
    updateSidebarStats();
  }
}

async function openNoteEditor(id) {
  if (currentNoteId && currentNoteId !== id) { await persistNote(); await discardIfEmpty(currentNoteId); }

  const note = allNotes.find(n => n.id === id);
  if (!note) return;

  currentNoteId = id;

  epTitle.value = note.title || '';
  epEditor.innerHTML = note.html || '';
  if (epImageManager) epImageManager.hydrateImages();
  epStarBtn.classList.toggle('starred', !!note.starred);
  epGroupSelect.value = note.groupId || '';

  const when = new Date(note.createdAt || note.lastUpdated).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit'});
  epCreated.textContent = `Created ${when}`;

  if (note.videoTitle && note.url) {
    epVideoInfo.innerHTML = `From: <a href="${note.url}" target="_blank" style="color:var(--accent);text-decoration:none;">${esc(note.videoTitle)}</a>`;
  } else {
    epVideoInfo.innerHTML = '';
  }

  renderEditorTags(note.tags || []);
  updateEditorWordCount();

  editorPanel.classList.remove('hidden');
  renderCards(); 
}

async function closeEditor() {
  if (currentNoteId) { await persistNote(); await discardIfEmpty(currentNoteId); }
  editorPanel.classList.add('hidden');
  currentNoteId = null;
  renderCards();
}
epCloseBtn.addEventListener('click', closeEditor);

function updateEditorWordCount() {
  const t = epEditor.innerText.trim();
  const w = t ? t.split(/\s+/).filter(x => x).length : 0;
  epWordCount.textContent = `${w} words`;
}

async function persistNote() {
  if (!currentNoteId) return;
  const n = allNotes.find(x => x.id === currentNoteId);
  if (!n) return;

  const t = epEditor.innerText.trim();
  const w = t ? t.split(/\s+/).filter(x => x).length : 0;

  n.title = epTitle.value.trim();
  n.html = epEditor.innerHTML;
  n.lastUpdated = Date.now();
  n.wordCount = w;

  await saveNote(n);
  epSaveStatus.textContent = 'Saved';
  epSaveStatus.style.color = 'var(--success)';
  updateEditorWordCount();

  updateSidebarStats();
}

function scheduleSave() {
  epSaveStatus.textContent = 'Saving…';
  epSaveStatus.style.color = 'var(--warning)';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNote, 600);
}

epTitle.addEventListener('input', scheduleSave);
epEditor.addEventListener('input', scheduleSave);

epStarBtn.addEventListener('click', async () => {
  if(!currentNoteId) return;
  const n = allNotes.find(x => x.id === currentNoteId);
  if(!n) return;
  n.starred = !n.starred;
  epStarBtn.classList.toggle('starred', n.starred);
  await saveNote(n);
  await refreshData();
});

epGroupSelect.addEventListener('change', async e => {
  if(!currentNoteId) return;
  const n = allNotes.find(x => x.id === currentNoteId);
  if(!n) return;
  n.groupId = e.target.value || null;
  await saveNote(n);
  await refreshData();
});

epDeleteBtn.addEventListener('click', async () => {
  const ok = await doConfirm('Delete Note?', 'This note will be permanently deleted.', 'Delete');
  if (ok && currentNoteId) {
    await deleteNote(currentNoteId);
    closeEditor();
    await refreshData();
    showToast('Note deleted', 'success');
  }
});

function renderEditorTags(tags) {
  epTagsList.innerHTML = '';
  tags.forEach(t => {
    const el = document.createElement('span');
    el.className = 'card-tag';
    el.style.display = 'inline-flex';
    el.style.alignItems = 'center';
    el.style.gap = '4px';
    el.innerHTML = `#${esc(t)} <span style="cursor:pointer;opacity:0.6" class="rm-tag">×</span>`;
    el.querySelector('.rm-tag').addEventListener('click', async () => {
      if(!currentNoteId) return;
      const n = allNotes.find(x => x.id === currentNoteId);
      n.tags = n.tags.filter(x => x !== t);
      renderEditorTags(n.tags);
      await saveNote(n);
      refreshData();
    });
    epTagsList.appendChild(el);
  });
}

document.getElementById('ep-add-tag').addEventListener('click', () => {
  document.getElementById('tag-input').value = '';
  openModal('tag-modal');
  document.getElementById('tag-input').focus();
});
document.getElementById('tag-cancel').addEventListener('click', () => closeModal('tag-modal'));
document.getElementById('tag-ok').addEventListener('click', async () => {
  const v = document.getElementById('tag-input').value.trim().replace(/^#/, '');
  if (v && currentNoteId) {
    const n = allNotes.find(x => x.id === currentNoteId);
    if (!n.tags) n.tags = [];
    if (!n.tags.includes(v)) {
      n.tags.push(v);
      renderEditorTags(n.tags);
      await saveNote(n);
      refreshData();
    }
  }
  closeModal('tag-modal');
});

let epImageManager = null, epCropSystem = null;

function setupEditor() {
  applyHistoryToolbarConfig();

  const ALIGN_CMDS = new Set(['justifyLeft','justifyCenter','justifyRight']);
  document.querySelectorAll('.etb-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      if (ALIGN_CMDS.has(btn.dataset.cmd)) {
        SSPEditor.applyAlign(epEditor, btn.dataset.cmd, scheduleSave);
      } else {
        epEditor.focus();
        try{document.execCommand(btn.dataset.cmd, false, null)}catch(_){}
        scheduleSave();
      }
      refreshToolbar();
    });
  });

  document.getElementById('ep-block').addEventListener('change', e => {
    const v = e.target.value; epEditor.focus();
    if (v === 'pre') {
      try{document.execCommand('insertHTML', false, '<pre contenteditable="true">code</pre><p><br></p>')}catch(_){}
    } else {
      try{document.execCommand('formatBlock', false, `<${v}>`)}catch(_){}
    }
    scheduleSave(); e.target.value = 'p';
  });

  epEditor.style.fontSize = '16px';
  const epFsizeWidget = SSPEditor.createFontSizeWidget({
    editor: epEditor, downId: 'ep-fsize-dn', upId: 'ep-fsize-up', labelId: 'ep-fsize-label',
    onChange: scheduleSave, defaultPx: 16
  });

  SSPEditor.createColorTool({
    editor: epEditor,
    buttonId: 'ep-color-btn',
    popoverId: 'ep-color-popover',
    customInputId: 'ep-color-custom-input',
    swatchSelector: '.color-current',
    onChange: scheduleSave
  });

  const hlBtn = document.getElementById('ep-highlight-btn');
  const epHighlightTool = SSPEditor.createHighlightTool({ editor: epEditor, button: hlBtn, onChange: scheduleSave });

  function selectionIsHighlighted() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return false;
    let node = sel.focusNode;
    if (!node) return false;
    if (node.nodeType === 3) node = node.parentElement;
    while (node && node !== epEditor) {
      if (node.tagName === 'MARK' && node.classList.contains('ssp-hl')) return true;
      node = node.parentElement;
    }
    return false;
  }
  function refreshHighlightBtn() {
    hlBtn.classList.toggle('active', selectionIsHighlighted() || epHighlightTool.isPaintMode());
  }

  document.getElementById('ep-code-btn').addEventListener('mousedown', e => {
    e.preventDefault();
    SSPEditor.wrapInlineCode(epEditor, scheduleSave);
  });

  document.getElementById('ep-checklist-btn').addEventListener('mousedown', e => {
    e.preventDefault(); epEditor.focus();
    try{document.execCommand('insertHTML',false,`<ul style="list-style:none;padding-left:4px"><li style="list-style:none"><input type="checkbox"> Item</li></ul><p><br></p>`)}catch(_){}
    scheduleSave();
  });

  document.getElementById('ep-math-btn').addEventListener('click', () => {
    SSPEditor.insertMath('ep-modal-root', epEditor, scheduleSave);
  });

  document.getElementById('ep-link-btn').addEventListener('click', () => {
    SSPEditor.insertLink('ep-modal-root', epEditor, scheduleSave);
  });

  document.getElementById('ep-table-btn').addEventListener('click', () => {
    SSPEditor.insertTable('ep-modal-root', epEditor, scheduleSave);
  });

  document.getElementById('ep-hr-btn').addEventListener('mousedown', e => {
    e.preventDefault(); epEditor.focus(); try{document.execCommand('insertHTML', false, '<hr><p><br></p>')}catch(_){} scheduleSave();
  });

  epCropSystem = SSPEditor.createCropSystem({
    modalId: 'crop-modal', canvasId: 'crop-canvas', infoId: 'crop-info',
    resetId: 'crop-reset', cancelId: 'crop-cancel', applyId: 'crop-apply',
    onApply: () => scheduleSave(),
    showToast
  });
  epImageManager = SSPEditor.createImageManager({
    editor: epEditor,
    modalRootId: 'ep-modal-root',
    onChange: () => scheduleSave(),
    showToast,
    cropSystem: epCropSystem
  });

  document.getElementById('ep-img-btn').addEventListener('click', () => document.getElementById('ep-img-input').click());
  document.getElementById('ep-img-input').addEventListener('change', function() {
    if (this.files[0]) epImageManager.readAndInsert(this.files[0]);
    this.value = '';
  });
  epEditor.addEventListener('paste', e => {
    const items = e.clipboardData?.items || [];
    for (const it of items) {
      if (it.type.startsWith('image/')) { e.preventDefault(); epImageManager.readAndInsert(it.getAsFile()); return; }
    }
  });
  epEditor.addEventListener('dragover', e => { e.preventDefault(); epEditor.classList.add('drag-over'); });
  epEditor.addEventListener('dragleave', () => epEditor.classList.remove('drag-over'));
  epEditor.addEventListener('drop', e => {
    epEditor.classList.remove('drag-over');
    const f = e.dataTransfer?.files?.[0];
    if (f?.type.startsWith('image/')) { e.preventDefault(); epImageManager.readAndInsert(f); }
  });

  function refreshToolbar() {
    ['bold','italic','underline','strikeThrough','superscript','subscript',
     'insertUnorderedList','insertOrderedList','justifyLeft','justifyCenter','justifyRight'].forEach(cmd => {
      const b = document.querySelector(`.etb-btn[data-cmd="${cmd}"]`);
      if (b) try{ b.style.color = document.queryCommandState(cmd) ? 'var(--accent)' : ''; }catch(_){}
    });
    refreshHighlightBtn();

    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        let node = sel.focusNode;
        if (node && node.nodeType === 3) node = node.parentElement;
        if (node && epEditor.contains(node)) {
          const computed = parseFloat(getComputedStyle(node).fontSize);
          if (!isNaN(computed) && computed > 0) {
            epFsizeWidget.setPx(Math.round(computed));
          }
        }
      }
    } catch (_) {}
  }
  document.addEventListener('selectionchange', () => { if (document.activeElement === epEditor || epEditor.contains(document.activeElement)) refreshToolbar(); });

  epEditor.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); try{document.execCommand(e.shiftKey ? 'outdent' : 'indent')}catch(_){} }
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        let node = range.startContainer;
        if (node.nodeType === 3 && range.startOffset === 0) {
          let el = node.parentElement;
          while (el && el !== epEditor) {
            if (el.tagName === 'BLOCKQUOTE') {
              const bqRange = document.createRange();
              bqRange.selectNodeContents(el);
              bqRange.collapse(true);
              if (range.compareBoundaryPoints(Range.START_TO_START, bqRange) === 0) {
                e.preventDefault();
                try { document.execCommand('formatBlock', false, 'p'); } catch(_) {}
                scheduleSave();
              }
              break;
            }
            el = el.parentElement;
          }
        }
      }
    }
  });

  epEditor.addEventListener('click', e => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
      e.target.toggleAttribute('checked');
      scheduleSave();
    }
  });
}

async function applyHistoryToolbarConfig() {
  await SSPEditor.applyToolbarVisibility('history');
}

function renderHistoryToolbarSettings() {
  const container = document.getElementById('ep-toolbar-tools-settings');
  if (!container) return;
  SSPEditor.renderToolbarSettings(container, applyHistoryToolbarConfig);
}

function openToolbarSettingsDrawer() {
  document.getElementById('ep-settings-drawer').classList.remove('hidden');
  document.getElementById('ep-settings-overlay').classList.remove('hidden');
  renderHistoryToolbarSettings();
}
function closeToolbarSettingsDrawer() {
  document.getElementById('ep-settings-drawer').classList.add('hidden');
  document.getElementById('ep-settings-overlay').classList.add('hidden');
}
document.getElementById('ep-settings-btn')?.addEventListener('click', openToolbarSettingsDrawer);
document.getElementById('sb-settings-btn')?.addEventListener('click', openToolbarSettingsDrawer);
document.getElementById('ep-settings-close')?.addEventListener('click', closeToolbarSettingsDrawer);
document.getElementById('ep-settings-overlay')?.addEventListener('click', closeToolbarSettingsDrawer);

document.addEventListener('keydown', e => {
  const cropOpen = !document.getElementById('crop-modal')?.classList.contains('hidden');
  const toolbarSettingsOpen = !document.getElementById('ep-settings-drawer')?.classList.contains('hidden');
  if (e.key === 'Escape' && !editorPanel.classList.contains('hidden')
      && document.querySelectorAll('.modal-backdrop:not(.hidden)').length === 0
      && !cropOpen && !toolbarSettingsOpen) {
    closeEditor();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault(); searchInput.focus();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault(); createNewNote();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (!editorPanel.classList.contains('hidden')) {
      clearTimeout(saveTimer);
      persistNote().then(() => showToast('Saved ✓', 'success', 1500));
    }
  }
});

const epExportBtn = document.getElementById('ep-export-btn');
const epExportMenu = document.getElementById('ep-export-menu');

epExportBtn.addEventListener('click', e => { e.stopPropagation(); epExportMenu.classList.toggle('hidden'); });
document.addEventListener('click', e => { if (!epExportMenu.contains(e.target) && e.target !== epExportBtn) epExportMenu.classList.add('hidden'); });

function downloadBlob(b, f) {
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = u; a.download = f;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 5000);
}

document.querySelectorAll('.ep-drop-item').forEach(b => {
  b.addEventListener('click', async () => {
    epExportMenu.classList.add('hidden');
    const k = b.dataset.epExport;
    const title = epTitle.value || 'Untitled Note';

    if (k === 'pdf') {
      const t = showToast('Creating PDF…', 'info', 0);
      let html = epEditor.innerHTML
        .replace(/<div class="ssp-img-actions"[\s\S]*?<\/div>/gi,'')
        .replace(/ contenteditable="[^"]*"/gi,'');

      const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:Georgia,serif;font-size:14px;line-height:1.75;color:#111;background:#fff;margin:0;padding:0}h1{font-size:22px;border-bottom:1px solid #ddd;padding-bottom:5px;margin:14px 0 7px}h2{font-size:18px;margin:12px 0 6px}h3{font-size:15px;margin:10px 0 5px}p{margin:5px 0}ul,ol{margin:6px 0 6px 20px}li{margin:2px 0}blockquote{border-left:3px solid #6d5acd;padding:3px 12px;color:#555;font-style:italic;margin:8px 0}pre{background:#f5f5f5;padding:10px;border-radius:4px;font-family:monospace;font-size:12px;margin:8px 0;white-space:pre-wrap}code{background:#f0f0f0;padding:1px 4px;border-radius:3px;font-family:monospace;font-size:12px;color:#c0392b}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{padding:6px 8px;border:1px solid #ccc;text-align:left}th{background:#f4f2fc;font-weight:600}img{max-width:100%;height:auto;border-radius:4px;margin:6px 0;page-break-inside:avoid}a{color:#4060cc}hr{border:0;border-top:1px solid #ccc;margin:12px 0}.ssp-ts{background:#e8f0fe;color:#4060cc;padding:2px 8px;border-radius:10px;font-size:11px;font-family:monospace;display:inline-block;margin-bottom:4px}span[style*="background-color"]{border-radius:2px;padding:0 2px}</style></head><body><div style="border-bottom:2px solid #5b6ef5;padding-bottom:6px;margin-bottom:16px"><h1 style="border:0;margin:0;font-size:24px">${esc(title)}</h1><div style="font-size:11px;color:#888;margin-top:3px">Exported ${new Date().toLocaleString()} · StudySnap Pro</div></div>${html}</body></html>`;

      try {
        await html2pdf().from(fullHtml, 'string').set({
          margin:[0.5,0.5,0.6,0.5], filename:`${safeFilename(title)}.pdf`,
          image:{type:'jpeg',quality:0.95},
          html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff'},
          jsPDF:{unit:'in',format:'a4',orientation:'portrait'},
          pagebreak:{mode:['avoid-all','css']}
        }).save();
        showToast('PDF saved ✓', 'success');
      } catch (e) { showToast('PDF failed.', 'error'); }
      finally { t.remove(); }
    } 
    else if (k === 'word') {
      const h = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset='utf-8'><title>${esc(title)}</title><style>body{font-family:Calibri;font-size:12pt}table{border-collapse:collapse}td,th{border:1px solid #999;padding:6px}img{max-width:100%}</style></head><body><h1>${esc(title)}</h1>${epEditor.innerHTML}</body></html>`;
      downloadBlob(new Blob(['\ufeff', h], {type:'application/msword'}), `${safeFilename(title)}.doc`);
      showToast('Word doc saved ✓', 'success');
    } 
    else if (k === 'text') {
      downloadBlob(new Blob([`${title}\n${'='.repeat(Math.min(title.length,60))}\n\n${epEditor.innerText.trim()}\n`], {type:'text/plain;charset=utf-8'}), `${safeFilename(title)}.txt`);
      showToast('Text file saved ✓', 'success');
    }
    else if (k === 'markdown') {
      function htmlToMd(node){
        let o='';
        for(const c of node.childNodes){
          if(c.nodeType===3){o+=c.textContent;continue;}
          if(c.nodeType!==1)continue;
          const tag=c.tagName.toLowerCase(),inner=htmlToMd(c).trim();
          switch(tag){
            case'h1':o+=`\n# ${inner}\n\n`;break;case'h2':o+=`\n## ${inner}\n\n`;break;case'h3':o+=`\n### ${inner}\n\n`;break;
            case'p':o+=`${inner}\n\n`;break;
            case'strong':case'b':o+=`**${inner}**`;break;case'em':case'i':o+=`_${inner}_`;break;
            case's':case'strike':o+=`~~${inner}~~`;break;case'u':o+=`<u>${inner}</u>`;break;
            case'code':o+=`\`${c.textContent}\``;break;case'pre':o+=`\`\`\`\n${c.textContent.trim()}\n\`\`\`\n\n`;break;
            case'blockquote':o+=`> ${inner}\n\n`;break;
            case'ul':for(const li of c.querySelectorAll(':scope>li'))o+=`- ${htmlToMd(li).trim()}\n`;o+='\n';break;
            case'ol':[...c.querySelectorAll(':scope>li')].forEach((li,i)=>{o+=`${i+1}. ${htmlToMd(li).trim()}\n`;});o+='\n';break;
            case'a':o+=`[${inner}](${c.getAttribute('href')})`;break;
            case'img':o+=`\n![image](embedded)\n\n`;break;
            case'hr':o+=`\n---\n\n`;break;case'br':o+='\n';break;
            case'table':{const rows=[...c.querySelectorAll('tr')];rows.forEach((row,ri)=>{const cells=[...row.querySelectorAll('th,td')].map(cc=>htmlToMd(cc).trim());o+='| '+cells.join(' | ')+' |\n';if(ri===0)o+='| '+cells.map(()=>'---').join(' | ')+' |\n';});o+='\n';break;}
            default:o+=inner;
          }
        }
        return o;
      }
      const md = `# ${title}\n\n> Exported ${new Date().toLocaleDateString()} · StudySnap Pro\n\n${htmlToMd(epEditor).replace(/\n{3,}/g,'\n\n').trim()}\n`;
      downloadBlob(new Blob([md], {type:'text/markdown;charset=utf-8'}), `${safeFilename(title)}.md`);
      showToast('Markdown saved ✓', 'success');
    }
  });
});

document.addEventListener('DOMContentLoaded', boot);
