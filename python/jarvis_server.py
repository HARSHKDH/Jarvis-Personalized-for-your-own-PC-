"""
jarvis_server.py — Persistent Python micro-server for JARVIS
============================================================
Runs on http://localhost:5001

Endpoints:
  POST /record/start   — starts screen recording in a background thread
  POST /record/stop    — stops recording and saves the .mp4 file
  GET  /record/status  — returns { isRecording, elapsed, filename }

Why a persistent server?
  Node's executor.js spawns a NEW Python process for every command.
  Screen recording needs a SINGLE long-lived process to hold the thread
  alive between start and stop calls.  Flask solves this cleanly.

Start automatically:  launched by jarvis-autostart.vbs before Electron.
"""

import threading
import time
import os
import sys
import json
import subprocess
import glob
import re
import webbrowser
import socket as _socket
from urllib.parse import quote
from datetime import datetime
from pathlib import Path
from ctypes import cast, POINTER

# Force UTF-8 output so Windows cp1252 terminals don't crash on any print()
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')


# ── Optional heavy imports — fail gracefully so server always starts ──────────
try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False

try:
    import mss
    import numpy as np
    MSS_AVAILABLE = True
except ImportError:
    MSS_AVAILABLE = False

try:
    import pyautogui
    PYAUTOGUI_AVAILABLE = True
except ImportError:
    PYAUTOGUI_AVAILABLE = False

try:
    import pyperclip
    PYPERCLIP_AVAILABLE = True
except ImportError:
    PYPERCLIP_AVAILABLE = False

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False

try:
    from comtypes import CLSCTX_ALL, CoInitialize, CoUninitialize
    from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
    PYCAW_AVAILABLE = True
    PYCAW_IMPORT_ERROR = ''
except ImportError as err:
    PYCAW_AVAILABLE = False
    PYCAW_IMPORT_ERROR = str(err)

try:
    import pywhatkit as _pywhatkit
    PYWHATKIT_AVAILABLE = True
    PYWHATKIT_IMPORT_ERROR = ''
except Exception as err:  # pywhatkit can raise beyond ImportError on headless/display issues
    PYWHATKIT_AVAILABLE = False
    PYWHATKIT_IMPORT_ERROR = str(err)

try:
    from selenium import webdriver as _wa_webdriver
    from selenium.webdriver.chrome.options import Options as _WaChromeOptions
    from selenium.webdriver.chrome.service import Service as _WaChromeService
    from selenium.webdriver.common.by import By as _WaBy
    from selenium.webdriver.support.ui import WebDriverWait as _WaWait
    from selenium.webdriver.support import expected_conditions as _wa_EC
    try:
        from webdriver_manager.chrome import ChromeDriverManager as _WaChromeDriverManager
    except Exception:
        _WaChromeDriverManager = None
    SELENIUM_WA_AVAILABLE = True
    SELENIUM_WA_IMPORT_ERROR = ''
except Exception as err:
    SELENIUM_WA_AVAILABLE = False
    SELENIUM_WA_IMPORT_ERROR = str(err)

try:
    import screen_brightness_control as _sbc
    SBC_AVAILABLE = True
    SBC_IMPORT_ERROR = ''
except Exception as err:
    SBC_AVAILABLE = False
    SBC_IMPORT_ERROR = str(err)

try:
    from flask import Flask, jsonify, request
    from flask_cors import CORS
except ImportError:
    print('[JarvisServer] flask or flask-cors not installed.')
    print('Run: pip install flask flask-cors opencv-python mss numpy')
    sys.exit(1)

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════════════════════

PORT = 5001
FPS  = 20.0
SEARCH_TIMEOUT_SEC = 8.0
APPS_CONFIG_PATH = Path(__file__).resolve().parent / 'apps.json'
WEBSITES_CONFIG_PATH = Path(__file__).resolve().parent / 'websites.json'
SEARCH_ENGINES_CONFIG_PATH = Path(__file__).resolve().parent / 'search_engines.json'
CONTACTS_CONFIG_PATH = Path(__file__).resolve().parent / 'contacts.json'
BROWSER_ACTION_DELAY_SEC = 0.5
WHATSAPP_WAIT_TIME_SEC = 15
WHATSAPP_SELENIUM_PROFILE = 'C:/WhatsAppSession'
IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'}

# ═══════════════════════════════════════════════════════════════════════════════
# RECORDING STATE  (module-level so it survives across requests)
# ═══════════════════════════════════════════════════════════════════════════════

is_recording        = False
recording_thread    = None
video_writer        = None
current_rec_path    = ''
current_rec_file    = ''
recording_start_ts  = 0.0   # unix timestamp when recording began

