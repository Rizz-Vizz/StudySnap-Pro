'use strict';

let panelOpen = false;

function injectNotesButton() {
  if (document.getElementById('ssp-notes-btn')) return;

  const targets = [
    '.ytp-right-controls',
    '.ytp-chrome-controls .ytp-right-controls',
    '.html5-video-controls .ytp-right-controls'
  ];
  let controls = null;
  for (const sel of targets) {
    controls = document.querySelector(sel);
    if (controls) break;
  }
  if (!controls) return;

  const btn = document.createElement('button');
  btn.id = 'ssp-notes-btn';
  btn.className = 'ytp-button ssp-yt-btn';
  btn.title = 'StudySnap Pro — take notes on this video';
  btn.setAttribute('aria-label', 'Open StudySnap Pro notes panel');

  const labelSpan = document.createElement('span');
  labelSpan.className = 'ssp-label';
  labelSpan.textContent = 'StudySnap Pro';
  btn.appendChild(labelSpan);

  btn.addEventListener('click', e => {
    e.stopPropagation();
    e.preventDefault();
    chrome.runtime.sendMessage({ action: 'TOGGLE_SIDE_PANEL' }, () => {

      void chrome.runtime.lastError;
    });
  });

  controls.insertBefore(btn, controls.firstChild);
  updateButtonState();
}

function updateButtonState() {
  const btn = document.getElementById('ssp-notes-btn');
  if (!btn) return;
  btn.classList.toggle('ssp-active', panelOpen);
  btn.setAttribute('aria-pressed', panelOpen ? 'true' : 'false');
}

let obsActive = false;
function startObserver() {
  if (obsActive) return;
  obsActive = true;
  const obs = new MutationObserver(() => {
    if (!document.getElementById('ssp-notes-btn')) injectNotesButton();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
}

document.addEventListener('yt-navigate-finish', injectNotesButton);
injectNotesButton();
startObserver();
setInterval(() => { if (!document.getElementById('ssp-notes-btn')) injectNotesButton(); }, 2500);

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'DO_SEEK') {
    const video = document.querySelector('video');
    if (video && typeof message.time === 'number') video.currentTime = message.time;
  }
  if (message.action === 'PANEL_STATE') {
    panelOpen = !!message.open;
    updateButtonState();
  }
});
