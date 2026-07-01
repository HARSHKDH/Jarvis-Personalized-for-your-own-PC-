#!/usr/bin/env python3
"""
J.A.R.V.I.S. OS Controller — executor.py
Receives a JSON payload via sys.argv[1] and executes OS-level commands.
Supports Windows (primary), with Mac/Linux fallbacks commented.
"""

import sys
import json
import os
import subprocess
import webbrowser
import time
import platform
from pathlib import Path
from datetime import datetime
import urllib.parse

# ─────────────────────────────────────────────────────────────────────────────
# OPTIONAL IMPORTS — fail gracefully if not installed
# ─────────────────────────────────────────────────────────────────────────────
try:
    import pyautogui
    PYAUTOGUI_AVAILABLE = True
except ImportError:
    PYAUTOGUI_AVAILABLE = False

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.options import Options as ChromeOptions
    from selenium.webdriver.chrome.service import Service
    from webdriver_manager.chrome import ChromeDriverManager
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False

# ─────────────────────────────────────────────────────────────────────────────
# PLATFORM DETECTION
# ─────────────────────────────────────────────────────────────────────────────
IS_WINDOWS = platform.system() == 'Windows'
IS_MAC     = platform.system() == 'Darwin'
IS_LINUX   = platform.system() == 'Linux'

# ─────────────────────────────────────────────────────────────────────────────
def get_desktop_path():
    """
    Returns the real Desktop path, handling OneDrive Desktop redirection.
    On Windows 11 with OneDrive enabled, Desktop is often at:
      C:\Users\<user>\OneDrive\Desktop   (not C:\Users\<user>\Desktop)
    """
    if IS_WINDOWS:
        # 1. Try reading from Windows registry (most reliable)
        try:
            import winreg
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r'Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders'
            ) as key:
                reg_desktop = winreg.QueryValueEx(key, 'Desktop')[0]
                # Expand env vars like %USERPROFILE%
                reg_desktop = os.path.expandvars(reg_desktop)
                p = Path(reg_desktop)
                if p.exists():
                    return p
        except Exception:
            pass

        # 2. Check OneDrive Desktop (common on Windows 10/11)
        username = get_username()
        onedrive = Path(f'C:/Users/{username}/OneDrive/Desktop')
        if onedrive.exists():
            return onedrive

        # 3. Standard Desktop
        standard = Path.home() / 'Desktop'
        if standard.exists():
            return standard

        # 4. Fallback: create standard Desktop
        standard.mkdir(parents=True, exist_ok=True)
        return standard
    else:
        return Path.home() / 'Desktop'

# ─────────────────────────────────────────────────────────────────────────────
# WINDOWS APP PATHS
# ─────────────────────────────────────────────────────────────────────────────
WINDOWS_APPS = {
    'chrome': [
        r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    ],
    'google chrome': [
        r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    ],
    'firefox': [
        r'C:\Program Files\Mozilla Firefox\firefox.exe',
        r'C:\Program Files (x86)\Mozilla Firefox\firefox.exe',
    ],
    'vscode': [
        r'C:\Users\{user}\AppData\Local\Programs\Microsoft VS Code\Code.exe',
        r'C:\Program Files\Microsoft VS Code\Code.exe',
    ],
    'code': [
        r'C:\Users\{user}\AppData\Local\Programs\Microsoft VS Code\Code.exe',
        r'C:\Program Files\Microsoft VS Code\Code.exe',
    ],
    'vs code': [
        r'C:\Users\{user}\AppData\Local\Programs\Microsoft VS Code\Code.exe',
    ],
    'spotify': [
        r'C:\Users\{user}\AppData\Roaming\Spotify\Spotify.exe',
    ],
    'notepad': ['notepad.exe'],
    'notepad++': [
        r'C:\Program Files\Notepad++\notepad++.exe',
        r'C:\Program Files (x86)\Notepad++\notepad++.exe',
    ],
    'calculator': ['calc.exe'],
    'calc': ['calc.exe'],
    'explorer': ['explorer.exe'],
    'file explorer': ['explorer.exe'],
    'vlc': [
        r'C:\Program Files\VideoLAN\VLC\vlc.exe',
        r'C:\Program Files (x86)\VideoLAN\VLC\vlc.exe',
    ],
    'whatsapp': [
        r'C:\Users\{user}\AppData\Local\WhatsApp\WhatsApp.exe',
        r'C:\Program Files\WindowsApps\WhatsAppDesktop',
    ],
    'discord': [
        r'C:\Users\{user}\AppData\Local\Discord\app-*\Discord.exe',
    ],
    'word': [
        r'C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE',
        r'C:\Program Files (x86)\Microsoft Office\root\Office16\WINWORD.EXE',
    ],
    'excel': [
        r'C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE',
        r'C:\Program Files (x86)\Microsoft Office\root\Office16\EXCEL.EXE',
    ],
    'powerpoint': [
        r'C:\Program Files\Microsoft Office\root\Office16\POWERPNT.EXE',
        r'C:\Program Files (x86)\Microsoft Office\root\Office16\POWERPNT.EXE',
    ],
    'task manager': ['taskmgr.exe'],
    'control panel': ['control.exe'],
    'paint': ['mspaint.exe'],
    'wordpad': ['write.exe'],
    'cmd': ['cmd.exe'],
    'powershell': ['powershell.exe'],
    'terminal': ['wt.exe', 'powershell.exe'],
    'obs': [
        r'C:\Program Files\obs-studio\bin\64bit\obs64.exe',
    ],
    'steam': [
        r'C:\Program Files (x86)\Steam\Steam.exe',
        r'C:\Program Files\Steam\Steam.exe',
    ],
    'zoom': [
        r'C:\Users\{user}\AppData\Roaming\Zoom\bin\Zoom.exe',
    ],
    'teams': [
        r'C:\Users\{user}\AppData\Local\Microsoft\Teams\current\Teams.exe',
    ],
    'slack': [
        r'C:\Users\{user}\AppData\Local\slack\slack.exe',
    ],
}

