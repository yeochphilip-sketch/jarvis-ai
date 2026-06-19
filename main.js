// ─── main.js ──────────────────────────────────────────────────────────────────
//  Entry point. Thin orchestration layer only — no business logic lives here.
//  Wires together all other modules and owns the event listeners.
//
//  Responsibilities:
//    • sendMessage()    — routes input to intent or Llama, delegates everything
//    • setInputLocked() — enables/disables input controls as a group
//    • sendSuggestion() — exposed on window for inline HTML onclick attributes
//    • init listener    — modal dismiss, orb activation, speech recognition start
//    • all addEventListener() calls
//
//  Import map (what each module provides to this file):
//    config.js      → CONFIG (URLs, model, tuning values)  ← used by deliverMorningBriefing
//    state.js       → STATE  (all mutable runtime state)
//    dom.js         → DOM    (all element references)
//    orb.js         → setOrbState()
//    memory.js      → handleMemoryCommands(), renderMemories()
//    llama.js       → streamLlamaResponse()
//    intent.js      → detectIntent(), executeIntent()
//    speech.js      → speak(), stopSpeaking()
//    recognition.js → initSpeechRecognition(), startListening(), stopListening()
//    ui.js          → UI (addMessage, addThinking, addMemoryNote, scrollToBottom)
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG                            } from './config.js';
import { STATE                             } from './state.js';
import { DOM                               } from './dom.js';
import { setOrbState                       } from './orb.js';
import { handleMemoryCommands,
         renderMemories, loadServerMemories} from './memory.js';
import { streamLlamaResponse               } from './llama.js';
import { detectIntent, executeIntent, classifyWithLlama     } from './intent.js';
import { speak, stopSpeaking               } from './speech.js';
import { initSpeechRecognition,
         startListening, stopListening     } from './recognition.js';
import { UI, showUserLine, clearUserLine   } from './ui.js';
import { Health } from './health.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function setInputLocked(locked) {
  DOM.sendBtn.disabled = locked;
  DOM.micBtn.disabled  = locked;
  STATE.isStreaming     = locked;
}

// ── Morning briefing ──────────────────────────────────────────────────────────

// deliverMorningBriefing() — fetches real data from Flask and asks Llama to
// compose a natural briefing. Called automatically on init and on demand.
// Errors are shown in the chat so they are never swallowed silently.
async function deliverMorningBriefing() {
  setOrbState('thinking');
  try {
        const [timeRes, calRes, countRes, weatherRes] = await Promise.all([
      fetch(`${CONFIG.flaskUrl}/datetime`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      }),
      fetch(`${CONFIG.flaskUrl}/calendar/upcoming`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: '1' })
      }),
      fetch(`${CONFIG.flaskUrl}/gmail/count`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      }),
      fetch(`${CONFIG.flaskUrl}/weather`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'Singapore' })
      }),
    ]);

    const timeData    = await timeRes.json();
    const calData     = await calRes.json();
    const countData   = await countRes.json();
    const weatherData = await weatherRes.json();
    const timeStr    = timeData.result    ?? 'unknown time';
    const calStr     = calData.result     ?? 'No events today';
    const countStr   = countData.result   ?? 'Unknown email count';
    const weatherStr = weatherData.result ?? 'Weather unavailable';

    // Isolated messages array — never touches STATE.history
    // so Llama cannot hallucinate from previous conversation
    const briefingRes = await fetch(CONFIG.ollamaUrl, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        model  : CONFIG.model,
        stream : false,
        messages: [
          {
            role   : 'system',
            content: 'You are Jarvis, a sharp personal AI assistant. Compose a natural, concise morning briefing in 2 to 3 sentences using ONLY the information provided below. Do not invent or infer any emails, events, or other details beyond what is given. No bullet points. No filler phrases. Address the user directly.'
          },
          {
            role   : 'user',
            content: `Time: ${timeStr}\nCalendar: ${calStr}\nEmail: ${countStr}\nWeather: ${weatherStr}`
          }
        ]
      })
    });

    if (!briefingRes.ok) throw new Error(`Ollama returned ${briefingRes.status}`);

    const briefingData = await briefingRes.json();
    const briefing     = briefingData.message?.content?.trim()
                      ?? `Good morning. ${timeStr}. ${calStr}. ${countStr}.`;

    setOrbState('idle');
    UI.addMessage('assistant', briefing);
    speak(briefing);

  } catch (err) {
    // Visible error in chat — never silently swallowed
    setOrbState('idle');
    const msg = `Morning briefing failed: ${err.message}. Check that the Flask server is running on port 5001.`;
    UI.addMessage('assistant', msg);
    console.error('[briefing]', err);
  }
}

// ── Core conversation loop ────────────────────────────────────────────────────

