// ─── health.js ───────────────────────────────────────────────────────────────
//  Garmin health data integration for Jarvis dashboard.
//  Fetches today's biometrics and workout from /health/today and /workout/today
//  Imported by: main.js
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = 'http://127.0.0.1:5000';

export const Health = {
  panel: null,
  toggleBtn: null,
  closeBtn: null,
  refreshBtn: null,
  fetchBtn: null,
  setupBtn: null,
  isOpen: false,

  init() {
    this.panel      = document.getElementById('health-panel');
    this.toggleBtn  = document.getElementById('health-toggle');
    this.closeBtn   = document.getElementById('health-close');
    this.refreshBtn = document.getElementById('health-refresh-btn');
    this.fetchBtn   = document.getElementById('health-fetch-btn');
    this.setupBtn   = document.getElementById('health-setup-btn');

    if (!this.panel) return;

    this.toggleBtn?.addEventListener('click', () => this.toggle());
    this.closeBtn?.addEventListener('click', () => this.close());
    this.refreshBtn?.addEventListener('click', () => this.loadData());
    this.fetchBtn?.addEventListener('click', () => this.refreshFromGarmin());
    this.setupBtn?.addEventListener('click', () => this.showSetup());

    // Auto-load when panel opens
    this.loadData();
  },

  toggle() {
    this.isOpen ? this.close() : this.open();
  },

  open() {
    this.isOpen = true;
    this.panel.classList.add('open');
    this.loadData();
  },

  close() {
    this.isOpen = false;
    this.panel.classList.remove('open');
  },

  async loadData() {
    this.showLoading();

    try {
      const [healthRes, workoutRes] = await Promise.all([
        fetch(`${API_BASE}/health/today`).catch(() => null),
        fetch(`${API_BASE}/workout/today`).catch(() => null)
      ]);

      const health = healthRes?.ok ? await healthRes.json() : null;
      const workout = workoutRes?.ok ? await workoutRes.json() : null;

      if (health) {
        this.renderHealth(health);
        if (workout) {
          this.renderWorkout(workout);
        } else {
          this.renderNoWorkout();
        }
        this.showMetrics();
      } else {
        this.showError();
      }
    } catch (err) {
      console.error('Health load error:', err);
      this.showError();
    }
  },

  renderHealth(data) {
    const sleepEl = document.getElementById('h-sleep');
    const batteryEl = document.getElementById('h-battery');
    const hrEl = document.getElementById('h-hr');
    const stressEl = document.getElementById('h-stress');

    if (sleepEl) {
      sleepEl.textContent = data.sleep_score ?? '--';
      sleepEl.className = 'health-value' + this.scoreClass(data.sleep_score, 70, 85);
    }
    if (batteryEl) {
      batteryEl.textContent = data.body_battery ?? '--';
      batteryEl.className = 'health-value' + this.scoreClass(data.body_battery, 25, 50);
    }
    if (hrEl) hrEl.textContent = data.resting_hr ?? '--';
    if (stressEl) {
      stressEl.textContent = data.stress ?? '--';
      stressEl.className = 'health-value' + this.scoreClass(data.stress, 50, 75, true); // inverted: lower is better
    }
  },

  renderWorkout(data) {
    const typeEl = document.getElementById('h-workout-type');
    const descEl = document.getElementById('h-workout-desc');
    const durEl = document.getElementById('h-workout-duration');
    const intEl = document.getElementById('h-workout-intensity');
    const reasonEl = document.getElementById('h-workout-reason');
    const card = document.getElementById('health-workout-card');

    if (typeEl) typeEl.textContent = data.workout_type || 'Unknown';
    if (descEl) descEl.textContent = data.description || 'No description';
    if (durEl) durEl.textContent = `${data.duration_minutes || '--'} min`;
    if (intEl) intEl.textContent = (data.intensity || '--').toUpperCase();
    if (reasonEl) reasonEl.textContent = data.reasoning || '';

    if (card) {
      card.className = 'health-workout' + (data.workout_type === 'rest' ? ' rest-day' : '');
    }
  },

  renderNoWorkout() {
    const typeEl = document.getElementById('h-workout-type');
    const descEl = document.getElementById('h-workout-desc');
    if (typeEl) typeEl.textContent = 'Not Generated';
    if (descEl) descEl.textContent = 'Click "Fetch Garmin" to generate today\\'s workout.';
  },

  scoreClass(value, warnThreshold, goodThreshold, invert = false) {
    if (value == null) return '';
    const num = parseInt(value);
    if (isNaN(num)) return '';
    
    if (invert) {
      if (num >= warnThreshold) return ' danger';
      if (num >= goodThreshold) return ' warning';
      return '';
    }
    
    if (num < warnThreshold) return ' danger';
    if (num < goodThreshold) return ' warning';
    return '';
  },

  async refreshFromGarmin() {
    this.showLoading();
    try {
      const res = await fetch(`${API_BASE}/health/refresh`, { method: 'POST' });
      const data = await res.json();
      
      if (data.status === 'success') {
        await this.loadData();
      } else {
        alert('Refresh failed: ' + (data.message || 'Unknown error'));
        this.showError();
      }
    } catch (err) {
      console.error('Refresh error:', err);
      alert('Failed to refresh. Make sure GARMIN_EMAIL and GARMIN_PASSWORD are set in ~/.zshrc');
      this.showError();
    }
  },

  showSetup() {
    alert('To set up health tracking:\\n\\n1. Set GARMIN_EMAIL and GARMIN_PASSWORD in ~/.zshrc\\n2. Run: jarvis-daily\\n3. Refresh this panel');
  },

  showLoading() {
    document.getElementById('health-loading').style.display = 'block';
    document.getElementById('health-metrics').style.display = 'none';
    document.getElementById('health-error').style.display = 'none';
  },

  showMetrics() {
    document.getElementById('health-loading').style.display = 'none';
    document.getElementById('health-metrics').style.display = 'block';
    document.getElementById('health-error').style.display = 'none';
    
    const now = new Date();
    document.getElementById('health-last-updated').textContent = 
      `Updated ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  },

  showError() {
    document.getElementById('health-loading').style.display = 'none';
    document.getElementById('health-metrics').style.display = 'none';
    document.getElementById('health-error').style.display = 'block';
  }
};
