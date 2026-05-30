// ─── memory.js ────────────────────────────────────────────────────────────────
//  localStorage-backed fact store for Jarvis's persistent memory.
//
//  Exports:
//    getMemories()              — returns the current memory array
//    addMemory(fact)            — adds a fact; returns true if new, false if duplicate
//    removeMemory(fact)         — removes a fact by value
//    handleMemoryCommands(text) — parses REMEMBER:/FORGET: from Llama replies
//    renderMemories()           — re-renders the memory panel in the UI
//
//  Design note:
//    Pure data functions (get/save/add/remove) have no UI side effects.
//    renderMemories() is the single function that owns the memory panel DOM.
//    handleMemoryCommands() bridges data and UI — it mutates state AND returns
//    a human-readable string for the chat bubble.
//
//  Imported by: llama.js, main.js
// ─────────────────────────────────────────────────────────────────────────────

import { DOM } from './dom.js';

const STORAGE_KEY = 'jarvis-memories';


// ── Data layer ────────────────────────────────────────────────────────────────

export function getMemories() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveMemories(memories) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
}

// addMemory() — adds a fact if it isn't already stored (case-insensitive check).
// Returns true if the fact was new and added, false if it was a duplicate.
export function addMemory(fact) {
  const memories   = getMemories();
  const normalized = fact.trim().toLowerCase();
  if (memories.some(m => m.toLowerCase() === normalized)) return false;
  memories.push(fact.trim());
  saveMemories(memories);
  renderMemories();
  return true;
}

// removeMemory() — removes a fact by value (case-insensitive match).
export function removeMemory(fact) {
  const memories = getMemories();
  saveMemories(memories.filter(m => m.toLowerCase() !== fact.trim().toLowerCase()));
  renderMemories();
}


// ── Command parser ────────────────────────────────────────────────────────────

// handleMemoryCommands() — called on every Llama reply.
// If Llama returned a REMEMBER: or FORGET: command, executes it and returns
// a human-readable confirmation string for the chat bubble.
// Returns null if the text is a normal reply (no action taken).
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

// renderMemories() — fully re-renders the memory panel.
// Called after any add/remove so the panel stays in sync with localStorage.
export function renderMemories() {
  const memories = getMemories();
  DOM.memoryCount.textContent = memories.length;

  // Clear existing items (keep the static empty-state element).
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
// Sends the last few exchanges to Llama silently and saves extracted facts
// to the Flask SQLite backend. Fire-and-forget — never blocks the response.
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
    const response = await fetch('http://localhost:11434/api/chat', {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({
        model    : 'llama3.2',
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
    const cleaned = content.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);

    if (!parsed.facts || parsed.facts.length === 0) return;

    // Save to Flask SQLite backend
    await fetch('http://localhost:5001/memory/save', {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({ facts: parsed.facts }),
    });

  } catch (err) {
    console.warn('[memory] Extraction failed silently:', err);
  }
}


// ── loadServerMemories() ──────────────────────────────────────────────────────
// Fetches stored memories from Flask on init.
// Returns a formatted string ready to inject into the system prompt.
export async function loadServerMemories() {
  try {
    const response = await fetch('http://localhost:5001/memory/load');
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