from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import subprocess, os, time, threading, sqlite3, re
import urllib.request, urllib.parse, json, ssl
from datetime import datetime, timezone, timedelta

app = Flask(__name__)
CORS(app)

# ─────────────────────────────────────────────
# DATABASE
# ─────────────────────────────────────────────
DB_PATH = os.path.expanduser('~/jarvis_data/memory.db')
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS memories (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            category   TEXT,
            fact       TEXT UNIQUE,
            confidence REAL DEFAULT 1.0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            last_seen  TEXT DEFAULT CURRENT_TIMESTAMP,
            times_seen INTEGER DEFAULT 1
        )
    """)
    conn.commit()
    conn.close()

init_db()

# ─────────────────────────────────────────────
# GOOGLE AUTH HELPER
# ─────────────────────────────────────────────
SCOPES           = ['https://www.googleapis.com/auth/gmail.modify',
                    'https://www.googleapis.com/auth/calendar']
CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), 'credentials.json')
TOKEN_FILE       = os.path.join(os.path.dirname(__file__), 'token.json')

def get_google_creds():
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        creds = None
        if os.path.exists(TOKEN_FILE):
            creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
                with open(TOKEN_FILE, 'w') as f:
                    f.write(creds.to_json())
        return creds
    except Exception as e:
        return None

def google_build(service, version):
    try:
        from googleapiclient.discovery import build
        creds = get_google_creds()
        if not creds:
            return None
        return build(service, version, credentials=creds)
    except Exception:
        return None

# ─────────────────────────────────────────────
# WHISPER (lazy load)
# ─────────────────────────────────────────────
_whisper_model = None

def get_whisper():
    global _whisper_model
    if _whisper_model is None:
        try:
            import whisper
            _whisper_model = whisper.load_model('base')
        except ImportError:
            pass
    return _whisper_model

# ─────────────────────────────────────────────
# APP + WEBSITE MAP
# ─────────────────────────────────────────────
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
    'slack'              : 'Slack',
    'discord'            : 'Discord',
    'zoom'               : 'zoom.us',
    'figma'              : 'Figma',
    'notion'             : 'Notion',
    'obsidian'           : 'Obsidian',
    'xcode'              : 'Xcode',
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
}

# ─────────────────────────────────────────────
# OPEN
# ─────────────────────────────────────────────
@app.route('/open', methods=['POST'])
def open_target():
    target = request.json.get('target', '').strip()
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
    result   = subprocess.run(['open', '-a', resolved], capture_output=True)
    if result.returncode != 0:
        return jsonify({'result': f'Could not find app: {resolved}'}), 404
    return jsonify({'result': f'Opened {resolved}'})


# ─────────────────────────────────────────────
# SPEAK
# ─────────────────────────────────────────────
@app.route('/speak', methods=['POST'])
def speak():
    text = request.json.get('text', '')
    if not text:
        return jsonify({'error': 'no text'}), 400

    aiff_path = '/tmp/jarvis_speech.aiff'
    wav_path  = '/tmp/jarvis_speech.wav'
    subprocess.run(['say', '-v', 'Daniel', '-r', '165', '-o', aiff_path, text])
    subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEF32@22050', aiff_path, wav_path])
    return send_file(wav_path, mimetype='audio/wav')


# ─────────────────────────────────────────────
# TIMER
# ─────────────────────────────────────────────
@app.route('/timer', methods=['POST'])
def timer():
    try:
        seconds = int(request.json.get('target', 0))
    except ValueError:
        return jsonify({'result': 'Invalid timer value'}), 400

    def run():
        time.sleep(seconds)
        subprocess.run([
            'osascript', '-e',
            'display notification "Timer done" with title "Jarvis" sound name "Glass"'
        ])

    threading.Thread(target=run, daemon=True).start()
    return jsonify({'result': f'Timer set for {seconds} seconds'})


# ─────────────────────────────────────────────
# SEARCH (opens browser)
# ─────────────────────────────────────────────
@app.route('/search', methods=['POST'])
def search():
    query = request.json.get('target', '')
    url   = f'https://duckduckgo.com/?q={urllib.parse.quote(query)}'
    subprocess.Popen(['open', url])
    return jsonify({'result': f'Searched for {query}'})


# ─────────────────────────────────────────────
# WEB SEARCH (returns text summary)
# ─────────────────────────────────────────────
@app.route('/websearch', methods=['POST'])
def websearch():
    query = request.json.get('query', '').strip()
    if not query:
        return jsonify({'error': 'No query provided'}), 400

    try:
        encoded = urllib.parse.quote(query)
        url     = f'https://api.duckduckgo.com/?q={encoded}&format=json&no_redirect=1&no_html=1&skip_disambig=1'
        ctx     = ssl.create_default_context()
        req     = urllib.request.Request(url, headers={'User-Agent': 'Jarvis/1.0'})
        with urllib.request.urlopen(req, context=ctx, timeout=8) as r:
            ddg = json.loads(r.read().decode())

        snippets = []
        abstract = ddg.get('AbstractText', '').strip()
        if abstract:
            snippets.append(abstract)
        for topic in ddg.get('RelatedTopics', [])[:6]:
            if isinstance(topic, dict) and topic.get('Text'):
                snippets.append(topic['Text'])

        if not snippets:
            return jsonify({'result': f'No results found for: {query}'})

        return jsonify({'result': ' '.join(snippets[:5])})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────
# FILES
# ─────────────────────────────────────────────
@app.route('/files', methods=['POST'])
def files():
    target  = request.json.get('target', '')
    parts   = target.split(':', 1)
    command = parts[0].strip().lower() if parts else ''
    path    = os.path.expanduser(parts[1].strip()) if len(parts) > 1 else ''

    allowed = [os.path.expanduser('~/Desktop'), os.path.expanduser('~/Documents')]
    if not any(os.path.abspath(path).startswith(a) for a in allowed):
        return jsonify({'result': 'Access denied'}), 403

    try:
        if command == 'list':
            return jsonify({'result': 'Files: ' + ', '.join(os.listdir(path))})
        elif command == 'create':
            os.makedirs(path, exist_ok=True)
            return jsonify({'result': f'Created {path}'})
        elif command == 'delete':
            os.remove(path)
            return jsonify({'result': f'Deleted {path}'})
        else:
            return jsonify({'result': f'Unknown command: {command}'}), 400
    except Exception as e:
        return jsonify({'result': f'Error: {e}'}), 500


# ─────────────────────────────────────────────
# VOLUME
# ─────────────────────────────────────────────
@app.route('/volume', methods=['POST'])
def volume():
    try:
        level = int(request.json.get('target', 0))
        if not 0 <= level <= 100:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({'result': 'Volume must be 0 to 100'}), 400
    subprocess.run(['osascript', '-e', f'set volume output volume {level}'])
    return jsonify({'result': f'Volume set to {level}%'})


# ─────────────────────────────────────────────
# BRIGHTNESS
# ─────────────────────────────────────────────
@app.route('/brightness', methods=['POST'])
def brightness():
    try:
        level = int(request.json.get('target', 0))
        if not 0 <= level <= 100:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({'result': 'Brightness must be 0 to 100'}), 400
    b = round(level / 100, 2)
    subprocess.run(['osascript', '-e',
        f'tell application "System Events" to set brightness of screen 1 to {b}'])
    return jsonify({'result': f'Brightness set to {level}%'})


# ─────────────────────────────────────────────
# SYSTEM INFO
# ─────────────────────────────────────────────
@app.route('/sysinfo', methods=['POST'])
def sysinfo():
    query   = request.json.get('target', '').lower()
    results = []

    if any(w in query for w in ['battery', 'power', 'charge']):
        try:
            out   = subprocess.check_output(['pmset', '-g', 'batt'], text=True)
            match = re.search(r'InternalBattery[^\n]*?\t(\d+)%', out)
            if match:
                pct      = match.group(1)
                charging = 'charging' if 'AC Power' in out else 'on battery'
                results.append(f'Battery at {pct}%, {charging}')
        except Exception as e:
            results.append(f'Battery error: {e}')

    if any(w in query for w in ['storage', 'disk', 'space']):
        try:
            parts = subprocess.check_output(['df', '-h', '/'], text=True).split('\n')[1].split()
            results.append(f'Disk: {parts[2]} used of {parts[1]}, {parts[3]} available')
        except Exception as e:
            results.append(f'Storage error: {e}')

    if any(w in query for w in ['memory', 'ram']):
        try:
            out        = subprocess.check_output(['vm_stat'], text=True)
            free       = int(re.search(r'Pages free:\s+(\d+)', out).group(1))
            active     = int(re.search(r'Pages active:\s+(\d+)', out).group(1))
            compressed = int(re.search(r'Pages occupied by compressor:\s+(\d+)', out).group(1))
            page       = 4096
            results.append(f'RAM: {((active+compressed)*page)//(1024*1024)}MB used, {(free*page)//(1024*1024)}MB free')
        except Exception as e:
            results.append(f'Memory error: {e}')

    if any(w in query for w in ['cpu', 'processor', 'usage']):
        try:
            out   = subprocess.check_output(['top', '-l', '1', '-n', '0'], text=True)
            match = re.search(r'CPU usage:\s+([\d.]+)%\s+user,\s+([\d.]+)%\s+sys,\s+([\d.]+)%\s+idle', out)
            if match:
                used = round(float(match.group(1)) + float(match.group(2)), 1)
                results.append(f'CPU: {used}% used, {match.group(3)}% idle')
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
            results.append(f'System up for {match.group(1).strip()}' if match else f'Uptime: {out}')
        except Exception as e:
            results.append(f'Uptime error: {e}')

    if any(w in query for w in ['network', 'internet', 'bandwidth', 'data']):
        try:
            out = subprocess.check_output(['netstat', '-ib'], text=True)
            for line in out.split('\n'):
                if line.startswith('en0') and '<Link#' in line:
                    parts  = line.split()
                    def fmt(b):
                        b = int(b)
                        if b > 1_073_741_824: return f'{b/1_073_741_824:.1f}GB'
                        if b > 1_048_576:     return f'{b/1_048_576:.1f}MB'
                        return f'{b/1024:.1f}KB'
                    results.append(f'Network: {fmt(parts[6])} received, {fmt(parts[9])} sent')
                    break
        except Exception as e:
            results.append(f'Network error: {e}')

    if not results:
        results.append('Available: battery, storage, memory, cpu, temperature, uptime, network')

    return jsonify({'result': '. '.join(results)})


# ─────────────────────────────────────────────
# DATETIME
# ─────────────────────────────────────────────
@app.route('/datetime', methods=['POST'])
def dt():
    return jsonify({'result': datetime.now().strftime('%A, %B %d %Y at %I:%M %p')})


# ─────────────────────────────────────────────
# MEMORY
# ─────────────────────────────────────────────
@app.route('/memory/save', methods=['POST'])
def save_memory():
    facts = request.json.get('facts', [])
    conn  = db()
    saved = 0
    for f in facts:
        fact = f.get('fact', '').strip()
        if not fact:
            continue
        existing = conn.execute('SELECT id FROM memories WHERE fact = ?', (fact,)).fetchone()
        if existing:
            conn.execute('''UPDATE memories SET last_seen = ?, times_seen = times_seen + 1
                           WHERE fact = ?''', (datetime.now().isoformat(), fact))
        else:
            conn.execute('INSERT INTO memories (category, fact) VALUES (?, ?)',
                        (f.get('category', 'general'), fact))
            saved += 1
    conn.commit()
    conn.close()
    return jsonify({'result': f'Saved {saved} facts'})


@app.route('/memory/load', methods=['GET'])
def load_memory():
    conn = db()
    rows = conn.execute(
        'SELECT category, fact FROM memories ORDER BY times_seen DESC, last_seen DESC LIMIT 15'
    ).fetchall()
    conn.close()
    return jsonify({'facts': [dict(r) for r in rows]})


# ─────────────────────────────────────────────
# GMAIL
# ─────────────────────────────────────────────
@app.route('/gmail/count', methods=['POST'])
def gmail_count():
    svc = google_build('gmail', 'v1')
    if not svc:
        return jsonify({'result': 'Gmail not available'})
    try:
        results = svc.users().messages().list(
            userId='me', labelIds=['INBOX', 'UNREAD'], maxResults=1
        ).execute()
        count = results.get('resultSizeEstimate', 0)
        return jsonify({'result': f'{count} unread email{"s" if count != 1 else ""}'})
    except Exception as e:
        return jsonify({'result': f'Gmail error: {e}'})


@app.route('/gmail/triage', methods=['POST'])
def gmail_triage():
    svc = google_build('gmail', 'v1')
    if not svc:
        return jsonify({'result': 'Gmail not available'})
    try:
        results  = svc.users().messages().list(
            userId='me', labelIds=['INBOX', 'UNREAD'], maxResults=10
        ).execute()
        messages = results.get('messages', [])
        if not messages:
            return jsonify({'result': 'No unread emails. Your inbox is clear.'})

        emails = []
        for msg in messages:
            full    = svc.users().messages().get(
                userId='me', id=msg['id'], format='metadata',
                metadataHeaders=['From', 'Subject']
            ).execute()
            headers = {h['name']: h['value'] for h in full['payload']['headers']}
            emails.append({
                'id'     : msg['id'],
                'from'   : headers.get('From', 'Unknown'),
                'subject': headers.get('Subject', 'No subject'),
                'snippet': full.get('snippet', ''),
            })
        return jsonify({'emails': emails, 'count': len(emails)})
    except Exception as e:
        return jsonify({'result': f'Gmail error: {e}'})


@app.route('/gmail/delete', methods=['POST'])
def gmail_delete():
    svc    = google_build('gmail', 'v1')
    msg_id = request.json.get('id', '')
    if not svc:
        return jsonify({'result': 'Gmail not available'})
    try:
        svc.users().messages().trash(userId='me', id=msg_id).execute()
        return jsonify({'result': 'Email deleted'})
    except Exception as e:
        return jsonify({'result': f'Delete error: {e}'})


# ─────────────────────────────────────────────
# CALENDAR
# ─────────────────────────────────────────────
@app.route('/calendar/upcoming', methods=['POST'])
def calendar_upcoming():
    svc  = google_build('calendar', 'v3')
    if not svc:
        return jsonify({'result': 'Calendar not available'})
    try:
        days = int(request.json.get('target', 1))
        now  = datetime.now(timezone.utc)
        end  = now + timedelta(days=days)
        evts = svc.events().list(
            calendarId='primary',
            timeMin=now.isoformat(),
            timeMax=end.isoformat(),
            maxResults=10,
            singleEvents=True,
            orderBy='startTime'
        ).execute().get('items', [])

        if not evts:
            return jsonify({'result': f'No events in the next {days} day(s).'})

        lines = []
        for e in evts:
            start   = e['start'].get('dateTime', e['start'].get('date', ''))
            summary = e.get('summary', 'Untitled event')
            if 'T' in start:
                dt = datetime.fromisoformat(start)
                lines.append(f'{dt.strftime("%A %d %B at %I:%M %p")}: {summary}')
            else:
                lines.append(f'{start}: {summary}')
        return jsonify({'result': '. '.join(lines)})
    except Exception as e:
        return jsonify({'result': f'Calendar error: {e}'})


@app.route('/calendar/create', methods=['POST'])
def calendar_create():
    svc = google_build('calendar', 'v3')
    if not svc:
        return jsonify({'result': 'Calendar not available'})
    try:
        data    = request.json
        summary = data.get('summary', 'New Event')
        start   = data.get('start', '')
        end     = data.get('end', '')
        event   = {
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
        svc.events().insert(calendarId='primary', body=event).execute()
        return jsonify({'result': f'Event created: {summary}'})
    except Exception as e:
        return jsonify({'result': f'Calendar create error: {e}'})


# ─────────────────────────────────────────────
# TRANSCRIBE (Whisper)
# ─────────────────────────────────────────────
@app.route('/transcribe', methods=['POST'])
def transcribe():
    model = get_whisper()
    if not model:
        return jsonify({'error': 'Whisper not installed. Run: pip3 install openai-whisper'}), 200

    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400

    audio_file = request.files['audio']
    tmp_path   = '/tmp/jarvis_input.webm'
    wav_path   = '/tmp/jarvis_input.wav'
    audio_file.save(tmp_path)

    subprocess.run(['ffmpeg', '-y', '-i', tmp_path, wav_path],
                   capture_output=True)

    result = model.transcribe(wav_path)
    return jsonify({'text': result.get('text', '').strip()})


# ─────────────────────────────────────────────
if __name__ == '__main__':
    print('Jarvis server running on http://localhost:5001')
    app.run(port=5001, debug=False)