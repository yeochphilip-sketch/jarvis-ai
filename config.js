// ─── config.js ────────────────────────────────────────────────────────────────
//  Every tunable value in Jarvis lives here.
//  To change the model, voice, orb behaviour, or server URLs — edit this file
//  only. Nothing else needs to change for these values.
//
//  Imported by: state.js, orb.js, speech.js, intent.js, llama.js, main.js
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG = {

  // ── Server endpoints ────────────────────────────────────────────────────────
  ollamaUrl : 'http://localhost:11434/api/chat',
  flaskUrl  : 'https://localhost:5001',
  model     : 'llama3.2',

  // ── Voice (SpeechSynthesis fallback) ────────────────────────────────────────
  // Used when the Flask /speak endpoint is unavailable.
  voice: {
    pitch : 0.5,   // 0 = lowest, 2 = highest  (default 1)
    rate  : 0.92,  // 0.1 = slowest, 10 = fastest (default 1)
  },

  // ── Audio analyser ──────────────────────────────────────────────────────────
  // Controls how strongly the orb pulses in response to Jarvis's voice.
  analyser: {
    fftSize      : 256,   // Web Audio FFT resolution
    freqBinCount : 12,    // how many low-freq bins to sample for the orb scale
    orbMaxScale  : 0.35,  // max extra scale on top of 1.0  (1.35 = 35% bigger)
  },

  // ── Timing ──────────────────────────────────────────────────────────────────
  sentencePauseMs  : 280,    // gap between spoken sentences (ms)
  synthKeepAliveMs : 10000,  // how often to ping speechSynthesis.resume() (ms)
                             // Chrome silently pauses synthesis after ~15 s

  // ── Starfield ───────────────────────────────────────────────────────────────
  starCount : 220,  // number of twinkling stars on the background canvas
};