async function sendMessage() {
  const text = DOM.input.value.trim();
  if (!text || STATE.isStreaming) return;

  const tLower = text.trim().toLowerCase();

  // ── Chat panel voice/text commands ────────────────────────────────────────
  if (['show chat', 'open chat', 'show chat log', 'open chat log'].includes(tLower)) {
    DOM.chatPanel.classList.add('open');
    setInputLocked(false);
    DOM.input.value = '';
    DOM.input.focus();
    return;
  }
  if (['hide chat', 'close chat', 'hide chat log', 'close chat log'].includes(tLower)) {
    DOM.chatPanel.classList.remove('open');
    setInputLocked(false);
    DOM.input.value = '';
    DOM.input.focus();
    return;
  }

  // ── Briefing shortcut — intercepted before Llama ever sees the message ────
  // Without this, "brief me" reaches Llama which hallucinates inbox contents
  // instead of calling the function that fetches real data from Flask.
  const briefingPhrases = [
    'brief me', 'morning briefing', 'give me a briefing',
    'good morning', 'good morning jarvis', "what's my morning briefing",
    'what is my morning briefing', 'start my day', 'daily briefing',
    'news briefing',
  ];
  if (briefingPhrases.includes(tLower)) {
    stopSpeaking();
    DOM.input.value        = '';
    DOM.input.style.height = 'auto';
    UI.addMessage('user', text);
    showUserLine(text);
    await deliverMorningBriefing();
    return;
  }

  stopSpeaking();
  DOM.input.value        = '';
  DOM.input.style.height = 'auto';
  setInputLocked(true);
  UI.addMessage('user', text);
  showUserLine(text);
  STATE.history.push({ role: 'user', content: text });

  // ── Step 1: regex (instant) ───────────────────────────────────────────────
  let intent = detectIntent(text);

  // ── Step 2: Llama classification (only if regex found nothing) ────────────
  if (!intent) {
    setOrbState('thinking');
    intent = await classifyWithLlama(text);
  }

  // ── Task path ─────────────────────────────────────────────────────────────
  if (intent) {
    setOrbState('thinking');
    const thinkingRow = UI.addThinking();
    thinkingRow.remove();
    await executeIntent(intent);
    setInputLocked(false);
    DOM.input.focus();
    return;
  }

  // ── Conversation path ─────────────────────────────────────────────────────
  setOrbState('thinking');
  const thinkingRow = UI.addThinking();

  try {
    const bubble   = UI.addMessage('assistant', '');
    thinkingRow.remove();
    const fullText = await streamLlamaResponse(bubble);

    const memoryResult = handleMemoryCommands(fullText.trim());
    if (memoryResult) {
      bubble.textContent = memoryResult;
      STATE.history.push({ role: 'assistant', content: memoryResult });
      speak(memoryResult);
      UI.addMemoryNote(fullText.trim().startsWith('REMEMBER'));
    } else {
      STATE.history.push({ role: 'assistant', content: fullText });
      speak(fullText);
    }

  } catch (err) {
    thinkingRow.remove();
    UI.addMessage(
      'assistant',
      `Error: ${err.message}. Make sure Ollama is running with: OLLAMA_ORIGINS="*" ollama serve`
    );
    setOrbState('idle');
  }

  setInputLocked(false);
  DOM.input.focus();
}

window.sendSuggestion = function(btn) {
  DOM.input.value = btn.textContent;
  sendMessage();
};


// ── Event listeners ───────────────────────────────────────────────────────────

DOM.chatToggle.addEventListener('click', () => DOM.chatPanel.classList.toggle('open'));
DOM.chatClose.addEventListener('click',  () => DOM.chatPanel.classList.remove('open'));

DOM.micBtn.addEventListener('click', () => {
  if (STATE.isListening) stopListening();
  else                   startListening();
});

DOM.input.addEventListener('input', () => {
  DOM.input.style.height = 'auto';
  DOM.input.style.height = Math.min(DOM.input.scrollHeight, 120) + 'px';
});

DOM.input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!STATE.isStreaming) sendMessage();
  }
});

DOM.sendBtn.addEventListener('click', () => {
  if (!STATE.isStreaming) sendMessage();
});

// Modal dismiss — unlocks the UI and activates the orb
document.getElementById('key-submit').addEventListener('click', () => {
  DOM.modal.style.display    = 'none';
  DOM.input.disabled         = false;
  DOM.chatToggle.disabled    = false;
  DOM.statusDot.classList.remove('offline');
  DOM.statusText.textContent = 'online';
  STATE.history = [];        // clear any leftover history from a previous session
  setOrbState('idle');
  renderMemories();
  loadServerMemories().then(memories => {
    STATE.serverMemories = memories;
    // Auto-briefing fires once after memories are loaded
    setTimeout(deliverMorningBriefing, 3000);
  });
  DOM.input.focus();
  initSpeechRecognition(sendMessage);
});