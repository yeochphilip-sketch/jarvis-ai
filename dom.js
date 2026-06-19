// ─── dom.js ───────────────────────────────────────────────────────────────────
//  All document.getElementById() calls in one place.
//  When an element ID changes in index.html, this is the only file to update.
//  Elements are grouped by which part of the UI they belong to.
//
//  Imported by: orb.js, memory.js, speech.js, recognition.js, ui.js, main.js
// ─────────────────────────────────────────────────────────────────────────────

export const DOM = {

  // ── Modal / status bar ──────────────────────────────────────────────────────
  modal      : document.getElementById('modal'),
  statusDot  : document.getElementById('status-dot'),
  statusText : document.getElementById('status-text'),

  // ── Chat panel [AMENDMENT C] ────────────────────────────────────────────────
  // The slide-in panel that holds the conversation history.
  chatPanel  : document.getElementById('chat-panel'),
  chatToggle : document.getElementById('chat-toggle'),
  chatClose  : document.getElementById('chat-close'),
  messages   : document.getElementById('messages'),
  emptyState : document.getElementById('empty-state'),

  // ── Text input ──────────────────────────────────────────────────────────────
  input   : document.getElementById('input'),
  sendBtn : document.getElementById('send-btn'),
  micBtn  : document.getElementById('mic-btn'),

  // ── Orb [AMENDMENT A / B] ───────────────────────────────────────────────────
  // orbWrapper receives CSS classes (speaking / listening) that drive animations.
  // orbStatus shows the IDLE / THINKING / SPEAKING / LISTENING label.
  orbWrapper : document.getElementById('orb-wrapper'),
  orbStatus  : document.getElementById('orb-status'),

  // ── Memory panel ────────────────────────────────────────────────────────────
  memoryList  : document.getElementById('memory-list'),
  memoryEmpty : document.getElementById('memory-empty'),
  memoryCount : document.getElementById('memory-count'),

  Health.init();
};