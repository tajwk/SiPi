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
__version__ = "0.9.5"

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
    elif bp & 16:  # Bit 04
        track = "Parked"
    elif not (bp & 1):  # Bit 00 false
        track = "Scope Not Initialized"
    elif bp & 2:  # Bit 01
        track = "Tracking"
    elif bp & 8:  # Bit 03
        track = "Parking"
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
        timezone = data.get('timezone')  # New: accept timezone
        
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
        
        # Set timezone first if provided
        if timezone:
            try:
                # Set system timezone using timedatectl
                tz_result = subprocess.run(['sudo', 'timedatectl', 'set-timezone', timezone], 
                                         capture_output=True, text=True)
                print(f"[DEBUG] sudo timedatectl set-timezone '{timezone}'\nstdout: {tz_result.stdout}\nstderr: {tz_result.stderr}\nreturncode: {tz_result.returncode}", flush=True)
                
                if tz_result.returncode != 0:
                    return jsonify(success=False, error=f'Failed to set timezone: {tz_result.stderr}'), 500
            except Exception as e:
                print(f"[DEBUG] Exception setting timezone: {e}", flush=True)
                return jsonify(success=False, error=f'Timezone error: {str(e)}'), 500
        
        # Set system time (requires sudo)
        result = subprocess.run(['sudo', 'date', '-s', dt_str], capture_output=True, text=True)
        print(f"[DEBUG] sudo date -s '{dt_str}'\nstdout: {result.stdout}\nstderr: {result.stderr}\nreturncode: {result.returncode}", flush=True)
        
        if result.returncode == 0:
            msg = f"System time set to {dt_str}"
            if timezone:
                msg += f" (timezone: {timezone})"
            return jsonify(success=True, message=msg, debug=result.stdout + result.stderr)
        else:
            return jsonify(success=False, error=result.stderr.strip(), debug=result.stdout + result.stderr), 500
    except Exception as e:
        print(f"[DEBUG] Exception in set_time_popup: {e}", flush=True)
        return jsonify(success=False, error=str(e)), 500

@app.route('/fix_wifi_permissions', methods=['POST'])
def fix_wifi_permissions():
    """Fix WiFi script permissions - can be called independently."""
    try:
        wifi_script = "/usr/local/bin/update_hostapd_conf.sh"
        messages = []
        
        # Check if script exists
        if not os.path.exists(wifi_script):
            return jsonify(success=False, error=f'WiFi script not found at {wifi_script}'), 404
        
        # Fix permissions
        result = subprocess.run(['sudo', 'chmod', '755', wifi_script], 
                              capture_output=True, text=True)
        if result.returncode != 0:
            return jsonify(success=False, error=f'Failed to fix permissions: {result.stderr}'), 500
        
        messages.append('WiFi script permissions fixed (755)')
        
        # Fix ownership
        try:
            subprocess.run(['sudo', 'chown', 'root:root', wifi_script], 
                         capture_output=True, text=True)
            messages.append('WiFi script ownership fixed (root:root)')
        except Exception as e:
            messages.append(f'Warning: Could not fix ownership: {e}')
        
        # Verify permissions
        import stat
        st = os.stat(wifi_script)
        perms = oct(st.st_mode & 0o777)
        messages.append(f'Current permissions: {perms}')
        
        return jsonify(success=True, message=' | '.join(messages))
        
    except Exception as e:
        return jsonify(success=False, error=f'Unexpected error: {str(e)}'), 500

