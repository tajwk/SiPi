Add the Mono repository to your system:

	sudo apt install dirmngr ca-certificates gnupg
	sudo gpg --homedir /tmp --no-default-keyring --keyring /usr/share/keyrings/mono-official-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF
	echo "deb [signed-by=/usr/share/keyrings/mono-official-archive-keyring.gpg] https://download.mono-project.com/repo/debian stable-buster main" | sudo tee /etc/apt/sources.list.d/mono-official-stable.list
	sudo apt update

Install Mono:

	sudo apt install mono-complete mono-vbnc

Download SiTechExe:
	
	sudo mkdir /opt/SiTech
	cd /opt/SiTech
	sudo wget -O /opt/SiTech/SiTechInstallerLinux.zip \
		http://siderealtechnology.com/SiTechInstallerLinux.zip

	
Unzip without extracting:

	sudo unzip SiTechInstallerLinux.zip

Modify SiTechInstaller.sh 
	
	((sudo nano SiTechInstaller.sh to modify install paths))

Run the installer with sudo:

	sudo ./SiTechInstaller.sh
	

SIPI
	
Install python3:

	sudo apt install python3

Install flask:

	sudo apt install python3-pip
	pip3 install flask --break-system-packages

Install dhcpcd

	sudo apt install dhcpcd5
	
Install hostapd
	
	sudo apt install hostapd dnsmasq

Enable hostpd and dnsmasq

	sudo systemctl unmask hostapd
	sudo systemctl enable hostapd

Configure hostpd

	sudo nano /etc/hostapd/hostapd.conf

	Sample File:
		interface=wlan0
		driver=nl80211
		ssid=SiPiAP
		hw_mode=g
		channel=6
		wmm_enabled=0
		macaddr_acl=0
		auth_algs=1
		ignore_broadcast_ssid=0
		wpa=2
		wpa_passphrase=12345678
		wpa_key_mgmt=WPA-PSK
		rsn_pairwise=CCMP
		
	sudo nano /etc/default/hostapd
	
	Add:
		DAEMON_CONF="/etc/hostapd/hostapd.conf"

Configure Static IP for wlan0:

	sudo nano /etc/dhcpcd.conf
	
	Add:
		interface wlan0
		static ip_address=192.168.4.1/24
		nohook wpa_supplicant
		
Configure dnsmasq
	
	sudo mv /etc/dnsmasq.conf /etc/dnsmasq.conf.orig
	sudo nano /etc/dnsmasq.conf
	
	Add:
		interface=wlan0
		dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h

Unblock WiFi

	sudo raspi-config nonint do_wifi_country XX //https://en.wikipedia.org/wiki/ISO_3166-1

Unmask hostapd

	sudo systemctl unmask hostapd
	sudo systemctl enable hostapd
	sudo systemctl start hostapd


Enable Services
	
	sudo systemctl restart dhcpcd
	sudo systemctl start dnsmasq
	sudo systemctl start hostapd
	sudo systemctl enable dnsmasq
	sudo systemctl enable hostapd

Reboot

	sudo reboot
	
Instal SIPI

	cd /opt/SiTech
	sudo git clone https://github.com/tajwk/SiPi.git

Install xvfb
		
		sudo apt update
		sudo apt install xvfb


Create start script:

	cd /opt/SiTech/SiTechExe/SiTechExe
	sudo nano start_sitech.sh
	
		Add:

		#!/bin/bash
		exec /usr/bin/xvfb-run -a /usr/bin/nice -n -10 /usr/bin/mono /opt/SiTech/SiTechExe/SiTechExe.exe

	sudo chmod +x /opt/SiTech/SiTechExe/start_sitech.sh

	
	
Create Services:

	cd /etc/systemd/system
	
	sudo nano sitech.service
		
	Sample File:
		
		[Unit]
		Description=SiTechExe Service
		After=network.target

		[Service]
		Type=simple
		ExecStart=/bin/bash -c 'exec /opt/SiTech/SiTechExe/start_sitech.sh'
		WorkingDirectory=/opt/SiTech/SiTechExe
		Restart=no
		StandardOutput=journal
		StandardError=journal

		[Install]
		WantedBy=multi-user.target
		
	
	sudo nano sipi.service
	
	Sample File:
	
		[Unit]
		Description=SiPi Python Script Service
		After=network.target

		[Service]
		ExecStart=/usr/bin/python3 /opt/SiTech/SiPi/SiPi.py
		WorkingDirectory=/opt/SiTech/SiPi
		Restart=always

		[Install]
		WantedBy=multi-user.target
		
Enable and Start Services
	
	sudo systemctl enable sitech sipi 
	sudo systemctl start sitech sipi

Give permissions:

	sudo chown -R sitech:sitech /usr/share/SiTech/SiTechExe

Other things to do:

Enable VNC
Setup com port
Edit Config

Authorize github ssh for updates
	sudo -u sitech ssh-keyscan github.com >> /home/sitech/.ssh/known_hosts
	sudo chown sitech:sitech /home/sitech/.ssh/known_hosts
	sudo chmod 600 /home/sitech/.ssh/known_hosts


Notes:

If you edit config in web interface and then click Change Config in SiTechExe prior to restarting SiTechExe, your settings will be lost
