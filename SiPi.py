#!/usr/bin/env python3


import socket
import threading
import time
import subprocess
import os
import datetime
import math
import json
import uuid
import getpass
import stat
from flask import (
    Flask, render_template, jsonify, request,
    flash, redirect, url_for, send_from_directory
)

# Import astrometric corrections
from astrometric_corrections import preprocess_catalogs_for_current_epoch

# Initial SiPi version (bump patch for simple fixes)
__version__ = "0.9"

# Base directory for Git operations
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)
app.secret_key = 'your_secret_key_here'  # Replace with a strong secret key

# Global variables for corrected catalog paths
corrected_catalogs = {
    'stars': None,
    'messier': None,
    'constellations': None,
    'galaxies': None,
    'globular_clusters': None,
    'nebula': None,
    'open_clusters': None,
    'planetary_nebula': None
}


# Paths
SI_TECH_HOST    = 'localhost'
SI_TECH_PORT    = 8078
CONFIG_FILE     = "/usr/share/SiTech/SiTechExe/SiTech.cfg"
CONFIG_BACKUP   = "/opt/SiTech/SiPi/SiTech.cfg.bak"
HOSTAPD_CONF    = "/etc/hostapd/hostapd.conf"
WEB_CONFIG_FILE = os.path.join(os.path.dirname(__file__), "web_config.json")
# --- Config backup/restore endpoints ---
@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'favicon.ico', mimetype='image/vnd.microsoft.icon')

@app.route('/backup_config', methods=['POST'])
def backup_config():
    try:
        os.makedirs(os.path.dirname(CONFIG_BACKUP), exist_ok=True)
        with open(CONFIG_FILE, 'r') as src, open(CONFIG_BACKUP, 'w') as dst:
            dst.write(src.read())
        # Diagnostics: user, permissions
        user = getpass.getuser()
        cfg_stat = os.stat(CONFIG_FILE)
        bak_stat = os.stat(CONFIG_BACKUP)
        dir_stat = os.stat(os.path.dirname(CONFIG_BACKUP))
        perms = {
            'config_file': oct(cfg_stat.st_mode & 0o777),
            'backup_file': oct(bak_stat.st_mode & 0o777),
            'backup_dir': oct(dir_stat.st_mode & 0o777),
        }
        return jsonify(success=True, message="Backup successful.", user=user, perms=perms)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        user = getpass.getuser()
        return jsonify(success=False, error=str(e), traceback=tb, user=user), 500

@app.route('/restore_config', methods=['POST'])
def restore_config():
    try:
        if not os.path.exists(CONFIG_BACKUP):
            return jsonify(success=False, error="No backup file found."), 404
        with open(CONFIG_BACKUP, 'r') as src, open(CONFIG_FILE, 'w') as dst:
            dst.write(src.read())
        # Diagnostics: user, permissions
        user = getpass.getuser()
        cfg_stat = os.stat(CONFIG_FILE)
        bak_stat = os.stat(CONFIG_BACKUP)
        dir_stat = os.stat(os.path.dirname(CONFIG_BACKUP))
        perms = {
            'config_file': oct(cfg_stat.st_mode & 0o777),
            'backup_file': oct(bak_stat.st_mode & 0o777),
            'backup_dir': oct(dir_stat.st_mode & 0o777),
        }
        # Optionally reload config in SiTechExe
        try:
            send_command('ReloadConfigFile\n')
        except Exception:
            pass
        return jsonify(success=True, message="Restore successful.", user=user, perms=perms)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        user = getpass.getuser()
        return jsonify(success=False, error=str(e), traceback=tb, user=user), 500

# Mount model file on Pi
MODEL_DIR       = "/usr/share/SiTech/SiTechExe"
MODEL_FILE      = "AutoLoad.PXP"    # Correct filename case

# Persisted web settings
def load_web_config():
    try:
        with open(WEB_CONFIG_FILE, 'r') as f:
            return json.load(f)
    except:
        return {"vibration_enabled": False, "tilt_enabled": False, "flip_skyview": False}

def save_web_config(cfg):
    # Ensure flip_skyview is always present
    if 'flip_skyview' not in cfg:
        cfg['flip_skyview'] = False
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