def get_username():
    return os.environ.get('USERNAME', os.environ.get('USER', 'User'))

def resolve_app_path(app_name):
    """Try to find the executable path for a given app name."""
    username = get_username()
    app_key = app_name.lower().strip()
    
    paths = WINDOWS_APPS.get(app_key, [])
    
    for path in paths:
        path = path.replace('{user}', username)
        if os.path.exists(path):
            return path
    
    # Fall back to just using the name (for system apps in PATH)
    if paths and not paths[0].startswith('C:\\'):
        return paths[0]
    
    # Last resort: try the name directly
    return app_name

# ─────────────────────────────────────────────────────────────────────────────
# ACTION HANDLERS
# ─────────────────────────────────────────────────────────────────────────────

def action_open_app(target, details):
    """Open an application by name."""
    app_name = target.lower().strip()
    original_name = target.strip()
    
    if IS_WINDOWS:
        username = get_username()

        # 1. Try resolved path from our known apps dictionary
        exe_path = resolve_app_path(app_name)
        if exe_path != app_name:  # We found a known path
            try:
                subprocess.Popen([exe_path], shell=False)
                return {"success": True, "message": f"Opening {original_name}..."}
            except (FileNotFoundError, OSError):
                pass

        # 2. Try Windows 'start' shell command (handles Store apps, shortcuts, etc.)
        try:
            result = subprocess.run(
                f'start "" "{original_name}"',
                shell=True, timeout=5,
                capture_output=True
            )
            if result.returncode == 0:
                return {"success": True, "message": f"Launched {original_name}"}
        except Exception:
            pass

        # 3. Try PowerShell Start-Process (most reliable for modern Windows)
        try:
            subprocess.Popen(
                ['powershell', '-NoProfile', '-Command', f'Start-Process "{original_name}"'],
                shell=False
            )
            return {"success": True, "message": f"Opening {original_name} via PowerShell..."}
        except Exception:
            pass

        # 4. Try common system executables by simple name
        simple_name = app_name.replace(' ', '') + '.exe'
        try:
            subprocess.Popen([simple_name], shell=True)
            return {"success": True, "message": f"Started {original_name}"}
        except Exception:
            pass

        # 5. Last resort: os.startfile
        try:
            os.startfile(original_name)
            return {"success": True, "message": f"Started {original_name}"}
        except Exception as e:
            return {"success": False, "message": f"Could not open '{original_name}'. Make sure the app is installed. Error: {str(e)}"}
    
    elif IS_MAC:
        # macOS: open -a "App Name"
        try:
            subprocess.Popen(['open', '-a', target])
            return {"success": True, "message": f"Opening {target}..."}
        except Exception as e:
            return {"success": False, "message": str(e)}
    
    else:
        # Linux: try common methods
        try:
            subprocess.Popen([app_name])
            return {"success": True, "message": f"Opening {target}..."}
        except Exception as e:
            return {"success": False, "message": str(e)}


