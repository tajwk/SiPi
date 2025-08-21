#!/bin/bash

# WiFi Hotspot Configuration Update Script
# Usage: update_hostapd_conf.sh <ssid> <password>

if [ $# -ne 2 ]; then
    echo "Usage: $0 <ssid> <password>" >&2
    exit 1
fi

SSID="$1"
PASSWORD="$2"
HOSTAPD_CONF="/etc/hostapd/hostapd.conf"
BACKUP_CONF="/etc/hostapd/hostapd.conf.backup"

# Validate inputs
if [ -z "$SSID" ]; then
    echo "Error: SSID cannot be empty" >&2
    exit 1
fi

if [ ${#PASSWORD} -lt 8 ]; then
    echo "Error: Password must be at least 8 characters" >&2
    exit 1
fi

# Check if hostapd config exists
if [ ! -f "$HOSTAPD_CONF" ]; then
    echo "Error: $HOSTAPD_CONF not found" >&2
    exit 1
fi

# Create backup
cp "$HOSTAPD_CONF" "$BACKUP_CONF" 2>/dev/null || {
    echo "Warning: Could not create backup"
}

# Update the configuration
# Use sed to replace ssid and wpa_passphrase lines
sed -i "s/^ssid=.*/ssid=$SSID/" "$HOSTAPD_CONF" || {
    echo "Error: Failed to update SSID" >&2
    exit 1
}

sed -i "s/^wpa_passphrase=.*/wpa_passphrase=$PASSWORD/" "$HOSTAPD_CONF" || {
    echo "Error: Failed to update password" >&2
    exit 1
}

# Verify changes
if ! grep -q "^ssid=$SSID$" "$HOSTAPD_CONF"; then
    echo "Error: SSID update verification failed" >&2
    exit 1
fi

if ! grep -q "^wpa_passphrase=$PASSWORD$" "$HOSTAPD_CONF"; then
    echo "Error: Password update verification failed" >&2
    exit 1
fi

# Restart hostapd service to apply changes
systemctl restart hostapd 2>/dev/null || {
    echo "Warning: Could not restart hostapd service"
}

echo "WiFi configuration updated successfully"
echo "SSID: $SSID"
echo "Password: [hidden]"

exit 0
