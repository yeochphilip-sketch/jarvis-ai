// ─── ui.js ────────────────────────────────────────────────────────────────────
//  Pure DOM helpers — they render things but contain no business logic.
//  Every function that touches the chat panel or message list lives here.
//
//  Exports:
//    UI.addMessage(role, content)  — appends a chat bubble, returns the element
//    UI.addThinking()              — appends the three-dot thinking indicator
//    UI.addMemoryNote(wasRemember) — appends a small memory-action system note
//    UI.scrollToBottom()           — scrolls the message list to the latest item
//
//  Design note:
//    Exported as a single UI object so call sites read UI.addMessage() rather
//    than a flat function name — making it immediately obvious at the call site
//    that this is a presentation concern, not business logic.
//
//  Imported by: llama.js, intent.js, main.js
// ─────────────────────────────────────────────────────────────────────────────

import { DOM } from './dom.js';

export const UI = {

  // addMessage() — appends a labelled chat bubble to the message list.
  // Returns the bubble element so callers can stream text into it afterwards.
  addMessage(role, content) {
    if (DOM.emptyState.parentNode) DOM.emptyState.remove();

    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    const label = document.createElement('div');
    label.className   = 'message-label';
    label.textContent = role === 'user' ? 'YOU' : 'JARVIS';

    const bubble = document.createElement('div');
    bubble.className   = 'bubble';
    bubble.textContent = content;

    row.appendChild(label);
    row.appendChild(bubble);
    DOM.messages.appendChild(row);
    this.scrollToBottom();
    return bubble;
  },

  // addThinking() — appends the animated three-dot indicator while Jarvis
  // is processing. Returns the row so the caller can .remove() it when
  // the real reply arrives.
  addThinking() {
    const row = document.createElement('div');
    row.className = 'message-row assistant';
    row.id        = 'thinking-row';

    const label = document.createElement('div');
    label.className   = 'message-label';
    label.textContent = 'JARVIS';

    const thinking = document.createElement('div');
    thinking.className = 'thinking';
    thinking.innerHTML = '<span></span><span></span><span></span>';

    row.appendChild(label);
    row.appendChild(thinking);
    DOM.messages.appendChild(row);
    this.scrollToBottom();
    return row;
  },

  // addMemoryNote() — appends a small system note below a memory-command reply
  // so the user can see what storage action Jarvis just took.
  addMemoryNote(wasRemember) {
    const row = document.createElement('div');
    row.className = 'message-row system-note';

    const label = document.createElement('div');
    label.className   = 'message-label';
    label.textContent = 'JARVIS';

    const bubble = document.createElement('div');
    bubble.className   = 'bubble';
    bubble.textContent = wasRemember ? 'Saved to memory' : 'Removed from memory';

    row.appendChild(label);
    row.appendChild(bubble);
    DOM.messages.appendChild(row);
    this.scrollToBottom();
  },

  scrollToBottom() {
    DOM.messages.scrollTop = DOM.messages.scrollHeight;
  },
  showUserLine(text)        { showUserLine(text); },
  clearUserLine()           { clearUserLine(); },
  showJarvisSentence(text)  { showJarvisSentence(text); },
  clearJarvisSentence()     { clearJarvisSentence(); },


};

const subtitleUser   = document.getElementById('subtitle-user');
const subtitleJarvis = document.getElementById('subtitle-jarvis');

// showUserLine() — shows the user's question below the orb in grey
// Fades out after 6 seconds automatically
export function showUserLine(text) {
  if (!subtitleUser) return;
  subtitleUser.textContent = `> ${text}`;
  subtitleUser.classList.add('visible');
}

export function clearUserLine() {
  if (!subtitleUser) return;
  subtitleUser.classList.remove('visible');
}

// showJarvisSentence() — fades out old sentence, fades in new one
export function showJarvisSentence(text) {
  if (!subtitleJarvis) return;
  // Fade out first
  subtitleJarvis.classList.remove('visible');
  setTimeout(() => {
    subtitleJarvis.textContent = text;
    subtitleJarvis.classList.add('visible');
  }, 350); // matches the CSS transition duration
}

export function clearJarvisSentence() {
  if (!subtitleJarvis) return;
  subtitleJarvis.classList.remove('visible');
  setTimeout(() => {
    subtitleJarvis.textContent = '';
  }, 350);
}