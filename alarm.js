// ─── alarm.js ────────────────────────────────────────────────────────────────
//  Polls the server for active alarms. When one is ringing it shows a
//  "STOP ALARM" button above the input and announces it, and hides the
//  button a few seconds after the user presses stop.
//
//  The actual ringing (audio playback) happens server-side via afplay, so
//  the alarm sounds even if this tab is in the background.
//
//  Imported by: main.js
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG } from './config.js';
import { UI     } from './ui.js';
import { speak  } from './speech.js';

const POLL_MS      = 8000;  // how often to check for ringing alarms
const HIDE_DELAY_MS = 4000; // button lingers this long after stop is pressed

export const Alarm = {
  bar: null,
  btn: null,
  announced    : new Set(), // alarm ids already announced to the user
  stopPressedAt: 0,         // timestamp of the last stop press

  init() {
    this.bar = document.getElementById('alarm-bar');
    this.btn = document.getElementById('stop-alarm-btn');
    if (!this.btn || !this.bar) return;
    this.btn.addEventListener('click', () => this.stop());
    this.poll();
    setInterval(() => this.poll(), POLL_MS);
  },

  async poll() {
    try {
      const res   = await fetch(`${CONFIG.flaskUrl}/alarms`);
      if (!res.ok) return;
      const alarms = await res.json();

      const ringing = alarms.filter(a => a.ringing);
      if (ringing.length > 0) {
        for (const a of ringing) {
          if (!this.announced.has(a.id)) {
            this.announced.add(a.id);
            const msg = 'Your alarm is ringing.';
            UI.addMessage('assistant', msg);
            speak(msg);
          }
        }
        this.show();
      }

      // Keep the button visible for a few seconds after pressing stop
      if (this.stopPressedAt && Date.now() - this.stopPressedAt > HIDE_DELAY_MS) {
        this.hide();
        this.stopPressedAt = 0;
      }

      this.renderList(alarms);
    } catch {
      // Server unreachable — ignore; the server plays the audio anyway
    }
  },

  // renderList() — shows active alarms (pending + ringing) in the health
  // panel, each with a cancel button.
  renderList(alarms) {
    const section = document.getElementById('health-alarms');
    const listEl  = document.getElementById('health-alarms-list');
    if (!section || !listEl) return;

    const visible = alarms.filter(a => !a.fired || a.ringing);
    if (visible.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';

    listEl.innerHTML = visible.map(a => `
      <div class="health-alarm-item${a.ringing ? ' ringing' : ''}">
        <div class="health-alarm-info">
          <span class="health-alarm-time">${this.formatDue(a.due_at)}</span>
          <span class="health-alarm-status">${a.ringing ? '⏰ Ringing now' : 'Scheduled'}</span>
        </div>
        <button class="health-alarm-cancel" data-id="${a.id}">Cancel</button>
      </div>
    `).join('');

    listEl.querySelectorAll('.health-alarm-cancel').forEach(btn => {
      btn.addEventListener('click', () => this.cancel(btn.dataset.id));
    });
  },

  async cancel(id) {
    try {
      await fetch(`${CONFIG.flaskUrl}/alarm/cancel`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ id }),
      });
    } catch {
      // Server unreachable — the next poll will reflect reality
    }
  },

  // formatDue() — "2026-08-22T07:30:00" → "Sat, 7:30 AM"
  formatDue(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso || '—';
    return d.toLocaleString('en-US', {
      weekday : 'short',
      month   : 'short',
      day     : 'numeric',
      hour    : 'numeric',
      minute  : '2-digit',
    });
  },

  async stop() {
    try {
      await fetch(`${CONFIG.flaskUrl}/alarm/stop`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : '{}',
      });
    } catch {
      // Even if the server is unreachable, hide the button on a delay
    }
    this.stopPressedAt = Date.now();
  },

  show() { if (this.bar) this.bar.classList.add('visible'); },
  hide() { if (this.bar) this.bar.classList.remove('visible'); },
};
