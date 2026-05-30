from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import subprocess
import os, time, threading, re

app = Flask(__name__)
CORS(app)

import sqlite3
from datetime import datetime

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import base64
import json
from email.mime.text import MIMEText
from datetime import datetime, timezone, timedelta

import whisper as whisper_lib
import tempfile

import urllib.parse
import urllib.request
import json as json_lib
import ssl

DB_PATH = os.path.expanduser('~/jarvis_data/memory.db')
os.makedirs(os.path.expanduser('~/jarvis_data'), exist_ok=True)

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS memories (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            category   TEXT    NOT NULL,
            fact       TEXT    NOT NULL UNIQUE,
            confidence REAL    DEFAULT 1.0,
            created_at TEXT    DEFAULT CURRENT_TIMESTAMP,
            last_seen  TEXT    DEFAULT CURRENT_TIMESTAMP,
            times_seen INTEGER DEFAULT 1
        )
    ''')
    conn.commit()
    conn.close()

init_db()

# ── App name resolution map ───────────────────────────────────────────────────
APP_NAMES = {
  'chrome'             : 'Google Chrome',
  'google chrome'      : 'Google Chrome',
  'safari'             : 'Safari',
  'firefox'            : 'Firefox',
  'spotify'            : 'Spotify',
  'vscode'             : 'Visual Studio Code',
  'vs code'            : 'Visual Studio Code',
  'code'               : 'Visual Studio Code',
  'terminal'           : 'Terminal',
  'finder'             : 'Finder',
  'notes'              : 'Notes',
  'calendar'           : 'Calendar',
  'mail'               : 'Mail',
  'messages'           : 'Messages',
  'facetime'           : 'FaceTime',
  'maps'               : 'Maps',
  'photos'             : 'Photos',
  'music'              : 'Music',
  'podcasts'           : 'Podcasts',
  'slack'              : 'Slack',
  'discord'            : 'Discord',
  'zoom'               : 'zoom.us',
  'figma'              : 'Figma',
  'notion'             : 'Notion',
  'obsidian'           : 'Obsidian',
  'xcode'              : 'Xcode',
  'system preferences' : 'System Preferences',
  'system settings'    : 'System Settings',
  'activity monitor'   : 'Activity Monitor',
  'calculator'         : 'Calculator',
  'preview'            : 'Preview',
  'quicktime'          : 'QuickTime Player',
  'vlc'                : 'VLC',
  'word'               : 'Microsoft Word',
  'excel'              : 'Microsoft Excel',
  'powerpoint'         : 'Microsoft PowerPoint',
  'outlook'            : 'Microsoft Outlook',
  'teams'              : 'Microsoft Teams',
  'whatsapp'           : 'WhatsApp',
  'telegram'           : 'Telegram',
}

WEBSITE_SHORTCUTS = {
  'youtube'       : 'https://youtube.com',
  'gmail'         : 'https://mail.google.com',
  'google'        : 'https://google.com',
  'github'        : 'https://github.com',
  'twitter'       : 'https://twitter.com',
  'x'             : 'https://x.com',
  'reddit'        : 'https://reddit.com',
  'netflix'       : 'https://netflix.com',
  'linkedin'      : 'https://linkedin.com',
  'chatgpt'       : 'https://chat.openai.com',
  'claude'        : 'https://claude.ai',
  'stackoverflow' : 'https://stackoverflow.com',
  "sls"           : "https://vle.learning.moe.edu.sg/login"
}

SCOPES           = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar'
]
CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), 'credentials.json')
TOKEN_FILE       = os.path.join(os.path.dirname(__file__), 'token.json')

def get_google_creds():
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(TOKEN_FILE, 'w') as f:
                f.write(creds.to_json())
    return creds

_whisper_model = None
def get_whisper():
    global _whisper_model
    if _whisper_model is None:
        _whisper_model = whisper_lib.load_model('base')
    return _whisper_model

# ── Open app or website ───────────────────────────────────────────────────────
@app.route('/open', methods=['POST'])
def handle_open():
    data   = request.get_json()
    target = data.get('target', '').strip()
    if not target:
        return jsonify({'result': 'No target provided'}), 400

    t = target.lower()

    if t.startswith('http://') or t.startswith('https://'):
        subprocess.Popen(['open', target])
        return jsonify({'result': f'Opened {target}'})

    if '.' in t and ' ' not in t:
        url = f'https://{target}' if not t.startswith('http') else target
        subprocess.Popen(['open', url])
        return jsonify({'result': f'Opened {url}'})

    if t in WEBSITE_SHORTCUTS:
        subprocess.Popen(['open', WEBSITE_SHORTCUTS[t]])
        return jsonify({'result': f'Opened {WEBSITE_SHORTCUTS[t]}'})

    resolved = APP_NAMES.get(t, target.title())
    app_path = f'/Applications/{resolved}.app'

    if not os.path.exists(app_path):
        app_path = f'/System/Applications/{resolved}.app'
    if not os.path.exists(app_path):
        result = subprocess.run(['open', '-a', resolved], capture_output=True)
        if result.returncode != 0:
            return jsonify({'result': f'Could not find app: {resolved}'}), 404
        return jsonify({'result': f'Opened {resolved}'})

    subprocess.Popen(['open', app_path])
    return jsonify({'result': f'Opened {resolved}'})


# ── Speak ─────────────────────────────────────────────────────────────────────
@app.route('/speak', methods=['POST'])
def handle_speak():
    data = request.get_json()
    text = data.get('text', '')
    if not text:
        return jsonify({'result': 'No text provided'}), 400

    output_path = '/tmp/jarvis_speech.aiff'
    wav_path    = '/tmp/jarvis_speech.wav'

    subprocess.run(['say', '-v', 'Daniel', '-r', '165', '-o', output_path, text])
    subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEF32@22050', output_path, wav_path])

    return send_file(wav_path, mimetype='audio/wav')


# ── Timer ─────────────────────────────────────────────────────────────────────
@app.route('/timer', methods=['POST'])
def handle_timer():
    data = request.get_json()
    try:
        seconds = int(data.get('target', 0))
    except ValueError:
        return jsonify({'result': 'Invalid timer value'}), 400

    def run_timer():
        time.sleep(seconds)
        subprocess.run([
            'osascript', '-e',
            'display notification "Timer done" with title "Jarvis" sound name "Glass"'
        ])

    threading.Thread(target=run_timer, daemon=True).start()
    return jsonify({'result': f'Timer set for {seconds} seconds'})


# ── Search ────────────────────────────────────────────────────────────────────
@app.route('/search', methods=['POST'])
def handle_search():
    data  = request.get_json()
    query = data.get('target', '')
    if not query:
        return jsonify({'result': 'No search query provided'}), 400
    search_url = f'https://duckduckgo.com/?q={query.replace(" ", "+")}'
    subprocess.Popen(['open', search_url])
    return jsonify({'result': f'Searched for {query}'})


# ── Files ─────────────────────────────────────────────────────────────────────
@app.route('/files', methods=['POST'])
def handle_files():
    data    = request.get_json()
    target  = data.get('target', '')
    parts   = target.split(':', 1)
    command = parts[0].strip().lower() if parts else ''
    path    = os.path.expanduser(parts[1].strip()) if len(parts) > 1 else ''

    allowed = [
        os.path.expanduser('~/Desktop'),
        os.path.expanduser('~/Documents'),
    ]
    if not any(os.path.abspath(path).startswith(a) for a in allowed):
        return jsonify({'result': 'Access denied. Only Desktop and Documents allowed.'}), 403

    try:
        if command == 'list':
            files = os.listdir(path)
            return jsonify({'result': 'Files: ' + ', '.join(files)})
        elif command == 'create':
            os.makedirs(path, exist_ok=True)
            return jsonify({'result': f'Created folder {path}'})
        elif command == 'delete':
            os.remove(path)
            return jsonify({'result': f'Deleted {path}'})
        else:
            return jsonify({'result': f'Unknown command: {command}'}), 400
    except Exception as e:
        return jsonify({'result': f'Error: {str(e)}'}), 500


# ── Volume ────────────────────────────────────────────────────────────────────
@app.route('/volume', methods=['POST'])
def handle_volume():
    data = request.get_json()
    try:
        level = int(data.get('target', 0))
        if not 0 <= level <= 100:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({'result': 'Volume must be 0 to 100'}), 400

    subprocess.run(['osascript', '-e', f'set volume output volume {level}'])
    return jsonify({'result': f'Volume set to {level}%'})


# ── Brightness ────────────────────────────────────────────────────────────────
@app.route('/brightness', methods=['POST'])
def handle_brightness():
    data = request.get_json()
    try:
        level = int(data.get('target', 0))
        if not 0 <= level <= 100:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({'result': 'Brightness must be 0 to 100'}), 400

    brightness = round(level / 100, 2)
    subprocess.run([
        'osascript', '-e',
        f'tell application "System Events" to set brightness of screen 1 to {brightness}'
    ])
    return jsonify({'result': f'Brightness set to {level}%'})


# ── System info ───────────────────────────────────────────────────────────────
@app.route('/sysinfo', methods=['POST'])
def handle_sysinfo():
    data    = request.get_json()
    query   = data.get('target', '').lower()
    results = []

    if any(w in query for w in ['battery', 'power', 'charge']):
        try:
            out   = subprocess.check_output(['pmset', '-g', 'batt'], text=True)
            match = re.search(r'InternalBattery[^\n]*?\t(\d+)%', out)
            if match:
                pct      = match.group(1)
                charging = 'charging' if 'AC Power' in out else 'on battery'
                results.append(f'Battery at {pct}%, {charging}')
            else:
                results.append('Could not read battery level')
        except Exception as e:
            results.append(f'Battery error: {e}')

    if any(w in query for w in ['storage', 'disk', 'space']):
        try:
            out   = subprocess.check_output(['df', '-h', '/'], text=True)
            parts = out.split('\n')[1].split()
            total, used, avail = parts[1], parts[2], parts[3]
            results.append(f'Disk: {used} used of {total}, {avail} available')
        except Exception as e:
            results.append(f'Storage error: {e}')

    if any(w in query for w in ['memory', 'ram']):
        try:
            out        = subprocess.check_output(['vm_stat'], text=True)
            free       = int(re.search(r'Pages free:\s+(\d+)', out).group(1))
            active     = int(re.search(r'Pages active:\s+(\d+)', out).group(1))
            compressed = int(re.search(r'Pages occupied by compressor:\s+(\d+)', out).group(1))
            page       = 4096
            free_mb    = (free * page) // (1024 * 1024)
            used_mb    = ((active + compressed) * page) // (1024 * 1024)
            results.append(f'RAM: {used_mb}MB used, {free_mb}MB free')
        except Exception as e:
            results.append(f'Memory error: {e}')

    if any(w in query for w in ['cpu', 'processor', 'usage']):
        try:
            out   = subprocess.check_output(['top', '-l', '1', '-n', '0'], text=True)
            match = re.search(r'CPU usage:\s+([\d.]+)%\s+user,\s+([\d.]+)%\s+sys,\s+([\d.]+)%\s+idle', out)
            if match:
                user, sys, idle = match.group(1), match.group(2), match.group(3)
                used = round(float(user) + float(sys), 1)
                results.append(f'CPU: {used}% used, {idle}% idle')
            else:
                results.append('Could not read CPU usage')
        except Exception as e:
            results.append(f'CPU error: {e}')

    if any(w in query for w in ['temperature', 'temp', 'heat', 'thermal']):
        try:
            out = subprocess.check_output(['/opt/homebrew/bin/osx-cpu-temp'], text=True).strip()
            results.append(f'CPU temperature: {out}')
        except Exception as e:
            results.append(f'Temperature error: {e}')

    if any(w in query for w in ['uptime', 'up', 'running']):
        try:
            out   = subprocess.check_output(['uptime'], text=True).strip()
            match = re.search(r'up\s+(.+?),\s+\d+\s+user', out)
            if match:
                results.append(f'System up for {match.group(1).strip()}')
            else:
                results.append(f'Uptime: {out}')
        except Exception as e:
            results.append(f'Uptime error: {e}')

    if any(w in query for w in ['network', 'internet', 'bandwidth', 'data']):
        try:
            out = subprocess.check_output(['netstat', '-ib'], text=True)
            for line in out.split('\n'):
                if line.startswith('en0') and '<Link#' in line:
                    parts  = line.split()
                    ibytes = int(parts[6])
                    obytes = int(parts[9])
                    def fmt(b):
                        if b > 1_073_741_824: return f'{b/1_073_741_824:.1f}GB'
                        if b > 1_048_576:     return f'{b/1_048_576:.1f}MB'
                        return f'{b/1024:.1f}KB'
                    results.append(f'Network: {fmt(ibytes)} received, {fmt(obytes)} sent')
                    break
        except Exception as e:
            results.append(f'Network error: {e}')

    if not results:
        results.append('Available system info: battery, storage, memory, cpu, temperature, uptime, network')

    return jsonify({'result': '. '.join(results)})


# ── Date and time ─────────────────────────────────────────────────────────────
@app.route('/datetime', methods=['POST'])
def handle_datetime():
    from datetime import datetime
    now       = datetime.now()
    formatted = now.strftime('%A, %B %d %Y at %I:%M %p')
    return jsonify({'result': f'It is {formatted}'})


# ── Gmail unread count ────────────────────────────────────────────────────────
@app.route('/gmail/count', methods=['POST'])
def handle_gmail_count():
    try:
        creds   = get_google_creds()
        service = build('gmail', 'v1', credentials=creds)
        results = service.users().messages().list(
            userId='me', labelIds=['INBOX', 'UNREAD'], maxResults=1
        ).execute()
        count = results.get('resultSizeEstimate', 0)
        return jsonify({'result': f'{count} unread email{"s" if count != 1 else ""}'})
    except Exception as e:
        return jsonify({'result': f'Could not check email count: {str(e)}'}), 500


# ── Gmail triage ──────────────────────────────────────────────────────────────
@app.route('/gmail/triage', methods=['POST'])
def handle_gmail_triage():
    try:
        creds   = get_google_creds()
        service = build('gmail', 'v1', credentials=creds)

        results  = service.users().messages().list(
            userId='me', labelIds=['INBOX', 'UNREAD'], maxResults=10
        ).execute()
        messages = results.get('messages', [])

        if not messages:
            return jsonify({'result': 'No unread emails. Your inbox is clear.'})

        summaries = []
        for msg in messages:
            full = service.users().messages().get(
                userId='me', id=msg['id'], format='metadata',
                metadataHeaders=['From', 'Subject']
            ).execute()

            headers = {h['name']: h['value'] for h in full['payload']['headers']}
            sender  = headers.get('From', 'Unknown')
            subject = headers.get('Subject', 'No subject')
            snippet = full.get('snippet', '')

            summaries.append({
                'id'     : msg['id'],
                'from'   : sender,
                'subject': subject,
                'snippet': snippet,
            })

        return jsonify({'emails': summaries, 'count': len(summaries)})

    except Exception as e:
        return jsonify({'result': f'Gmail error: {str(e)}'}), 500


# ── Gmail delete ──────────────────────────────────────────────────────────────
@app.route('/gmail/delete', methods=['POST'])
def handle_gmail_delete():
    try:
        data    = request.get_json()
        msg_id  = data.get('id', '')
        creds   = get_google_creds()
        service = build('gmail', 'v1', credentials=creds)
        service.users().messages().trash(userId='me', id=msg_id).execute()
        return jsonify({'result': 'Email deleted.'})
    except Exception as e:
        return jsonify({'result': f'Delete error: {str(e)}'}), 500


# ── Calendar upcoming ─────────────────────────────────────────────────────────
@app.route('/calendar/upcoming', methods=['POST'])
def handle_calendar_upcoming():
    try:
        data    = request.get_json()
        days    = int(data.get('target', 1))
        creds   = get_google_creds()
        service = build('calendar', 'v3', credentials=creds)

        now = datetime.now(timezone.utc)
        end = now + timedelta(days=days)

        events_result = service.events().list(
            calendarId='primary',
            timeMin=now.isoformat(),
            timeMax=end.isoformat(),
            maxResults=10,
            singleEvents=True,
            orderBy='startTime'
        ).execute()

        events = events_result.get('items', [])
        if not events:
            return jsonify({'result': f'No events in the next {days} day(s).'})

        lines = []
        for e in events:
            start   = e['start'].get('dateTime', e['start'].get('date', ''))
            summary = e.get('summary', 'Untitled event')
            if 'T' in start:
                dt = datetime.fromisoformat(start)
                lines.append(f'{dt.strftime("%A %d %B at %I:%M %p")}: {summary}')
            else:
                lines.append(f'{start}: {summary}')

        return jsonify({'result': '. '.join(lines)})

    except Exception as e:
        return jsonify({'result': f'Calendar error: {str(e)}'}), 500


# ── Calendar create ───────────────────────────────────────────────────────────
@app.route('/calendar/create', methods=['POST'])
def handle_calendar_create():
    try:
        data    = request.get_json()
        summary = data.get('summary', 'New Event')
        start   = data.get('start', '')
        end     = data.get('end', '')
        creds   = get_google_creds()
        service = build('calendar', 'v3', credentials=creds)

        event = {
            'summary': summary,
            'start'  : {'dateTime': start, 'timeZone': 'Asia/Singapore'},
            'end'    : {'dateTime': end,   'timeZone': 'Asia/Singapore'},
            'reminders': {
                'useDefault': False,
                'overrides' : [
                    {'method': 'popup', 'minutes': 30},
                    {'method': 'popup', 'minutes': 10},
                ],
            },
        }

        service.events().insert(calendarId='primary', body=event).execute()
        return jsonify({'result': f'Event created: {summary} on {start}'})

    except Exception as e:
        return jsonify({'result': f'Calendar create error: {str(e)}'}), 500


# ── Memory save ───────────────────────────────────────────────────────────────
@app.route('/memory/save', methods=['POST'])
def handle_memory_save():
    data  = request.get_json()
    facts = data.get('facts', [])
    if not facts:
        return jsonify({'result': 'No facts provided'}), 400

    conn    = get_db()
    saved   = 0
    skipped = 0

    for item in facts:
        category = item.get('category', 'general').strip()
        fact     = item.get('fact', '').strip()
        if not fact:
            continue
        try:
            existing = conn.execute(
                'SELECT id, times_seen FROM memories WHERE fact = ?', (fact,)
            ).fetchone()

            if existing:
                conn.execute('''
                    UPDATE memories
                    SET last_seen  = ?,
                        times_seen = times_seen + 1,
                        confidence = MIN(confidence + 0.1, 1.0)
                    WHERE fact = ?
                ''', (datetime.now().isoformat(), fact))
                skipped += 1
            else:
                conn.execute('''
                    INSERT INTO memories (category, fact, created_at, last_seen)
                    VALUES (?, ?, ?, ?)
                ''', (category, fact, datetime.now().isoformat(), datetime.now().isoformat()))
                saved += 1
        except Exception as e:
            print(f'[memory] Error saving fact: {e}')

    conn.commit()
    conn.close()
    return jsonify({'result': f'Saved {saved} new facts, updated {skipped} existing'})


# ── Memory load ───────────────────────────────────────────────────────────────
@app.route('/memory/load', methods=['GET'])
def handle_memory_load():
    try:
        conn = get_db()
        rows = conn.execute('''
            SELECT category, fact
            FROM   memories
            ORDER  BY times_seen DESC, last_seen DESC
            LIMIT  15
        ''').fetchall()
        conn.close()
        facts = [{'category': r['category'], 'fact': r['fact']} for r in rows]
        return jsonify({'facts': facts})
    except Exception as e:
        return jsonify({'facts': [], 'error': str(e)})

@app.route('/transcribe', methods=['POST'])
def handle_transcribe():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file'}), 400
    audio_file = request.files['audio']
    with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as tmp:
        audio_file.save(tmp.name)
        webm_path = tmp.name

    # Save a copy for debugging
    import shutil
    shutil.copy(webm_path, '/tmp/last_recording.webm')

    wav_path = webm_path.replace('.webm', '.wav')
    try:
        subprocess.run(
            ['ffmpeg', '-y', '-i', webm_path, wav_path],
            capture_output=True, check=True
        )
        result = get_whisper().transcribe(wav_path, language='en')
        text   = result['text'].strip()
        return jsonify({'transcript': text})
    except subprocess.CalledProcessError as e:
        return jsonify({'error': f'ffmpeg failed: {e.stderr.decode()}'}), 500
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500
    finally:
        os.unlink(webm_path)
        if os.path.exists(wav_path):
            os.unlink(wav_path)

@app.route('/websearch', methods=['POST'])
def handle_websearch():
    data  = request.get_json()
    query = data.get('query', '').strip()
    if not query:
        return jsonify({'error': 'No query provided'}), 400

    try:
        # DuckDuckGo instant answer API
        encoded = urllib.parse.quote(query)
        url     = f'https://api.duckduckgo.com/?q={encoded}&format=json&no_redirect=1&no_html=1&skip_disambig=1'
        ctx     = ssl.create_default_context()
        req     = urllib.request.Request(url, headers={'User-Agent': 'Jarvis/1.0'})
        with urllib.request.urlopen(req, context=ctx, timeout=8) as r:
            raw  = r.read().decode()
            ddg  = json_lib.loads(raw)

        # Collect results
        snippets = []

        abstract = ddg.get('AbstractText', '').strip()
        if abstract:
            snippets.append(abstract)

        for topic in ddg.get('RelatedTopics', [])[:6]:
            if isinstance(topic, dict) and topic.get('Text'):
                snippets.append(topic['Text'])

        if not snippets:
            return jsonify({'result': f'No results found for: {query}'}), 200

        combined = ' '.join(snippets[:5])
        return jsonify({'result': combined, 'snippets': snippets})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print('Jarvis Flask server running on https://localhost:5001')
    app.run(port=5001, debug=True, ssl_context=(
        '/Users/philipyeo/jarvis/127.0.0.1+1.pem',
        '/Users/philipyeo/jarvis/127.0.0.1+1-key.pem'
    ))