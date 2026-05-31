// ─── recognition.js ───────────────────────────────────────────────────────────
import { CONFIG       } from './config.js';
import { STATE        } from './state.js';
import { DOM          } from './dom.js';
import { stopSpeaking } from './speech.js';

let sendMessageFn  = null;
let mediaRecorder  = null;
let audioStream    = null;
let restartTimeout = null;
let isRecording    = false;
let silenceTimer   = null;

const SILENCE_MS   = 2000;  // stop after 2 s of silence (via AudioContext energy)
const MIN_RECORD_MS = 400;  // ignore blips shorter than this
let   recordStart  = 0;

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initSpeechRecognition(sendMessage) {
  sendMessageFn = sendMessage;
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    console.warn('[recognition] Mic access denied:', e);
    return;
  }
  startListening();
}

// ── Start / stop ──────────────────────────────────────────────────────────────

export function startListening() {
  if (isRecording)        return;
  if (STATE.isSpeaking)   return;
  if (STATE.isStreaming)   return;
  if (!audioStream)       return;

  const chunks = [];
  mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });

  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    isRecording = false;
    STATE.isListening = false;
    const duration = Date.now() - recordStart;
    if (duration < MIN_RECORD_MS) {
      scheduleRestart();
      return;
    }
    const blob = new Blob(chunks, { type: 'audio/webm' });
    await transcribeAndSend(blob);
  };

  mediaRecorder.start();
  isRecording       = true;
  STATE.isListening = true;
  recordStart       = Date.now();

  startSilenceDetection();
}

export function stopListening() {
  clearTimeout(restartTimeout);
  clearTimeout(silenceTimer);
  restartTimeout = null;
  silenceTimer   = null;
  if (mediaRecorder && isRecording) {
    try { mediaRecorder.stop(); } catch {}
  }
  isRecording       = false;
  STATE.isListening = false;
}

// ── Silence detection ─────────────────────────────────────────────────────────
// Uses a separate AudioContext analyser to detect when the user has stopped
// speaking, then stops the recorder automatically.

function startSilenceDetection() {
  clearTimeout(silenceTimer);
  const ctx      = new AudioContext();
  const source   = ctx.createMediaStreamSource(audioStream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);

  function check() {
    if (!isRecording) { ctx.close(); return; }
    analyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;

    if (avg < 40) {
      // Silence — schedule a stop if not already pending
      if (!silenceTimer) {
        silenceTimer = setTimeout(() => {
          if (isRecording && !STATE.isSpeaking) {
            mediaRecorder.stop();
          }
        }, SILENCE_MS);
      }
    } else {
      // Voice detected — cancel any pending silence stop
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    requestAnimationFrame(check);
  }
  check();
}

function isValidTranscript(text) {
  // Reject if more than 30% non-ASCII characters (catches CJK hallucinations)
  const nonAscii = (text.match(/[^\x00-\x7F]/g) || []).length;
  if (nonAscii / text.length > 0.3) return false;
  // Reject repetitive tokens like "1.5% 1.5% 1.5%"
  const words = text.trim().split(/\s+/);
  if (words.length >= 3) {
    const unique = new Set(words);
    if (unique.size / words.length < 0.4) return false;
  }
  return true;
}

// ── Transcription ─────────────────────────────────────────────────────────────

async function transcribeAndSend(blob) {
  try {
    const form = new FormData();
    form.append('audio', blob, 'recording.webm');

    const res = await fetch(`${CONFIG.flaskUrl}/transcribe`, {
      method: 'POST',
      body  : form,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { transcript } = await res.json();

    if (transcript && transcript.length > 1 && isValidTranscript(transcript)) {
      DOM.input.value = transcript;
      sendMessageFn();
      return; // don't restart — sendMessage triggers startListening when done
    }
  } catch (e) {
    console.warn('[recognition] Whisper error:', e);
  }
  scheduleRestart();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scheduleRestart() {
  clearTimeout(restartTimeout);
  if (STATE.isSpeaking || STATE.isStreaming) return;
  restartTimeout = setTimeout(() => startListening(), 500);
}