// ─── intent.js ────────────────────────────────────────────────────────────────
import { CONFIG } from './config.js';
import { STATE  } from './state.js';
import { UI     } from './ui.js';
import { speak  } from './speech.js';


// ── Step 1: Regex (fast path) ─────────────────────────────────────────────────
export function detectIntent(text) {
  const t = text.trim().toLowerCase();

  const openMatch = t.match(/^(?:open|launch|start)\s+(.+)$/);
  if (openMatch) return { action: 'open', target: openMatch[1].trim() };

  const searchMatch = t.match(/^(?:search(?:\s+for)?|look\s+up|google)\s+(.+)$/);
  if (searchMatch) return { action: 'search', target: searchMatch[1].trim() };

  const newsMatch = t.match(/(?:latest|current|recent|today'?s?)\s+news|what(?:'s|\s+is)\s+(?:the\s+)?news|news\s+today/);
  if (newsMatch) return { action: 'websearch', target: 'latest news today' };

  // Handle numbered email selection
  const numberMatch = t.match(/^(?:number\s+)?([1-9]\d*)(?:st|nd|rd|th)?$/);
  if (numberMatch && STATE.pendingEmails && STATE.pendingEmails.length > 0) {
    const index = parseInt(numberMatch[1]) - 1;
    if (index >= 0 && index < STATE.pendingEmails.length) {
      const email = STATE.pendingEmails[index];
      STATE.pendingEmails.splice(index, 1);
      return { action: 'open', target: `https://mail.google.com/mail/u/0/#inbox/${email.id}` };
    }
  }

  // Handle named email selection
  if (STATE.pendingEmails && STATE.pendingEmails.length > 0) {
    const cleaned = t
      .replace(/^(?:look\s+into|open|show)\s+(?:the\s+)?(?:email\s+)?(?:from\s+)?/, '')
      .trim();
    if (cleaned.length > 2) {
      const match = STATE.pendingEmails.findIndex(e =>
        e.from.toLowerCase().includes(cleaned) ||
        e.subject.toLowerCase().includes(cleaned)
      );
      if (match !== -1) {
        const email = STATE.pendingEmails[match];
        STATE.pendingEmails.splice(match, 1);
        return { action: 'open', target: `https://mail.google.com/mail/u/0/#inbox/${email.id}` };
      }
    }
  }

  // Handle yes — opens the first pending email
  if (['yes', 'yeah', 'sure', 'open it'].includes(t)
      && STATE.pendingEmails && STATE.pendingEmails.length > 0) {
    const email = STATE.pendingEmails.shift();
    return { action: 'open', target: `https://mail.google.com/mail/u/0/#inbox/${email.id}` };
  }

  // Handle no/skip
  if (['no', 'skip', 'never mind'].includes(t)
      && STATE.pendingEmails && STATE.pendingEmails.length > 0) {
    STATE.pendingEmails = [];
    return null;
  }

  const listMatch = t.match(/^list\s+(?:my\s+|files\s+(?:on\s+)?)?(?:files\s+(?:on\s+)?)?(desktop|documents)$/);
  if (listMatch) {
    const folder = listMatch[1] === 'desktop' ? '~/Desktop' : '~/Documents';
    return { action: 'files', target: `list:${folder}` };
  }

  // Volume
  const volumeMatch = t.match(/(?:set\s+)?volume\s+(?:to\s+)?(\d+)/);
  if (volumeMatch) return { action: 'volume', target: volumeMatch[1] };

  // Brightness
  const brightnessMatch = t.match(/(?:set\s+)?brightness\s+(?:to\s+)?(\d+)/);
  if (brightnessMatch) return { action: 'brightness', target: brightnessMatch[1] };

  // System info
  const sysinfoMatch = t.match(/(?:what(?:'s|is)\s+(?:my\s+)?|check\s+(?:my\s+)?)(battery|storage|memory|ram|disk|power)/);
  if (sysinfoMatch) return { action: 'sysinfo', target: sysinfoMatch[1] };

  // Calendar today
  const calTodayMatch = t.match(/(?:what(?:'s|is)\s+(?:on\s+)?(?:my\s+)?(?:calendar|schedule)\s+today|what\s+do\s+i\s+have\s+today)/);
  if (calTodayMatch) return { action: 'calendar_upcoming', target: '1' };

  // Calendar this week
  const calWeekMatch = t.match(/(?:what(?:'s|is)\s+(?:on\s+)?(?:my\s+)?(?:calendar|schedule)\s+this\s+week|what\s+do\s+i\s+have\s+this\s+week)/);
  if (calWeekMatch) return { action: 'calendar_upcoming', target: '7' };

  // Calendar broader match
  const calMatch = t.match(/(?:check|show|what(?:'s|is)\s+on)\s+(?:my\s+)?calendar/);
  if (calMatch) return { action: 'calendar_upcoming', target: '1' };

  // Date and time
  const datetimeMatch = t.match(/what(?:'s|is)\s+(?:the\s+)?(?:time|date|day)/);
  if (datetimeMatch) return { action: 'datetime', target: 'now' };

  // CPU usage
  const cpuMatch = t.match(/(?:what(?:'s|is)\s+(?:my\s+)?|check\s+(?:my\s+)?)(cpu|processor|usage)/);
  if (cpuMatch) return { action: 'sysinfo', target: cpuMatch[1] };

  // Temperature
  const tempMatch = t.match(/(?:what(?:'s|is)\s+(?:the\s+)?|check\s+(?:the\s+)?)(temperature|temp|heat)/);
  if (tempMatch) return { action: 'sysinfo', target: tempMatch[1] };

  // Uptime
  const uptimeMatch = t.match(/(?:how\s+long|uptime|how\s+long\s+(?:has|have))/);
  if (uptimeMatch) return { action: 'sysinfo', target: 'uptime' };

  // Network
  const networkMatch = t.match(/(?:network|internet|bandwidth|data\s+usage)/);
  if (networkMatch) return { action: 'sysinfo', target: 'network' };

  // Gmail triage
  const gmailMatch = t.match(/(?:check|read|triage|show)\s+(?:my\s+)?(?:emails?|inbox|gmail)/);
  if (gmailMatch) return { action: 'gmail_triage', target: 'unread' };

  // Web search / news
  const newsMatch = t.match(/(?:latest|current|recent|today'?s?)\s+news|what(?:'s|\s+is)\s+(?:the\s+)?news/);
  if (newsMatch) return { action: 'websearch', target: 'latest news today' };

  const webSearchMatch = t.match(/^(?:search(?:\s+the)?\s+(?:web|internet|news)|what(?:'s|\s+is)\s+(?:the\s+)?(?:latest|current|recent)|find\s+news\s+about)\s+(.+)$/);
  if (webSearchMatch) return { action: 'websearch', target: webSearchMatch[1].trim() };

  return null;
}


// ── Step 2: Llama classification (fallback when regex returns null) ────────────
export async function classifyWithLlama(text) {
  const systemPrompt = `You are an intent classifier for a personal AI assistant.
Classify the user's message as either a task or a conversation.

Tasks are things like: opening apps, searching the web, setting timers, listing files, controlling volume or brightness, checking system info, or asking the time and date.
Conversations are everything else.

Respond ONLY with valid JSON. No explanation. No markdown. Examples:

{"type":"task","action":"open","target":"spotify"}
{"type":"task","action":"open","target":"https://youtube.com"}
{"type":"task","action":"search","target":"latest news"}
{"type":"task","action":"timer","target":"300"}
{"type":"task","action":"files","target":"list:~/Desktop"}
{"type":"task","action":"volume","target":"50"}
{"type":"task","action":"brightness","target":"70"}
{"type":"task","action":"sysinfo","target":"battery"}
{"type":"task","action":"sysinfo","target":"storage"}
{"type":"task","action":"sysinfo","target":"memory"}
{"type":"task","action":"sysinfo","target":"cpu"}
{"type":"task","action":"sysinfo","target":"temperature"}
{"type":"task","action":"sysinfo","target":"uptime"}
{"type":"task","action":"sysinfo","target":"network"}
{"type":"task","action":"datetime","target":"now"}
{"type":"task","action":"websearch","target":"latest news today"}
{"type":"conversation"}

Valid actions are: open, search, timer, files, volume, brightness, sysinfo, datetime, websearch.
For timer, target must be total seconds as a string.
For files, target must be "list:~/Desktop" or "list:~/Documents".
For volume and brightness, target must be a number 0-100 as a string.
For sysinfo, target must be one of: battery, storage, memory, cpu, temperature, uptime, network.
For datetime, target is always "now".
For websearch, target is the search query string.`;

  try {
    const response = await fetch(CONFIG.ollamaUrl, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({
        model    : CONFIG.model,
        stream   : false,
        messages : [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: text         },
        ],
      }),
    });

    if (!response.ok) return null;

    const data    = await response.json();
    const content = data.message?.content?.trim() ?? '';
    const cleaned = content.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);

    if (parsed.type === 'task' && parsed.action && parsed.target) {
      return { action: parsed.action, target: parsed.target };
    }
    return null;

  } catch (err) {
    console.warn('[intent] Llama classification failed:', err);
    return null;
  }
}


// ── Server bridge ─────────────────────────────────────────────────────────────
export async function callServer(endpoint, data) {
  try {
    const response = await fetch(`${CONFIG.flaskUrl}/${endpoint}`, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify(data),
    });
    const result = await response.json();
    return result.result;
  } catch (err) {
    console.error(`[intent] Server error on /${endpoint}:`, err);
    return null;
  }
}


// ── Execute ───────────────────────────────────────────────────────────────────
export async function executeIntent(intent) {
  // Special handlers that need custom logic
  if (intent.action === 'gmail_triage') {
    await handleGmailTriage();
    return;
  }

  if (intent.action === 'websearch') {
    await handleWebSearch(intent.target);
    return;
  }

  const serverResult = await callServer(
    intent.action.replace('_', '/'),
    { target: intent.target }
  );

  const confirmations = {
    open              : `Opened ${intent.target}.`,
    search            : `Searching for ${intent.target}.`,
    timer             : `Timer set for ${intent.target} seconds.`,
    files             : serverResult,
    volume            : `Volume set to ${intent.target}%.`,
    brightness        : `Brightness set to ${intent.target}%.`,
    sysinfo           : serverResult,
    datetime          : serverResult,
    calendar_upcoming : serverResult,
    calendar_create   : serverResult,
  };

  const msg = serverResult
    ? (confirmations[intent.action] || serverResult)
    : 'I could not complete that action. Make sure the server is running.';

  STATE.history.push({ role: 'assistant', content: msg });
  UI.addMessage('assistant', msg);
  speak(msg);
}


// ── Web search ────────────────────────────────────────────────────────────────
async function handleWebSearch(query) {
  const thinkingMsg = `Searching for ${query}.`;
  UI.addMessage('assistant', thinkingMsg);
  speak(thinkingMsg);

  try {
    const res = await fetch(`${CONFIG.flaskUrl}/websearch`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ query })
    });
    const data = await res.json();

    if (data.error) throw new Error(data.error);
    if (!data.result) throw new Error('No results returned');

    // Ask Llama to summarise into Jarvis-style sentences
    const summaryRes = await fetch(CONFIG.ollamaUrl, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        model  : CONFIG.model,
        stream : false,
        messages: [
          {
            role   : 'system',
            content: 'You are Jarvis. Summarise the following search results into 2 to 3 concise sentences. Only include what is genuinely relevant. No bullet points. No filler. No markdown.'
          },
          {
            role   : 'user',
            content: data.result
          }
        ]
      })
    });

    const summaryData = await summaryRes.json();
    const summary     = summaryData.message?.content?.trim() ?? data.result;

    UI.addMessage('assistant', summary);
    speak(summary);
    STATE.history.push({ role: 'assistant', content: summary });

  } catch (err) {
    const msg = `Search failed: ${err.message}`;
    UI.addMessage('assistant', msg);
    speak(msg);
  }
}


// ── Gmail triage ──────────────────────────────────────────────────────────────
async function handleGmailTriage() {
  let data;
  try {
    const res = await fetch(`${CONFIG.flaskUrl}/gmail/triage`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : '{}'
    });
    data = await res.json();
  } catch {
    const msg = 'Could not reach Gmail.';
    UI.addMessage('assistant', msg);
    speak(msg);
    return;
  }

  if (data.result) {
    UI.addMessage('assistant', data.result);
    speak(data.result);
    return;
  }

  const emails = data.emails || [];
  const intro  = `You have ${emails.length} unread email${emails.length > 1 ? 's' : ''}. Analysing now.`;
  UI.addMessage('assistant', intro);
  speak(intro);

  const importantEmails = [];
  let   deletedCount    = 0;

  for (const email of emails) {
    try {
      const classifyRes = await fetch('http://localhost:11434/api/chat', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          model   : 'llama3.2',
          stream  : false,
          messages: [
            {
              role   : 'system',
              content: 'You are an email importance classifier. Respond with ONLY "important" or "unimportant". Nothing else.'
            },
            {
              role   : 'user',
              content: `From: ${email.from}\nSubject: ${email.subject}\nPreview: ${email.snippet}`
            }
          ]
        })
      });
      const classifyData = await classifyRes.json();
      const verdict      = classifyData.message?.content?.trim().toLowerCase() ?? 'unimportant';
      const isImportant  = verdict.includes('important') && !verdict.includes('unimportant');

      if (isImportant) {
        const summaryRes = await fetch('http://localhost:11434/api/chat', {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({
            model   : 'llama3.2',
            stream  : false,
            messages: [
              {
                role   : 'system',
                content: 'Summarise this email in one concise sentence. No filler. No bullet points. Just the key point.'
              },
              {
                role   : 'user',
                content: `From: ${email.from}\nSubject: ${email.subject}\nPreview: ${email.snippet}`
              }
            ]
          })
        });
        const summaryData = await summaryRes.json();
        const summary     = summaryData.message?.content?.trim() ?? email.snippet;

        importantEmails.push({
          id     : email.id,
          from   : email.from.split('<')[0].trim(),
          subject: email.subject,
          summary: summary,
        });
      } else {
        deletedCount++;
        await fetch(`${CONFIG.flaskUrl}/gmail/delete`, {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({ id: email.id })
        });
      }
    } catch (err) {
      console.warn('[gmail] Classification error:', err);
    }
  }

  // Rank important emails by priority
  let rankedEmails = importantEmails;
  if (importantEmails.length > 1) {
    try {
      const rankRes = await fetch('http://localhost:11434/api/chat', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          model   : 'llama3.2',
          stream  : false,
          messages: [
            {
              role   : 'system',
              content: `You are an email prioritisation assistant.
Given a list of emails, return ONLY a JSON array of indices ranked from most to least urgent.
Example: if there are 3 emails and email 2 is most urgent, return [1,0,2].
No explanation. No markdown. Just the JSON array.`
            },
            {
              role   : 'user',
              content: importantEmails.map((e, i) =>
                `${i}: From ${e.from}, Subject: ${e.subject}, Summary: ${e.summary}`
              ).join('\n')
            }
          ]
        })
      });
      const rankData    = await rankRes.json();
      const rankContent = rankData.message?.content?.trim().replace(/```json|```/g, '') ?? '[]';
      const rankOrder   = JSON.parse(rankContent);
      const reordered   = rankOrder
        .filter(i => i >= 0 && i < importantEmails.length)
        .map(i => importantEmails[i]);
      importantEmails.forEach((e, i) => {
        if (!rankOrder.includes(i)) reordered.push(e);
      });
      rankedEmails = reordered;
    } catch {
      rankedEmails = importantEmails;
    }
  }

  STATE.pendingEmails = rankedEmails;

  if (rankedEmails.length === 0) {
    const msg = `Done. No important emails. Deleted ${deletedCount} unimportant email${deletedCount !== 1 ? 's' : ''}.`;
    UI.addMessage('assistant', msg);
    speak(msg);
    return;
  }

  const listText = rankedEmails
    .map((e, i) => `${i + 1}: ${e.summary} from ${e.from}`)
    .join(', ');

  const finalMsg = `Done. Deleted ${deletedCount} unimportant email${deletedCount !== 1 ? 's' : ''}. You have ${rankedEmails.length} important email${rankedEmails.length !== 1 ? 's' : ''}, ranked by priority. ${listText}. Which one do you want to look into?`;
  UI.addMessage('assistant', finalMsg);
  speak(finalMsg);
}