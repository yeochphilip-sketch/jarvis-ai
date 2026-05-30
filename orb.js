// ─── orb.js ───────────────────────────────────────────────────────────────────
//  Everything that drives the visual orb and its starfield background.
//
//  Exports:
//    setOrbState(state)          — switches orb CSS class + status label
//
//  Amendment history:
//    B — setOrbState() added (single source of truth for orb visuals)
//    D — driveOrbFromAnalyser() added (real waveform drives orb scale)
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG } from './config.js';
import { STATE  } from './state.js';
import { DOM    } from './dom.js';


// setOrbState() — [AMENDMENT B]
// The only place that adds/removes orb CSS classes and sets the status label.
// CSS keyframes in style.css respond to .speaking and .listening on orbWrapper.
//
// Valid states: 'idle' | 'thinking' | 'speaking' | 'listening'
export function setOrbState(state) {
  DOM.orbWrapper.classList.remove('speaking', 'listening');

  switch (state) {
    case 'speaking':
      DOM.orbWrapper.classList.add('speaking');
      DOM.orbStatus.textContent = 'SPEAKING';
      break;
    case 'listening':
      DOM.orbWrapper.classList.add('listening');
      DOM.orbStatus.textContent = 'LISTENING';
      break;
    case 'thinking':
      // No extra CSS class — idle pulse continues, only the label changes.
      DOM.orbStatus.textContent = 'THINKING';
      break;
    default: // 'idle'
      DOM.orbStatus.textContent = 'IDLE';
  }
}

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Deep navy-to-purple gradient — the Jarvis "space" backdrop.
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0,   'rgba(7,9,26,0.6)');
    grad.addColorStop(0.6, 'rgba(13,10,31,0.6)');
    grad.addColorStop(1,   'rgba(19,8,32,0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    stars.forEach(s => {
      s.alpha += s.speed * s.dir;
      if (s.alpha >= 1 || s.alpha <= 0.1) s.dir *= -1; // reverse twinkle at limits
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }
