const API_BASE = 'https://localhost:5001';

export const Health = {
  init() {
    setTimeout(() => {
      this.panel = document.getElementById('health-panel');
      this.btn = document.getElementById('health-toggle');
      this.closeBtn = document.getElementById('health-close');
      
      if (this.btn) this.btn.addEventListener('click', () => this.toggle());
      if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close());
    }, 100);
  },

  toggle() {
    if (!this.panel) return;
    this.panel.classList.toggle('open');
    if (this.panel.classList.contains('open')) this.loadData();
  },

  close() {
    if (this.panel) this.panel.classList.remove('open');
  },

  async refreshFromGarmin() {
    this.showLoading();
    try {
      const res = await fetch(API_BASE + '/health/refresh', {method: 'POST'});
      const data = await res.json();
      if (data.status === 'success') {
        await this.loadData();
      } else {
        this.showError('Refresh failed: ' + data.message);
      }
    } catch (err) {
      this.showError('Refresh error: ' + err.message);
    }
  },

  async loadData() {
    this.showLoading();
    console.log('[Health] fetching...');
    
    try {
      const [healthRes, workoutRes, scheduleRes] = await Promise.all([
        fetch(API_BASE + '/health/today'),
        fetch(API_BASE + '/workout/today'),
        fetch(API_BASE + '/calendar/weekly').catch(() => null)
      ]);
      
      const healthData = healthRes.ok ? await healthRes.json() : null;
      const workoutData = workoutRes.ok ? await workoutRes.json() : null;
      
      const [healthRes, workoutRes, scheduleRes] = await Promise.all([
      fetch(API_BASE + '/health/today'),
      fetch(API_BASE + '/workout/today'),
      fetch(API_BASE + '/calendar/weekly').catch(() => null)
      ]);

      console.log('[Health] health:', healthData);
      console.log('[Health] workout:', workoutData);
      
      if (healthData && !healthData.error) {
        this.renderHealth(healthData);
      }
      
      if (workoutData && !workoutData.error) {
        this.renderWorkout(workoutData);
      } else {
        this.renderNoWorkout();
      }
      
      if (scheduleRes && scheduleRes.ok) {
        const scheduleData = await scheduleRes.json();
        this.renderSchedule(scheduleData);
      }
      this.showMetrics();
      
    } catch (err) {
      console.error('[Health] error:', err);
      this.showError('Failed to load data');
    }
  },

  renderHealth(data) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val ?? '--';
    };
    set('h-sleep', data.sleep_score);
    set('h-battery', data.body_battery);
    set('h-hr', data.resting_hr);
    set('h-stress', data.stress);
  },

  renderWorkout(data) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val ?? '--';
    };
    set('h-workout-type', data.workout_type);
    set('h-workout-desc', data.description);
    set('h-workout-duration', (data.duration_minutes ?? '--') + ' min');
    set('h-workout-intensity', data.intensity);
    set('h-workout-reason', data.reasoning);
    
    const card = document.getElementById('health-workout-card');
    if (card) {
      card.className = 'health-workout' + (data.workout_type === 'rest' ? ' rest-day' : '');
    }
  },

  renderSchedule(data) {
  const renderWeek = (events, containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!events || events.length === 0) {
      container.innerHTML = '<div class="schedule-empty">No events</div>';
      return;
    }
    
    container.innerHTML = events.map(e => {
      const date = new Date(e.start);
      const dateStr = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
      const timeStr = e.start.includes('T') ? date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      }) : '';
      
      return `
        <div class="schedule-event">
          <div class="schedule-event-title">${e.title}</div>
          <div class="schedule-event-time">${dateStr}${timeStr ? ' · ' + timeStr : ''}</div>
          ${e.location ? `<div class="schedule-event-location">📍 ${e.location}</div>` : ''}
        </div>
      `;
      }).join('');
    };
    
    renderWeek(data.this_week, 'schedule-this-week');
    renderWeek(data.next_week, 'schedule-next-week');
  }
  renderNoWorkout() {
    const type = document.getElementById('h-workout-type');
    const desc = document.getElementById('h-workout-desc');
    if (type) type.textContent = 'Not Generated';
    if (desc) desc.textContent = 'Run workout_coach.py to generate';
  },

  showLoading() {
    const l = document.getElementById('health-loading');
    const m = document.getElementById('health-metrics');
    const e = document.getElementById('health-error');
    if (l) l.style.display = 'block';
    if (m) m.style.display = 'none';
    if (e) e.style.display = 'none';
  },

  showMetrics() {
    const l = document.getElementById('health-loading');
    const m = document.getElementById('health-metrics');
    const e = document.getElementById('health-error');
    if (l) l.style.display = 'none';
    if (m) m.style.display = 'block';
    if (e) e.style.display = 'none';
  },

  showError(msg) {
    const l = document.getElementById('health-loading');
    const m = document.getElementById('health-metrics');
    const e = document.getElementById('health-error');
    if (l) l.style.display = 'none';
    if (m) m.style.display = 'none';
    if (e) {
      e.style.display = 'block';
      const p = e.querySelector('p');
      if (p) p.textContent = msg;
    }
  }
};
