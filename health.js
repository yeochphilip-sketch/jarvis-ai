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
  
  async loadData() {
    this.showLoading();
    console.log('[Health] fetching...');
    
    try {
      const res = await fetch(API_BASE + '/health/today');
      console.log('[Health] status:', res.status);
      
      if (!res.ok) {
        const text = await res.text();
        console.error('[Health] HTTP error:', res.status, text.substring(0, 100));
        this.showError('Server error: ' + res.status);
        return;
      }
      
      const data = await res.json();
      console.log('[Health] got data:', data);
      
      if (data.error) {
        this.showError(data.error);
        return;
      }
      
      this.render(data);
      this.showMetrics();
      
    } catch (err) {
      console.error('[Health] fetch error:', err);
      this.showError('Connection failed: ' + err.message);
    }
  },
  async loadTrends() {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  
  const trendData = await Promise.all(
    dates.map(date => fetch(`${API_BASE}/health/${date}`).catch(() => null))
  );
  
  // Render a simple SVG sparkline
  this.renderSparkline('sleep-trend', trendData.map(d => d?.sleep_score));
  }
  render(data) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val ?? '--';
    };
    set('h-sleep', data.sleep_score);
    set('h-battery', data.body_battery);
    set('h-hr', data.resting_hr);
    set('h-stress', data.stress);
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

  renderWorkout(data) {
  const typeEl = document.getElementById('h-workout-type');
  const card = document.getElementById('health-workout-card');
  
  if (typeEl) typeEl.textContent = data.workout_type;
  if (card) {
    card.className = 'health-workout';
    if (data.workout_type === 'rest') card.classList.add('rest-day');
    if (data.intensity === 'high') card.classList.add('high-intensity');
    }
  }
  if (data.sleep_score && data.sleep_score < 60) {
  new Notification("Jarvis", {
    body: "Sleep score is low today. Consider a rest day."
  });
  }
};

