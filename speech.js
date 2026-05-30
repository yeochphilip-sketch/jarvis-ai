// ─── speech.js ────────────────────────────────────────────────────────────────
//  AudioContext-based TTS pipeline that drives both Jarvis's voice and the
//  orb animation. Falls back to browser SpeechSynthesis if Flask is unavailable.
//
//  Exports:
//    speak(text)      — main entry point; strips markdown, splits, plays in order
//    stopSpeaking()   — hard-cancels all audio and resets state
//
//  Internal call chain:
//    speak()
//      → fetchAudioBuffer()       [network: POST Flask /speak → AudioBuffer]
//      → playSentenceFromBuffer() [playback: Web Audio API + orb animation]
//          → driveOrbAnimation()  [visual: rAF loop that reads audio frequency]
//      → fallbackSpeak()          [fallback: browser SpeechSynthesis]
//
//  Amendment history:
//    D — Replaced SpeechSynthesisUtterance with AudioContext pipeline so the
//        orb can be driven by real frequency data. isSpeaking flag introduced
//        to fix the loop-break bug (old code checked CSS class between sentences).
//    G — speak() now sets orb state immediately (before first Flask fetch) and
//        pre-fetches the next sentence's audio while the current one plays,
//        eliminating both the initial lag and inter-sentence gaps.
//
//  Imported by: intent.js, recognition.js, main.js
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG             } from './config.js';
import { STATE              } from './state.js';
import { setOrbState        } from './orb.js';
import { showJarvisSentence, clearJarvisSentence } from './ui.js';
import { stopListening, startListening } from './recognition.js';

// ── AudioContext helper ───────────────────────────────────────────────────────

// getAudioContext() — lazy-initialises the shared AudioContext and resumes it
// if the browser suspended it (browsers require a user gesture before audio).
function getAudioContext() {
  if (!STATE.audioCtx) STATE.audioCtx = new AudioContext();
  if (STATE.audioCtx.state === 'suspended') STATE.audioCtx.resume();
  return STATE.audioCtx;
}

// [AMENDMENT G] Two key improvements over the original:
//   1. setOrbState('speaking') fires immediately — before any network call —
//      so the orb reacts the instant speech is triggered, not 300–600 ms later.
//   2. The next sentence's audio is fetched while the current one plays
//      (prefetchPromise), hiding Flask's response latency between sentences.
export async function speak(text) {
  stopSpeaking();
  stopListening(); 
  const cleaned = text.replace(/[*#`_~]/g, '').trim();
  if (!cleaned) return;

  // Split on sentence-ending punctuation followed by whitespace.
  // A response with no terminal punctuation is treated as one sentence.
  const sentences = cleaned
  .split(/(?<=[.!?])\s+|\n+/)
  .map(s => s.replace(/^[-•*\d]+[.)]\s*/, '').trim())
  .filter(Boolean);
  STATE.isSpeaking = true;

  // [AMENDMENT G — part 1] Orb reacts immediately, before the first fetch.
  setOrbState('speaking');

  // [AMENDMENT G — part 2] Pre-fetch sentence 0 so the first word plays
  // with no perceptible delay.
  let nextBuffer = await fetchAudioBuffer(sentences[0]);

  for (let i = 0; i < sentences.length; i++) {
    if (!STATE.isSpeaking) break;

    const prefetchPromise = (i + 1 < sentences.length)
      ? fetchAudioBuffer(sentences[i + 1])
      : Promise.resolve(null);

    // Show current sentence in subtitle display
    showJarvisSentence(sentences[i]);

    await playSentenceFromBuffer(nextBuffer, sentences[i]);

    nextBuffer = await prefetchPromise;

    if (i < sentences.length - 1 && STATE.isSpeaking) {
      setOrbState('idle');
      await new Promise(r => setTimeout(r, CONFIG.sentencePauseMs));
      if (STATE.isSpeaking) setOrbState('speaking');
    }
  }

  clearJarvisSentence();
  // Delay mic restart to prevent Jarvis hearing its own voice tail
  setTimeout(() => startListening(), 2500);
  if (STATE.isSpeaking) stopSpeaking();
}


// ── Pipeline steps ────────────────────────────────────────────────────────────

// fetchAudioBuffer() — [AMENDMENT G] network-only step.
// POSTs a sentence to Flask /speak and returns a decoded AudioBuffer.
// Returns null if the server is unreachable or returns an error — the caller
// (playSentenceFromBuffer) will fall back to browser SpeechSynthesis.
async function fetchAudioBuffer(sentence) {
  try {
    const response = await fetch(`${CONFIG.flaskUrl}/speak`, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({ text: sentence }),
    });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return await getAudioContext().decodeAudioData(arrayBuffer);
  } catch {
    return null; // network error — playSentenceFromBuffer will use fallback
  }
}