_lock = threading.Lock()    # protect shared state


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def get_recordings_folder():
    """Returns ~/JARVIS/Recordings/, creating it if needed."""
    folder = Path.home() / 'JARVIS' / 'Recordings'
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _notify_windows(title: str, message: str):
    """Non-blocking Windows balloon notification."""
    try:
        import subprocess
        ps = (
            'Add-Type -AssemblyName System.Windows.Forms; '
            '$n = New-Object System.Windows.Forms.NotifyIcon; '
            '$n.Icon = [System.Drawing.SystemIcons]::Information; '
            '$n.Visible = $true; '
            f"$n.ShowBalloonTip(5000, '{title}', '{message}', "
            '[System.Windows.Forms.ToolTipIcon]::Info); '
            'Start-Sleep -Seconds 6; $n.Dispose()'
        )
        subprocess.Popen(
            ['powershell', '-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except Exception:
        pass  # notifications are best-effort


# ── File/folder search + open helpers ───────────────────────────────────────────
def _username():
    # Prefer the actual home-folder name (reliable on Windows even when display
    # name differs from the profile folder), then fall back to USERNAME.
    return Path.home().name or os.environ.get('USERNAME') or 'User'


def _user_root():
    return Path.home()


def _prefer_existing(primary: Path, fallback: Path):
    if primary.exists():
        return primary
    if fallback.exists():
        return fallback
    return primary


def _search_roots():
    user_root = _user_root()
    one_drive = user_root / 'OneDrive'
    roots = [
        _prefer_existing(user_root / 'Desktop', one_drive / 'Desktop'),
        _prefer_existing(user_root / 'Documents', one_drive / 'Documents'),
        _prefer_existing(user_root / 'Downloads', one_drive / 'Downloads'),
        _prefer_existing(user_root / 'Pictures', one_drive / 'Pictures'),
        _prefer_existing(user_root / 'Videos', one_drive / 'Videos'),
        _prefer_existing(user_root / 'Music', one_drive / 'Music'),
        Path('D:/'),
        user_root,
    ]
    # Keep original order, skip non-existent paths
    return [p for p in roots if p.exists()]


def _clean_search_term(value: str) -> str:
    return (value or '').strip().strip('"').strip("'")


def _find_file(filename: str):
    term = _clean_search_term(filename)
    if not term:
        return None

    term_lower = term.lower()
    best_contains = None
    started = time.time()

    for root in _search_roots():
        for dirpath, _, files in os.walk(root, topdown=True):
            if time.time() - started > SEARCH_TIMEOUT_SEC:
                return best_contains
            for fname in files:
                lower_name = fname.lower()
                full_path = Path(dirpath) / fname
                if lower_name == term_lower:
                    return full_path
                if term_lower in lower_name and best_contains is None:
                    best_contains = full_path
    return best_contains


# ── Windows shell (virtual) folders ───────────────────────────────────────────
# "This PC", "Recycle Bin", "Control Panel" and friends are shell namespace
# objects rather than directories, so os.walk can never find them. They are
# opened through explorer's shell: monikers instead. Every target below was
# verified against Shell.Application.Namespace() on Windows 11.
#
# Keys must be written in the form produced by _normalize_foldername():
# lowercase, punctuation stripped, filler words ("open", "my", "folder", …)
# removed, single-spaced.
_SHELL_FOLDERS = {
    # ── This PC / Explorer ──
    'this pc':                  ('This PC', 'shell:MyComputerFolder'),
    'pc':                       ('This PC', 'shell:MyComputerFolder'),
    'computer':                 ('This PC', 'shell:MyComputerFolder'),
    'this computer':            ('This PC', 'shell:MyComputerFolder'),
    'file explorer':            ('File Explorer', 'shell:MyComputerFolder'),
    'explorer':                 ('File Explorer', 'shell:MyComputerFolder'),
    'drives':                   ('This PC', 'shell:MyComputerFolder'),

    # ── Recycle Bin ──
    'recycle bin':              ('Recycle Bin', 'shell:RecycleBinFolder'),
    'recyclebin':               ('Recycle Bin', 'shell:RecycleBinFolder'),
    'recycle':                  ('Recycle Bin', 'shell:RecycleBinFolder'),
    'trash':                    ('Recycle Bin', 'shell:RecycleBinFolder'),
    'trash can':                ('Recycle Bin', 'shell:RecycleBinFolder'),
    'bin':                      ('Recycle Bin', 'shell:RecycleBinFolder'),
    'dustbin':                  ('Recycle Bin', 'shell:RecycleBinFolder'),
    'deleted files':            ('Recycle Bin', 'shell:RecycleBinFolder'),

    # ── Control surfaces ──
    'control panel':            ('Control Panel', 'shell:ControlPanelFolder'),
    'settings':                 ('Settings', 'ms-settings:'),
    'windows settings':         ('Settings', 'ms-settings:'),
    'programs and features':    ('Programs and Features', 'shell:ChangeRemoveProgramsFolder'),
    'installed programs':       ('Programs and Features', 'shell:ChangeRemoveProgramsFolder'),
    'add or remove programs':   ('Programs and Features', 'shell:ChangeRemoveProgramsFolder'),
    'uninstall programs':       ('Programs and Features', 'shell:ChangeRemoveProgramsFolder'),
    'applications':             ('Applications', 'shell:AppsFolder'),
    'all apps':                 ('Applications', 'shell:AppsFolder'),
    'installed apps':           ('Applications', 'shell:AppsFolder'),
    'printers':                 ('Printers', 'shell:PrintersFolder'),
    'fonts':                    ('Fonts', 'shell:Fonts'),
    'sync center':              ('Sync Center', 'shell:SyncCenterFolder'),

    # ── Network ──
    'network':                  ('Network', 'shell:NetworkPlacesFolder'),
    'network places':           ('Network', 'shell:NetworkPlacesFolder'),
    'network connections':      ('Network Connections', 'shell:ConnectionsFolder'),
    'wifi settings':            ('Network Connections', 'shell:ConnectionsFolder'),

    # ── System paths ──
    'windows':                  ('Windows', 'shell:Windows'),
    'system32':                 ('System32', 'shell:System'),
    'system':                   ('System32', 'shell:System'),
    'program files':            ('Program Files', 'shell:ProgramFiles'),
    'program files x86':        ('Program Files (x86)', 'shell:ProgramFilesX86'),
    'startup':                  ('Startup', 'shell:Startup'),
    'temp':                     ('Temp', '%TEMP%'),
    'temporary files':          ('Temp', '%TEMP%'),

    # ── User profile ──
    'user':                     ('User folder', 'shell:Profile'),
    'user profile':             ('User folder', 'shell:Profile'),
    'home':                     ('User folder', 'shell:Profile'),
    'profile':                  ('User folder', 'shell:Profile'),
    'public':                   ('Public', 'shell:Public'),
    'roaming':                  ('AppData\\Roaming', 'shell:AppData'),
    'local appdata':            ('AppData\\Local', 'shell:Local AppData'),
    'favorites':                ('Favorites', 'shell:Favorites'),
    'recent':                   ('Recent items', 'shell:Recent'),
    'recent files':             ('Recent items', 'shell:Recent'),
    'send to':                  ('Send To', 'shell:SendTo'),
}

# Words that carry no meaning when identifying a folder.
_FOLDER_FILLER_RE = re.compile(
    r'\b(open|opening|show|see|view|display|launch|bring|go|goto|take|me|up|'
    r'to|the|my|a|an|please|jarvis|now|window|folder|directory|dir)\b'
)


def _normalize_foldername(value: str) -> str:
    """Reduce a spoken folder name to a bare _SHELL_FOLDERS key."""
    term = _clean_search_term(value).lower()
    term = term.replace('&', ' and ')
    term = re.sub(r'[^a-z0-9 ]+', ' ', term)
    term = _FOLDER_FILLER_RE.sub(' ', term)
    return re.sub(r'\s+', ' ', term).strip()


def _resolve_shell_folder(foldername: str):
    """
    Map a spoken folder name to a Windows shell target.

    Returns (label, target) where target is handed straight to explorer, or
    None if the name isn't a known system location.
    """
    term = _normalize_foldername(foldername)
    if not term:
        return None

    entry = _SHELL_FOLDERS.get(term)
    if entry:
        label, target = entry
        return label, os.path.expandvars(target)

    # "C drive", "drive D", "the E drive" → that drive's root, if it exists.
    drive = re.match(r'^(?:drive ([a-z])|([a-z]) drive)$', term)
    if drive:
        letter = (drive.group(1) or drive.group(2)).upper()
        root = f'{letter}:\\'
        if os.path.isdir(root):
            return f'{letter}: drive', root

    return None


def _special_folders():
    user_root = _user_root()
    one_drive = user_root / 'OneDrive'
    return {
        'desktop': _prefer_existing(user_root / 'Desktop', one_drive / 'Desktop'),
        'documents': _prefer_existing(user_root / 'Documents', one_drive / 'Documents'),
        'downloads': _prefer_existing(user_root / 'Downloads', one_drive / 'Downloads'),
        'pictures': _prefer_existing(user_root / 'Pictures', one_drive / 'Pictures'),
        'videos': _prefer_existing(user_root / 'Videos', one_drive / 'Videos'),
        'music': _prefer_existing(user_root / 'Music', one_drive / 'Music'),
        'jarvis': user_root / 'JARVIS',
        'appdata': user_root / 'AppData',
    }


def _resolve_special_folder(foldername: str):
    term = _clean_search_term(foldername).lower()
    specials = _special_folders()
    if term in specials and specials[term].exists():
        return specials[term]
    return None


def _find_folder(foldername: str):
    term = _clean_search_term(foldername)
    if not term:
        return None

    direct_special = _resolve_special_folder(term)
    if direct_special:
        return direct_special

    term_lower = term.lower()
    best_contains = None
    started = time.time()

    for root in _search_roots():
        for dirpath, dirs, _ in os.walk(root, topdown=True):
            if time.time() - started > SEARCH_TIMEOUT_SEC:
                return best_contains
            for dname in dirs:
                lower_name = dname.lower()
                full_path = Path(dirpath) / dname
                if lower_name == term_lower:
                    return full_path
                if term_lower in lower_name and best_contains is None:
                    best_contains = full_path
    return best_contains


# ── App control helpers (open / close / running / add) ─────────────────────────
def _runtime_username():
    try:
        return os.getlogin()
    except Exception:
        return _username()


def _load_apps_config():
    if not APPS_CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(APPS_CONFIG_PATH.read_text(encoding='utf-8'))
    except Exception:
        return {}


def _save_apps_config(apps):
    APPS_CONFIG_PATH.write_text(json.dumps(apps, indent=2), encoding='utf-8')


def _normalize_appname(app_name: str) -> str:
    cleaned = _clean_search_term(app_name).lower()
    cleaned = re.sub(r'\b(open|launch|start|run|close|quit|exit|kill|app)\b', ' ', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned


def _expand_path(path_template: str):
    username = _runtime_username()
    expanded = (path_template or '').replace('{username}', username)
    if '*' in expanded:
        matches = glob.glob(expanded)
        if matches:
            return matches[0]
    return expanded


def _resolve_app(app_name: str, apps):
    query = _normalize_appname(app_name)
    if not query:
        return None, None

    # 1) exact key / alias
    for canonical, info in apps.items():
        if canonical.lower() == query:
            return canonical, info
        aliases = info.get('aliases') or []
        if any(_normalize_appname(alias) == query for alias in aliases):
            return canonical, info

    # 2) partial key / alias
    for canonical, info in apps.items():
        key_norm = _normalize_appname(canonical)
        if query in key_norm or key_norm in query:
            return canonical, info
        aliases = info.get('aliases') or []
        for alias in aliases:
            alias_norm = _normalize_appname(alias)
            if query in alias_norm or alias_norm in query:
                return canonical, info

    return None, None


def _launch_app_path(app_path: str):
    candidate = _expand_path(app_path)
    path_like = any(ch in candidate for ch in ('/', '\\'))

    if path_like and os.path.exists(candidate):
        subprocess.Popen([candidate])
        return True, candidate

    if path_like:
        fallback_exe = os.path.basename(candidate)
        if fallback_exe:
            try:
                subprocess.Popen([fallback_exe])
                return True, fallback_exe
            except Exception:
                return False, candidate
        return False, candidate

    try:
        subprocess.Popen([candidate])
        return True, candidate
    except Exception:
        return False, candidate


# Web-only services that open in Chrome when requested
_WEB_SERVICES = {
    'youtube': 'https://www.youtube.com',
    'netflix': 'https://www.netflix.com',
    'amazon prime': 'https://www.primevideo.com',
    'prime video': 'https://www.primevideo.com',
    'hotstar': 'https://www.hotstar.com',
    'disney plus': 'https://www.disneyplus.com',
    'disney+': 'https://www.disneyplus.com',
    'hulu': 'https://www.hulu.com',
    'twitch': 'https://www.twitch.tv',
    'reddit': 'https://www.reddit.com',
    'twitter': 'https://www.twitter.com',
    'x': 'https://www.x.com',
    'facebook': 'https://www.facebook.com',
    'instagram': 'https://www.instagram.com',
    'linkedin': 'https://www.linkedin.com',
    'github': 'https://www.github.com',
    'gmail': 'https://mail.google.com',
    'google drive': 'https://drive.google.com',
    'google docs': 'https://docs.google.com',
    'google sheets': 'https://sheets.google.com',
    'google slides': 'https://slides.google.com',
    'google maps': 'https://maps.google.com',
    'google meet': 'https://meet.google.com',
    'google calendar': 'https://calendar.google.com',
    'google translate': 'https://translate.google.com',
    'chatgpt': 'https://chat.openai.com',
    'openai': 'https://chat.openai.com',
    'claude': 'https://claude.ai',
    'perplexity': 'https://www.perplexity.ai',
    'gemini': 'https://gemini.google.com',
    'amazon': 'https://www.amazon.in',
    'flipkart': 'https://www.flipkart.com',
    'stackoverflow': 'https://stackoverflow.com',
    'stack overflow': 'https://stackoverflow.com',
    'wikipedia': 'https://www.wikipedia.org',
    'outlook': 'https://outlook.live.com',
    'office': 'https://www.office.com',
    'onedrive': 'https://onedrive.live.com',
    'notion': 'https://www.notion.so',
    'trello': 'https://trello.com',
    'slack web': 'https://app.slack.com',
    'figma': 'https://www.figma.com',
}


def _open_in_chrome(url: str):
    """Open a URL in Chrome (or default browser as fallback)."""
    chrome_paths = [
        r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    ]
    for path in chrome_paths:
        if os.path.exists(path):
            try:
                subprocess.Popen([path, url])
                return True
            except Exception:
                pass
    # Fall back to default browser
    try:
        import webbrowser
        webbrowser.open(url)
        return True
    except Exception:
        return False


def _open_app(app_name: str):
    apps = _load_apps_config()
    canonical, info = _resolve_app(app_name, apps)

    if info:
        launch_ok, used = _launch_app_path(info.get('path', ''))
        display_name = canonical.title()
        if launch_ok:
            return {
                'success': True,
                'message': f'Opening {display_name}',
                'appname': canonical,
                'path': used,
            }
        return {
            'success': False,
            'message': f"App path not found or failed to launch: {display_name}",
            'appname': canonical,
        }

    # Fallback 1: try raw name and raw.exe
    raw = _normalize_appname(app_name)
    candidates = [raw]
    if raw and not raw.endswith('.exe'):
        candidates.append(f'{raw}.exe')
    for cand in candidates:
        if not cand:
            continue
        try:
            subprocess.Popen([cand])
            return {
                'success': True,
                'message': f'Opening {raw}',
                'appname': raw,
                'path': cand,
            }
        except Exception:
            continue

    # Fallback 2: check if it's a known web service → open in Chrome
    query_lower = _normalize_appname(app_name).lower()
    for svc_name, svc_url in _WEB_SERVICES.items():
        if svc_name in query_lower or query_lower in svc_name:
            ok = _open_in_chrome(svc_url)
            display = raw.title() or svc_name.title()
            if ok:
                return {
                    'success': True,
                    'message': f'Opening {display} in Chrome',
                    'appname': display,
                    'openedInBrowser': True,
                    'url': svc_url,
                }

    # Fallback 3: if the name looks like a website, open it in Chrome
    if any(tld in query_lower for tld in ['.com', '.in', '.org', '.net', '.io', '.ai', '.tv']):
        url = query_lower if query_lower.startswith('http') else f'https://{query_lower}'
        ok = _open_in_chrome(url)
        if ok:
            return {
                'success': True,
                'message': f'Opening {query_lower} in Chrome',
                'appname': query_lower,
                'openedInBrowser': True,
                'url': url,
            }

    return {
        'success': False,
        'message': f"I couldn't find {raw or app_name} on your system or in my web services list. You can add it by saying 'add app {raw or app_name}'.",
        'appname': raw or app_name,
    }


def _close_app(app_name: str):
    apps = _load_apps_config()
    canonical, info = _resolve_app(app_name, apps)

    process_name = ''
    display_name = _normalize_appname(app_name) or app_name
    if info:
        process_name = info.get('process', '')
        display_name = canonical
    if not process_name:
        normalized = _normalize_appname(app_name)
        process_name = normalized if normalized.endswith('.exe') else f'{normalized}.exe'

    if not process_name:
        return {'success': False, 'message': 'No app name specified'}

    result = subprocess.run(
        ['taskkill', '/F', '/IM', process_name],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return {
            'success': True,
            'message': f'{display_name.title()} closed',
            'appname': display_name,
            'process': process_name,
        }

    stderr = (result.stderr or '').strip()
    stdout = (result.stdout or '').strip()
    err_msg = stderr or stdout or f'Could not close {display_name}'
    return {
        'success': False,
        'message': err_msg,
        'appname': display_name,
        'process': process_name,
    }


def _running_apps():
    if not PSUTIL_AVAILABLE:
        return {'success': False, 'message': 'psutil not installed. Run: pip install psutil', 'apps': []}

    apps = _load_apps_config()
    if not apps:
        return {'success': True, 'apps': []}

    running = set()
    for proc in psutil.process_iter(['name']):
        name = (proc.info.get('name') or '').lower()
        if name:
            running.add(name)

    matches = []
    for canonical, info in apps.items():
        proc_name = (info.get('process') or '').lower()
        if proc_name and proc_name in running:
            matches.append(canonical)

    return {'success': True, 'apps': sorted(matches)}


def _add_app(app_name: str, app_path: str):
    canonical = _normalize_appname(app_name)
    raw_path = _clean_search_term(app_path)
    if not canonical or not raw_path:
        return {'success': False, 'message': 'appname and path are required'}

    apps = _load_apps_config()
    process_name = os.path.basename(_expand_path(raw_path)) or f'{canonical}.exe'
    apps[canonical] = {
        'path': raw_path,
        'process': process_name,
        'aliases': apps.get(canonical, {}).get('aliases', []),
    }
    _save_apps_config(apps)
    return {
        'success': True,
        'message': f'{canonical.title()} added to JARVIS app list',
        'appname': canonical,
        'path': raw_path,
    }


# ── Browser control helpers (search / open site / actions / current URL) ──────
def _load_json_config(path: Path, default: dict):
    if not path.exists():
        return dict(default)
    try:
        loaded = json.loads(path.read_text(encoding='utf-8'))
        if isinstance(loaded, dict):
            return loaded
        return dict(default)
    except Exception:
        return dict(default)


def _websites_config():
    default = {
        'youtube': 'https://www.youtube.com',
        'google': 'https://www.google.com',
        'github': 'https://www.github.com',
        'instagram': 'https://www.instagram.com',
    }
    return _load_json_config(WEBSITES_CONFIG_PATH, default)


def _search_engines_config():
    default = {
        'google': 'https://www.google.com/search?q=',
        'youtube': 'https://www.youtube.com/results?search_query=',
        'bing': 'https://www.bing.com/search?q=',
        'github': 'https://www.github.com/search?q=',
    }
    return _load_json_config(SEARCH_ENGINES_CONFIG_PATH, default)


def _normalize_site_query(site_name: str):
    cleaned = _clean_search_term(site_name).lower()
    cleaned = re.sub(r'\b(open|go to|take me to|website|site|browser|on)\b', ' ', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned


def _looks_like_url(value: str):
    lowered = (value or '').lower()
    return lowered.startswith(('http://', 'https://', 'www.')) or any(
        token in lowered for token in ('.com', '.in', '.org', '.net', '.io', '.dev')
    )


def _normalize_url(value: str):
    raw = _clean_search_term(value)
    if not raw:
        return ''
    if raw.startswith(('http://', 'https://')):
        return raw
    return f'https://{raw}'


def _open_url(url: str):
    webbrowser.open(url, new=2)


def _search_web(query: str, engine: str = 'google'):
    raw_query = _clean_search_term(query)
    if not raw_query:
        return {'success': False, 'message': 'query is required'}

    engines = _search_engines_config()
    selected_engine = _clean_search_term(engine).lower() or 'google'
    base = engines.get(selected_engine) or engines.get('google')
    if not base:
        return {'success': False, 'message': 'No search engine URL configured'}

    search_url = f'{base}{quote(raw_query)}'
    _open_url(search_url)
    return {
        'success': True,
        'message': f'Searching {selected_engine.title()} for {raw_query}',
        'engine': selected_engine,
        'query': raw_query,
        'url': search_url,
    }


def _open_website(site_name: str):
    site = _clean_search_term(site_name)
    if not site:
        return {'success': False, 'message': 'site is required'}

    if _looks_like_url(site):
        url = _normalize_url(site)
        _open_url(url)
        return {
            'success': True,
            'message': f'Opening {site}',
            'site': site,
            'url': url,
        }

    websites = _websites_config()
    query = _normalize_site_query(site)
    exact_match = None
    contains_match = None
    for key, url in websites.items():
        normalized_key = _normalize_site_query(key)
        if normalized_key == query:
            exact_match = (key, url)
            break
        if contains_match is None and (query in normalized_key or normalized_key in query):
            contains_match = (key, url)

    selected = exact_match or contains_match
    if selected:
        key, url = selected
        _open_url(url)
        return {
            'success': True,
            'message': f'Opening {key.title()}',
            'site': key,
            'url': url,
        }

    fallback = _search_web(site, 'google')
    if fallback.get('success'):
        fallback['message'] = f'Could not find {site} directly. Searching Google instead'
        fallback['site'] = site
    return fallback


def _browser_action(action_name: str):
    action = _clean_search_term(action_name).lower()
    if not action:
        return {'success': False, 'message': 'action is required'}

    if action == 'close_browser':
        result = subprocess.run(
            ['taskkill', '/F', '/IM', 'chrome.exe'],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            return {'success': True, 'message': 'Closing Chrome', 'action': action}
        err = (result.stderr or result.stdout or 'Could not close browser').strip()
        return {'success': False, 'message': err, 'action': action}

    if not PYAUTOGUI_AVAILABLE:
        return {'success': False, 'message': 'pyautogui not installed. Run: pip install pyautogui', 'action': action}

    time.sleep(BROWSER_ACTION_DELAY_SEC)
    if action == 'new_tab':
        pyautogui.hotkey('ctrl', 't')
        return {'success': True, 'message': 'New tab opened', 'action': action}
    if action == 'close_tab':
        pyautogui.hotkey('ctrl', 'w')
        return {'success': True, 'message': 'Tab closed', 'action': action}
    if action == 'go_back':
        pyautogui.hotkey('alt', 'left')
        return {'success': True, 'message': 'Going back', 'action': action}
    if action == 'refresh':
        pyautogui.press('f5')
        return {'success': True, 'message': 'Page refreshed', 'action': action}
    if action == 'zoom_in':
        pyautogui.hotkey('ctrl', '=')
        return {'success': True, 'message': 'Zooming in', 'action': action}
    if action == 'zoom_out':
        pyautogui.hotkey('ctrl', '-')
        return {'success': True, 'message': 'Zooming out', 'action': action}
    return {'success': False, 'message': f'Unsupported browser action: {action}', 'action': action}


def _get_active_tab_url():
    if not PYAUTOGUI_AVAILABLE:
        return {'success': False, 'message': 'pyautogui not installed. Run: pip install pyautogui'}
    if not PYPERCLIP_AVAILABLE:
        return {'success': False, 'message': 'pyperclip not installed. Run: pip install pyperclip'}

    time.sleep(BROWSER_ACTION_DELAY_SEC)
    pyautogui.hotkey('ctrl', 'l')     # focus address bar
    time.sleep(0.1)
    pyautogui.hotkey('ctrl', 'a')
    pyautogui.hotkey('ctrl', 'c')
    time.sleep(0.15)
    url = (pyperclip.paste() or '').strip()
    if not url:
        return {'success': False, 'message': 'Could not read current URL'}
    return {'success': True, 'message': f'You are on {url}', 'url': url}


# ── Volume control helpers (Windows / pycaw) ───────────────────────────────────
def _volume_unavailable():
    message = 'pycaw/comtypes not installed. Run: pip install pycaw comtypes'
    if PYCAW_IMPORT_ERROR:
        message = f'{message} ({PYCAW_IMPORT_ERROR})'
    return {'success': False, 'message': message}


def _get_volume_interface():
    if not PYCAW_AVAILABLE:
        raise RuntimeError(_volume_unavailable()['message'])
    devices = AudioUtilities.GetSpeakers()
    if hasattr(devices, 'EndpointVolume'):
        return devices.EndpointVolume
    interface = devices.Activate(
        IAudioEndpointVolume._iid_,
        CLSCTX_ALL,
        None,
    )
    return cast(interface, POINTER(IAudioEndpointVolume))


def _get_current_volume_level():
    volume = _get_volume_interface()
    current = volume.GetMasterVolumeLevelScalar()
    return round(current * 100)


def _set_volume_level(level: int):
    clamped = max(0, min(100, int(level)))
    volume = _get_volume_interface()
    volume.SetMasterVolumeLevelScalar(clamped / 100, None)
    return clamped


def _volume_up(step: int = 10):
    amount = max(1, min(100, int(step)))
    current = _get_current_volume_level()
    return _set_volume_level(min(100, current + amount))


def _volume_down(step: int = 10):
    amount = max(1, min(100, int(step)))
    current = _get_current_volume_level()
    return _set_volume_level(max(0, current - amount))


def _set_system_mute(state: bool):
    volume = _get_volume_interface()
    volume.SetMute(1 if state else 0, None)
    return state


def _is_muted():
    volume = _get_volume_interface()
    return bool(volume.GetMute())


def _toggle_mute():
    muted = _is_muted()
    _set_system_mute(not muted)
    return 'unmuted' if muted else 'muted'


# ═══════════════════════════════════════════════════════════════════════════════
# WHATSAPP HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _load_contacts():
    """Read contacts.json fresh on every call so new contacts apply without restart."""
    try:
        with open(CONTACTS_CONFIG_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, dict):
                return {str(k).lower().strip(): str(v).strip() for k, v in data.items()}
    except FileNotFoundError:
        return {}
    except (json.JSONDecodeError, OSError) as err:
        print(f'[JarvisServer] contacts.json read error: {err}')
    return {}


def _find_contact(name: str):
    """Case-insensitive exact match first, then partial match. Returns phone or None."""
    contacts = _load_contacts()
    key = (name or '').lower().strip()
    if not key:
        return None
    if key in contacts:
        return contacts[key]
    for contact, number in contacts.items():
        if key in contact or contact in key:
            return number
    return None


def _search_file_for_whatsapp(filename: str):
    """Locate a file by (partial) name across common user folders. Returns full path or None."""
    term = _clean_search_term(filename)
    if not term:
        return None
    term_lower = term.lower()
    started = time.time()
    best_contains = None
    for root in _search_roots():
        for dirpath, _, files in os.walk(root, topdown=True):
            if time.time() - started > SEARCH_TIMEOUT_SEC:
                return best_contains
            for fname in files:
                lower_name = fname.lower()
                full_path = os.path.join(dirpath, fname)
                if lower_name == term_lower:
                    return full_path
                if term_lower in lower_name and best_contains is None:
                    best_contains = full_path
    return best_contains


def _get_latest_screenshot():
    """Return the most recently created screenshot in the JARVIS Screenshots folder."""
    user_root = _user_root()
    candidates = [
        _prefer_existing(user_root / 'JARVIS' / 'Screenshots', user_root / 'OneDrive' / 'JARVIS' / 'Screenshots'),
        _prefer_existing(user_root / 'Pictures' / 'Screenshots', user_root / 'OneDrive' / 'Pictures' / 'Screenshots'),
    ]
    newest = None
    newest_ts = -1.0
    for folder in candidates:
        if not folder.exists():
            continue
        for pattern in ('*.png', '*.jpg', '*.jpeg'):
            for f in folder.glob(pattern):
                try:
                    ts = f.stat().st_ctime
                except OSError:
                    continue
                if ts > newest_ts:
                    newest_ts = ts
                    newest = str(f)
    return newest


def _normalize_phone(phone: str) -> str:
    cleaned = re.sub(r'[^\d+]', '', phone or '')
    if cleaned and not cleaned.startswith('+'):
        cleaned = '+' + cleaned
    return cleaned


def _add_contact(name: str, phone: str):
    """Add or update a contact in contacts.json and persist it."""
    key = (name or '').lower().strip()
    number = _normalize_phone(phone)
    if not key:
        return {'success': False, 'message': 'No contact name provided'}
    if not number or len(re.sub(r'\D', '', number)) < 7:
        return {'success': False, 'message': 'Invalid phone number'}
    contacts = _load_contacts()
    contacts[key] = number
    try:
        with open(CONTACTS_CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(contacts, f, indent=2, ensure_ascii=False)
    except OSError as err:
        return {'success': False, 'message': f'Could not save contact: {err}'}
    display = name.strip().title()
    return {'success': True, 'name': display, 'phone': number,
            'message': f'{display} added to contacts'}


def _send_whatsapp_message(contact_name: str, message: str):
    """Send a WhatsApp text message via pywhatkit (WhatsApp Web must be logged in)."""
    if not PYWHATKIT_AVAILABLE:
        return {'success': False,
                'message': f'pywhatkit not available: {PYWHATKIT_IMPORT_ERROR or "not installed"}. '
                           'Run: pip install pywhatkit'}
    phone = _find_contact(contact_name)
    if not phone:
        return {'success': False, 'contactMissing': True,
                'message': f'Contact not found: {contact_name}'}
    if not message or not message.strip():
        return {'success': False, 'message': 'No message text provided'}
    try:
        _pywhatkit.sendwhatmsg_instantly(
            phone_no=phone,
            message=message,
            wait_time=WHATSAPP_WAIT_TIME_SEC,
            tab_close=True,
        )
        display = contact_name.strip().title()
        return {'success': True, 'contact': display,
                'message': f'Message sent to {display}'}
    except Exception as err:
        return {'success': False, 'message': f'WhatsApp message failed: {err}'}


def _send_file_via_selenium(phone_number: str, file_path: str, caption: str = ''):
    """Send any file (PDF/DOCX/etc) via WhatsApp Web using a persistent Chrome profile."""
    if not SELENIUM_WA_AVAILABLE:
        return {'success': False,
                'message': f'selenium not available: {SELENIUM_WA_IMPORT_ERROR or "not installed"}. '
                           'Run: pip install selenium webdriver-manager'}
    driver = None
    try:
        options = _WaChromeOptions()
        options.add_argument(f'--user-data-dir={WHATSAPP_SELENIUM_PROFILE}')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        if _WaChromeDriverManager is not None:
            service = _WaChromeService(_WaChromeDriverManager().install())
            driver = _wa_webdriver.Chrome(service=service, options=options)
        else:
            driver = _wa_webdriver.Chrome(options=options)

        driver.get(f'https://web.whatsapp.com/send?phone={phone_number.lstrip("+")}')
        wait = _WaWait(driver, 40)
        time.sleep(6)

        attach_btn = wait.until(_wa_EC.element_to_be_clickable(
            (_WaBy.XPATH, '//div[@title="Attach"] | //span[@data-icon="plus"] | //span[@data-icon="attach-menu-plus"] | //div[@aria-label="Attach"]')))
        attach_btn.click()
        time.sleep(1)

        doc_input = wait.until(_wa_EC.presence_of_element_located(
            (_WaBy.XPATH, '//input[@accept="*"] | (//input[@type="file"])[last()]')))
        doc_input.send_keys(file_path)
        time.sleep(3)

        if caption:
            try:
                caption_box = driver.find_element(
                    _WaBy.XPATH, '//div[@contenteditable="true"][@data-tab]')
                caption_box.send_keys(caption)
            except Exception:
                pass

        send_btn = wait.until(_wa_EC.element_to_be_clickable(
            (_WaBy.XPATH, '//span[@data-icon="send"] | //div[@aria-label="Send"]')))
        send_btn.click()
        time.sleep(4)
        return {'success': True, 'message': 'File sent'}
    except Exception as err:
        return {'success': False, 'message': f'WhatsApp file send failed: {err}'}
    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass


def _send_whatsapp_file(contact_name: str, filename: str, caption: str = ''):
    """Send a file to a contact. Images use pywhatkit; other files use selenium."""
    phone = _find_contact(contact_name)
    if not phone:
        return {'success': False, 'contactMissing': True,
                'message': f'Contact not found: {contact_name}'}

    if (filename or '').strip().lower() in ('latest_screenshot', 'last screenshot', 'latest screenshot'):
        filepath = _get_latest_screenshot()
        if not filepath:
            return {'success': False, 'fileMissing': True,
                    'message': 'No screenshot found to send'}
    else:
        filepath = _search_file_for_whatsapp(filename)
        if not filepath:
            return {'success': False, 'fileMissing': True,
                    'message': f'File not found: {filename}'}

    display = contact_name.strip().title()
    ext = os.path.splitext(filepath)[1].lower()
    shown_name = os.path.basename(filepath)

    if ext in IMAGE_EXTENSIONS:
        if not PYWHATKIT_AVAILABLE:
            return {'success': False,
                    'message': f'pywhatkit not available: {PYWHATKIT_IMPORT_ERROR or "not installed"}.'}
        try:
            _pywhatkit.sendwhats_image(
                receiver=phone,
                img_path=filepath,
                caption=caption or '',
                wait_time=WHATSAPP_WAIT_TIME_SEC,
                tab_close=True,
            )
            return {'success': True, 'contact': display, 'filename': shown_name,
                    'message': f'{shown_name} sent to {display}'}
        except Exception as err:
            return {'success': False, 'message': f'WhatsApp image send failed: {err}'}

    result = _send_file_via_selenium(phone, filepath, caption or '')
    if result.get('success'):
        result.update({'contact': display, 'filename': shown_name,
                       'message': f'{shown_name} sent to {display}'})
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# SYSTEM CONTROL HELPERS  (power / info / brightness)
# ═══════════════════════════════════════════════════════════════════════════════

def _psutil_unavailable():
    return {'success': False,
            'message': 'psutil not installed. Run: pip install psutil'}


def _lock_screen():
    subprocess.run(['rundll32.exe', 'user32.dll,LockWorkStation'], check=False)
    return {'success': True, 'message': 'Screen locked'}


def _sleep_system():
    # Second arg 0 = sleep (not hibernate); third 0 = don't force
    subprocess.run(['rundll32.exe', 'powrprof.dll,SetSuspendState', '0', '1', '0'], check=False)
    return {'success': True, 'message': 'Going to sleep'}


def _shutdown_system(minutes=0):
    minutes = max(0, int(minutes or 0))
    seconds = 5 if minutes == 0 else minutes * 60
    subprocess.run(['shutdown', '/s', '/t', str(seconds)], check=False)
    message = 'Shutting down in 5 seconds' if minutes == 0 else f'Shutting down in {minutes} minutes'
    return {'success': True, 'minutes': minutes, 'seconds': seconds, 'message': message}


def _cancel_shutdown():
    result = subprocess.run(['shutdown', '/a'], check=False,
                            capture_output=True, text=True)
    if result.returncode != 0:
        return {'success': False, 'message': 'No shutdown was scheduled'}
    return {'success': True, 'message': 'Shutdown cancelled'}


def _restart_system(minutes=0):
    minutes = max(0, int(minutes or 0))
    seconds = 5 if minutes == 0 else minutes * 60
    subprocess.run(['shutdown', '/r', '/t', str(seconds)], check=False)
    message = 'Restarting in 5 seconds' if minutes == 0 else f'Restarting in {minutes} minutes'
    return {'success': True, 'minutes': minutes, 'seconds': seconds, 'message': message}


def _logoff_system():
    subprocess.run(['shutdown', '/l'], check=False)
    return {'success': True, 'message': 'Logging off'}


def _get_battery_info():
    if not PSUTIL_AVAILABLE:
        return _psutil_unavailable()
    battery = psutil.sensors_battery()
    if battery is None:
        return {'success': True, 'plugged': True, 'percent': 100, 'time_left': '',
                'message': 'No battery detected — running on AC power'}
    percent = round(battery.percent)
    plugged = bool(battery.power_plugged)
    status = 'charging' if plugged else 'on battery'
    time_left = ''
    secsleft = battery.secsleft
    unknown = secsleft in (
        getattr(psutil, 'POWER_TIME_UNKNOWN', -1),
        getattr(psutil, 'POWER_TIME_UNLIMITED', -2),
    )
    # psutil can report a sentinel/garbage value (e.g. ~2^32) when the
    # remaining time is unknown — bound it to a sane range (< 48h).
    if (not plugged and isinstance(secsleft, int) and not unknown
            and 0 < secsleft < 172800):
        hours = secsleft // 3600
        mins = (secsleft % 3600) // 60
        time_left = f'{hours}h {mins}m remaining'
    msg = f'Battery at {percent}%, {status}.'
    if time_left:
        msg += f' {time_left}'
    return {'success': True, 'percent': percent, 'plugged': plugged,
            'time_left': time_left, 'message': msg}


def _get_ram_info():
    if not PSUTIL_AVAILABLE:
        return _psutil_unavailable()
    ram = psutil.virtual_memory()
    total = round(ram.total / (1024 ** 3), 1)
    available = round(ram.available / (1024 ** 3), 1)
    used = round(ram.used / (1024 ** 3), 1)
    percent = ram.percent
    return {'success': True, 'total_gb': total, 'available_gb': available,
            'used_gb': used, 'percent_used': percent,
            'message': f'{available}GB free out of {total}GB total RAM. {percent}% in use'}


def _get_cpu_info():
    if not PSUTIL_AVAILABLE:
        return _psutil_unavailable()
    cpu_percent = psutil.cpu_percent(interval=1)
    cpu_count = psutil.cpu_count()
    cpu_freq = psutil.cpu_freq()
    freq_ghz = round(cpu_freq.current / 1000, 2) if cpu_freq else 0
    return {'success': True, 'percent': cpu_percent, 'cores': cpu_count,
            'frequency_ghz': freq_ghz,
            'message': f'CPU usage is {cpu_percent}% across {cpu_count} cores at {freq_ghz}GHz'}


def _get_disk_info():
    if not PSUTIL_AVAILABLE:
        return _psutil_unavailable()
    disk = psutil.disk_usage('C:/')
    total = round(disk.total / (1024 ** 3), 1)
    free = round(disk.free / (1024 ** 3), 1)
    used = round(disk.used / (1024 ** 3), 1)
    percent = disk.percent
    return {'success': True, 'total_gb': total, 'free_gb': free, 'used_gb': used,
            'percent_used': percent,
            'message': f'C drive has {free}GB free out of {total}GB total. {percent}% used'}


def _get_ip_address():
    hostname = _socket.gethostname()
    local_ip = ''
    # Prefer the outbound-interface IP (avoids returning 127.0.0.1 on some setups)
    try:
        s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
        try:
            s.connect(('8.8.8.8', 80))
            local_ip = s.getsockname()[0]
        finally:
            s.close()
    except OSError:
        local_ip = ''
    if not local_ip:
        try:
            local_ip = _socket.gethostbyname(hostname)
        except OSError:
            local_ip = '127.0.0.1'
    return {'success': True, 'ip': local_ip, 'hostname': hostname,
            'message': f'Your IP address is {local_ip}'}


def _get_full_system_info():
    battery = _get_battery_info()
    ram = _get_ram_info()
    cpu = _get_cpu_info()
    disk = _get_disk_info()
    ip = _get_ip_address()
    parts = []
    if battery.get('percent') is not None:
        parts.append(f"Battery {battery.get('percent')}%")
    if ram.get('available_gb') is not None:
        parts.append(f"RAM {ram.get('available_gb')}GB free")
    if cpu.get('percent') is not None:
        parts.append(f"CPU {cpu.get('percent')}%")
    if disk.get('free_gb') is not None:
        parts.append(f"Disk {disk.get('free_gb')}GB free")
    return {'success': True, 'battery': battery, 'ram': ram, 'cpu': cpu,
            'disk': disk, 'ip': ip, 'message': ', '.join(parts)}


# ── Brightness ──────────────────────────────────────────────────────────────────

def _brightness_via_powershell(level):
    """Fallback brightness setter using WMI when screen_brightness_control fails."""
    level = max(0, min(100, int(level)))
    ps = ('(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods)'
          f'.WmiSetBrightness(1,{level})')
    result = subprocess.run(['powershell', '-NoProfile', '-Command', ps],
                            check=False, capture_output=True, text=True)
    return result.returncode == 0


def _get_brightness_level():
    if SBC_AVAILABLE:
        try:
            values = _sbc.get_brightness()
            if isinstance(values, (list, tuple)) and values:
                return int(values[0])
            if isinstance(values, int):
                return int(values)
        except Exception:
            pass
    # Fallback: query via WMI
    try:
        ps = ('(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness)'
              '.CurrentBrightness')
        result = subprocess.run(['powershell', '-NoProfile', '-Command', ps],
                                check=False, capture_output=True, text=True)
        line = (result.stdout or '').strip().splitlines()
        if line:
            return int(line[0])
    except Exception:
        pass
    return None


def _set_brightness_level(level):
    level = max(0, min(100, int(level)))
    if SBC_AVAILABLE:
        try:
            _sbc.set_brightness(level)
            return {'success': True, 'level': level,
                    'message': f'Brightness set to {level}%'}
        except Exception:
            pass
    if _brightness_via_powershell(level):
        return {'success': True, 'level': level,
                'message': f'Brightness set to {level}%'}
    return {'success': False,
            'message': 'Brightness control not supported on this display'}


def _brightness_up(step=10):
    current = _get_brightness_level()
    if current is None:
        current = 50
    return _set_brightness_level(min(100, current + int(step)))


def _brightness_down(step=10):
    current = _get_brightness_level()
    if current is None:
        current = 50
    return _set_brightness_level(max(0, current - int(step)))


# ═══════════════════════════════════════════════════════════════════════════════
# CLIPBOARD CONTROL HELPERS  (read / copy / paste / history)
# ═══════════════════════════════════════════════════════════════════════════════

CLIPBOARD_HISTORY_FILE = str(
    Path(os.path.expanduser('~')) / 'JARVIS' / 'clipboard_history.json'
)
CLIPBOARD_MAX_HISTORY = 10


def _pyperclip_unavailable():
    return {'success': False,
            'message': 'pyperclip not installed. Run: pip install pyperclip'}


def _pyautogui_unavailable():
    return {'success': False,
            'message': 'pyautogui not installed. Run: pip install pyautogui'}


def _load_clipboard_history():
    try:
        with open(CLIPBOARD_HISTORY_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def _save_clipboard_history(history):
    try:
        Path(CLIPBOARD_HISTORY_FILE).parent.mkdir(parents=True, exist_ok=True)
        with open(CLIPBOARD_HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=2, ensure_ascii=False)
    except Exception as err:
        print(f'[Clipboard] Could not save history: {err}')


def _add_to_clipboard_history(text):
    if not text or len(text.strip()) == 0:
        return
    history = _load_clipboard_history()
    if text in history:
        history.remove(text)
    history.insert(0, text)
    history = history[:CLIPBOARD_MAX_HISTORY]
    _save_clipboard_history(history)


def _read_clipboard():
    if not PYPERCLIP_AVAILABLE:
        return _pyperclip_unavailable()
    text = pyperclip.paste() or ''
    if not text:
        return {'success': True, 'text': '', 'short': '',
                'message': 'Your clipboard is empty'}
    short = (text[:100] + '...') if len(text) > 100 else text
    return {'success': True, 'text': text, 'short': short,
            'message': f'Clipboard contains: {short}'}


def _copy_text(text):
    if not PYPERCLIP_AVAILABLE:
        return _pyperclip_unavailable()
    text = text or ''
    pyperclip.copy(text)
    _add_to_clipboard_history(text)
    return {'success': True, 'text': text,
            'message': f'Copied to clipboard: {text[:50]}'}


def _simulate_copy():
    if not PYAUTOGUI_AVAILABLE:
        return _pyautogui_unavailable()
    time.sleep(0.3)
    pyautogui.hotkey('ctrl', 'c')
    time.sleep(0.3)
    text = pyperclip.paste() if PYPERCLIP_AVAILABLE else ''
    _add_to_clipboard_history(text)
    return {'success': True, 'text': text, 'message': 'Copied selected text'}


def _simulate_paste():
    if not PYAUTOGUI_AVAILABLE:
        return _pyautogui_unavailable()
    time.sleep(0.3)
    pyautogui.hotkey('ctrl', 'v')
    return {'success': True, 'message': 'Pasted from clipboard'}


def _simulate_cut():
    if not PYAUTOGUI_AVAILABLE:
        return _pyautogui_unavailable()
    time.sleep(0.3)
    pyautogui.hotkey('ctrl', 'x')
    time.sleep(0.3)
    text = pyperclip.paste() if PYPERCLIP_AVAILABLE else ''
    _add_to_clipboard_history(text)
    return {'success': True, 'text': text, 'message': 'Cut selected text'}


def _simulate_select_all():
    if not PYAUTOGUI_AVAILABLE:
        return _pyautogui_unavailable()
    time.sleep(0.3)
    pyautogui.hotkey('ctrl', 'a')
    return {'success': True, 'message': 'Selected all'}


def _simulate_undo():
    if not PYAUTOGUI_AVAILABLE:
        return _pyautogui_unavailable()
    time.sleep(0.3)
    pyautogui.hotkey('ctrl', 'z')
    return {'success': True, 'message': 'Undone'}


def _simulate_redo():
    if not PYAUTOGUI_AVAILABLE:
        return _pyautogui_unavailable()
    time.sleep(0.3)
    pyautogui.hotkey('ctrl', 'y')
    return {'success': True, 'message': 'Redone'}


def _get_clipboard_history():
    history = _load_clipboard_history()
    return {'success': True, 'history': history, 'count': len(history)}


def _paste_from_history(index):
    try:
        index = int(index)
    except (TypeError, ValueError):
        return {'success': False, 'message': 'Invalid history position'}
    history = _load_clipboard_history()
    if index < 1 or index > len(history):
        return {'success': False, 'message': f'No item at position {index}'}
    text = history[index - 1]
    if PYPERCLIP_AVAILABLE:
        pyperclip.copy(text)
    if PYAUTOGUI_AVAILABLE:
        time.sleep(0.3)
        pyautogui.hotkey('ctrl', 'v')
    return {'success': True, 'text': text, 'index': index,
            'message': f'Pasted item {index} from history'}


def _clear_clipboard():
    if not PYPERCLIP_AVAILABLE:
        return _pyperclip_unavailable()
    pyperclip.copy('')
    return {'success': True, 'message': 'Clipboard cleared'}


def _clear_clipboard_history():
    _save_clipboard_history([])
    return {'success': True, 'message': 'Clipboard history cleared'}


# ═══════════════════════════════════════════════════════════════════════════════
# REMINDERS + DATE/TIME HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

REMINDERS_FILE = str(Path(__file__).resolve().parent / 'reminders.json')


def _load_reminders():
    try:
        with open(REMINDERS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def _save_reminders(reminders):
    try:
        with open(REMINDERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(reminders, f, indent=2, ensure_ascii=False)
    except Exception as err:
        print(f'[Reminders] Could not save: {err}')


def _parse_time_to_24h(time_str):
    """Parse natural time like '5 PM', '3:30 PM', '17:00', '9am' → 'HH:MM' (24h)."""
    if not time_str:
        return None
    s = str(time_str).strip().lower().replace('.', '')
    m = re.match(r'^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$', s)
    if not m:
        return None
    hour = int(m.group(1))
    minute = int(m.group(2)) if m.group(2) else 0
    meridiem = m.group(3)
    if hour > 23 or minute > 59:
        return None
    if meridiem == 'pm' and hour < 12:
        hour += 12
    elif meridiem == 'am' and hour == 12:
        hour = 0
    return f'{hour:02d}:{minute:02d}'


def _add_reminder(text, time_str, date_str=None):
    parsed = _parse_time_to_24h(time_str)
    if not parsed:
        return {'success': False, 'message': f'I could not understand the time "{time_str}"'}
    reminders = _load_reminders()
    now = datetime.now()
    reminder = {
        'id': str(int(time.time() * 1000)),
        'text': (text or 'reminder').strip(),
        'time': parsed,
        'date': date_str or now.strftime('%Y-%m-%d'),
        'active': True,
        'notified': False,
        'created': now.isoformat(timespec='seconds'),
    }
    reminders.append(reminder)
    _save_reminders(reminders)
    disp = _format_12h(parsed)
    return {'success': True, 'reminder': reminder, 'time': parsed, 'display_time': disp,
            'message': f'Reminder set for {disp}: {reminder["text"]}'}


def _get_reminders():
    reminders = [r for r in _load_reminders() if r.get('active')]
    reminders.sort(key=lambda r: (r.get('date', ''), r.get('time', '')))
    return {'success': True, 'reminders': reminders, 'count': len(reminders)}


def _cancel_reminder(time_str=None, reminder_id=None):
    parsed = _parse_time_to_24h(time_str) if time_str else None
    reminders = _load_reminders()
    found = None
    for r in reminders:
        if not r.get('active'):
            continue
        if (reminder_id and r.get('id') == reminder_id) or (parsed and r.get('time') == parsed):
            r['active'] = False
            found = r
            break
    if not found:
        return {'success': False, 'message': 'No matching reminder found'}
    _save_reminders(reminders)
    return {'success': True, 'reminder': found,
            'message': f'Cancelled reminder: {found.get("text", "")}'}


def _check_reminders():
    """Return reminders whose time has arrived and mark them notified. Stateless-safe."""
    reminders = _load_reminders()
    now = datetime.now()
    today = now.strftime('%Y-%m-%d')
    current = now.strftime('%H:%M')
    triggered = []
    changed = False
    for r in reminders:
        if not r.get('active') or r.get('notified'):
            continue
        # Fire when the reminder's date+time is now or has just passed (same day, time <= now)
        if r.get('date', today) <= today and r.get('time', '') <= current:
            r['notified'] = True
            r['active'] = False
            changed = True
            triggered.append(r)
    if changed:
        _save_reminders(reminders)
    return {'success': True, 'triggered': len(triggered) > 0,
            'reminders': triggered, 'count': len(triggered)}


def _format_12h(hhmm):
    try:
        h, m = [int(x) for x in hhmm.split(':')]
        meridiem = 'AM' if h < 12 else 'PM'
        h12 = h % 12
        if h12 == 0:
            h12 = 12
        return f'{h12}:{m:02d} {meridiem}'
    except Exception:
        return hhmm


def _get_datetime():
    now = datetime.now()
    return {
        'success': True,
        'time': now.strftime('%I:%M %p').lstrip('0'),
        'date': now.strftime('%A, %d %B %Y'),
        'day': now.strftime('%A'),
        'timestamp': int(now.timestamp()),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# RECORDING LOOP  (runs in a daemon thread)
# ═══════════════════════════════════════════════════════════════════════════════

def _grab_frame_pil():
    """Grab screen using PIL ImageGrab — same method that works for screenshots."""
    from PIL import ImageGrab
    img = ImageGrab.grab()
    frame = np.array(img)
    return cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)


def _grab_frame_mss(sct, monitor):
    """Grab screen using mss (fastest, but needs display access)."""
    img = sct.grab(monitor)
    frame = np.array(img)
    return cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)


def _recording_loop():
    """Capture frames at FPS until is_recording becomes False."""
    global video_writer, is_recording

    frame_interval  = 1.0 / FPS
    consecutive_err = 0

    # Determine which capture method works (try once at start)
    use_mss = False
    sct_ctx = None
    monitor = None
    if MSS_AVAILABLE:
        try:
            sct_ctx = mss.MSS()
            monitor = sct_ctx.monitors[1]
            _grab_frame_mss(sct_ctx, monitor)   # test grab
            use_mss = True
            print('[JarvisServer] Screen capture: using mss')
        except Exception as e:
            print(f'[JarvisServer] mss failed ({e}), falling back to PIL ImageGrab')
            if sct_ctx:
                try: sct_ctx.close()
                except: pass
            sct_ctx = None

    if not use_mss:
        try:
            _grab_frame_pil()   # test PIL
            print('[JarvisServer] Screen capture: using PIL ImageGrab')
        except Exception as e:
            print(f'[JarvisServer] PIL ImageGrab also failed: {e}')
            is_recording = False
            if video_writer:
                video_writer.release()
                video_writer = None
            return

    while is_recording:
        t0    = time.time()
        frame = None

        try:
            if use_mss and sct_ctx:
                frame = _grab_frame_mss(sct_ctx, monitor)
            else:
                frame = _grab_frame_pil()
            consecutive_err = 0
        except Exception as e:
            consecutive_err += 1
            if consecutive_err == 1:
                method = 'mss' if use_mss else 'PIL'
                print(f'[JarvisServer] Capture error ({method}): {e}')
                # If mss just broke, fall back to PIL for the rest of the recording
                if use_mss:
                    use_mss = False
                    print('[JarvisServer] Switching to PIL ImageGrab fallback mid-recording')
            if consecutive_err > 200:
                print('[JarvisServer] Too many capture errors — stopping recording.')
                is_recording = False
                break
            time.sleep(frame_interval)
            continue

        with _lock:
            if video_writer and video_writer.isOpened():
                video_writer.write(frame)

        elapsed   = time.time() - t0
        remaining = frame_interval - elapsed
        if remaining > 0:
            time.sleep(remaining)

    # Clean up
    if sct_ctx:
        try: sct_ctx.close()
        except: pass
    with _lock:
        if video_writer:
            video_writer.release()
            video_writer = None

    print(f'[JarvisServer] Recording thread finished -> {current_rec_path}')


# ═══════════════════════════════════════════════════════════════════════════════
# FLASK APP
# ═══════════════════════════════════════════════════════════════════════════════

app = Flask(__name__)
CORS(app, origins=['http://localhost:5000', 'http://localhost:5173', 'http://localhost:3456'])


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'jarvis-python-server', 'port': PORT})


# ── POST /open-file ─────────────────────────────────────────────────────────────
@app.route('/open-file', methods=['POST'])
def open_file():
    data = request.get_json(silent=True) or {}
    filename = _clean_search_term(data.get('filename', ''))
    if not filename:
        return jsonify({'success': False, 'message': 'filename is required'}), 400

    found_path = _find_file(filename)
    if not found_path:
        return jsonify({
            'success': False,
            'message': f'File not found: {filename}',
            'filename': filename,
        }), 404

    try:
        os.startfile(str(found_path))
        return jsonify({
            'success': True,
            'message': f'Opening {found_path.name}',
            'path': str(found_path).replace('\\', '/'),
            'filename': found_path.name,
        })
    except Exception as err:
        return jsonify({
            'success': False,
            'message': f'Failed to open file: {err}',
            'filename': filename,
        }), 500


# ── POST /open-folder ───────────────────────────────────────────────────────────
@app.route('/open-folder', methods=['POST'])
def open_folder():
    data = request.get_json(silent=True) or {}
    foldername = _clean_search_term(data.get('foldername', ''))
    if not foldername:
        return jsonify({'success': False, 'message': 'foldername is required'}), 400

    # 1. Real user folders first — _special_folders() is OneDrive-aware, so it
    #    beats any shell: moniker for Desktop/Documents/Downloads/etc. Retry
    #    against the normalized term so "my downloads folder" still lands here.
    special = _resolve_special_folder(foldername)
    if special is None:
        special = _resolve_special_folder(_normalize_foldername(foldername))

    # 2. Virtual + system locations (This PC, Recycle Bin, Control Panel, …).
    #    This MUST come before _find_folder: those names have no filesystem
    #    path, so the os.walk would scan for SEARCH_TIMEOUT_SEC and still fail
    #    — long enough to trip the caller's 8 s HTTP timeout.
    if special is None:
        shell_target = _resolve_shell_folder(foldername)
        if shell_target:
            label, target = shell_target
            try:
                # explorer.exe exits 1 even on success, so don't wait on it.
                subprocess.Popen(['explorer', target])
            except Exception as err:
                return jsonify({
                    'success': False,
                    'message': f'Failed to open {label}: {err}',
                    'foldername': label,
                }), 500
            return jsonify({
                'success': True,
                'message': f'Opening {label}',
                'path': target,
                'foldername': label,
                'shellFolder': True,
            })

    # 3. Fall back to the fuzzy filesystem search.
    found_path = special or _find_folder(foldername)
    if not found_path:
        return jsonify({
            'success': False,
            'message': f'Folder not found: {foldername}',
            'foldername': foldername,
        }), 404

    try:
        subprocess.Popen(['explorer', str(found_path)])
        return jsonify({
            'success': True,
            'message': f'Opening {found_path.name} folder',
            'path': str(found_path).replace('\\', '/'),
            'foldername': found_path.name,
        })
    except Exception as err:
        return jsonify({
            'success': False,
            'message': f'Failed to open folder: {err}',
            'foldername': foldername,
        }), 500


# ── POST /open-app ──────────────────────────────────────────────────────────────
@app.route('/open-app', methods=['POST'])
def open_app():
    data = request.get_json(silent=True) or {}
    appname = _clean_search_term(data.get('appname', ''))
    if not appname:
        return jsonify({'success': False, 'message': 'appname is required'}), 400

    result = _open_app(appname)
    # Consider web fallback a success too
    status = 200 if result.get('success') else 404
    return jsonify(result), status


# ── POST /screenshot/take ────────────────────────────────────────────────────────
# Takes a screenshot and returns the saved file path — used by the screen
# analysis pipeline (executor.js reads the file as base64 and sends to Gemini).
@app.route('/screenshot/take', methods=['POST'])
def screenshot_take():
    """Take a screenshot and return {success, path, filename}."""
    from datetime import datetime
    timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    save_dir = Path.home() / 'JARVIS' / 'Screenshots'
    try:
        save_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        save_dir = Path.home()

    filename = f'screenshot_{timestamp}.png'
    filepath = save_dir / filename

    # Method 1: mss
    if MSS_AVAILABLE:
        try:
            with mss.mss() as sct:
                monitor = sct.monitors[1]
                img = sct.grab(monitor)
                mss.tools.to_png(img.rgb, img.size, output=str(filepath))
            if filepath.exists() and filepath.stat().st_size > 1000:
                return jsonify({
                    'success': True,
                    'path': str(filepath).replace('\\', '/'),
                    'filename': filename,
                    'message': f'Screenshot saved: {filename}',
                })
        except Exception:
            pass

    # Method 2: pyautogui
    if PYAUTOGUI_AVAILABLE:
        try:
            import pyautogui as _pag
            shot = _pag.screenshot()
            shot.save(str(filepath))
            if filepath.exists() and filepath.stat().st_size > 1000:
                return jsonify({
                    'success': True,
                    'path': str(filepath).replace('\\', '/'),
                    'filename': filename,
                    'message': f'Screenshot saved: {filename}',
                })
        except Exception:
            pass

    # Method 3: PowerShell (no extra Python deps)
    try:
        safe = str(filepath).replace('\\', '/')
        ps = (
            'Add-Type -AssemblyName System.Windows.Forms,System.Drawing; '
            '$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; '
            '$bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height); '
            '$g=[System.Drawing.Graphics]::FromImage($bmp); '
            '$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); '
            f"$bmp.Save('{safe}'); "
            '$g.Dispose();$bmp.Dispose()'
        )
        subprocess.run(
            ['powershell', '-NoProfile', '-NonInteractive', '-Command', ps],
            capture_output=True, timeout=20,
        )
        if filepath.exists() and filepath.stat().st_size > 1000:
            return jsonify({
                'success': True,
                'path': str(filepath).replace('\\', '/'),
                'filename': filename,
                'message': f'Screenshot saved: {filename}',
            })
    except Exception:
        pass

    return jsonify({
        'success': False,
        'message': 'Screenshot failed — no capture library available. Run: pip install mss',
    }), 500


# ── POST /close-app ─────────────────────────────────────────────────────────────
@app.route('/close-app', methods=['POST'])
def close_app():
    data = request.get_json(silent=True) or {}
    appname = _clean_search_term(data.get('appname', ''))
    if not appname:
        return jsonify({'success': False, 'message': 'appname is required'}), 400

    result = _close_app(appname)
    status = 200 if result.get('success') else 404
    return jsonify(result), status


# ── GET /running-apps ───────────────────────────────────────────────────────────
@app.route('/running-apps', methods=['GET'])
def running_apps():
    result = _running_apps()
    status = 200 if result.get('success', True) else 500
    return jsonify(result), status


# ── POST /add-app ───────────────────────────────────────────────────────────────
@app.route('/add-app', methods=['POST'])
def add_app():
    data = request.get_json(silent=True) or {}
    appname = _clean_search_term(data.get('appname', ''))
    path = _clean_search_term(data.get('path', ''))
    result = _add_app(appname, path)
    status = 200 if result.get('success') else 400
    return jsonify(result), status


# ── POST /browser/search ────────────────────────────────────────────────────────
@app.route('/browser/search', methods=['POST'])
def browser_search():
    data = request.get_json(silent=True) or {}
    query = _clean_search_term(data.get('query', ''))
    engine = _clean_search_term(data.get('engine', 'google')) or 'google'
    result = _search_web(query, engine)
    status = 200 if result.get('success') else 400
    return jsonify(result), status


# ── POST /browser/open ──────────────────────────────────────────────────────────
@app.route('/browser/open', methods=['POST'])
def browser_open():
    data = request.get_json(silent=True) or {}
    site = _clean_search_term(data.get('site', ''))
    result = _open_website(site)
    status = 200 if result.get('success') else 400
    return jsonify(result), status


# ── POST /browser/action ────────────────────────────────────────────────────────
@app.route('/browser/action', methods=['POST'])
def browser_action():
    data = request.get_json(silent=True) or {}
    action = _clean_search_term(data.get('action', ''))
    result = _browser_action(action)
    status = 200 if result.get('success') else 400
    return jsonify(result), status


# ── GET /browser/current-url ────────────────────────────────────────────────────
@app.route('/browser/current-url', methods=['GET'])
def browser_current_url():
    result = _get_active_tab_url()
    status = 200 if result.get('success') else 400
    return jsonify(result), status


# ── POST /volume/up ─────────────────────────────────────────────────────────────
@app.route('/volume/up', methods=['POST'])
def volume_up():
    if not PYCAW_AVAILABLE:
        return jsonify(_volume_unavailable()), 500
    data = request.get_json(silent=True) or {}
    step = data.get('step', 10)
    CoInitialize()
    try:
        level = _volume_up(step)
        muted = _is_muted()
        return jsonify({
            'success': True,
            'level': level,
            'muted': muted,
            'message': f'Volume increased to {level}%',
        })
    except (ValueError, TypeError) as err:
        return jsonify({'success': False, 'message': f'Invalid step value: {err}'}), 400
    except Exception as err:
        return jsonify({'success': False, 'message': f'Volume control failed: {err}'}), 500
    finally:
        CoUninitialize()


# ── POST /volume/down ───────────────────────────────────────────────────────────
@app.route('/volume/down', methods=['POST'])
def volume_down():
    if not PYCAW_AVAILABLE:
        return jsonify(_volume_unavailable()), 500
    data = request.get_json(silent=True) or {}
    step = data.get('step', 10)
    CoInitialize()
    try:
        level = _volume_down(step)
        muted = _is_muted()
        return jsonify({
            'success': True,
            'level': level,
            'muted': muted,
            'message': f'Volume decreased to {level}%',
        })
    except (ValueError, TypeError) as err:
        return jsonify({'success': False, 'message': f'Invalid step value: {err}'}), 400
    except Exception as err:
        return jsonify({'success': False, 'message': f'Volume control failed: {err}'}), 500
    finally:
        CoUninitialize()


# ── POST /volume/set ────────────────────────────────────────────────────────────
@app.route('/volume/set', methods=['POST'])
def volume_set():
    if not PYCAW_AVAILABLE:
        return jsonify(_volume_unavailable()), 500
    data = request.get_json(silent=True) or {}
    level = data.get('level', None)
    if level is None:
        return jsonify({'success': False, 'message': 'level is required'}), 400
    CoInitialize()
    try:
        set_level = _set_volume_level(level)
        muted = _is_muted()
        return jsonify({
            'success': True,
            'level': set_level,
            'muted': muted,
            'message': f'Volume set to {set_level}%',
        })
    except (ValueError, TypeError) as err:
        return jsonify({'success': False, 'message': f'Invalid level value: {err}'}), 400
    except Exception as err:
        return jsonify({'success': False, 'message': f'Volume control failed: {err}'}), 500
    finally:
        CoUninitialize()


# ── POST /volume/mute ───────────────────────────────────────────────────────────
@app.route('/volume/mute', methods=['POST'])
def volume_mute():
    if not PYCAW_AVAILABLE:
        return jsonify(_volume_unavailable()), 500
    CoInitialize()
    try:
        _set_system_mute(True)
        level = _get_current_volume_level()
        return jsonify({'success': True, 'muted': True, 'level': level, 'message': 'System muted'})
    except Exception as err:
        return jsonify({'success': False, 'message': f'Volume control failed: {err}'}), 500
    finally:
        CoUninitialize()


# ── POST /volume/unmute ─────────────────────────────────────────────────────────
@app.route('/volume/unmute', methods=['POST'])
def volume_unmute():
    if not PYCAW_AVAILABLE:
        return jsonify(_volume_unavailable()), 500
    CoInitialize()
    try:
        _set_system_mute(False)
        level = _get_current_volume_level()
        return jsonify({'success': True, 'muted': False, 'level': level, 'message': 'System unmuted'})
    except Exception as err:
        return jsonify({'success': False, 'message': f'Volume control failed: {err}'}), 500
    finally:
        CoUninitialize()


# ── POST /volume/toggle-mute ────────────────────────────────────────────────────
@app.route('/volume/toggle-mute', methods=['POST'])
def volume_toggle_mute():
    if not PYCAW_AVAILABLE:
        return jsonify(_volume_unavailable()), 500
    CoInitialize()
    try:
        status = _toggle_mute()
        level = _get_current_volume_level()
        muted = status == 'muted'
        return jsonify({
            'success': True,
            'status': status,
            'muted': muted,
            'level': level,
            'message': f'System {status}',
        })
    except Exception as err:
        return jsonify({'success': False, 'message': f'Volume control failed: {err}'}), 500
    finally:
        CoUninitialize()


# ── GET /volume/current ─────────────────────────────────────────────────────────
@app.route('/volume/current', methods=['GET'])
def volume_current():
    if not PYCAW_AVAILABLE:
        return jsonify(_volume_unavailable()), 500
    CoInitialize()
    try:
        level = _get_current_volume_level()
        muted = _is_muted()
        return jsonify({'success': True, 'level': level, 'muted': muted})
    except Exception as err:
        return jsonify({'success': False, 'message': f'Volume control failed: {err}'}), 500
    finally:
        CoUninitialize()


# ═══════════════════════════════════════════════════════════════════════════════
# WHATSAPP ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

# ── POST /whatsapp/message ──────────────────────────────────────────────────────
@app.route('/whatsapp/message', methods=['POST'])
def whatsapp_message():
    data = request.get_json(silent=True) or {}
    contact = (data.get('contact') or '').strip()
    message = (data.get('message') or '').strip()
    if not contact:
        return jsonify({'success': False, 'message': 'No contact specified'}), 400
    result = _send_whatsapp_message(contact, message)
    return jsonify(result), (200 if result.get('success') else 400)


# ── POST /whatsapp/file ─────────────────────────────────────────────────────────
@app.route('/whatsapp/file', methods=['POST'])
def whatsapp_file():
    data = request.get_json(silent=True) or {}
    contact = (data.get('contact') or '').strip()
    filename = (data.get('filename') or '').strip()
    caption = (data.get('caption') or '').strip()
    if not contact:
        return jsonify({'success': False, 'message': 'No contact specified'}), 400
    if not filename:
        return jsonify({'success': False, 'message': 'No filename specified'}), 400
    result = _send_whatsapp_file(contact, filename, caption)
    return jsonify(result), (200 if result.get('success') else 400)


# ── POST /whatsapp/add-contact ──────────────────────────────────────────────────
@app.route('/whatsapp/add-contact', methods=['POST'])
def whatsapp_add_contact():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    phone = (data.get('phone') or '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'No contact name specified'}), 400
    result = _add_contact(name, phone)
    return jsonify(result), (200 if result.get('success') else 400)


# ── GET /whatsapp/contacts ──────────────────────────────────────────────────────
@app.route('/whatsapp/contacts', methods=['GET'])
def whatsapp_contacts():
    return jsonify({'success': True, 'contacts': _load_contacts()})


# ═══════════════════════════════════════════════════════════════════════════════
# SYSTEM CONTROL ROUTES  (power / info / brightness)
# ═══════════════════════════════════════════════════════════════════════════════

def _safe_system(fn, *args):
    try:
        return jsonify(fn(*args))
    except Exception as err:
        return jsonify({'success': False, 'message': f'System action failed: {err}'}), 500


# ── Power ───────────────────────────────────────────────────────────────────────
@app.route('/system/lock', methods=['POST'])
def system_lock():
    return _safe_system(_lock_screen)


@app.route('/system/sleep', methods=['POST'])
def system_sleep():
    return _safe_system(_sleep_system)


@app.route('/system/shutdown', methods=['POST'])
def system_shutdown():
    data = request.get_json(silent=True) or {}
    return _safe_system(_shutdown_system, data.get('minutes', 0))


@app.route('/system/cancel-shutdown', methods=['POST'])
def system_cancel_shutdown():
    return _safe_system(_cancel_shutdown)


@app.route('/system/restart', methods=['POST'])
def system_restart():
    data = request.get_json(silent=True) or {}
    return _safe_system(_restart_system, data.get('minutes', 0))


@app.route('/system/logoff', methods=['POST'])
def system_logoff():
    return _safe_system(_logoff_system)


# ── Info ────────────────────────────────────────────────────────────────────────
@app.route('/system/battery', methods=['GET'])
def system_battery():
    return _safe_system(_get_battery_info)


@app.route('/system/ram', methods=['GET'])
def system_ram():
    return _safe_system(_get_ram_info)


@app.route('/system/cpu', methods=['GET'])
def system_cpu():
    return _safe_system(_get_cpu_info)


@app.route('/system/disk', methods=['GET'])
def system_disk():
    return _safe_system(_get_disk_info)


@app.route('/system/ip', methods=['GET'])
def system_ip():
    return _safe_system(_get_ip_address)


@app.route('/system/info', methods=['GET'])
def system_info():
    return _safe_system(_get_full_system_info)


# ── Brightness ──────────────────────────────────────────────────────────────────
@app.route('/system/brightness/set', methods=['POST'])
def system_brightness_set():
    data = request.get_json(silent=True) or {}
    level = data.get('level')
    if level is None:
        return jsonify({'success': False, 'message': 'No brightness level specified'}), 400
    return _safe_system(_set_brightness_level, level)


@app.route('/system/brightness/up', methods=['POST'])
def system_brightness_up():
    data = request.get_json(silent=True) or {}
    return _safe_system(_brightness_up, data.get('step', 10))


@app.route('/system/brightness/down', methods=['POST'])
def system_brightness_down():
    data = request.get_json(silent=True) or {}
    return _safe_system(_brightness_down, data.get('step', 10))


@app.route('/system/brightness/current', methods=['GET'])
def system_brightness_current():
    level = _get_brightness_level()
    if level is None:
        return jsonify({'success': False, 'message': 'Could not read brightness'}), 500
    return jsonify({'success': True, 'level': level})


# ═══════════════════════════════════════════════════════════════════════════════
# CLIPBOARD CONTROL ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/clipboard/read', methods=['GET'])
def clipboard_read():
    return _safe_system(_read_clipboard)


@app.route('/clipboard/copy', methods=['POST'])
def clipboard_copy():
    data = request.get_json(silent=True) or {}
    text = data.get('text')
    if text is None:
        return jsonify({'success': False, 'message': 'No text provided'}), 400
    return _safe_system(_copy_text, text)


@app.route('/clipboard/simulate-copy', methods=['POST'])
def clipboard_simulate_copy():
    return _safe_system(_simulate_copy)


@app.route('/clipboard/simulate-paste', methods=['POST'])
def clipboard_simulate_paste():
    return _safe_system(_simulate_paste)


@app.route('/clipboard/simulate-cut', methods=['POST'])
def clipboard_simulate_cut():
    return _safe_system(_simulate_cut)


@app.route('/clipboard/select-all', methods=['POST'])
def clipboard_select_all():
    return _safe_system(_simulate_select_all)


@app.route('/clipboard/undo', methods=['POST'])
def clipboard_undo():
    return _safe_system(_simulate_undo)


@app.route('/clipboard/redo', methods=['POST'])
def clipboard_redo():
    return _safe_system(_simulate_redo)


@app.route('/clipboard/history', methods=['GET'])
def clipboard_history():
    return _safe_system(_get_clipboard_history)


@app.route('/clipboard/paste-history', methods=['POST'])
def clipboard_paste_history():
    data = request.get_json(silent=True) or {}
    index = data.get('index')
    if index is None:
        return jsonify({'success': False, 'message': 'No index provided'}), 400
    return _safe_system(_paste_from_history, index)


@app.route('/clipboard/clear', methods=['POST'])
def clipboard_clear():
    return _safe_system(_clear_clipboard)


@app.route('/clipboard/clear-history', methods=['POST'])
def clipboard_clear_history():
    return _safe_system(_clear_clipboard_history)


# ═══════════════════════════════════════════════════════════════════════════════
# REMINDERS + DATE/TIME ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/system/datetime', methods=['GET'])
def system_datetime():
    return _safe_system(_get_datetime)


@app.route('/reminders/add', methods=['POST'])
def reminders_add():
    data = request.get_json(silent=True) or {}
    text = data.get('text')
    time_str = data.get('time')
    date_str = data.get('date')
    if not time_str:
        return jsonify({'success': False, 'message': 'A time is required for the reminder'}), 400
    return _safe_system(_add_reminder, text, time_str, date_str)


@app.route('/reminders/list', methods=['GET'])
def reminders_list():
    return _safe_system(_get_reminders)


@app.route('/reminders/cancel', methods=['POST'])
def reminders_cancel():
    data = request.get_json(silent=True) or {}
    time_str = data.get('time')
    reminder_id = data.get('id')
    if not time_str and not reminder_id:
        return jsonify({'success': False, 'message': 'A time or id is required'}), 400
    return _safe_system(_cancel_reminder, time_str, reminder_id)


@app.route('/reminders/check', methods=['GET'])
def reminders_check():
    return _safe_system(_check_reminders)


# ── POST /record/start ─────────────────────────────────────────────────────────
@app.route('/record/start', methods=['POST'])
def record_start():
    global is_recording, recording_thread, video_writer
    global current_rec_path, current_rec_file, recording_start_ts

    if is_recording:
        return jsonify({
            'success': False,
            'message': 'Recording is already in progress, sir.',
        }), 409

    if not CV2_AVAILABLE:
        return jsonify({'success': False, 'message': 'opencv-python not installed. Run: pip install opencv-python'}), 500
    if not MSS_AVAILABLE:
        return jsonify({'success': False, 'message': 'mss or numpy not installed. Run: pip install mss numpy'}), 500

    # ── Determine screen size ────────────────────────────────────────────────
    try:
        with mss.MSS() as sct:
            monitor = sct.monitors[1]
            width   = monitor['width']
            height  = monitor['height']
    except Exception as e:
        return jsonify({'success': False, 'message': f'Screen capture init failed: {e}'}), 500

    # ── Build output path ────────────────────────────────────────────────────
    folder    = get_recordings_folder()
    timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    filename  = f'recording_{timestamp}.mp4'
    filepath  = str(folder / filename)

    # ── Create VideoWriter ───────────────────────────────────────────────────
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(filepath, fourcc, FPS, (width, height))
    if not writer.isOpened():
        return jsonify({'success': False, 'message': 'Could not open VideoWriter. Check codec support.'}), 500

    # ── Start recording thread ───────────────────────────────────────────────
    with _lock:
        video_writer        = writer
        current_rec_path    = filepath
        current_rec_file    = filename
        recording_start_ts  = time.time()
        is_recording        = True

    recording_thread = threading.Thread(target=_recording_loop, daemon=True)
    recording_thread.start()

    print(f'[JarvisServer] Recording started -> {filepath}')
    return jsonify({
        'success': True,
        'message': 'Screen recording started, sir.',
        'filename': filename,
        'path': filepath,
    })


# ── POST /record/stop ──────────────────────────────────────────────────────────
@app.route('/record/stop', methods=['POST'])
def record_stop():
    global is_recording, recording_thread

    if not is_recording:
        return jsonify({
            'success': False,
            'message': 'No recording is currently active, sir.',
        }), 409

    saved_path = current_rec_path
    saved_file = current_rec_file

    # Signal loop to stop
    is_recording = False

    # Wait for thread to finish cleanly (max 5s)
    if recording_thread and recording_thread.is_alive():
        recording_thread.join(timeout=5)

    # Fire Windows toast notification
    threading.Thread(
        target=_notify_windows,
        args=('JARVIS — Recording Saved', f'Saved: {saved_file}'),
        daemon=True,
    ).start()

    print(f'[JarvisServer] Recording stopped -> {saved_path}')
    return jsonify({
        'success': True,
        'message': f'Recording saved, sir.',
        'filename': saved_file,
        'path': saved_path,
    })


# ── GET /record/status ─────────────────────────────────────────────────────────
@app.route('/record/status', methods=['GET'])
def record_status():
    elapsed = 0
    if is_recording and recording_start_ts > 0:
        elapsed = int(time.time() - recording_start_ts)

    return jsonify({
        'isRecording': is_recording,
        'elapsed': elapsed,           # seconds
        'filename': current_rec_file,
        'path': current_rec_path,
    })


# ═══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    print('==============================================')
    print('  J.A.R.V.I.S. Python Server v1.0')
    print(f'  http://localhost:{PORT}')
    print('  Endpoints: /record/start  /record/stop')
    print('             /record/status  /open-file')
    print('             /open-folder    /open-app')
    print('             /close-app      /running-apps')
    print('             /add-app        /browser/search')
    print('             /browser/open   /browser/action')
    print('             /browser/current-url  /volume/current')
    print('             /volume/up /down /set /mute /unmute /toggle-mute')
    print('             /whatsapp/message /file /add-contact /contacts')
    print('             /system/lock /sleep /shutdown /restart /logoff')
    print('             /system/battery /ram /cpu /disk /ip /info')
    print('             /system/brightness/up /down /set /current')
    print('             /clipboard/read /copy /history /paste-history /clear')
    print('             /system/datetime  /reminders/add /list /cancel /check')
    print('             /health')
    print('==============================================')

    # Use threaded=True so start + stop requests don't block each other
    app.run(host='127.0.0.1', port=PORT, threaded=True, debug=False)
