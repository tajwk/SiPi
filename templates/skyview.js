<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SkyView</title>
  <link rel="stylesheet" href="{{ url_for('static', filename='css/style.css') }}">
  <style>
    html, body {
      margin:0; padding:0; overflow:hidden;
      background:black; color:white;
    }
    #skyviewTopBar {
      position:absolute; top:0; left:0; width:100vw;
      padding:10px; background:rgba(0,0,0,0.8);
      display:flex; gap:8px; align-items:center; z-index:20;
    }
    #skyviewTopBar input {
      width:6em; background:#222; color:#fff;
      border:1px solid #555; padding:2px 4px;
    }
    #skyviewTopBar button {
      background:#28a; color:#fff; border:none;
      padding:4px 8px; cursor:pointer;
    }
    #fullscreenBtn, #refreshBtn {
      position: absolute;
      top: 12px;
      z-index: 30;
      background: #28a;
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
    }
    #fullscreenBtn { right: 12px; }
    #refreshBtn { right: 90px; }
    #starAttributes {
      position:absolute; top:60px; left:10px; z-index:20;
      background:rgba(0,0,0,0.7); padding:8px; border-radius:4px;
      font-size:0.9em; line-height:1.4;
    }
    #toggleBar {
      position: fixed;
      left: 50%;
      bottom: 0;
      transform: translateX(-50%);
      z-index: 20;
      background: rgba(0,0,0,0.7);
      padding: 10px 12px 10px 12px;
      border-radius: 8px 8px 0 0;
      display: flex;
      flex-wrap: wrap;
      gap: 18px 24px;
      font-size: 1em;
      align-items: flex-start;
      box-sizing: border-box;
      width: 98vw;
      max-width: 600px;
    }
    #toggleBar label {
      display: flex;
      align-items: flex-start;
      margin-bottom: 0;
      min-width: 120px;
    }
    #toggleBar input {
      vertical-align: middle;
      margin-top: 2px;
      margin-right: 6px;
    }
    @media (max-width: 600px) {
      #toggleBar {
        flex-direction: column;
        align-items: flex-start;
        width: 98vw;
        left: 1vw;
        transform: none;
        max-width: none;
      }
      #toggleBar label {
        min-width: unset;
        width: 100%;
      }
    }
    #skyviewCanvas {
      display: block;
      margin: 0 auto;
      position: relative;
      left: 0;
      right: 0;
      top: 0;
      bottom: 0;
      background: black;
      box-sizing: border-box;
      max-width: 100vw;
      max-height: 100vh;
    }
    #popup {
      position:absolute; background:rgba(0,0,0,0.8);
      color:white; padding:8px; border-radius:4px;
      font-family:sans-serif; display:none; z-index:40;
    }
    #popup button {
      margin-top:6px; padding:4px 8px;
      background:#28a; color:white; border:none;
      border-radius:3px; cursor:pointer;
    }
  </style>
</head>
<body>
  <div id="skyviewTopBar">
	<label>Alt: <input id="gotoAlt" type="text" placeholder="DD:MM:SS"></label>
    <label>Az:  <input id="gotoAz"  type="text" placeholder="DD:MM:SS"></label>
    
    <button id="gotoCoordsBtn">GoTo</button>
  </div>
  <button id="refreshBtn">⟳</button>
  <button id="fullscreenBtn">⛶</button>

  <div id="starAttributes">
    <div id="nameInfo">Name: </div>
    <div id="hipInfo">HIP: </div>
    <div id="hdInfo">HD: </div>
    <div id="hrInfo">HR: </div>
    <div id="specInfo">Spectral Type: </div>
    <div id="colorInfo">Color Index: </div>
    <div id="distInfo">Distance: </div>
    <div id="magInfo">Magnitude: </div>
  </div>

  <div id="toggleBar">
    <label><input type="checkbox" id="toggleStars" checked> Stars</label>
    <label><input type="checkbox" id="toggleConst"> Constellations</label>
    <label><input type="checkbox" id="toggleGal"> Galaxies</label>
    <label><input type="checkbox" id="toggleOpen"> Open Clusters</label>
    <label><input type="checkbox" id="toggleGlobular"> Globular Clusters</label>
    <label><input type="checkbox" id="toggleNebula"> Nebulae</label>
    <label><input type="checkbox" id="togglePlanetary"> Planetary Nebulae</label>
  </div>

  <div id="galFilterBar" style="display:none;">
    <label>Galaxy Mag:
      <input type="range" id="galFilter" min="2" max="20" step="0.1" value="11">
    </label>
    <span id="galFilterValue">11.0</span>
  </div>

  <canvas id="skyviewCanvas"
          data-latitude="{{ site_latitude }}"
          data-longitude="{{ site_longitude }}">
  </canvas>
  <div id="popup"></div>

  <script src="{{ url_for('static', filename='js/jquery-3.6.0.min.js') }}"></script>
  <script src="{{ url_for('static', filename='js/skyview.js') }}" defer></script>
</body>
</html>
