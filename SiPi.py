#!/usr/bin/env python3
import socket
import threading
import time
import subprocess
import os
import datetime
import math
import json
from flask import (
    Flask, render_template, jsonify, request,
    flash, redirect, url_for, send_from_directory
)

# Initial SiPi version (bump patch for simple fixes)
__version__ = "0.7"

# Base directory for Git operations
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)
app.secret_key = 'your_secret_key_here'  # Replace with a strong secret key

# Paths
SI_TECH_HOST    = 'localhost'
SI_TECH_PORT    = 8079
CONFIG_FILE     = "/usr/share/SiTech/SiTechExe/SiTech.cfg"
HOSTAPD_CONF    = "/etc/hostapd/hostapd.conf"
WEB_CONFIG_FILE = os.path.join(os.path.dirname(__file__), "web_config.json")

# Mount model file on Pi
MODEL_DIR       = "/usr/share/SiTech/SiTechExe"
MODEL_FILE      = "AutoLoad.PXP"    # Correct filename case

# Persisted web settings
def load_web_config():
    try:
        with open(WEB_CONFIG_FILE, 'r') as f:
            return json.load(f)
    except:
        return {"vibration_enabled": False, "tilt_enabled": False}

def save_web_config(cfg):
    with open(WEB_CONFIG_FILE, 'w') as f:
        json.dump(cfg, f)

web_config = load_web_config()

# Global state
scope_status            = "No status yet"
status_lock             = threading.Lock()
site_latitude           = None
site_longitude          = None  
persistent_socket       = None
move_socket             = None
command_socket          = None
move_socket_lock        = threading.Lock()
command_socket_lock     = threading.Lock()
MESSIER_FILE            = os.path.join(BASE_DIR, "messier.json")


# Formatting helpers
def format_hms(value):
    try:
        num = float(value)
    except:
        return value
    sign = "-" if num < 0 else ""
    num = abs(num)
    h = int(num)
    rem = (num - h) * 60
    m = int(rem)
    s = (rem - m) * 60
    return f"{sign}{h:02d}:{m:02d}:{s:05.2f}"

def format_hms_no_decimals(value):
    try:
        num = float(value)
    except:
        return value
    sign = "-" if num < 0 else ""
    num = abs(num)
    h = int(num)
    rem = (num - h) * 60
    m = int(rem)
    s = int(round((rem - m) * 60))
    if s == 60:
        s = 0
        m += 1
    return f"{sign}{h:02d}:{m:02d}:{s:02d}"

def get_site_location():
    global site_latitude, site_longitude
    try:
        s = socket.socket()
        s.connect((SI_TECH_HOST, SI_TECH_PORT))
        s.settimeout(5)
        s.sendall(b"SiteLocations\n")
        data = s.recv(1024).decode('ascii')
        s.close()
        parts = data.split(';')
        # first element is latitude, second is longitude
        site_latitude  = float(parts[0].strip()) if len(parts) > 0 else 0.0
        site_longitude = float(parts[1].strip()) if len(parts) > 1 else 0.0
    except:
        site_latitude  = 0.0
        site_longitude = 0.0


def eq_to_alt_az(ra, dec, lst, lat):
    # Convert all to degrees
    ha = (lst - ra) * 15  # Hour angle in degrees
    ha_r = math.radians(ha)
    dec_r = math.radians(dec)
    lat_r = math.radians(lat)

    # Altitude
    sin_alt = math.sin(dec_r) * math.sin(lat_r) + math.cos(dec_r) * math.cos(lat_r) * math.cos(ha_r)
    alt = math.asin(sin_alt)

    # Azimuth (measured from North, increasing eastward)
    cos_az = (math.sin(dec_r) - math.sin(alt) * math.sin(lat_r)) / (math.cos(alt) * math.cos(lat_r))
    sin_az = -math.sin(ha_r) * math.cos(dec_r) / math.cos(alt)
    az = math.atan2(sin_az, cos_az)
    az = math.degrees(az)
    if az < 0:
        az += 360
    alt = math.degrees(alt)
    return alt, az