def action_search_web(target, details):
    """Open browser with a Google search."""
    query = urllib.parse.quote_plus(target)
    url = f"https://www.google.com/search?q={query}"
    try:
        webbrowser.open(url)
        return {"success": True, "message": f"Searching Google for: {target}"}
    except Exception as e:
        return {"success": False, "message": str(e)}


def action_open_youtube(target, details):
    """Open YouTube search or homepage."""
    if target:
        query = urllib.parse.quote_plus(target)
        url = f"https://www.youtube.com/results?search_query={query}"
    else:
        url = "https://www.youtube.com"
    try:
        webbrowser.open(url)
        return {"success": True, "message": f"Opening YouTube: {target}"}
    except Exception as e:
        return {"success": False, "message": str(e)}


def action_play_spotify(target, details):
    """Open Spotify with search."""
    if target:
        query = urllib.parse.quote_plus(target)
        url = f"https://open.spotify.com/search/{query}"
    else:
        url = "https://open.spotify.com"
    try:
        webbrowser.open(url)
        return {"success": True, "message": f"Opening Spotify: {target}"}
    except Exception as e:
        return {"success": False, "message": str(e)}


def action_open_file(target, details):
    """Open a file. Fuzzy search common folders if path not found."""
    if not target:
        return {"success": False, "message": "No file path specified"}
    
    # If exact path exists
    if os.path.exists(target):
        try:
            if IS_WINDOWS:
                os.startfile(target)
            elif IS_MAC:
                subprocess.Popen(['open', target])
            else:
                subprocess.Popen(['xdg-open', target])
            return {"success": True, "message": f"Opening: {target}"}
        except Exception as e:
            return {"success": False, "message": str(e)}
    
    # Fuzzy search in common locations
    username = get_username()
    search_dirs = [
        Path.home() / 'Documents',
        Path.home() / 'Desktop',
        Path.home() / 'Downloads',
        Path.home(),
    ]
    
    filename = Path(target).name
    for directory in search_dirs:
        if directory.exists():
            matches = list(directory.rglob(f"*{filename}*"))
            if matches:
                found = str(matches[0])
                try:
                    if IS_WINDOWS:
                        os.startfile(found)
                    elif IS_MAC:
                        subprocess.Popen(['open', found])
                    else:
                        subprocess.Popen(['xdg-open', found])
                    return {"success": True, "message": f"Found and opened: {found}"}
                except Exception as e:
                    return {"success": False, "message": str(e)}
    
    return {"success": False, "message": f"File not found: {target}"}


def action_run_command(target, details):
    """Run a shell command in a new terminal window."""
    if not target:
        return {"success": False, "message": "No command specified"}
    
    try:
        if IS_WINDOWS:
            # Open new CMD window and run the command, keeping it open
            subprocess.Popen(f'start cmd /k "{target}"', shell=True)
        elif IS_MAC:
            script = f'tell application "Terminal" to do script "{target}"'
            subprocess.Popen(['osascript', '-e', script])
        else:
            # Linux: try various terminal emulators
            for term in ['gnome-terminal', 'xterm', 'konsole']:
                try:
                    subprocess.Popen([term, '--', 'bash', '-c', f'{target}; read'])
                    break
                except FileNotFoundError:
                    continue
        
        return {"success": True, "message": f"Running: {target}"}
    except Exception as e:
        return {"success": False, "message": str(e)}


