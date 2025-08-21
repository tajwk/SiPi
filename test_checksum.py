#!/usr/bin/env python3
"""
Test SiTech controller with checksum mode (like the C# code)
"""

import serial
import time

def calculate_checksum_command(cmd):
    """Calculate SiTech checksum command like the C# code"""
    # Add \r to command
    s = cmd + '\r'
    
    # Replace \r with \r + space
    s = s.replace('\r', '\r ')
    
    # Convert to bytes
    b = bytearray(s.encode('ascii'))
    
    # Calculate checksum
    ss = 0
    i = 0
    while i < len(b) - 1:
        ss += b[i]
        ss = ss & 0xFF  # Keep it as byte
        if b[i] == 13:  # CR
            b[i + 1] = (~ss) & 0xFF  # Complement of checksum
            ss = 0
            i += 1
        i += 1
    
    return bytes(b)

def test_both_modes(port='/dev/ttyUSB0', baud=19200):
    print(f"Testing both normal and checksum modes on {port}")
    
    try:
        ser = serial.Serial(port, baud, timeout=2)
        print("Serial port opened")
        time.sleep(1)
        
        # Test 1: Normal mode (what we've been doing)
        print("\n=== Testing Normal Mode ===")
        ser.reset_input_buffer()
        cmd_normal = 'XB\r\n'.encode()
        print(f"Sending normal: {cmd_normal}")
        ser.write(cmd_normal)
        ser.flush()
        time.sleep(1)
        
        if ser.in_waiting > 0:
            response = ser.read(ser.in_waiting).decode('ascii', errors='ignore')
            print(f"Normal response: '{response.strip()}'")
        else:
            print("No response to normal mode")
        
        # Test 2: Checksum mode (like C# code)
        print("\n=== Testing Checksum Mode ===")
        ser.reset_input_buffer()
        time.sleep(0.5)
        
        cmd_checksum = calculate_checksum_command('XB')
        print(f"Sending checksum: {cmd_checksum}")
        print(f"Checksum hex: {cmd_checksum.hex()}")
        
        ser.write(cmd_checksum)
        ser.flush()
        time.sleep(1)
        
        if ser.in_waiting > 0:
            response = ser.read(ser.in_waiting).decode('ascii', errors='ignore')
            print(f"Checksum response: '{response.strip()}'")
        else:
            print("No response to checksum mode")
        
        # Test 3: Try a few other commands
        test_commands = ['V', 'YB', 'X0B']
        
        for cmd in test_commands:
            print(f"\n=== Testing '{cmd}' with checksum ===")
            ser.reset_input_buffer()
            time.sleep(0.5)
            
            cmd_bytes = calculate_checksum_command(cmd)
            print(f"Sending: {cmd_bytes}")
            ser.write(cmd_bytes)
            ser.flush()
            time.sleep(1)
            
            if ser.in_waiting > 0:
                response = ser.read(ser.in_waiting).decode('ascii', errors='ignore')
                print(f"Response: '{response.strip()}'")
            else:
                print("No response")
        
        ser.close()
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_both_modes()