# Version helper for SiPi
def get_sipi_version():
    # Return the explicit version; bump __version__ for each patch change
    return __version__

# --- Socket connect functions ---

def connect_persistent_socket():
    global persistent_socket
    try:
        persistent_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        persistent_socket.connect((SI_TECH_HOST, SI_TECH_PORT))
        persistent_socket.settimeout(5)
    except:
        persistent_socket = None

def connect_move_socket():
    global move_socket
    try:
        move_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        move_socket.connect((SI_TECH_HOST, SI_TECH_PORT))
        move_socket.settimeout(5)
    except:
        move_socket = None

def connect_command_socket():
    global command_socket
    try:
        command_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        command_socket.connect((SI_TECH_HOST, SI_TECH_PORT))
        command_socket.settimeout(5)
    except:
        command_socket = None

# Fire-and-forget for movement & tracking
def send_move_no_wait(command):
    global move_socket
    with move_socket_lock:
        if move_socket is None:
            connect_move_socket()
        try:
            move_socket.sendall(command.encode('ascii'))
        except:
            try: move_socket.close()
            except: pass
            connect_move_socket()
            if move_socket:
                move_socket.sendall(command.encode('ascii'))

# Persistent command-socket helper
def send_command(command, timeout=5, retries=1, terminator=None):
    global command_socket
    with command_socket_lock:
        if command_socket is None:
            connect_command_socket()
        s = command_socket
        if s is None:
            return ""
        try:
            orig_to = s.gettimeout()
        except:
            orig_to = None
        try:
            s.settimeout(timeout)
            s.sendall(command.encode('ascii'))
            response = ""
            while True:
                try:
                    data = s.recv(1024)
                    if not data:
                        break
                    decoded = data.decode('ascii')
                    #print("RECV DEBUG:", repr(decoded))  # <--- INSERT THIS LINE
                    response += decoded
                    if terminator and terminator in response:
                        break  # Early exit
                except socket.timeout:
                    break

            return response
        except:
            try: s.close()
            except: pass
            command_socket = None
            if retries > 0:
                return send_command(command, timeout, retries - 1, terminator)
            return ""
        finally:
            try:
                if orig_to is not None:
                    s.settimeout(orig_to)
            except:
                pass


# Version helper for SiTechExe
def get_site_version():
    # Use a 0.25-second timeout so we don’t stall the page load
    raw = send_command("GetSiTechVersion\n", timeout=0.25)
    # strip leading semicolons/newlines/spaces
    v = raw.lstrip(";\r\n ").strip()
    prefix = "_GetSiTechVersion="
    if v.startswith(prefix):
        return v[len(prefix):].strip()
    if prefix in v:
        return v.split(prefix,1)[1].strip()
    return v

# Status update loop (persistent_socket)
def status_update_loop():
    global scope_status, persistent_socket
    if persistent_socket is None:
        connect_persistent_socket()
    while True:
        try:
            if persistent_socket:
                persistent_socket.sendall(b"ReadScopeStatus\n")
                data = persistent_socket.recv(1024)
                if data:
                    with status_lock:
                        scope_status = data.decode('ascii')
            else:
                connect_persistent_socket()
            # poll every 200 ms instead of 500 ms
            time.sleep(0.2)
        except:
            try: persistent_socket.close()
            except: pass
            persistent_socket = None
            # reconnect delay of 200 ms
            time.sleep(0.2)
            connect_persistent_socket()

# --- Flask routes ---

@app.route('/')
def index():
    # Ensure site location is up to date for SkyView
    get_site_location()
    return render_template(
        'index.html',
        vibration_enabled=web_config['vibration_enabled'],
        tilt_enabled=web_config['tilt_enabled'],
        site_latitude=site_latitude,
        site_longitude=site_longitude
    )

