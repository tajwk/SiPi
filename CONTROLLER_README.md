# SiTech Controller Integration - UPDATED

This system adds direct SiTech controller communication to the SiPi web interface.

## IMPORTANT UPDATES ✅

### 1. Corrected Baud Rate
- **OLD**: 9600 baud
- **NEW**: 19200 baud (correct SiTech standard per protocol documentation)

### 2. Added Configuration Persistence 
- **NEW**: All mode changes now saved to flash ROM using `XW` command
- **BENEFIT**: Controller settings persist through power cycles

## Files Created/Modified:

### 1. sitech_controller.py ✅ UPDATED
- **Purpose**: Direct serial communication with SiTech controller
- **Baud Rate**: Now correctly set to 19200
- **New Feature**: `save_config_to_flash()` method using `XW` command
- **Functions**: 
  - Get/Set XBits and YBits
  - Decode controller modes (Normal, Slew & Track, Drag & Track)
  - Start/Stop/Restart sitech.service
  - Serial communication with ASCII commands
  - **NEW**: Automatic flash ROM save after mode changes

### 2. templates/edit_config.html ✅ UPDATED
- **Added**: Controller Settings section between SkyView Settings and Versions
- **Features**:
  - ComPort configuration input field
  - Get Status button (reads XBits/YBits)
  - Mode display (Normal, Slew & Track, Drag & Track)
  - Mode setting buttons with flash save confirmation
  - Restart Service button

### 3. SiPi.py ✅ UPDATED
- **Added Routes**:
  - `/controller_status` (GET) - Get current controller status
  - `/controller_mode` (POST) - Set controller mode + save to flash
  - `/restart_sitech` (POST) - Restart sitech.service
  - `/get_config` (GET) - Get web configuration
  - `/save_config` (POST) - Save configuration settings

## Controller Mode Definitions:

Based on sitech_serial_protocol.txt:

### XBits (X-axis control bits):
- **Bit 3**: Drag and Track mode
- **Bit 4**: Tracking Platform mode  
- **Bit 7**: Guide mode

### YBits (Y-axis control bits):
- **Bit 3**: Slew and Track mode

### Mode Combinations:
- **Normal**: All tracking bits cleared
- **Slew & Track**: XBits bit 3 + YBits bit 3 set
- **Drag & Track**: XBits bit 3 set, YBits bit 3 clear

## Usage:

1. **Configure ComPort**: Set the serial port (default: /dev/ttyUSB0)
2. **Get Status**: Click "Get Status" to read current XBits/YBits and mode
3. **Set Mode**: Click mode buttons to change controller behavior
4. **Restart Service**: Restart sitech.service if needed

## Technical Notes:

### Service Management:
- Controller communication requires stopping sitech.service temporarily
- Service is automatically restarted after each operation
- Uses `sudo systemctl` commands

### Serial Communication: ✅ UPDATED
- **Baud rate**: 19200 (corrected from 9600)
- Protocol: ASCII commands from SiTech specification
- Commands: `XB` (get XBits), `YB` (get YBits), `XB###` (set XBits), **`XW` (save to flash ROM)**
- **Configuration persistence**: All mode changes are automatically saved to flash ROM using `XW` command

### Dependencies:
- `pyserial` package required for serial communication
- `sudo` permissions needed for systemctl commands

## Key Protocol Commands Used:

- `XB\r` - Read XBits value
- `YB\r` - Read YBits value  
- `XB###\r` - Set XBits to decimal value ###
- `YB###\r` - Set YBits to decimal value ###
- **`XW\r` - Save configuration from RAM to flash ROM** ✅ NEW

## Error Handling:

The system includes comprehensive error handling for:
- Serial communication failures
- Service start/stop failures  
- Invalid responses from controller
- Network/timeout issues
- Flash ROM save failures

## Configuration Storage:

Controller settings are stored in `web_config.json`:
```json
{
  "controller_com_port": "/dev/ttyUSB0",
  "vibration_enabled": true,
  "tilt_enabled": false
}
```

## Installation Requirements:

```bash
pip install pyserial
```