@app.route('/update_wifi', methods=['POST'])
def update_wifi():
    # Accept from form, query, or JSON
    ssid = request.values.get('ssid', '')
    passwd = request.values.get('pass', '')
    if not ssid and request.is_json:
        data = request.get_json(force=True)
        ssid = data.get('ssid', '')
        passwd = data.get('pass', '')
    
    # Validate inputs
    if not ssid:
        return jsonify(success=False, error='SSID cannot be empty'), 400
    
    if len(passwd) < 8:
        return jsonify(success=False, error='Password must be at least 8 characters'), 400
    
    try:
        print(f"[DEBUG] Updating WiFi - SSID: '{ssid}', Password length: {len(passwd)}")
        
        # Check if script exists and is executable
        script_path = '/usr/local/bin/update_hostapd_conf.sh'
        if not os.path.exists(script_path):
            return jsonify(success=False, error=f'WiFi update script not found at {script_path}'), 500
        
        if not os.access(script_path, os.X_OK):
            return jsonify(success=False, error='WiFi update script is not executable. Run: sudo chmod 755 /usr/local/bin/update_hostapd_conf.sh'), 500
        
        result = subprocess.run(
            ['sudo', script_path, ssid, passwd],
            capture_output=True, text=True, timeout=30
        )
        
        print(f"[DEBUG] WiFi update result - returncode: {result.returncode}")
        print(f"[DEBUG] stdout: {result.stdout}")
        print(f"[DEBUG] stderr: {result.stderr}")
        
        if result.returncode == 0:
            return jsonify(success=True, message='WiFi settings updated successfully')
        else:
            error_msg = result.stderr.strip() if result.stderr else result.stdout.strip()
            if not error_msg:
                error_msg = f'Script failed with exit code {result.returncode}'
            
            # If we get a permission error, try to automatically fix it
            if ('Permission denied' in error_msg or 'command not found' in error_msg):
                print("[DEBUG] Attempting to automatically fix WiFi script permissions...")
                try:
                    # Try to fix permissions
                    fix_result = subprocess.run(['sudo', 'chmod', '755', script_path], 
                                              capture_output=True, text=True, timeout=10)
                    if fix_result.returncode == 0:
                        print("[DEBUG] Permissions fixed, retrying WiFi update...")
                        # Retry the original command
                        retry_result = subprocess.run(
                            ['sudo', script_path, ssid, passwd],
                            capture_output=True, text=True, timeout=30
                        )
                        if retry_result.returncode == 0:
                            return jsonify(success=True, message='WiFi settings updated successfully (after fixing permissions)')
                        else:
                            error_msg = f"Permission fix succeeded but update still failed: {retry_result.stderr}"
                    else:
                        error_msg += f". Auto-fix failed: {fix_result.stderr}"
                except Exception as fix_e:
                    error_msg += f". Auto-fix failed: {str(fix_e)}"
            
            # Provide helpful error messages for common issues
            if 'command not found' in error_msg:
                error_msg += '. Please ensure the script exists and has correct permissions.'
            elif 'Permission denied' in error_msg:
                error_msg += '. Try clicking "Fix Permissions" button or run: sudo chmod 755 /usr/local/bin/update_hostapd_conf.sh'
            
            return jsonify(success=False, error=error_msg), 500
            
    except subprocess.TimeoutExpired:
        return jsonify(success=False, error='WiFi update timed out after 30 seconds'), 500
    except FileNotFoundError:
        return jsonify(success=False, error='sudo command not found or script missing'), 500
    except Exception as e:
        print(f"[DEBUG] WiFi update exception: {e}")
        return jsonify(success=False, error=f'Unexpected error: {str(e)}'), 500

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

# ─── Git Corruption Handling ───────────────────────────────────────────────