@app.route('/skyview')
def skyview():
    # Refresh site location from the mount on every request
    get_site_location()
    return render_template(
        'skyview.html',
        site_latitude=site_latitude,
        site_longitude=site_longitude
    )

@app.route('/messier-data')
def messier_data():
    with open(MESSIER_FILE, 'r') as f:
        data = json.load(f)
    return jsonify(data)

@app.route('/stars-data')
def stars_data():
    """
    Serve the pre-generated star catalog for SkyView.
    Expects static/stars.json to exist.
    """
    stars_path = os.path.join(BASE_DIR, 'static', 'stars.json')
    with open(stars_path, 'r') as f:
        stars = json.load(f)
    return jsonify(stars)
    
@app.route('/constellations-data')
def constellations_data():
    return send_from_directory(
        os.path.join(BASE_DIR, 'static'),
        'constellations.json',
        mimetype='application/json'
    )


@app.route('/download_model')
def download_model():
    return send_from_directory(MODEL_DIR, MODEL_FILE, as_attachment=True)

@app.route('/status')
def status():
    with status_lock:
        s = scope_status
    fields = s.split(';')
    if len(fields) >= 8:
        ra  = format_hms(fields[1].strip())
        dec = format_hms(fields[2].strip())
        sid = format_hms_no_decimals(fields[7].strip())
        try:
            alt = f"{float(fields[3]):.2f}"
            az  = f"{float(fields[4]):.2f}"
        except:
            alt, az = fields[3].strip(), fields[4].strip()
    else:
        ra = dec = sid = alt = az = "N/A"
    bp = int(fields[0]) if fields[0].isdigit() else 0
    track = (
        "Communication Fault" if bp & 128 else
        "Parking"            if bp &   8 else
        "Parked"             if bp &  16 else
        "Slewing"            if bp &   4 else
        "Blinky"             if bp &  64 else
        "Tracking"           if bp &   2 else
        "Stopped"
    )
    return jsonify(
        time=time.strftime("%H:%M:%S"),
        sidereal=sid, ra=ra, dec=dec,
        alt=alt, az=az, tracking=track
    )

@app.route('/search', methods=['POST'])    
def search():
    q = request.form.get('query','')
    if not q:
        return jsonify(results=[])
    # --- Debug print: command being sent ---
    print(f"[SiPi SEARCH DEBUG] Sending: SearchDatabase {q}\\n")
    raw = send_command(f"SearchDatabase {q}\n", timeout=5, retries=1, terminator="\n")
    # --- Debug print: raw reply received ---
    print(f"[SiPi SEARCH DEBUG] Reply: {repr(raw)}")
    lines = raw.split('~') if '~' in raw else raw.splitlines()
    results = []    
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        main = ln.split(';')[0]
        parts = [p.strip() for p in main.split(',')]
        if len(parts) >= 2:
            try:
                raf = float(parts[0]); dcf = float(parts[1])
            except:
                raf = dcf = 0.0
            with status_lock:
                st = scope_status.split(';')
            try:
                lst = float(st[7].strip())
            except:
                lst = 0.0
            if site_latitude is not None:
                altf, azf = eq_to_alt_az(raf, dcf, lst, site_latitude)
                alts = f"{altf:.2f}"
                azs  = f"{azf:.2f}"
            else:
                alts = azs = "N/A"
            results.append({
                'ra': format_hms(parts[0]), 'raw_ra': parts[0],
                'dec': format_hms(parts[1]), 'raw_dec': parts[1],
                'alt': alts, 'az': azs,
                'info': ", ".join(parts[2:]) if len(parts)>2 else "",
                'rawResult': ln
            })
        else:
            results.append({'result': ln, 'rawResult': ln})
    return jsonify(results=results)

@app.route('/sync', methods=['POST'])
def sync():
    ra = request.form.get('ra','')
    dec = request.form.get('dec','')
    if not ra or not dec:
        return jsonify(response="Missing RA or Dec")
    return jsonify(response=send_command(f"Sync {ra} {dec} 1\n", timeout=5, terminator="\n"))

