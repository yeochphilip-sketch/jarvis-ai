// ─── state.js ─────────────────────────────────────────────────────────────────
//  Single source of truth for all runtime state.
//  Read:  STATE.foo
//  Write: STATE.foo = bar
//
//  Nothing outside this file should declare its own mutable variables for
//  these concerns. If you find yourself adding a new `let` in another file,
//  consider whether it belongs here instead.
//
//  Imported by: orb.js, speech.js, recognition.js, intent.js, llama.js, main.js
// ─────────────────────────────────────────────────────────────────────────────

export const STATE = {

  // ── Conversation ────────────────────────────────────────────────────────────
  history     : [],     // [{role, content}, ...] — full history sent to Ollama
  isStreaming : false,  // true while a Llama response is actively streaming
  // ── Speech output [AMENDMENT D] ─────────────────────────────────────────────
  // AudioContext pipeline that drives both TTS and the orb animation.
  isSpeaking     : false,  // true for the entire multi-sentence speak() run
  audioCtx       : null,   // shared AudioContext — created once, reused
  currentSource  : null,   // the BufferSource node currently playing
  speakAnimFrame : null,   // requestAnimationFrame handle for orb scale loop

  // ── Speech input [AMENDMENT E] ──────────────────────────────────────────────
  recognition : null,   // SpeechRecognition instance (set by initSpeechRecognition)
  isListening : false,  // true while the mic is open
  serverMemories : '',   
  pendingEmails: [],
};
window._STATE = STATE;