// playSentenceFromBuffer() — [AMENDMENT G] playback-only step.
// Accepts a pre-decoded AudioBuffer (or null to trigger the fallback).
// Wires the source through an AnalyserNode and reads frequency data
// in a rAF loop to scale the orb in real time.
// Resolves when the audio clip finishes playing.
async function playSentenceFromBuffer(audioBuffer, sentence) {
  return new Promise((resolve) => {
    // null buffer means Flask was unavailable — fall back to browser TTS.
    if (!audioBuffer) {
      fallbackSpeak(sentence, resolve);
      return;
    }

    const ctx      = getAudioContext();
    const source   = ctx.createBufferSource();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = CONFIG.analyser.fftSize;

    source.buffer = audioBuffer;
    source.connect(analyser);      // audio → analyser (for orb data)
    analyser.connect(ctx.destination); // analyser → speakers

    STATE.currentSource = source;
    driveOrbAnimation(analyser); // start the rAF scale loop

    source.onended = () => {
      stopOrbAnimation();
      const orb = document.querySelector('.orb');
      if (orb) orb.style.transform = 'scale(1)'; // reset orb to natural size
      resolve();
    };

    source.start();
  });
}

// driveOrbAnimation() — reads low-frequency energy from an AnalyserNode
// in a requestAnimationFrame loop and scales the .orb-core element so it
// physically pulses in sync with Jarvis's voice.
function driveOrbAnimation(analyser) {
  const orb       = document.querySelector('.orb-core');
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  let   active    = true;

  function tick() {
    if (!active) {
      if (orb) orb.style.transform = 'scale(1)';
      STATE.speakAnimFrame = null;
      return;
    }
    analyser.getByteFrequencyData(dataArray);
    const slice = dataArray.slice(0, 12);
    const avg   = slice.reduce((a, b) => a + b, 0) / slice.length;
    const scale = 1 + (avg / 255) * 0.35;
    if (orb) orb.style.transform = `scale(${scale})`;
    STATE.speakAnimFrame = requestAnimationFrame(tick);
  }

  // Store reference to stop function on global state
  STATE.stopOrbAnimation = () => { active = false; };
  tick();
}

// stopOrbAnimation() — cleanly stops the orb animation loop.
function stopOrbAnimation() {
  if (STATE.stopOrbAnimation) {
    STATE.stopOrbAnimation();
    STATE.stopOrbAnimation = null;
  }
  if (STATE.speakAnimFrame) {
    cancelAnimationFrame(STATE.speakAnimFrame);
    STATE.speakAnimFrame = null;
  }
}

// fallbackSpeak() — [AMENDMENT D] used when Flask /speak is down.
// Speaks via the browser's built-in SpeechSynthesis API using the voice
// settings from CONFIG so character is preserved without the server.
function fallbackSpeak(sentence, resolve) {
  const utt   = new SpeechSynthesisUtterance(sentence);
  utt.pitch   = CONFIG.voice.pitch;
  utt.rate    = CONFIG.voice.rate;
  utt.onend   = resolve;
  utt.onerror = resolve; // always resolve so the sentence chain continues
  window.speechSynthesis.speak(utt);
}


// ── Cleanup ───────────────────────────────────────────────────────────────────

// stopSpeaking() — hard-cancels all audio output and resets all related state.
// Called by: speak() on natural completion, sendMessage() on new input,
//            startListening() when mic opens, error handlers.
export function stopSpeaking() {
  STATE.isSpeaking = false; // [AMENDMENT D] signals the speak() loop to break

  stopOrbAnimation();

  if (STATE.currentSource) {
    try { STATE.currentSource.stop(); } catch {}
    STATE.currentSource = null;
  }

  // Reset orb scale in case the animation loop left it stretched.
  const orb = document.querySelector('.orb');
  if (orb) orb.style.transform = 'scale(1)';

  // Cancel any in-progress fallback SpeechSynthesis sentence.
  window.speechSynthesis.cancel();

  setOrbState('idle');
  startListening();
}

// [AMENDMENT D] Chrome bug workaround: speechSynthesis silently pauses after
// ~15 seconds of continuous speech. Calling resume() periodically keeps it alive.
setInterval(() => {
  if (window.speechSynthesis.speaking) window.speechSynthesis.resume();
}, CONFIG.synthKeepAliveMs);