@app.route('/goto', methods=['POST'])
def goto():
    ra = request.form.get('ra',''); dec = request.form.get('dec','')
    if not ra or not dec:
        return jsonify(response="Invalid RA or Dec")
    return jsonify(response=send_command(f"GoTo {ra} {dec}\n"))

@app.route('/goto-altaz', methods=['POST'])
def goto_altaz():
    # Accepts JSON body with 'alt' and 'az' (degrees)
    data = request.get_json(force=True)
    alt = data.get('alt', None)
    az = data.get('az', None)
    if alt is None or az is None:
        return jsonify(response="Missing alt or az"), 400
    try:
        alt = float(alt)
        az = float(az)
    except Exception:
        return jsonify(response="Invalid alt or az"), 400
    # Command format: GoToAltAz Az Alt\n
    cmd = f"GoToAltAz {az:.6f} {alt:.6f}\n"
    result = send_command(cmd)
    return jsonify(response=result)

@app.route('/calpt', methods=['POST'])
def calpt():
    ra = request.form.get('ra','')
    dec = request.form.get('dec','')
    if not ra or not dec:
        return jsonify(response="Missing RA or Dec")
    return jsonify(response=send_command(f"Sync {ra} {dec} 2\n", timeout=5, terminator="\n"))

@app.route('/clear', methods=['POST'])
def clear():
    return jsonify(response=send_command("ClearAllCalPoints\n", timeout=5, terminator="\n"))

@app.route('/save_model', methods=['POST'])
def save_model():
    return jsonify(response=send_command("SaveModel\n", timeout=5, terminator="\n"))

@app.route('/moveaxis', methods=['POST'])
def moveaxis():
    axis = request.form.get('axis',''); arg = request.form.get('arg','')
    if not axis:
        return jsonify(response="Missing axis")
    cmd = f"MoveAxisSPG{axis}" + (f" {arg}" if arg else "") + "\n"
    send_move_no_wait(cmd)
    return jsonify(response="Command sent")

@app.route('/abort', methods=['POST'])
def abort():
    send_move_no_wait("Abort\n")
    return jsonify(response="Command sent")

@app.route('/park', methods=['POST'])
def park():
    send_move_no_wait("Park\n")
    return jsonify(response="Command sent")

@app.route('/unpark', methods=['POST'])
def unpark():
    send_move_no_wait("UnPark\n")
    return jsonify(response="Command sent")

@app.route('/setpark', methods=['POST'])
def setpark():
    return jsonify(response=send_command("SetPark\n"))

@app.route('/start', methods=['POST'])
def start():
    send_move_no_wait("SetTrackMode 1 0 0.0 0.0\n")
    return jsonify(response="Command sent")

@app.route('/toggle_mode', methods=['POST'])
def toggle_mode():
    with status_lock:
        fb = int(scope_status.split(';')[0] or 0)
    if fb & 64:
        cmd  = "MotorsToAuto\n"
        mode = "Auto"
    else:
        cmd  = "MotorsToBlinky\n"
        mode = "Manual"
    send_move_no_wait(cmd)
    return jsonify(mode=mode)

@app.route('/getModelInfo', methods=['POST'])
def get_model_info():
    raw = send_command("GetPointXPStatus\n", timeout=1)
    parts = [p.strip() for p in raw.split(';')]
    cal_pts = parts[0] if parts else "0"
    rms = parts[1] if len(parts) > 1 else ""
    if rms.startswith("RMS="):
        rms = rms[4:]
    return jsonify(cal_pts=cal_pts, rms=rms)

@app.route('/settime', methods=['POST'])
def set_time():
    t = request.form.get('time','')
    # Accepts "HH:MM" (24-hour). Optionally add validation.
    try:
        # Run as root so this works; may require sudoers config for passwordless sudo
        result = subprocess.run(['sudo', 'date', '+%H:%M', '-s', t], capture_output=True, text=True)
        if result.returncode == 0:
            return jsonify(response=f"System time set to {t}")
        else:
            return jsonify(response=f"Failed to set time: {result.stderr.strip()}")
    except Exception as e:
        return jsonify(response=f"Error: {e}")

