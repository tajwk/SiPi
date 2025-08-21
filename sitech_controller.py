#!/usr/bin/env python3
"""
SiTech Controller Communication Module
Handles direct serial communication with SiTech controller
"""

import serial
import time
import subprocess
import json
import os

class SiTechController:
    def __init__(self, com_port='/dev/ttyUSB0', baud_rate=19200, timeout=2):
        self.com_port = com_port
        self.baud_rate = baud_rate
        self.timeout = timeout
        self.serial_conn = None
    
    def stop_sitech_service(self):
        """Stop the sitech.service"""
        try:
            print(f"[DEBUG] Attempting to stop sitech.service as user: {os.getenv('USER', 'unknown')}")
            result = subprocess.run(['sudo', 'systemctl', 'stop', 'sitech.service'], 
                                  capture_output=True, text=True, timeout=10)
            print(f"[DEBUG] Stop command result: returncode={result.returncode}, stdout='{result.stdout}', stderr='{result.stderr}'")
            if result.returncode == 0:
                # Wait longer and check if service is actually stopped
                time.sleep(3)
                print(f"[DEBUG] Stop command succeeded, now verifying service is stopped...")
                
                # Verify service is stopped
                for i in range(10):  # Try up to 10 times (increased from 5)
                    check_result = subprocess.run(['sudo', 'systemctl', 'is-active', 'sitech.service'], 
                                                capture_output=True, text=True, timeout=5)
                    print(f"[DEBUG] Verification attempt {i+1}: is-active returned '{check_result.stdout.strip()}', returncode={check_result.returncode}")
                    if check_result.stdout.strip() == 'inactive':
                        print(f"[DEBUG] Service confirmed stopped after {i+1} attempts")
                        return True, "SiTech service stopped successfully"
                    
                    # If still active after 5 attempts, try killing it more aggressively
                    if i == 4:
                        print(f"[DEBUG] Service still active after 5 attempts, trying aggressive kill...")
                        try:
                            kill_result = subprocess.run(['sudo', 'systemctl', 'kill', 'sitech.service'], 
                                         capture_output=True, text=True, timeout=5)
                            print(f"[DEBUG] Kill command result: returncode={kill_result.returncode}, stderr='{kill_result.stderr}'")
                            time.sleep(2)
                        except Exception as kill_e:
                            print(f"[DEBUG] Kill command failed: {kill_e}")
                    
                    time.sleep(1)  # Wait 1 more second
                
                print(f"[DEBUG] Service still appears active after 10 verification attempts")
                return False, "Service stop command succeeded but service still appears active after 10 seconds"
            else:
                return False, f"Failed to stop service: {result.stderr}"
        except Exception as e:
            return False, f"Error stopping service: {str(e)}"
    
    def start_sitech_service(self):
        """Start the sitech.service"""
        try:
            result = subprocess.run(['sudo', 'systemctl', 'start', 'sitech.service'], 
                                  capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                time.sleep(3)  # Give it time to start
                return True, "SiTech service started successfully"
            else:
                return False, f"Failed to start service: {result.stderr}"
        except Exception as e:
            return False, f"Error starting service: {str(e)}"
    
    def restart_sitech_service(self):
        """Restart the sitech.service"""
        try:
            result = subprocess.run(['sudo', 'systemctl', 'restart', 'sitech.service'], 
                                  capture_output=True, text=True, timeout=15)
            if result.returncode == 0:
                time.sleep(3)  # Give it time to restart
                return True, "SiTech service restarted successfully"
            else:
                return False, f"Failed to restart service: {result.stderr}"
        except Exception as e:
            return False, f"Error restarting service: {str(e)}"
    
    def connect(self):
        """Establish serial connection to controller"""
        try:
            # Check if port exists and is accessible
            if not os.path.exists(self.com_port):
                return False, f"Serial port {self.com_port} does not exist"
            
            self.serial_conn = serial.Serial(
                self.com_port, 
                self.baud_rate, 
                timeout=self.timeout,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE
            )
            time.sleep(0.5)  # Give connection time to establish
            return True, "Serial connection established"
        except serial.SerialException as e:
            error_msg = str(e)
            if "Permission denied" in error_msg:
                return False, f"Permission denied accessing {self.com_port}. May need to add user to dialout group."
            elif "Device or resource busy" in error_msg:
                return False, f"Serial port {self.com_port} is busy (likely used by SiTech service). Ensure service is stopped."
            else:
                return False, f"Serial error: {error_msg}"
        except Exception as e:
            return False, f"Failed to connect: {str(e)}"
    
    def disconnect(self):
        """Close serial connection"""
        if self.serial_conn and self.serial_conn.is_open:
            self.serial_conn.close()
            self.serial_conn = None
    
    def calculate_checksum_command(self, cmd):
        """Calculate SiTech checksum command like the C# code"""
        # Add \r to command
        s = cmd + '\r'
        
        # Replace \r with \r + space
        s = s.replace('\r', '\r ')
        
        # Convert to bytes
        b = bytearray(s.encode())
        
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
    
    def send_command(self, command):
        """Send command to controller and read response"""
        if not self.serial_conn or not self.serial_conn.is_open:
            return None, "No serial connection"
        
        try:
            print(f"[DEBUG] Sending command '{command}' to controller...")
            
            # Clear any pending data first
            self.serial_conn.reset_input_buffer()
            
            # Send command with checksum
            cmd_bytes = self.calculate_checksum_command(command)
            print(f"[DEBUG] Command bytes: {cmd_bytes}")
            self.serial_conn.write(cmd_bytes)
            self.serial_conn.flush()
            
            # Wait a bit for controller to process
            time.sleep(0.2)
            
            # Read all available responses
            responses = []
            attempts = 0
            max_attempts = 20  # 2 seconds total
            
            while attempts < max_attempts:
                if self.serial_conn.in_waiting > 0:
                    try:
                        line = self.serial_conn.readline().decode('ascii').strip()
                        if line:
                            responses.append(line)
                            print(f"[DEBUG] Received line: '{line}'")
                            
                            # For XB/YB commands, look for specific patterns
                            if command == 'XB' and line.startswith('B'):
                                print(f"[DEBUG] Found XBits response: '{line}'")
                                return line, None
                            elif command == 'YB' and line.startswith('b'):
                                print(f"[DEBUG] Found YBits response: '{line}'")
                                return line, None
                            elif not command.startswith('XB') and not command.startswith('YB'):
                                # For other commands, return first response
                                return line, None
                    except UnicodeDecodeError as e:
                        print(f"[DEBUG] Unicode decode error: {e}")
                        continue
                
                time.sleep(0.1)
                attempts += 1
            
            # Check if we got any responses
            if responses:
                print(f"[DEBUG] Got {len(responses)} responses: {responses}")
                # Return the most relevant response
                for resp in responses:
                    if command == 'XB' and resp.startswith('B'):
                        return resp, None
                    elif command == 'YB' and resp.startswith('b'):
                        return resp, None
                # If no specific pattern found, return last response
                return responses[-1], None
            else:
                return None, f"No response received for command '{command}'"
            
        except Exception as e:
            print(f"[DEBUG] Communication error for command '{command}': {str(e)}")
            return None, f"Communication error for command '{command}': {str(e)}"
    
    def send_command_raw(self, command):
        """Send raw command to controller without adding \\r"""
        if not self.serial_conn or not self.serial_conn.is_open:
            return None, "No serial connection"
        
        try:
            # Clear any pending data
            self.serial_conn.reset_input_buffer()
            
            # Send command as-is
            cmd_bytes = command.encode('ascii')
            self.serial_conn.write(cmd_bytes)
            self.serial_conn.flush()
            time.sleep(0.5)
            
            # Read response with timeout
            response = self.serial_conn.readline().decode('ascii').strip()
            
            # Check if we got an empty response
            if not response:
                return None, f"No response received for raw command '{command}'"
            
            return response, None
        except Exception as e:
            return None, f"Communication error for raw command '{command}': {str(e)}"
    
    def get_xbits(self):
        """Get current XBits value"""
        response, error = self.send_command('XB')
        
        if error:
            return None, error
        
        try:
            # Response format: "B###" where ### is the decimal value
            if response.startswith('B'):
                value = int(response[1:])
                print(f"[DEBUG] Successfully parsed XBits: {value}")
                return value, None
            else:
                return None, f"Unexpected response format. Expected 'B###' but got: '{response}' (length: {len(response)})"
        except (ValueError, IndexError) as e:
            return None, f"Failed to parse XBits response '{response}': {str(e)}"
    
    def _send_command_and_get_response(self, command, expected_prefix):
        """Helper method to send command and get response"""
        try:
            # Clear buffer first
            self.serial_conn.reset_input_buffer()
            time.sleep(0.1)
            
            # Send command
            cmd_bytes = (command + '\r').encode('ascii')
            print(f"[DEBUG] Sending command: {cmd_bytes}")
            self.serial_conn.write(cmd_bytes)
            self.serial_conn.flush()
            
            # Wait for response
            start_time = time.time()
            while time.time() - start_time < self.timeout:
                if self.serial_conn.in_waiting > 0:
                    line = self.serial_conn.readline().decode('ascii').strip()
                    if line:
                        print(f"[DEBUG] Received response: '{line}'")
                        if line.startswith(expected_prefix):
                            value = int(line[1:])
                            return value, None
                
                time.sleep(0.1)
            
            return None, f"No valid response for command '{command}'"
            
        except Exception as e:
            return None, f"Error sending command '{command}': {str(e)}"
    
    def get_ybits(self):
        """Get current YBits value"""
        response, error = self.send_command('YB')
        if error:
            return None, error
        
        try:
            # Response format could be "b###" or "Y###" - handle both
            if response.startswith('b'):
                value = int(response[1:])
                print(f"[DEBUG] Successfully parsed YBits (b format): {value}")
                return value, None
            elif response.startswith('Y'):
                value = int(response[1:])
                print(f"[DEBUG] Successfully parsed YBits (Y format): {value}")
                return value, None
            else:
                return None, f"Unexpected response format. Expected 'b###' or 'Y###' but got: '{response}' (length: {len(response)})"
        except (ValueError, IndexError) as e:
            return None, f"Failed to parse YBits response '{response}': {str(e)}"
    
    def set_xbits(self, value):
        """Set XBits value - try different command formats"""
        # Try different formats for setting XBits
        formats_to_try = [
            f'XB{value}',      # Original format
            f'XB={value}',     # With equals sign
            f'X0B{value}',     # With axis identifier
            f'X0B={value}',    # With axis and equals
        ]
        
        for cmd_format in formats_to_try:
            print(f"[DEBUG] Trying set XBits format: '{cmd_format}'")
            response, error = self.send_command(cmd_format)
            if not error and response:
                print(f"[DEBUG] Set XBits successful with format '{cmd_format}', response: '{response}'")
                return True, f"XBits set successfully using format '{cmd_format}'"
        
        return False, f"Failed to set XBits to {value} - tried multiple formats"
    
    def set_ybits(self, value):
        """Set YBits value - try different command formats"""
        # Try different formats for setting YBits  
        formats_to_try = [
            f'YB{value}',      # Original format
            f'YB={value}',     # With equals sign
            f'Y0B{value}',     # With axis identifier
            f'Y0B={value}',    # With axis and equals
        ]
        
        for cmd_format in formats_to_try:
            print(f"[DEBUG] Trying set YBits format: '{cmd_format}'")
            response, error = self.send_command(cmd_format)
            if not error and response:
                print(f"[DEBUG] Set YBits successful with format '{cmd_format}', response: '{response}'")
                return True, f"YBits set successfully using format '{cmd_format}'"
        
        return False, f"Failed to set YBits to {value} - tried multiple formats"
    
    def save_config_to_flash(self):
        """Save current configuration from RAM to flash ROM using XW command"""
        # Try different XW command formats
        formats_to_try = [
            'XW',      # Basic format
            'X0W',     # With axis identifier
            'XW0',     # With parameter
            'XW1',     # Alternative parameter
        ]
        
        for cmd_format in formats_to_try:
            print(f"[DEBUG] Trying save to flash format: '{cmd_format}'")
            response, error = self.send_command(cmd_format)
            if not error and response:
                print(f"[DEBUG] Save to flash successful with format '{cmd_format}', response: '{response}'")
                return True, f"Configuration saved to flash ROM using format '{cmd_format}'"
            elif not error:
                # No error but no response - might still be successful for XW
                print(f"[DEBUG] No response for '{cmd_format}' but no error - might be successful")
                return True, f"Configuration save attempted with format '{cmd_format}' (no response expected)"
        
        # If all formats failed, try a longer timeout for XW specifically
        print(f"[DEBUG] All formats failed, trying XW with extended timeout...")
        
        try:
            # Clear buffer first
            self.serial_conn.reset_input_buffer()
            time.sleep(0.1)
            
            # Send XW command with checksum
            cmd_bytes = self.calculate_checksum_command('XW')
            print(f"[DEBUG] Sending XW with extended timeout: {cmd_bytes}")
            self.serial_conn.write(cmd_bytes)
            self.serial_conn.flush()
            
            # Wait longer for flash write operation
            time.sleep(2.0)  # Flash writes can take longer
            
            # Check for any response
            if self.serial_conn.in_waiting > 0:
                response = self.serial_conn.readline().decode('ascii').strip()
                print(f"[DEBUG] XW extended timeout response: '{response}'")
                return True, f"Configuration saved to flash ROM (response: {response})"
            else:
                # Flash write commands often don't return responses
                print(f"[DEBUG] XW completed with no response - assuming success")
                return True, "Configuration saved to flash ROM (no response - normal for flash writes)"
                
        except Exception as e:
            print(f"[DEBUG] XW extended timeout failed: {e}")
            return False, f"Failed to save to flash ROM: {str(e)}"
    
    def decode_mode(self, xbits, ybits):
        """Decode current operating mode from XBits and YBits"""
        modes = []
        
        # Check XBits
        if xbits & 0x08:  # Bit 3
            modes.append("Drag and Track")
        if xbits & 0x10:  # Bit 4
            modes.append("Tracking Platform")
        if xbits & 0x80:  # Bit 7
            modes.append("Guide Mode")
        
        # Check YBits
        if ybits & 0x08:  # Bit 3
            modes.append("Slew and Track")
        
        if not modes:
            modes.append("Normal")
        
        return modes
    
    def set_mode_normal(self):
        """Set controller to Normal mode"""
        # Clear tracking and guide bits
        try:
            xbits, error = self.get_xbits()
            if error:
                return False, error
            
            ybits, error = self.get_ybits()
            if error:
                return False, error
            
            # Clear tracking bits
            new_xbits = xbits & ~(0x08 | 0x10 | 0x80)  # Clear bits 3, 4, 7
            new_ybits = ybits & ~0x08  # Clear bit 3
            
            success, error = self.set_xbits(new_xbits)
            if not success:
                return False, error
            
            success, error = self.set_ybits(new_ybits)
            if not success:
                return False, error
            
            # Try to save configuration to flash ROM (optional)
            success, error = self.save_config_to_flash()
            if not success:
                print(f"[WARNING] Mode set to Normal but flash save failed: {error}")
                return True, "Set to Normal mode (RAM only - flash save failed)"
            
            return True, "Set to Normal mode and saved to flash"
        except Exception as e:
            return False, f"Error setting Normal mode: {str(e)}"
    
    def set_mode_slew_track(self):
        """Set controller to Slew and Track mode"""
        try:
            xbits, error = self.get_xbits()
            if error:
                return False, error
            
            ybits, error = self.get_ybits()
            if error:
                return False, error
            
            # Set Slew and Track (YBits bit 3), clear Drag and Track (XBits bit 3)
            new_xbits = xbits & ~0x08  # Clear bit 3
            new_ybits = ybits | 0x08   # Set bit 3
            
            success, error = self.set_xbits(new_xbits)
            if not success:
                return False, error
            
            success, error = self.set_ybits(new_ybits)
            if not success:
                return False, error
            
            # Try to save configuration to flash ROM (optional)
            success, error = self.save_config_to_flash()
            if not success:
                print(f"[WARNING] Mode set to Slew and Track but flash save failed: {error}")
                return True, "Set to Slew and Track mode (RAM only - flash save failed)"
            
            return True, "Set to Slew and Track mode and saved to flash"
        except Exception as e:
            return False, f"Error setting Slew and Track mode: {str(e)}"
    
    def set_mode_drag_track(self):
        """Set controller to Drag and Track mode"""
        try:
            xbits, error = self.get_xbits()
            if error:
                return False, error
            
            ybits, error = self.get_ybits()
            if error:
                return False, error
            
            # Set Drag and Track (XBits bit 3), clear Slew and Track (YBits bit 3)
            new_xbits = xbits | 0x08  # Set bit 3
            new_ybits = ybits & ~0x08  # Clear bit 3
            
            success, error = self.set_xbits(new_xbits)
            if not success:
                return False, error
            
            success, error = self.set_ybits(new_ybits)
            if not success:
                return False, error
            
            # Try to save configuration to flash ROM (optional)
            success, error = self.save_config_to_flash()
            if not success:
                print(f"[WARNING] Mode set to Drag and Track but flash save failed: {error}")
                return True, "Set to Drag and Track mode (RAM only - flash save failed)"
            
            return True, "Set to Drag and Track mode and saved to flash"
        except Exception as e:
            return False, f"Error setting Drag and Track mode: {str(e)}"

def get_controller_status(com_port='/dev/ttyUSB0'):
    """Get current controller status (main function to call from web interface)"""
    controller = SiTechController(com_port)
    
    # First, check if port exists
    if not os.path.exists(com_port):
        return {"error": f"Serial port {com_port} does not exist. Check connection and ComPort setting."}
    
    # Stop service
    print(f"[DEBUG] About to stop sitech.service...")
    success, msg = controller.stop_sitech_service()
    print(f"[DEBUG] Stop service result: success={success}, msg='{msg}'")
    if not success:
        return {"error": f"Failed to stop SiTech service: {msg}"}
    
    # Wait for port to be released - check up to 10 times over 10 seconds
    for attempt in range(10):
        try:
            lsof_result = subprocess.run(['sudo', 'lsof', com_port], 
                                       capture_output=True, text=True, timeout=5)
            if lsof_result.returncode != 0 or not lsof_result.stdout.strip():
                # Port is free
                break
            else:
                # Port still in use, wait and try again
                if attempt == 9:  # Last attempt
                    return {"error": f"Serial port {com_port} is still in use after stopping service:\n{lsof_result.stdout.strip()}\n\nTry again in a few seconds."}
                time.sleep(1)
        except:
            # lsof failed, assume port might be free and continue
            break
    
    # Connect
    print(f"[DEBUG] Attempting to connect to serial port {com_port}...")
    success, msg = controller.connect()
    print(f"[DEBUG] Serial connection result: success={success}, msg='{msg}'")
    if not success:
        controller.start_sitech_service()  # Restart service if connection fails
        return {"error": f"Failed to connect to serial port {com_port}: {msg}"}
    
    try:
        # Get XBits and YBits
        xbits, error = controller.get_xbits()
        if error:
            raise Exception(f"Failed to get XBits: {error}")
        
        ybits, error = controller.get_ybits()
        if error:
            raise Exception(f"Failed to get YBits: {error}")
        
        # Decode mode
        modes = controller.decode_mode(xbits, ybits)
        
        result = {
            "success": True,
            "xbits": xbits,
            "ybits": ybits,
            "xbits_hex": f"0x{xbits:02X}",
            "ybits_hex": f"0x{ybits:02X}",
            "modes": modes,
            "primary_mode": modes[0] if modes else "Unknown"
        }
        
        # Only disconnect here on success - don't restart service yet
        controller.disconnect()
        return result
        
    except Exception as e:
        # On error, disconnect and restart service
        controller.disconnect()
        controller.start_sitech_service()
        return {"error": str(e)}

def set_controller_mode(mode, com_port='/dev/ttyUSB0'):
    """Set controller mode (main function to call from web interface)"""
    controller = SiTechController(com_port)
    
    # Stop service
    success, msg = controller.stop_sitech_service()
    if not success:
        return {"error": f"Failed to stop service: {msg}"}
    
    # Wait for port to be released - check up to 10 times over 10 seconds
    for attempt in range(10):
        try:
            lsof_result = subprocess.run(['sudo', 'lsof', com_port], 
                                       capture_output=True, text=True, timeout=5)
            if lsof_result.returncode != 0 or not lsof_result.stdout.strip():
                # Port is free
                break
            else:
                # Port still in use, wait and try again
                if attempt == 9:  # Last attempt
                    controller.start_sitech_service()
                    return {"error": f"Serial port {com_port} is still in use after stopping service. Try again in a few seconds."}
                time.sleep(1)
        except:
            # lsof failed, assume port might be free and continue
            break
    
    # Connect
    success, msg = controller.connect()
    if not success:
        controller.start_sitech_service()
        return {"error": f"Failed to connect: {msg}"}
    
    try:
        if mode == "normal":
            success, msg = controller.set_mode_normal()
        elif mode == "slew_track":
            success, msg = controller.set_mode_slew_track()
        elif mode == "drag_track":
            success, msg = controller.set_mode_drag_track()
        else:
            raise Exception(f"Unknown mode: {mode}")
        
        if not success:
            raise Exception(msg)
        
        result = {"success": True, "message": msg}
        
        # Only disconnect here on success - don't restart service yet
        controller.disconnect()
        # Start service after successful operation
        controller.start_sitech_service()
        return result
        
    except Exception as e:
        # On error, disconnect and restart service
        controller.disconnect()
        controller.start_sitech_service()
        return {"error": str(e)}

if __name__ == "__main__":
    # Test the controller communication
    import sys
    
    if len(sys.argv) > 1:
        com_port = sys.argv[1]
    else:
        com_port = "/dev/ttyUSB0"
    
    print(f"Testing SiTech controller on {com_port}...")
    result = get_controller_status(com_port)
    print(json.dumps(result, indent=2))