def check_and_repair_git_corruption(env, force_repair=False):
    """Check for git corruption and attempt automatic repair"""
    corruption_detected = False
    repair_successful = False
    messages = []
    
    try:
        # Test basic git operations to detect corruption
        test_commands = [
            ['git', 'status', '--porcelain'],
            ['git', 'log', '--oneline', '-1'],
            ['git', 'rev-parse', 'HEAD']
        ]
        
        for cmd in test_commands:
            try:
                result = subprocess.run(cmd, cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=10)
                if result.returncode != 0:
                    stderr_lower = result.stderr.lower()
                    if any(keyword in stderr_lower for keyword in ['corrupt', 'empty', 'bad object', 'loose object']):
                        corruption_detected = True
                        messages.append(f"Corruption detected in: {' '.join(cmd)}")
                        break
            except subprocess.TimeoutExpired:
                messages.append(f"Timeout during git operation: {' '.join(cmd)}")
                corruption_detected = True
                break
        
        # Also check for empty or corrupt object files directly
        if not corruption_detected:
            git_objects_dir = os.path.join(BASE_DIR, '.git', 'objects')
            if os.path.exists(git_objects_dir):
                for root, dirs, files in os.walk(git_objects_dir):
                    if 'pack' in dirs:
                        dirs.remove('pack')  # Skip pack directory
                    for file in files:
                        if len(file) == 38:  # Git object filename length
                            filepath = os.path.join(root, file)
                            try:
                                if os.path.getsize(filepath) == 0:
                                    corruption_detected = True
                                    messages.append(f"Empty object file found: {filepath}")
                                    break
                            except OSError:
                                corruption_detected = True
                                messages.append(f"Corrupt object file found: {filepath}")
                                break
                    if corruption_detected:
                        break
        
        # Attempt repair if corruption detected or forced
        if corruption_detected or force_repair:
            messages.append("Attempting git corruption repair...")
            
            # Method 1: Git fsck and prune
            try:
                # Run git fsck to identify corruption
                fsck_result = subprocess.run(
                    ['git', 'fsck', '--full'],
                    cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=30
                )
                if fsck_result.returncode != 0:
                    messages.append(f"Git fsck found issues: {fsck_result.stderr}")
                
                # Try to repair with git gc and prune
                gc_result = subprocess.run(
                    ['git', 'gc', '--aggressive', '--prune=now'],
                    cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=60
                )
                
                if gc_result.returncode == 0:
                    # Test if repair worked
                    test_result = subprocess.run(
                        ['git', 'status', '--porcelain'],
                        cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=10
                    )
                    if test_result.returncode == 0:
                        repair_successful = True
                        messages.append("Git corruption repaired successfully with gc/prune")
                    else:
                        messages.append("Git gc completed but corruption persists")
                else:
                    messages.append(f"Git gc failed: {gc_result.stderr}")
            
            except subprocess.TimeoutExpired:
                messages.append("Git repair operations timed out")
            except Exception as e:
                messages.append(f"Git repair attempt failed: {e}")
            
            # Method 2: Fresh clone fallback if repair failed
            if not repair_successful:
                messages.append("Attempting fresh clone as fallback...")
                try:
                    # Get the remote URL
                    remote_url_result = subprocess.run(
                        ['git', 'remote', 'get-url', 'origin'],
                        cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=10
                    )
                    
                    if remote_url_result.returncode == 0:
                        remote_url = remote_url_result.stdout.strip()
                        
                        # Create backup directory name
                        import time
                        backup_dir = f"{BASE_DIR}_corrupt_backup_{int(time.time())}"
                        
                        # Move current directory to backup
                        os.rename(BASE_DIR, backup_dir)
                        messages.append(f"Moved corrupt repository to: {backup_dir}")
                        
                        # Fresh clone
                        clone_result = subprocess.run(
                            ['git', 'clone', remote_url, BASE_DIR],
                            capture_output=True, text=True, env=env, timeout=120
                        )
                        
                        if clone_result.returncode == 0:
                            repair_successful = True
                            messages.append("Fresh clone completed successfully")
                            
                            # Try to remove backup if clone successful
                            try:
                                import shutil
                                shutil.rmtree(backup_dir)
                                messages.append("Corrupt backup removed")
                            except Exception as e:
                                messages.append(f"Warning: Could not remove backup {backup_dir}: {e}")
                        else:
                            # Restore backup if clone failed
                            try:
                                if os.path.exists(backup_dir):
                                    os.rename(backup_dir, BASE_DIR)
                                    messages.append("Clone failed, restored from backup")
                            except Exception as restore_e:
                                messages.append(f"Critical: Clone failed and backup restore failed: {restore_e}")
                    else:
                        messages.append("Could not determine remote URL for fresh clone")
                        
                except Exception as e:
                    messages.append(f"Fresh clone attempt failed: {e}")
    
    except Exception as e:
        messages.append(f"Corruption check failed: {e}")
    
    return {
        'corruption_detected': corruption_detected,
        'repair_successful': repair_successful,
        'messages': messages
    }

