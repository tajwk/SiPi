#!/usr/bin/env python3
"""
Simple serial test script to debug SiTech controller communication
"""

import serial
import time
import sys

def test_serial_communication(port='/dev/ttyUSB0', baud=19200):
    print(f"Interactive serial communication test on {port} at {baud} baud...")
    print(f"Type commands to send to the controller. Type 'quit' to exit.")
    print(f"Commands will automatically have \\r added unless you specify otherwise.")
    print(f"Use \\n or \\r\\n if you want different line endings.")
    
    try:
        # Open serial connection
        ser = serial.Serial(port, baud, timeout=1)
        print(f"Serial port opened successfully")
        
        # Wait for connection to stabilize
        time.sleep(1)
        
        # Check if there's any initial data (like version messages)
        print(f"\nChecking for initial data...")
        time.sleep(0.5)
        if ser.in_waiting > 0:
            initial_data = ser.read(ser.in_waiting()).decode('ascii', errors='ignore')
            print(f"Initial data received: '{initial_data.strip()}'")
        
        print(f"\nReady for commands. Type your command and press Enter:")
        
        while True:
            try:
                # Get user input
                user_input = input("> ").strip()
                
                if user_input.lower() == 'quit':
                    break
                
                if not user_input:
                    continue
                
                # Clear any pending data
                ser.reset_input_buffer()
                
                # Prepare command
                if '\\n' in user_input or '\\r' in user_input:
                    # User specified line endings
                    cmd_str = user_input.replace('\\n', '\n').replace('\\r', '\r')
                    cmd = cmd_str.encode()  # Use default encoding like your working code
                    print(f"Sending: '{user_input}' (with your specified line endings)")
                    print(f"ASCII command: '{cmd_str}' (repr: {repr(cmd_str)})")
                else:
                    # Add default carriage return + line feed (like your working code)
                    cmd_str = user_input + '\r\n'
                    cmd = cmd_str.encode()  # Use default encoding like your working code
                    print(f"Sending: '{user_input}' + \\r\\n")
                    print(f"ASCII command: '{cmd_str}' (repr: {repr(cmd_str)})")
                
                # Send command
                ser.write(cmd)
                ser.flush()
                
                # Wait for response
                time.sleep(0.5)
                
                if ser.in_waiting > 0:
                    response = ser.read(ser.in_waiting()).decode('ascii', errors='ignore')
                    print(f"Response: '{response.strip()}'")
                    
                    # Show each line separately if multiple lines
                    lines = response.strip().split('\n')
                    if len(lines) > 1:
                        for i, line in enumerate(lines):
                            print(f"  Line {i}: '{line.strip()}'")
                else:
                    print("No response received")
                
                print()  # Empty line for readability
                
            except KeyboardInterrupt:
                print("\nInterrupted by user")
                break
            except Exception as e:
                print(f"Error processing command: {e}")
        
        ser.close()
        print(f"Serial port closed")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    port = sys.argv[1] if len(sys.argv) > 1 else '/dev/ttyUSB0'
    test_serial_communication(port)
