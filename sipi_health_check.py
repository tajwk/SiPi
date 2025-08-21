#!/usr/bin/env python3
"""
SiPi Startup Health Check
Waits for SiTechExe to be fully operational before starting SiPi
"""

import socket
import time
import sys
import subprocess

def check_sitech_tcp_connection(host='localhost', port=4030, timeout=5):
    """Check if SiTechExe TCP server is responding"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(timeout)
            result = sock.connect_ex((host, port))
            if result == 0:
                # Try to send a basic command to verify it's fully operational
                sock.sendall(b"Xg\n")
                response = sock.recv(1024)
                return len(response) > 0
            return False
    except Exception as e:
        print(f"[HEALTH CHECK] TCP connection failed: {e}")
        return False

def check_sitech_service_status():
    """Check if sitech.service is active and running"""
    try:
        result = subprocess.run(['systemctl', 'is-active', 'sitech.service'], 
                              capture_output=True, text=True, timeout=5)
        return result.stdout.strip() == 'active'
    except Exception as e:
        print(f"[HEALTH CHECK] Service status check failed: {e}")
        return False

def wait_for_sitech(max_wait=120, check_interval=2):
    """Wait for SiTechExe to be fully operational"""
    print(f"[HEALTH CHECK] Waiting for SiTechExe to be ready (max {max_wait}s)...")
    
    start_time = time.time()
    while time.time() - start_time < max_wait:
        # Check service status first
        if check_sitech_service_status():
            print("[HEALTH CHECK] SiTech service is active")
            
            # Wait a bit for TCP server to initialize
            time.sleep(3)
            
            # Check TCP connectivity
            if check_sitech_tcp_connection():
                print("[HEALTH CHECK] ✅ SiTechExe is fully operational")
                return True
            else:
                print("[HEALTH CHECK] Service active but TCP not ready, waiting...")
        else:
            print("[HEALTH CHECK] SiTech service not active yet, waiting...")
        
        time.sleep(check_interval)
    
    print(f"[HEALTH CHECK] ❌ Timeout after {max_wait}s - SiTechExe not ready")
    return False

if __name__ == "__main__":
    if wait_for_sitech():
        print("[HEALTH CHECK] Starting SiPi...")
        sys.exit(0)
    else:
        print("[HEALTH CHECK] SiTechExe not ready, aborting SiPi startup")
        sys.exit(1)
