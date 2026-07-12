'use strict';

chrome.storage.session.get('ssp_popup_theme').then(r => {
  const t = (r && r.ssp_popup_theme) || 'dark';
  document.documentElement.setAttribute('data-theme', t);
}).catch(() => {});

document.getElementById('open-yt-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.youtube.com' });
  window.close();
});

document.getElementById('open-history-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'OPEN_HISTORY_PAGE' });
  window.close();
});