@app.route('/update_wifi', methods=['POST'])
def update_wifi():
    ssid   = request.form.get('ssid','')
    passwd = request.form.get('pass','')
    lines = []
    for ln in open(HOSTAPD_CONF).read().splitlines():
        if ln.startswith('ssid='):
            lines.append(f"ssid={ssid}")
        elif ln.startswith('wpa_passphrase='):
            lines.append(f"wpa_passphrase={passwd}")
        else:
            lines.append(ln)
    with open(HOSTAPD_CONF,'w') as f:
        f.write("\n".join(lines) + "\n")
    try:
        subprocess.run(['systemctl','restart','hostapd'], check=False)
    except:
        pass
    return jsonify(success=True)

@app.route('/toggle_vibration', methods=['POST'])
def toggle_vibration():
    enabled = request.form.get('enabled','false').lower() == 'true'
    web_config['vibration_enabled'] = enabled
    save_web_config(web_config)
    return jsonify(success=True)

@app.route('/toggle_tilt', methods=['POST'])
def toggle_tilt():
    enabled = request.form.get('enabled','false').lower() == 'true'
    web_config['tilt_enabled'] = enabled
    save_web_config(web_config)
    return jsonify(success=True)

# ─── New Update Routes ─────────────────────────────────────────────────────

@app.route('/check_updates', methods=['POST'])
def check_updates():
    try:
        env = os.environ.copy()
        # Print working directory and environment
        print(f"[DEBUG] os.getcwd(): {os.getcwd()}")
        print(f"[DEBUG] BASE_DIR: {BASE_DIR}")
        # Print git remote -v
        try:
            remote_v = subprocess.run(['git', 'remote', '-v'], cwd=BASE_DIR, capture_output=True, text=True, env=env).stdout.strip()
        except Exception as e:
            remote_v = f"[error running git remote -v: {e}]"
        print(f"[DEBUG] git remote -v:\n{remote_v}")
        # Fetch updates using HTTPS
        fetch_result = subprocess.run(
            ['git', 'fetch', '--prune', 'origin', '+refs/heads/*:refs/remotes/origin/*', '--verbose'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env)
        print(f"[DEBUG] git fetch stdout: {fetch_result.stdout}")
        print(f"[DEBUG] git fetch stderr: {fetch_result.stderr}")
        # Find current branch
        current_branch = subprocess.run(
            ['git','rev-parse','--abbrev-ref','HEAD'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env).stdout.strip()
        print(f"[DEBUG] current_branch: {current_branch}")
        # Get hashes
        local = subprocess.run(
            ['git','rev-parse','HEAD'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env).stdout.strip()
        print(f"[DEBUG] local HEAD: {local}")
        remote = subprocess.run(
            ['git','rev-parse',f'origin/{current_branch}'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env).stdout.strip()
        print(f"[DEBUG] remote HEAD: {remote}")
        # Also print git status for more info
        status = subprocess.run(
            ['git','status','-b','-s','-uall'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env).stdout.strip()
        print(f"[DEBUG] git status: {status}")
        available = (local != remote)
        return jsonify(
            updates_available=available,
            current_version=local,
            latest_version=remote,
            git_status=status,
            fetch_stdout=fetch_result.stdout,
            fetch_stderr=fetch_result.stderr,
            remote_v=remote_v
        )
    except Exception as e:
        print(f"[DEBUG] check_updates: Exception: {e}")
        return jsonify(updates_available=False, current_version="", latest_version="", error=str(e))


@app.route('/apply_updates', methods=['POST'])
def apply_updates():
    try:
        env = os.environ.copy()
        # Print working directory and environment
        print(f"[DEBUG] os.getcwd(): {os.getcwd()}")
        print(f"[DEBUG] BASE_DIR: {BASE_DIR}")
        # Pull latest changes using HTTPS
        pull = subprocess.run(
            ['git', 'pull', 'origin', 'main'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env)
        print(f"[DEBUG] git pull stdout: {pull.stdout}")
        print(f"[DEBUG] git pull stderr: {pull.stderr}")
        if pull.returncode == 0:
            # ---- Auto-restart SiPi after update ----
            try:
                subprocess.run(['systemctl', 'restart', 'sipi'], check=False, env=env)
                restart_msg = "\n[sipi.service restarted]"
            except Exception as e:
                restart_msg = f"\n[Failed to restart sipi.service: {e}]"
            return jsonify(success=True, message=pull.stdout.strip() + restart_msg)
        else:
            return jsonify(success=False, message=pull.stderr.strip())
    except Exception as e:
        return jsonify(success=False, message=str(e))

# ────────────────────────────────────────────────────────────────────────────

@app.route('/edit_config', methods=['GET','POST'])
def edit_config():
    if request.method == 'POST':
        open(CONFIG_FILE, 'w').write(request.form.get('config',''))
        flash("Configuration updated", "success")
        return redirect(url_for('edit_config'))

    cfg = open(CONFIG_FILE).read()
    ob = o2 = mmode = 0
    for ln in cfg.splitlines():
        if ln.startswith('OptionBits='):
            val = ln.split('=',1)[1]
            ob = int(val) if val.isdigit() else 0
        if ln.startswith('Option2Bits='):
            val = ln.split('=',1)[1]
            o2 = int(val) if val.isdigit() else 0
        if ln.startswith('AlignmentMode='):
            val = ln.split('=',1)[1]
            mmode = int(val) if val.isdigit() else 0

    az_mode    = ('cascade' if (o2 & (1<<23)) else
                  'ignore'  if (ob & 1)    else
                  'precise' if (ob & 2)    else
                  'polite')
    alt_mode   = ('cascade' if (o2 & (1<<22)) else
                  'ignore'  if (ob & (1<<17)) else
                  'precise' if (ob & (1<<18)) else
                  'polite')
    drag_mode  = bool(ob & 8)
    no_wrap    = bool(ob & (1<<24))
    mount_type = str(mmode if mmode in (0,1,3) else 0)

    wssid = wpass = ""
    for ln in open(HOSTAPD_CONF).read().splitlines():
        if ln.startswith('ssid='):           wssid = ln.split('=',1)[1]
        if ln.startswith('wpa_passphrase='): wpass = ln.split('=',1)[1]

    with status_lock:
        fb = int(scope_status.split(';')[0] or 0)
    mode = "Auto" if (fb & 64) else "Manual"

    sipi_version = get_sipi_version()
    site_version = get_site_version()

    return render_template(
        'edit_config.html',
        config=open(CONFIG_FILE).read(),
        az_mode=az_mode,
        alt_mode=alt_mode,
        drag_mode=drag_mode,
        no_wrap=no_wrap,
        mount_type=mount_type,
        wifi_ssid=wssid,
        wifi_passphrase=wpass,
        vibration_enabled=web_config['vibration_enabled'],
        tilt_enabled=web_config['tilt_enabled'],
        mode=mode,
        sipi_version=sipi_version,
        site_version=site_version
    )

def wait_for_ip(interface='wlan0'):
    for _ in range(20):
        result = subprocess.run(['ip','-4','addr','show', interface], capture_output=True, text=True)
        if 'inet ' in result.stdout:
            return
        time.sleep(0.5)

@app.route('/quickstart')
def quickstart():
    return render_template('quickstart.html')

if __name__ == '__main__':
    get_site_location()
    connect_command_socket()
    connect_persistent_socket()
    wait_for_ip()
    threading.Thread(target=status_update_loop, daemon=True).start()
    app.run(host='0.0.0.0', port=5000)