# --- Boot/session ID for first-load logic ---
BOOT_ID = str(int(time.time())) + "-" + uuid.uuid4().hex[:8]


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
    # Priority-based status determination (highest to lowest priority)
    if bp & 128:  # Bit 07
        track = "Communication Fault"
    elif bp & 64:  # Bit 06
        track = "Blinky/Manual"
    elif not (bp & 1):  # Bit 00 false
        track = "Scope Not Initialized"
    elif bp & 2:  # Bit 01
        track = "Tracking"
    elif bp & 8:  # Bit 03
        track = "Parking"
    elif bp & 16:  # Bit 04
        track = "Parked"
    elif bp & 4:  # Bit 02
        track = "Slewing"
    else:  # Bit 02 false
        track = "Stopped"
    return jsonify(
        time=time.strftime("%H:%M:%S"),
        sidereal=sid, ra=ra, dec=dec,
        alt=alt, az=az, tracking=track,
        boot_id=BOOT_ID
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
# --- Calibration Points API ---
import re

POINTERR_PATH = "/usr/share/SiTech/SiTechExe/PointErr.txt"

@app.route('/cal_points')
def cal_points():
    points = []
    try:
        with open(POINTERR_PATH, 'r') as f:
            for line in f:
                parts = line.strip().split(';')
                if len(parts) < 5:
                    continue
                idx = int(parts[0])
                ra = float(parts[1])
                dec = float(parts[2])
                error = float(parts[3])
                enabled = parts[4].strip().lower() == 'true'
                points.append({
                    'index': idx,
                    'ra': ra,
                    'dec': dec,
                    'error': error,
                    'enabled': enabled
                })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    return jsonify(points=points)

@app.route('/enable_cal_point', methods=['POST'])
def enable_cal_point():
    idx = request.json.get('index')
    if idx is None:
        return jsonify({'error': 'Missing index'}), 400
    resp = send_command(f"EnablePoint {idx}\n", timeout=5, terminator="\n")
    return jsonify(response=resp)

@app.route('/disable_cal_point', methods=['POST'])
def disable_cal_point():
    idx = request.json.get('index')
    if idx is None:
        return jsonify({'error': 'Missing index'}), 400
    resp = send_command(f"DisablePoint {idx}\n", timeout=5, terminator="\n")
    return jsonify(response=resp)
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


# --- New: Set system time from ISO string (for popup) ---
@app.route('/set_time', methods=['POST'])
def set_time_popup():
    try:
        data = request.get_json(force=True)
        # Accept either 'dt_str' (preferred) or 'iso' (legacy)
        dt_str = data.get('dt_str')
        if not dt_str:
            iso = data.get('iso')
            if not iso:
                return jsonify(success=False, error='Missing time'), 400
            # Parse ISO string as local time
            try:
                dt = datetime.datetime.fromisoformat(iso.replace('Z','+00:00'))
            except Exception:
                return jsonify(success=False, error='Invalid ISO time'), 400
            dt_str = dt.strftime('%Y-%m-%d %H:%M:%S')
        # Set system time (requires sudo)
        result = subprocess.run(['sudo', 'date', '-s', dt_str], capture_output=True, text=True)
        print(f"[DEBUG] sudo date -s '{dt_str}'\nstdout: {result.stdout}\nstderr: {result.stderr}\nreturncode: {result.returncode}", flush=True)
        if result.returncode == 0:
            return jsonify(success=True, message=f"System time set to {dt_str}", debug=result.stdout + result.stderr)
        else:
            return jsonify(success=False, error=result.stderr.strip(), debug=result.stdout + result.stderr), 500
    except Exception as e:
        print(f"[DEBUG] Exception in set_time_popup: {e}", flush=True)
        return jsonify(success=False, error=str(e)), 500

@app.route('/update_wifi', methods=['POST'])
def update_wifi():
    # Accept from form, query, or JSON
    ssid = request.values.get('ssid', '')
    passwd = request.values.get('pass', '')
    if not ssid and request.is_json:
        data = request.get_json(force=True)
        ssid = data.get('ssid', '')
        passwd = data.get('pass', '')
    try:
        result = subprocess.run(
            ['sudo', '/usr/local/bin/update_hostapd_conf.sh', ssid, passwd],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return jsonify(success=True)
        else:
            return jsonify(success=False, error=result.stderr), 500
    except Exception as e:
        return jsonify(success=False, error=str(e)), 500

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
    import getpass
    try:
        env = os.environ.copy()
        if not env.get('HOME'):
            env['HOME'] = f"/home/{subprocess.run(['whoami'], capture_output=True, text=True).stdout.strip()}"
        # Always fetch from origin
        fetch = subprocess.run(
            ['git', 'fetch', 'origin'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env)
        # Get local HEAD commit
        local_hash_proc = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env)
        local_hash = local_hash_proc.stdout.strip()
        # Get remote main commit
        remote_hash_proc = subprocess.run(
            ['git', 'rev-parse', 'origin/main'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env)
        remote_hash = remote_hash_proc.stdout.strip()
        # Get git status and log for debug
        git_status = subprocess.run(
            ['git', 'status', '-b', '-u', '--porcelain'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env).stdout.strip()
        git_log = subprocess.run(
            ['git', 'log', '--oneline', '--decorate', '--graph', '-20'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env).stdout.strip()
        updates_available = (local_hash != remote_hash)
        # Add environment and user info for debugging
        debug_info = {
            'user': getpass.getuser(),
            'cwd': BASE_DIR,
            'HOME': env.get('HOME'),
            'PATH': env.get('PATH'),
            'fetch_stdout': fetch.stdout,
            'fetch_stderr': fetch.stderr,
            'local_hash_stdout': local_hash_proc.stdout,
            'local_hash_stderr': local_hash_proc.stderr,
            'remote_hash_stdout': remote_hash_proc.stdout,
            'remote_hash_stderr': remote_hash_proc.stderr,
            'env': {k: env[k] for k in ('USER','HOME','PATH') if k in env}
        }
        return jsonify(
            updates_available=updates_available,
            current_version=local_hash,
            latest_version=remote_hash,
            git_status=git_status,
            git_log=git_log,
            debug_info=debug_info
        )
    except Exception as e:
        return jsonify(updates_available=False, error=str(e))

@app.route('/apply_updates', methods=['POST'])
def apply_updates():
    try:
        env = os.environ.copy()
        if not env.get('HOME'):
            env['HOME'] = f"/home/{subprocess.run(['whoami'], capture_output=True, text=True).stdout.strip()}"
        print("[DEBUG] /apply_updates called", flush=True)
        # Find current branch
        current_branch = subprocess.run(
            ['git','rev-parse','--abbrev-ref','HEAD'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env).stdout.strip()
        print(f"[DEBUG] current_branch: {current_branch}", flush=True)
        # Force update: fetch, hard reset, clean, pull
        fetch = subprocess.run(
            ['git', 'fetch', '--all'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env)
        print(f"[DEBUG] git fetch: {fetch.stdout}\n{fetch.stderr}", flush=True)
        reset = subprocess.run(
            ['git', 'reset', '--hard', f'origin/{current_branch}'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env)
        print(f"[DEBUG] git reset: {reset.stdout}\n{reset.stderr}", flush=True)
        clean = subprocess.run(
            ['git', 'clean', '-fdx'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env)
        print(f"[DEBUG] git clean: {clean.stdout}\n{clean.stderr}", flush=True)
        # Optionally, pull again to ensure all is up to date
        pull = subprocess.run(
            ['git', 'pull', 'origin', current_branch],
            cwd=BASE_DIR, capture_output=True, text=True, env=env)
        print(f"[DEBUG] git pull: {pull.stdout}\n{pull.stderr}", flush=True)
        # --- SiTechExe.exe update logic ---
        sitex_src = "/opt/SiTech/SiPi/SiTechExe.exe"
        sitex_dst = "/opt/SiTech/SiTechExe/SiTechExe.exe"
        update_msgs = []
        # Stop sitech.service
        try:
            stop_sitech = subprocess.run(['sudo', 'systemctl', 'stop', 'sitech'], capture_output=True, text=True, env=env)
            update_msgs.append("[sitech.service stopped]")
        except Exception as e:
            update_msgs.append(f"[Failed to stop sitech.service: {e}]")
        # Copy new SiTechExe.exe
        try:
            if os.path.exists(sitex_src):
                import shutil
                shutil.copy2(sitex_src, sitex_dst)
                update_msgs.append("[SiTechExe.exe updated]")
            else:
                update_msgs.append(f"[SiTechExe.exe not found at {sitex_src}]")
        except Exception as e:
            update_msgs.append(f"[Failed to update SiTechExe.exe: {e}]")
        # Restart sitech.service
        try:
            subprocess.run(['sudo', 'systemctl', 'start', 'sitech'], check=False, env=env)
            update_msgs.append("[sitech.service restarted]")
        except Exception as e:
            update_msgs.append(f"[Failed to restart sitech.service: {e}]")
        # Restart sipi.service
        try:
            subprocess.run(['sudo', 'systemctl', 'restart', 'sipi'], check=False, env=env)
            update_msgs.append("[sipi.service restarted]")
        except Exception as e:
            update_msgs.append(f"[Failed to restart sipi.service: {e}]")
        return jsonify(success=True, message="Force-updated to latest remote.\n" + "\n".join(update_msgs))
    except Exception as e:
        print(f"[DEBUG] apply_updates: Exception: {e}", flush=True)
        return jsonify(success=False, message=str(e))

# ────────────────────────────────────────────────────────────────────────────

@app.route('/edit_config', methods=['GET','POST'])
def edit_config():
    if request.method == 'POST':
        open(CONFIG_FILE, 'w').write(request.form.get('config',''))
        # Send ReloadConfigFile command to SiTechExe after saving config
        try:
            send_command('ReloadConfigFile\n')
            msg = "Configuration updated and reload command sent"
            status = "success"
        except Exception as e:
            msg = f"Configuration updated, but failed to send reload command: {e}"
            status = "warning"
        # If AJAX, return JSON for modal popup
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify(success=(status=="success"), message=msg)
        # Otherwise, fallback to flash and redirect
        flash(msg, status)
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

@app.route('/RemoveLastCalPoint', methods=['POST'])
def remove_last_cal_point():
    resp = send_command("RemoveLastCalPoint\n", timeout=5, terminator="\n")
    return jsonify(response=resp)

# --- Astrometric Corrections ---
def initialize_astrometric_corrections():
    """Initialize astrometric corrections at startup."""
    global corrected_catalogs
    
    print("Initializing astrometric corrections...")
    try:
        corrected_catalogs = preprocess_catalogs_for_current_epoch(BASE_DIR)
        print("Astrometric corrections initialized successfully.")
        print(f"Stars catalog: {corrected_catalogs['stars']}")
        print(f"Messier catalog: {corrected_catalogs['messier']}")
        print(f"Constellations catalog: {corrected_catalogs['constellations']}")
        print(f"Galaxies catalog: {corrected_catalogs['galaxies']}")
        print(f"Globular clusters catalog: {corrected_catalogs['globular_clusters']}")
        print(f"Nebula catalog: {corrected_catalogs['nebula']}")
        print(f"Open clusters catalog: {corrected_catalogs['open_clusters']}")
        print(f"Planetary nebula catalog: {corrected_catalogs['planetary_nebula']}")
    except Exception as e:
        print(f"Warning: Astrometric corrections failed: {e}")
        print("Falling back to original catalogs.")
        corrected_catalogs = {
            'stars': os.path.join(BASE_DIR, 'static', 'stars.json'),
            'messier': os.path.join(BASE_DIR, 'static', 'messier.json'),
            'constellations': os.path.join(BASE_DIR, 'static', 'constellations.json'),
            'galaxies': os.path.join(BASE_DIR, 'static', 'galaxies.json'),
            'globular_clusters': os.path.join(BASE_DIR, 'static', 'globular_clusters.json'),
            'nebula': os.path.join(BASE_DIR, 'static', 'nebula.json'),
            'open_clusters': os.path.join(BASE_DIR, 'static', 'open_clusters.json'),
            'planetary_nebula': os.path.join(BASE_DIR, 'static', 'planetary_nebula.json')
        }

@app.route('/corrected_stars.json')
def corrected_stars():
    """Serve the astrometrically corrected star catalog."""
    try:
        with open(corrected_catalogs['stars'], 'r') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception as e:
        print(f"Error serving corrected stars: {e}")
        # Fallback to original catalog
        return send_from_directory(os.path.join(BASE_DIR, 'static'), 'stars.json')

@app.route('/corrected_messier.json')
def corrected_messier():
    """Serve the astrometrically corrected Messier catalog."""
    try:
        with open(corrected_catalogs['messier'], 'r') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception as e:
        print(f"Error serving corrected Messier catalog: {e}")
        # Fallback to original catalog
        return send_from_directory(os.path.join(BASE_DIR, 'static'), 'messier.json')

@app.route('/corrected_constellations.json')
def corrected_constellations():
    """Serve the astrometrically corrected constellation catalog."""
    try:
        with open(corrected_catalogs['constellations'], 'r') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception as e:
        print(f"Error serving corrected constellation catalog: {e}")
        # Fallback to original catalog
        return send_from_directory(os.path.join(BASE_DIR, 'static'), 'constellations.json')

@app.route('/corrected_galaxies.json')
def corrected_galaxies():
    """Serve the astrometrically corrected galaxy catalog."""
    try:
        with open(corrected_catalogs['galaxies'], 'r') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception as e:
        print(f"Error serving corrected galaxy catalog: {e}")
        # Fallback to original catalog
        return send_from_directory(os.path.join(BASE_DIR, 'static'), 'galaxies.json')

@app.route('/corrected_globular_clusters.json')
def corrected_globular_clusters():
    """Serve the astrometrically corrected globular cluster catalog."""
    try:
        with open(corrected_catalogs['globular_clusters'], 'r') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception as e:
        print(f"Error serving corrected globular cluster catalog: {e}")
        # Fallback to original catalog
        return send_from_directory(os.path.join(BASE_DIR, 'static'), 'globular_clusters.json')

@app.route('/corrected_nebula.json')
def corrected_nebula():
    """Serve the astrometrically corrected nebula catalog."""
    try:
        with open(corrected_catalogs['nebula'], 'r') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception as e:
        print(f"Error serving corrected nebula catalog: {e}")
        # Fallback to original catalog
        return send_from_directory(os.path.join(BASE_DIR, 'static'), 'nebula.json')

@app.route('/corrected_open_clusters.json')
def corrected_open_clusters():
    """Serve the astrometrically corrected open cluster catalog."""
    try:
        with open(corrected_catalogs['open_clusters'], 'r') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception as e:
        print(f"Error serving corrected open cluster catalog: {e}")
        # Fallback to original catalog
        return send_from_directory(os.path.join(BASE_DIR, 'static'), 'open_clusters.json')

@app.route('/corrected_planetary_nebula.json')
def corrected_planetary_nebula():
    """Serve the astrometrically corrected planetary nebula catalog."""
    try:
        with open(corrected_catalogs['planetary_nebula'], 'r') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception as e:
        print(f"Error serving corrected planetary nebula catalog: {e}")
        # Fallback to original catalog
        return send_from_directory(os.path.join(BASE_DIR, 'static'), 'planetary_nebula.json')

@app.route('/reprocess_catalogs', methods=['POST'])
def reprocess_catalogs():
    """Manually trigger catalog reprocessing."""
    try:
        global corrected_catalogs
        corrected_catalogs = preprocess_catalogs_for_current_epoch(BASE_DIR)
        return jsonify({
            'status': 'success',
            'message': 'Catalogs reprocessed successfully',
            'catalogs': corrected_catalogs
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Reprocessing failed: {str(e)}'
        }), 500

@app.route('/catalog_status')
def catalog_status():
    """Get status of current catalogs."""
    status = {}
    for name, path in corrected_catalogs.items():
        if path and os.path.exists(path):
            try:
                with open(path, 'r') as f:
                    data = json.load(f)
                
                # Handle different catalog formats
                if name == 'constellations':
                    # Constellation catalog has metadata at root level
                    is_corrected = '_correction_metadata' in data
                    correction_jd = data.get('_correction_metadata', {}).get('correction_jd') if is_corrected else None
                    sample_size = len(data.get('features', []))
                else:
                    # Star and Messier catalogs have metadata in objects
                    sample = data[:3] if isinstance(data, list) else []
                    is_corrected = '_correction_jd' in sample[0] if sample else False
                    correction_jd = sample[0].get('_correction_jd') if is_corrected and sample else None
                    sample_size = len(data) if isinstance(data, list) else 0
                
                status[name] = {
                    'path': path,
                    'exists': True,
                    'corrected': is_corrected,
                    'correction_jd': correction_jd,
                    'file_size': os.path.getsize(path),
                    'modified': os.path.getmtime(path),
                    'object_count': sample_size
                }
            except Exception as e:
                status[name] = {
                    'path': path,
                    'exists': True,
                    'error': str(e)
                }
        else:
            status[name] = {
                'path': path,
                'exists': False
            }
    
    return jsonify(status)

@app.route('/astrometric')
def astrometric_admin():
    """Admin interface for astrometric corrections."""
    return render_template('astrometric.html')

if __name__ == '__main__':
    get_site_location()
    connect_command_socket()
    connect_persistent_socket()
    initialize_astrometric_corrections()  # Initialize corrected catalogs
    wait_for_ip()
    threading.Thread(target=status_update_loop, daemon=True).start()
    app.run(host='0.0.0.0', port=5000, debug=False)