def action_take_screenshot(target, details):
    """Take a screenshot and save to Desktop (handles OneDrive Desktop)."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    desktop   = get_desktop_path()
    filename  = f"JARVIS_screenshot_{timestamp}.png"
    filepath  = desktop / filename

    # Method 1: pyautogui (best quality)
    if PYAUTOGUI_AVAILABLE:
        try:
            screenshot = pyautogui.screenshot()
            screenshot.save(str(filepath))
            return {"success": True, "message": f"Screenshot saved to Desktop: {filename}", "path": str(filepath)}
        except Exception:
            pass

    # Method 2: Windows PowerShell (no extra deps)
    if IS_WINDOWS:
        try:
            safe_path = str(filepath).replace('\\', '\\\\')
            ps_script = (
                "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; "
                "$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "
                "$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height); "
                "$g = [System.Drawing.Graphics]::FromImage($bmp); "
                "$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); "
                f"$bmp.Save('{safe_path}'); "
                "$g.Dispose(); $bmp.Dispose(); "
                "Write-Output 'SCREENSHOT_OK'"
            )
            result = subprocess.run(
                ['powershell', '-NoProfile', '-NonInteractive', '-Command', ps_script],
                capture_output=True, text=True, timeout=20
            )
            if filepath.exists() and filepath.stat().st_size > 1000:
                return {"success": True, "message": f"Screenshot saved to Desktop: {filename}", "path": str(filepath)}
        except Exception:
            pass

    # Method 3: PIL ImageGrab
    if PIL_AVAILABLE and IS_WINDOWS:
        try:
            from PIL import ImageGrab
            screenshot = ImageGrab.grab()
            screenshot.save(str(filepath))
            return {"success": True, "message": f"Screenshot saved to Desktop: {filename}", "path": str(filepath)}
        except Exception as e:
            return {"success": False, "message": f"Screenshot failed: {str(e)}"}

    return {"success": False, "message": "Screenshot unavailable. Install pyautogui: pip install pyautogui Pillow"}


def action_send_whatsapp(target, details):
    """Send a WhatsApp message via WhatsApp Web using Selenium."""
    if not SELENIUM_AVAILABLE:
        return {"success": False, "message": "selenium not installed. Run: pip install selenium webdriver-manager"}
    
    contact = details.get('contact', target)
    message = details.get('message', target)
    file_path = details.get('file_path', None)
    
    try:
        options = ChromeOptions()
        options.add_argument("--user-data-dir=./whatsapp_profile")
        options.add_argument("--profile-directory=Default")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
        driver.get("https://web.whatsapp.com")
        
        wait = WebDriverWait(driver, 30)
        
        # Wait for WhatsApp to load
        search_box = wait.until(
            EC.presence_of_element_located((By.XPATH, '//div[@contenteditable="true"][@data-tab="3"]'))
        )
        
        # Search for contact
        search_box.click()
        search_box.send_keys(contact)
        time.sleep(2)
        
        # Click first result
        contact_element = wait.until(
            EC.presence_of_element_located((By.XPATH, f'//span[@title="{contact}"]'))
        )
        contact_element.click()
        time.sleep(1)
        
        if file_path and os.path.exists(file_path):
            # Attach file
            attach_btn = driver.find_element(By.XPATH, '//div[@title="Attach"]')
            attach_btn.click()
            time.sleep(1)
            
            doc_input = driver.find_element(By.XPATH, '//input[@accept="*"]')
            doc_input.send_keys(file_path)
            time.sleep(2)
            
            send_btn = wait.until(
                EC.element_to_be_clickable((By.XPATH, '//span[@data-icon="send"]'))
            )
            send_btn.click()
            result = {"success": True, "message": f"File sent to {contact}"}
        else:
            # Type and send message
            msg_box = wait.until(
                EC.presence_of_element_located((By.XPATH, '//div[@contenteditable="true"][@data-tab="10"]'))
            )
            msg_box.click()
            msg_box.send_keys(message)
            time.sleep(0.5)
            
            send_btn = driver.find_element(By.XPATH, '//span[@data-icon="send"]')
            send_btn.click()
            result = {"success": True, "message": f"Message sent to {contact}"}
        
        time.sleep(2)
        driver.quit()
        return result
        
    except Exception as e:
        return {"success": False, "message": f"WhatsApp error: {str(e)}"}


def action_create_file(target, details):
    """Create a file with given content."""
    if not target:
        return {"success": False, "message": "No file path specified"}

    content = details.get('content', '')

    try:
        filepath = Path(target)

        # If no absolute path, create on actual Desktop (handles OneDrive)
        if not filepath.is_absolute():
            filepath = get_desktop_path() / target

        filepath.parent.mkdir(parents=True, exist_ok=True)
        filepath.write_text(content, encoding='utf-8')

        return {"success": True, "message": f"File created: {filepath}"}
    except Exception as e:
        return {"success": False, "message": f"File creation failed: {str(e)}"}


def action_delete_file(target, details):
    """Delete a file."""
    if not target:
        return {"success": False, "message": "No file path specified"}
    
    try:
        filepath = Path(target)
        if filepath.exists():
            filepath.unlink()
            return {"success": True, "message": f"Deleted: {filepath}"}
        else:
            return {"success": False, "message": f"File not found: {filepath}"}
    except Exception as e:
        return {"success": False, "message": f"Delete failed: {str(e)}"}


def action_volume_control(target, details):
    """Control system volume."""
    if not PYAUTOGUI_AVAILABLE:
        return {"success": False, "message": "pyautogui not installed"}
    
    action = (target or '').lower()
    steps = details.get('steps', 3)
    
    try:
        if IS_WINDOWS:
            if action == 'mute':
                pyautogui.press('volumemute')
                return {"success": True, "message": "Volume muted"}
            elif action == 'up' or action == 'increase':
                for _ in range(int(steps)):
                    pyautogui.press('volumeup')
                return {"success": True, "message": f"Volume increased by {steps}"}
            elif action == 'down' or action == 'decrease':
                for _ in range(int(steps)):
                    pyautogui.press('volumedown')
                return {"success": True, "message": f"Volume decreased by {steps}"}
            else:
                return {"success": False, "message": f"Unknown volume action: {action}"}
        else:
            # Linux: amixer
            if action == 'mute':
                subprocess.run(['amixer', 'set', 'Master', 'toggle'])
            elif action == 'up':
                subprocess.run(['amixer', 'set', 'Master', f'{steps * 5}%+'])
            elif action == 'down':
                subprocess.run(['amixer', 'set', 'Master', f'{steps * 5}%-'])
            return {"success": True, "message": f"Volume {action}"}
    except Exception as e:
        return {"success": False, "message": str(e)}


def action_system_action(target, details):
    """Handle system-level actions: shutdown, restart, sleep, lock."""
    action = (target or '').lower().strip()
    
    try:
        if IS_WINDOWS:
            commands = {
                'shutdown': 'shutdown /s /t 30',
                'restart': 'shutdown /r /t 30',
                'reboot': 'shutdown /r /t 30',
                'sleep': 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
                'hibernate': 'shutdown /h',
                'lock': 'rundll32.exe user32.dll,LockWorkStation',
                'logoff': 'shutdown /l',
                'cancel_shutdown': 'shutdown /a',
            }
            cmd = commands.get(action)
            if cmd:
                os.system(cmd)
                return {"success": True, "message": f"System action: {action}"}
            else:
                return {"success": False, "message": f"Unknown system action: {action}"}
        
        elif IS_MAC:
            commands = {
                'shutdown': 'sudo shutdown -h now',
                'restart': 'sudo shutdown -r now',
                'sleep': 'pmset sleepnow',
                'lock': '/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend',
            }
            cmd = commands.get(action)
            if cmd:
                os.system(cmd)
                return {"success": True, "message": f"System action: {action}"}
        
        else:
            commands = {
                'shutdown': 'sudo shutdown -h now',
                'restart': 'sudo reboot',
                'sleep': 'systemctl suspend',
                'lock': 'loginctl lock-session',
            }
            cmd = commands.get(action)
            if cmd:
                os.system(cmd)
                return {"success": True, "message": f"System action: {action}"}
        
        return {"success": False, "message": f"Unknown action: {action}"}
        
    except Exception as e:
        return {"success": False, "message": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# MAIN DISPATCHER
# ─────────────────────────────────────────────────────────────────────────────

ACTION_HANDLERS = {
    'open_app': action_open_app,
    'search_web': action_search_web,
    'open_youtube': action_open_youtube,
    'play_spotify': action_play_spotify,
    'open_file': action_open_file,
    'run_command': action_run_command,
    'take_screenshot': action_take_screenshot,
    'send_whatsapp': action_send_whatsapp,
    'create_file': action_create_file,
    'delete_file': action_delete_file,
    'volume_control': action_volume_control,
    'system_action': action_system_action,
}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "message": "No payload provided"}))
        sys.exit(1)
    
    try:
        payload = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "message": f"Invalid JSON payload: {str(e)}"}))
        sys.exit(1)
    
    action = payload.get('action', '').lower()
    target = payload.get('target', '')
    details = payload.get('details', {})
    
    handler = ACTION_HANDLERS.get(action)
    
    if not handler:
        print(json.dumps({
            "success": False,
            "message": f"Unknown action: {action}. Available: {list(ACTION_HANDLERS.keys())}"
        }))
        sys.exit(1)
    
    try:
        result = handler(target, details)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "message": f"Action '{action}' failed: {str(e)}"
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