# ─── New Update Routes ─────────────────────────────────────────────────────

@app.route('/check_updates', methods=['POST'])
def check_updates():
    import getpass
    try:
        env = os.environ.copy()
        if not env.get('HOME'):
            env['HOME'] = f"/home/{subprocess.run(['whoami'], capture_output=True, text=True).stdout.strip()}"
        
        corruption_detected = False
        repair_messages = []
        
        # Check for git corruption first
        corruption_result = check_and_repair_git_corruption(env)
        if corruption_result['corruption_detected']:
            corruption_detected = True
            repair_messages = corruption_result['messages']
            if not corruption_result['repair_successful']:
                return jsonify(
                    updates_available=False, 
                    error="Git corruption detected but repair failed",
                    corruption_detected=True,
                    repair_messages=repair_messages
                )
        
        # Always fetch from origin with timeout
        fetch = subprocess.run(
            ['git', 'fetch', 'origin'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=30)
        
        # Check if fetch failed due to corruption
        if fetch.returncode != 0 and ('corrupt' in fetch.stderr.lower() or 'empty' in fetch.stderr.lower()):
            # Attempt repair and retry
            corruption_result = check_and_repair_git_corruption(env, force_repair=True)
            repair_messages.extend(corruption_result['messages'])
            if corruption_result['repair_successful']:
                fetch = subprocess.run(
                    ['git', 'fetch', 'origin'],
                    cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=30)
            else:
                return jsonify(
                    updates_available=False,
                    error="Git fetch failed due to corruption, repair unsuccessful",
                    corruption_detected=True,
                    repair_messages=repair_messages
                )
        
        # Get local HEAD commit
        local_hash_proc = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=10)
        local_hash = local_hash_proc.stdout.strip()
        
        # Get remote main commit
        remote_hash_proc = subprocess.run(
            ['git', 'rev-parse', 'origin/main'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=10)
        remote_hash = remote_hash_proc.stdout.strip()
        
        # Get git status and log for debug
        git_status = subprocess.run(
            ['git', 'status', '-b', '-u', '--porcelain'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=10).stdout.strip()
        git_log = subprocess.run(
            ['git', 'log', '--oneline', '--decorate', '--graph', '-20'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=10).stdout.strip()
        
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
            debug_info=debug_info,
            corruption_detected=corruption_detected,
            repair_messages=repair_messages
        )
    except subprocess.TimeoutExpired:
        return jsonify(updates_available=False, error="Git operation timed out")
    except Exception as e:
        return jsonify(updates_available=False, error=str(e))

@app.route('/apply_updates', methods=['POST'])
def apply_updates():
    try:
        env = os.environ.copy()
        if not env.get('HOME'):
            env['HOME'] = f"/home/{subprocess.run(['whoami'], capture_output=True, text=True).stdout.strip()}"
        print("[DEBUG] /apply_updates called", flush=True)
        
        update_msgs = []
        
        # Check and repair git corruption before attempting update
        corruption_result = check_and_repair_git_corruption(env)
        if corruption_result['corruption_detected']:
            update_msgs.extend(corruption_result['messages'])
            if not corruption_result['repair_successful']:
                return jsonify(
                    success=False, 
                    message="Git corruption detected and repair failed.\n" + "\n".join(update_msgs)
                )
        
        # Find current branch
        current_branch = subprocess.run(
            ['git','rev-parse','--abbrev-ref','HEAD'],
            cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=10).stdout.strip()
        print(f"[DEBUG] current_branch: {current_branch}", flush=True)
        
        # Force update: fetch, hard reset, clean, pull with corruption handling
        try:
            fetch = subprocess.run(
                ['git', 'fetch', '--all'],
                cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=60)
            print(f"[DEBUG] git fetch: {fetch.stdout}\n{fetch.stderr}", flush=True)
            
            # Check if fetch failed due to corruption
            if fetch.returncode != 0 and ('corrupt' in fetch.stderr.lower() or 'empty' in fetch.stderr.lower()):
                update_msgs.append("Fetch failed due to corruption, attempting repair...")
                corruption_result = check_and_repair_git_corruption(env, force_repair=True)
                update_msgs.extend(corruption_result['messages'])
                if corruption_result['repair_successful']:
                    # Retry fetch after repair
                    fetch = subprocess.run(
                        ['git', 'fetch', '--all'],
                        cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=60)
                    print(f"[DEBUG] git fetch after repair: {fetch.stdout}\n{fetch.stderr}", flush=True)
                else:
                    return jsonify(
                        success=False,
                        message="Git fetch failed due to corruption, repair unsuccessful.\n" + "\n".join(update_msgs)
                    )
            
            reset = subprocess.run(
                ['git', 'reset', '--hard', f'origin/{current_branch}'],
                cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=30)
            print(f"[DEBUG] git reset: {reset.stdout}\n{reset.stderr}", flush=True)
            
            clean = subprocess.run(
                ['git', 'clean', '-fdx'],
                cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=30)
            print(f"[DEBUG] git clean: {clean.stdout}\n{clean.stderr}", flush=True)
            
            # Optionally, pull again to ensure all is up to date
            pull = subprocess.run(
                ['git', 'pull', 'origin', current_branch],
                cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=60)
            print(f"[DEBUG] git pull: {pull.stdout}\n{pull.stderr}", flush=True)
            
        except subprocess.TimeoutExpired as te:
            return jsonify(success=False, message=f"Git operation timed out: {te}")
        
        # --- SiTechExe.exe update logic ---
        sitex_src = "/opt/SiTech/SiPi/SiTechExe.exe"
        sitex_dst = "/opt/SiTech/SiTechExe/SiTechExe.exe"
        
        # --- Fix WiFi script permissions automatically ---
        try:
            wifi_script = "/usr/local/bin/update_hostapd_conf.sh"
            if os.path.exists(wifi_script):
                # Fix permissions to 755 (rwxr-xr-x)
                subprocess.run(['sudo', 'chmod', '755', wifi_script], 
                             capture_output=True, text=True, env=env, timeout=10)
                update_msgs.append(f"[WiFi script permissions fixed: {wifi_script}]")
            else:
                update_msgs.append(f"[WiFi script not found: {wifi_script}]")
        except Exception as e:
            update_msgs.append(f"[Failed to fix WiFi script permissions: {e}]")
        
        # --- Ensure update script itself exists and has correct permissions ---
        try:
            local_script = "/opt/SiTech/SiPi/update_hostapd_conf.sh"
            target_script = "/usr/local/bin/update_hostapd_conf.sh"
            
            if os.path.exists(local_script):
                # Copy updated script to system location
                subprocess.run(['sudo', 'cp', local_script, target_script], 
                             capture_output=True, text=True, env=env, timeout=10)
                # Set correct permissions
                subprocess.run(['sudo', 'chmod', '755', target_script], 
                             capture_output=True, text=True, env=env, timeout=10)
                # Set correct ownership
                subprocess.run(['sudo', 'chown', 'root:root', target_script], 
                             capture_output=True, text=True, env=env, timeout=10)
                update_msgs.append(f"[WiFi script updated and permissions fixed]")
            else:
                update_msgs.append(f"[Local WiFi script not found: {local_script}]")
        except Exception as e:
            update_msgs.append(f"[Failed to update WiFi script: {e}]")
        
        # Stop sitech.service
        try:
            stop_sitech = subprocess.run(['sudo', 'systemctl', 'stop', 'sitech'], 
                                       capture_output=True, text=True, env=env, timeout=30)
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
            subprocess.run(['sudo', 'systemctl', 'start', 'sitech'], 
                         check=False, env=env, timeout=30)
            update_msgs.append("[sitech.service restarted]")
        except Exception as e:
            update_msgs.append(f"[Failed to restart sitech.service: {e}]")
        
        # Restart sipi.service
        try:
            subprocess.run(['sudo', 'systemctl', 'restart', 'sipi'], 
                         check=False, env=env, timeout=30)
            update_msgs.append("[sipi.service restarted]")
        except Exception as e:
            update_msgs.append(f"[Failed to restart sipi.service: {e}]")
        
        # Final corruption check
        final_check = check_and_repair_git_corruption(env)
        if final_check['corruption_detected']:
            update_msgs.append("Warning: Git corruption detected after update")
            update_msgs.extend(final_check['messages'])
        
        return jsonify(success=True, message="Force-updated to latest remote.\n" + "\n".join(update_msgs))
        
    except subprocess.TimeoutExpired as te:
        print(f"[DEBUG] apply_updates: Timeout: {te}", flush=True)
        return jsonify(success=False, message=f"Update timed out: {te}")
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

@app.route('/device_profile', methods=['POST'])
def device_profile():
    """Generate device performance profile for adaptive optimizations."""
    try:
        data = request.get_json(force=True)
        
        # Get performance metrics from frontend
        render_time = data.get('render_time', 100)  # ms for 1000 operations
        screen_width = data.get('screen_width', 1920)
        screen_height = data.get('screen_height', 1080)
        pixel_ratio = data.get('pixel_ratio', 1)
        memory = data.get('memory', 4)  # GB estimate
        
        # Calculate device tier
        screen_area = screen_width * screen_height
        
        # Determine performance tier
        tier = 'high'
        if render_time > 50 or memory < 4 or screen_area < 1000000:
            tier = 'medium'
        if render_time > 100 or memory < 2 or screen_area < 500000:
            tier = 'low'
            
        # Generate optimized settings (no object count limits - preserves astronomical completeness)
        profile = {
            'tier': tier,
            'max_pixel_ratio': 1.5 if tier == 'low' else (2 if tier == 'medium' else pixel_ratio),
            'throttle_ms': 50 if tier == 'low' else (33 if tier == 'medium' else 16),
            'anti_aliasing': tier != 'low',
            'batch_drawing': True,  # Always enabled
            'viewport_culling': True,  # Always enabled
            'lod_enabled': tier == 'low',  # Level-of-detail for low-end devices
            'animation_quality': 'low' if tier == 'low' else ('medium' if tier == 'medium' else 'high'),
            'constellation_detail': 'low' if tier == 'low' else 'high',
            'label_density': 'low' if tier == 'low' else ('medium' if tier == 'medium' else 'high')
        }
        
        print(f"[PERF] Device profile generated: {tier} tier, render_time: {render_time}ms")
        return jsonify(profile)
        
    except Exception as e:
        # Fallback safe profile (no object count limits)
        print(f"[PERF] Device profiling failed: {e}, using safe defaults")
        return jsonify({
            'tier': 'medium',
            'max_pixel_ratio': 2,
            'throttle_ms': 33,
            'anti_aliasing': True,
            'batch_drawing': True,
            'viewport_culling': True,
            'lod_enabled': False,
            'animation_quality': 'medium',
            'constellation_detail': 'high',
            'label_density': 'medium'
        })

@app.route('/performance_status')
def performance_status():
    """Get current performance optimization status."""
    return jsonify({
        'adaptive_performance_enabled': True,
        'available_tiers': ['high', 'medium', 'low'],
        'optimization_features': [
            'Adaptive canvas resolution',
            'Smart object culling', 
            'Level-of-detail rendering',
            'Event throttling',
            'Batch drawing operations',
            'Hardware acceleration',
            'Magnitude-based filtering',
            'Zoom-dependent detail levels'
        ]
    })

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
