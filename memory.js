// ─── memory.js ────────────────────────────────────────────────────────────────
import { CONFIG } from './config.js';
import { DOM    } from './dom.js';

const STORAGE_KEY = 'jarvis-memories';

// ── Data layer ────────────────────────────────────────────────────────────────

export function getMemories() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveMemories(memories) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
}

export function addMemory(fact) {
  const memories   = getMemories();
  const normalized = fact.trim().toLowerCase();
  if (memories.some(m => m.toLowerCase() === normalized)) return false;
  memories.push(fact.trim());
  saveMemories(memories);
  renderMemories();
  return true;
}

export function removeMemory(fact) {
  const memories = getMemories();
  saveMemories(memories.filter(m => m.toLowerCase() !== fact.trim().toLowerCase()));
  renderMemories();
}

// ── Command parser ────────────────────────────────────────────────────────────

export function handleMemoryCommands(text) {
  if (text.startsWith('REMEMBER:')) {
    const fact  = text.slice(9).trim();
    const added = addMemory(fact);
    return added
      ? `Got it. I will remember that ${fact}.`
      : `I already know that ${fact}.`;
  }
  if (text.startsWith('FORGET:')) {
    const fact = text.slice(7).trim();
    removeMemory(fact);
    return `Done. I have forgotten that ${fact}.`;
  }
  return null;
}

// ── UI renderer ───────────────────────────────────────────────────────────────

export function renderMemories() {
  const memories = getMemories();
  DOM.memoryCount.textContent = memories.length;

  DOM.memoryList.querySelectorAll('.memory-item').forEach(el => el.remove());

  if (memories.length === 0) {
    DOM.memoryEmpty.style.display = 'block';
    return;
  }
  DOM.memoryEmpty.style.display = 'none';

  memories.forEach(fact => {
    const item = document.createElement('div');
    item.className = 'memory-item';

    const span = document.createElement('span');
    span.textContent = fact;

    const del = document.createElement('button');
    del.className   = 'memory-delete';
    del.textContent = '×';
    del.addEventListener('click', () => removeMemory(fact));

    item.appendChild(span);
    item.appendChild(del);
    DOM.memoryList.appendChild(item);
  });
}

// ── extractAndSaveMemory() ────────────────────────────────────────────────────

export async function extractAndSaveMemory(conversationSlice) {
  if (!conversationSlice || conversationSlice.length === 0) return;

  const extractionPrompt = `You are a memory extraction system for a personal AI assistant.
Analyse the conversation below and extract factual things you learned about the USER only.
Do not extract things Jarvis said. Do not extract questions. Only extract clear facts.

Respond ONLY with valid JSON. No explanation. No markdown.
If nothing useful was learned, respond with: {"facts": []}

Valid categories: preference, routine, identity, goal, skill, location, relationship, health, work

Example output:
{"facts": [
  {"category": "preference", "fact": "prefers dark mode interfaces"},
  {"category": "work",       "fact": "studies computer science"},
  {"category": "routine",    "fact": "works late at night"}
]}`;

  try {
    const response = await fetch(CONFIG.ollamaUrl, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({
        model    : CONFIG.model,
        stream   : false,
        messages : [
          { role: 'system', content: extractionPrompt },
          ...conversationSlice,
          { role: 'user', content: 'Extract facts about the user from the conversation above.' }
        ],
      }),
    });

    if (!response.ok) return;

    const data    = await response.json();
    const content = data.message?.content?.trim() ?? '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.facts || parsed.facts.length === 0) return;

    // FIX: use CONFIG.flaskUrl instead of hardcoded http://
    await fetch(`${CONFIG.flaskUrl}/memory/save`, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({ facts: parsed.facts }),
    });

  } catch (err) {
    console.warn('[memory] Extraction failed silently:', err);
  }
}

// ── loadServerMemories() ──────────────────────────────────────────────────────

export async function loadServerMemories() {
  try {
    // FIX: use CONFIG.flaskUrl instead of hardcoded http://
    const response = await fetch(`${CONFIG.flaskUrl}/memory/load`);
    if (!response.ok) return '';
    const data = await response.json();
    if (!data.facts || data.facts.length === 0) return '';
    return data.facts
      .map(f => `[${f.category}] ${f.fact}`)
      .join('\n');
  } catch {
    return '';
  }
}