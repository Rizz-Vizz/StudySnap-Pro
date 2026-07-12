'use strict';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

function isYouTubeWatch(url) {
  try {
    const u = new URL(url);
    return u.hostname.includes('youtube.com') && u.pathname === '/watch';
  } catch (_) { return false; }
}

async function setPanelState(tabId, url) {
  if (!tabId) return;

  const onYT = isYouTubeWatch(url);
  try {
    if (onYT) {
      await chrome.action.setPopup({ tabId, popup: '' });
      await chrome.sidePanel.setOptions({ tabId, path: 'html/panel.html', enabled: true });
    } else {
      await chrome.action.setPopup({ tabId, popup: 'html/popup.html' });
      await chrome.sidePanel.setOptions({ tabId, path: 'html/panel.html', enabled: false });
    }
  } catch (_) {}
}

const SESSION_KEY = 'ssp_open_tabs';
let openTabs = {}; 

chrome.storage.session.get(SESSION_KEY).then(r => {
  if (r && r[SESSION_KEY]) openTabs = r[SESSION_KEY];
}).catch(() => {});

function persistOpenTabs() {
  chrome.storage.session.set({ [SESSION_KEY]: openTabs }).catch(() => {});
}

function markTabOpen(tabId) {
  openTabs[tabId] = true;
  persistOpenTabs();
}

function clearOpenTab(tabId) {
  if (openTabs[tabId]) {
    delete openTabs[tabId];
    persistOpenTabs();
  }
  notifyContentScript(tabId, false);
}

function notifyContentScript(tabId, open) {
  chrome.tabs.sendMessage(tabId, { action: 'PANEL_STATE', open }).catch(() => {});
}

function openPanelForTab(tab) {

  try {
    chrome.sidePanel.open({ tabId: tab.id, windowId: tab.windowId });
  } catch (err) {
    console.error('[SSP] sidePanel.open failed:', err);
    return false;
  }
  markTabOpen(tab.id);
  notifyContentScript(tab.id, true);
  return true;
}

function closePanelForTab(tab) {
  chrome.tabs.sendMessage(tab.id, { action: 'CLOSE_PANEL_REQUEST' }).catch(() => {});
  chrome.runtime.sendMessage({ action: 'CLOSE_PANEL_REQUEST', tabId: tab.id }).catch(() => {});
  clearOpenTab(tab.id);
  return true;
}

function togglePanel(tab) {
  if (!tab?.id) return false;
  if (openTabs[tab.id]) return closePanelForTab(tab);
  return openPanelForTab(tab);
}

chrome.action.onClicked.addListener((tab) => {
  togglePanel(tab);
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' || info.url) setPanelState(tabId, tab.url);
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try { const tab = await chrome.tabs.get(tabId); setPanelState(tabId, tab.url); } catch (_) {}
});
chrome.tabs.onCreated.addListener(tab => setPanelState(tab.id, tab.url || ''));
chrome.tabs.onRemoved.addListener(tabId => clearOpenTab(tabId));

function initAllTabs() {
  chrome.tabs.query({}, tabs => { for (const t of (tabs || [])) if (t.id) setPanelState(t.id, t.url || ''); });
}
chrome.runtime.onInstalled.addListener(() => {
  openTabs = {};
  chrome.storage.session.set({ [SESSION_KEY]: {} }).catch(() => {});
  initAllTabs();
});
chrome.runtime.onStartup.addListener(() => {
  openTabs = {};
  chrome.storage.session.set({ [SESSION_KEY]: {} }).catch(() => {});
  initAllTabs();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.action === 'PANEL_OPENED') {
    const tabId = msg.tabId;
    if (tabId) { markTabOpen(tabId); notifyContentScript(tabId, true); }
    sendResponse({ ok: true });
    return true;
  }
  if (msg.action === 'PANEL_CLOSED') {
    const tabId = msg.tabId;
    if (tabId) clearOpenTab(tabId);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.action === 'OPEN_SIDE_PANEL' || msg.action === 'TOGGLE_SIDE_PANEL') {

    const tab = sender.tab;
    if (!tab?.id) { sendResponse({ ok: false }); return true; }
    const ok = togglePanel(tab);
    sendResponse({ ok });
    return true;
  }
  if (msg.action === 'OPEN_HISTORY_PAGE') {
    chrome.tabs.create({ url: chrome.runtime.getURL('html/history.html') });
    sendResponse({ ok: true });
    return true;
  }
  if (msg.action === 'SEEK_VIDEO') {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs?.[0];
      if (tab && isYouTubeWatch(tab.url)) {
        chrome.tabs.sendMessage(tab.id, { action: 'DO_SEEK', time: msg.time }).catch(() => {});
      }
    });
    sendResponse({ ok: true });
    return true;
  }
});
