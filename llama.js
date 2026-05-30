// ─── llama.js ─────────────────────────────────────────────────────────────────
//  Everything that talks to the Ollama API.
//
//  Exports:
//    buildSystemPrompt()         — builds the system message for each turn
//    streamLlamaResponse(bubble) — streams a response into a chat bubble element
//                                  returns the full text when the stream closes
//
//  Design note:
//    streamLlamaResponse() was extracted from sendMessage() so that function
//    stays thin. The streaming reader loop is complex enough to live alone,
//    and isolating it here means Llama can be swapped for another model or
//    API without touching any other file.
//
//  Imported by: main.js
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG      } from './config.js';
import { STATE       } from './state.js';
import { getMemories, extractAndSaveMemory } from './memory.js';
import { UI          } from './ui.js';


// buildSystemPrompt() — constructs the system message sent to Ollama each turn.
// Injects any stored memories so Jarvis recalls facts about the user.
export function buildSystemPrompt() {
  const memories = getMemories();

  let prompt = 'You are Jarvis, a sharp, capable personal AI assistant. '
           + 'You are direct, intelligent, and slightly dry in tone. '
           + 'Never use filler phrases. '
           + 'Keep responses concise since they will be read aloud. '
           + 'Never use bullet points, dashes, or numbered lists. '
           + 'Always respond in flowing prose sentences only.';
    // FIXED
  const serverMemories = STATE.serverMemories;
  if (serverMemories && serverMemories.trim().length > 0) {
      prompt += '\n\nThings Jarvis has observed about the user over time:\n';
      prompt += serverMemories;
  }

  if (memories.length > 0) {
    prompt += '\n\nThings you must remember about the user:\n';
    memories.forEach(m => { prompt += `- ${m}\n`; });
  }

  // Instruct Llama to signal memory operations with exact prefixes so
  // handleMemoryCommands() in memory.js can parse them reliably.
  prompt += '\n\nIf the user says "remember that [fact]", respond with exactly: REMEMBER:[fact]';
  prompt += '\nIf the user says "forget that [fact]", respond with exactly: FORGET:[fact]';
  prompt += '\nOtherwise respond normally.';

  return prompt;
}


// streamLlamaResponse() — sends the full conversation to Ollama with stream:true
// and pipes each token into the provided bubble element as it arrives.
//
// Parameters:
//   bubble — a DOM element whose .textContent is updated live during streaming
//
// Returns:  the complete response string once the stream closes
// Throws:   on HTTP errors or network failures (caught by sendMessage in main.js)
export async function streamLlamaResponse(bubble) {
  const response = await fetch(CONFIG.ollamaUrl, {
    method  : 'POST',
    headers : { 'Content-Type': 'application/json' },
    body    : JSON.stringify({
      model    : CONFIG.model,
      stream   : true,
      messages : [
        { role: 'system', content: buildSystemPrompt() },
        ...STATE.history.slice(-10),
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Ollama API error');
  }

  const reader   = response.body.getReader();
  const decoder  = new TextDecoder();
  let   fullText = '';

  // Ollama sends newline-delimited JSON objects. Each chunk may contain
  // multiple lines, or a line may be split across chunks — so we decode
  // and split on '\n' rather than treating each chunk as one object.
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    for (const line of decoder.decode(value).split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.message?.content) {
          fullText           += parsed.message.content;
          bubble.textContent  = fullText;
          UI.scrollToBottom();
        }
      } catch { /* partial JSON line — skip and wait for the next chunk */ }
    }
  }
  // Fire-and-forget memory extraction — does not block the response
  const slice = STATE.history.slice(-6); // last 3 exchanges
  extractAndSaveMemory(slice);
  return fullText;
}