import json
import os

WEB_CONFIG_FILE = os.path.join(os.path.dirname(__file__), "web_config.json")

def migrate():
    with open(WEB_CONFIG_FILE, 'r') as f:
        cfg = json.load(f)
    if 'flip_skyview' not in cfg:
        cfg['flip_skyview'] = False
        with open(WEB_CONFIG_FILE, 'w') as f2:
            json.dump(cfg, f2)
        print("Added 'flip_skyview': false to web_config.json")
    else:
        print("'flip_skyview' already present.")

if __name__ == "__main__":
    migrate()
