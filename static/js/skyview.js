// static/js/skyview.js
document.addEventListener('DOMContentLoaded', async () => {
  console.log('📡 SkyView init');


  // how many extra pixels to expand every hit area by (for easier touch)
  // Increase hit area for easier touch selection
  const HIT_PADDING = 18;
  // zoom limits
  const MIN_SCALE   = 0.5;
  const MAX_SCALE   = 50;

  // Convert degrees → “DDD:MM:SS”
  function degToDMS(deg) {
    const d = Math.floor(deg);
    const m = Math.floor(Math.abs(deg - d) * 60);
    const s = Math.round((Math.abs(deg - d) * 60 - m) * 60);
    return `${String(d).padStart(3, '0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  // Convert “DDD:MM:SS” → degrees
  function dmsToDeg(dms) {
    const [d, m, s] = dms.split(':').map(Number);
    if (isNaN(d) || isNaN(m) || isNaN(s)) return NaN;
    return Math.abs(d) + m / 60 + s / 3600 * (d < 0 ? -1 : 1);
  }


  // Canvas & HiDPI
  const canvas = document.getElementById('skyviewCanvas');
  // disable the browser’s native pinch-zoom on this element
  canvas.style.touchAction = 'none';
  const ctx    = canvas.getContext('2d');
  let cx, cy, baseRadius;
  let canvasScale    = 1;                 // our zoom factor
  let translateX     = 0, translateY = 0; // pan offsets in CSS px
  let currentVpScale = 1;                 // viewport pinch-zoom factor
  const dpr          = window.devicePixelRatio || 1;

  // Site coords from data- attributes
  const lat = parseFloat(canvas.dataset.latitude);
  const lon = parseFloat(canvas.dataset.longitude);

  // Top-bar UI elements
  const azInput       = document.getElementById('gotoAz');
  const altInput      = document.getElementById('gotoAlt');
  const magInfo       = document.getElementById('magInfo');
  const hipInfo       = document.getElementById('hipInfo');
  const hdInfo        = document.getElementById('hdInfo');
  const hrInfo        = document.getElementById('hrInfo');
  const specInfo      = document.getElementById('specInfo');
  const colorInfo     = document.getElementById('colorInfo');
  const distInfo      = document.getElementById('distInfo');
  const nameInfo      = document.getElementById('nameInfo');
  const popup         = document.getElementById('popup');
  const gotoBtn       = document.getElementById('gotoCoordsBtn');
  // const fullscreenBtn = document.getElementById('fullscreenBtn'); // Removed: button no longer exists
  // Attach event handlers to Back and Redraw buttons (new IDs: backBtn, redrawBtn)
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.onclick = function() {
      // Hide SkyView overlay, show main view
      document.getElementById('skyviewContainer').style.display = 'none';
      const mainView = document.getElementById('mainViewContainer');
      if (mainView) mainView.style.display = '';
    };
  }
  const redrawBtn = document.getElementById('redrawBtn');
  if (redrawBtn) {
    redrawBtn.onclick = function() {
      canvasScale = 1;
      translateX = 0;
      translateY = 0;
      draw();
    };
  }

  // Make GoTo button wider for text
  if (gotoBtn) {
    gotoBtn.style.minWidth = '70px';
    gotoBtn.style.width = 'auto';
    gotoBtn.style.padding = '4px 18px';
    gotoBtn.style.fontSize = '1.1em';
  }

  // Data arrays
  let stars        = [];
  let constLines   = [], constFeatures = [];
  let galaxies     = [], galaxyMags = [];
  let openClusters = [];
  let globularClusters = [];
  let nebulae = [];
  let planetaryNebulae = [];

  // Hit-test buffers
  let starHits     = [];
  let galaxyHits   = [];
  let openHits     = [];
  let globularHits = [];
  let nebulaHits   = [];
  let planetaryHits = [];

  // Current mount pointing
  let mountPos     = { alt: null, az: null };

  // --- Mount position polling ---
  async function fetchMount() {
    try {
      const resp = await fetch('/status');
      if (!resp.ok) throw new Error('Failed to fetch mount position');
      const data = await resp.json();
      // /status returns alt and az as strings or numbers; parse as float and check for NaN
      const alt = parseFloat(data.alt);
      const az = parseFloat(data.az);
      if (!isNaN(alt) && !isNaN(az)) {
        mountPos.alt = alt;
        mountPos.az = az;
        console.log('[SkyView] Mount position updated:', mountPos);
      } else {
        mountPos.alt = null;
        mountPos.az = null;
        console.warn('[SkyView] Invalid mount position data:', data);
      }
    } catch (e) {
      mountPos.alt = null;
      mountPos.az = null;
      console.error('[SkyView] Error fetching mount position:', e);
    }
    draw();
  }

  // Fetch mount position on load and every 2 seconds
  fetchMount();
  setInterval(fetchMount, 2000);

  // Track the currently selected object (star, galaxy, or open cluster)
  let selectedObject = null;

  // --- Restore default/previous view toggles on load ---
  // Default: Stars ON, Constellations ON, Constellation Labels OFF, others OFF
  // Try to restore from localStorage, else set default
  function setDefaultOrRestoreToggles() {
    const toggles = [
      { id: 'toggleStars', def: true },
      { id: 'toggleConst', def: true },
      { id: 'toggleConstLabels', def: false },
      { id: 'toggleGal', def: false },
      { id: 'toggleOpen', def: false },
      { id: 'toggleGlobular', def: false },
      { id: 'toggleNebula', def: false },
      { id: 'togglePlanetary', def: false },
      { id: 'toggleCalPoints', def: false }
    ];
    let anyRestored = false;
    toggles.forEach(t => {
      const el = document.getElementById(t.id);
      if (!el) return;
      let val = localStorage.getItem('skyview_' + t.id);
      if (val !== null) {
        el.checked = val === 'true';
        anyRestored = true;
      } else {
        el.checked = t.def;
      }
    });
    // If nothing was restored, force default view (stars + const, no labels)
    if (!anyRestored) {
      const stars = document.getElementById('toggleStars');
      const consts = document.getElementById('toggleConst');
      const labels = document.getElementById('toggleConstLabels');
      if (stars) stars.checked = true;
      if (consts) consts.checked = true;
      if (labels) labels.checked = false;
    }
  }
  setDefaultOrRestoreToggles();

  // --- Save toggle state on change ---
  [
    'toggleStars','toggleConst','toggleConstLabels','toggleGal','toggleOpen','toggleGlobular','toggleNebula','togglePlanetary','toggleCalPoints'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        localStorage.setItem('skyview_' + id, el.checked);
        draw();
      });
    }
  });

  // Fullscreen toggle removed: fullscreenBtn no longer exists

  // Astronomy utilities
  function toJulian(d){ return d.valueOf()/86400000 + 2440587.5; }
  function computeLST(d, lonDeg){
    const D = toJulian(d) - 2451545.0;
    let GMST = (18.697374558 + 24.06570982441908*D) % 24;
    if (GMST<0) GMST+=24;
    let LST = GMST + lonDeg/15;
    LST%=24; if(LST<0)LST+=24;
    return LST;
  }
  function eqToAltAz(raH, decDeg, latDeg, lonDeg, date){
    const lst  = computeLST(date, lonDeg);
    const ha   = ((lst - raH)*15 + 180)%360 - 180;
    const haR  = ha*Math.PI/180,
          decR = decDeg*Math.PI/180,
          latR = latDeg*Math.PI/180;
    const altR = Math.asin(
      Math.sin(decR)*Math.sin(latR) +
      Math.cos(decR)*Math.cos(latR)*Math.cos(haR)
    );
    let azR = Math.atan2(
      Math.sin(haR),
      Math.cos(haR)*Math.sin(latR) - Math.tan(decR)*Math.cos(latR)
    );
    let az = azR*180/Math.PI; if(az<0) az+=360;
    return { alt: altR*180/Math.PI, az };
  }

  // Resize & HiDPI
  function handleResize(){
    const w=window.innerWidth, h=window.innerHeight;
    currentVpScale = window.visualViewport ? window.visualViewport.scale : 1;
    canvas.width  = w * dpr * currentVpScale;
    canvas.height = h * dpr * currentVpScale;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';

    ctx.resetTransform();
    // *** TRANSLATE first, then SCALE ***
    ctx.translate(translateX, translateY);
    ctx.scale(dpr * currentVpScale * canvasScale, dpr * currentVpScale * canvasScale);

    cx = w/2; cy = h/2;
    baseRadius = Math.min(cx,cy)*0.95;
    draw();
  }
  window.addEventListener('resize', handleResize);
  if(window.visualViewport)
    window.visualViewport.addEventListener('resize', handleResize);
  handleResize();

  // --- Ensure initial pan/zoom is centered and zoomable ---
  function setInitialCanvasTransform() {
    canvasScale = 1;
    translateX = 0;
    translateY = 0;
  }
  setInitialCanvasTransform();


  // Pan & pinch-zoom state
  let pointers={}, initialDist=0, panStartX, panStartY, panOrigX, panOrigY;

  // --- Utility: Convert pointer event to canvas pixel coordinates (untransformed) ---
  function transformEvent(e) {
    // Returns {mx, my} in canvas pixel coordinates (before pan/zoom/flip)
    const rect = canvas.getBoundingClientRect();
    
    // Scale mouse/touch position to canvas pixel space
    let mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    // Mirror mx if Flip SkyView is enabled
    // With our new transform sequence, we need to mirror coordinates for hit testing
    const flip = localStorage.getItem('flipSkyView') === 'true';
    if (flip) {
      mx = canvas.width - mx;
    }
    
    return {mx, my};
  }


  // --- Tap-and-hold (short press) object selection logic ---
  let tapHoldTimer = null;
  let tapHoldTarget = null;
  let tapHoldStart = null;
  let tapHoldLastEvent = null;
  const TAP_HOLD_DELAY = 320; // ms for touch
  const CLICK_SELECT_MAX_MS = 200; // ms for mouse click selection
  const CLICK_SELECT_MOVE_THRESH = 10; // px for mouse click selection

  let pointerDownInfo = null;
  canvas.addEventListener('pointerdown', e => {
    // Defensive: ensure canvas is visible and not covered
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    let {mx, my} = transformEvent(e);
    pointerDownInfo = {
      pointerType: e.pointerType,
      time: Date.now(),
      mx, my,
      event: e
    };

    // --- Unified object selection: gather all candidates (including cal points) ---
    let candidates = [];
    function addHits(arr) {
      for (let obj of arr) {
        if (Math.hypot(mx - obj.screenX, my - obj.screenY) < obj.r + HIT_PADDING) {
          candidates.push(obj);
        }
      }
    }
    addHits(starHits);
    addHits(galaxyHits);
    addHits(openHits);
    addHits(globularHits);
    addHits(nebulaHits);
    addHits(planetaryHits);
    if (toggleCalPoints && toggleCalPoints.checked && calPointHits.length) {
      for (let pt of calPointHits) {
        if (Math.hypot(mx - pt.x, my - pt.y) < pt.r + HIT_PADDING) {
          // For cal points, add a special object with cal point info and screenX/screenY
          candidates.push({
            ...pt,
            isCalPoint: true,
            altDeg: pt.dec,
            az: (((pt.ra - 180) % 360) + 360) % 360,
            r: pt.r || 19,
            screenX: pt.x,
            screenY: pt.y
          });
        }
      }
    }
    // If any candidates, select the closest
    if (candidates.length > 0) {
      let hitObj = null;
      let minDist = Infinity;
      for (let obj of candidates) {
        let dist = Math.hypot(mx - obj.screenX, my - obj.screenY);
        if (dist < minDist) {
          minDist = dist;
          hitObj = obj;
        }
      }
      if (hitObj) {
        selectedObject = hitObj;
        showSelectedAttributes(selectedObject);
        // Show popup for cal point, else normal attributes
        if (hitObj.isCalPoint) {
          if (altInput && azInput) {
            altInput.value = degToDMS(hitObj.dec); // Alt is pt.dec
            azInput.value = degToDMS(hitObj.ra);  // Az is pt.ra
          }
          let html = `<div><strong>Cal Point #${hitObj.index}</strong></div>` +
            `<div>Az: ${hitObj.ra.toFixed(5)}°</div>` +
            `<div>Alt: ${hitObj.dec.toFixed(5)}°</div>` +
            `<div>RMS: ${hitObj.error.toFixed(5)}</div>` +
            `<div>Status: <span style='color:${hitObj.enabled ? 'yellow' : 'red'}'>${hitObj.enabled ? 'Enabled' : 'Disabled'}</span></div>` +
            `<button id='toggleCalPointBtn' style="min-width: 100px; padding: 6px 18px; font-size: 1em; margin-top: 6px; border-radius: 6px; border: 2px solid #888; background: #222; color: #fff; cursor: pointer;">${hitObj.enabled ? 'Disable' : 'Enable'}</button>`;
          popup.innerHTML = html;
          popup.style.left = (e.pageX + 8) + 'px';
          popup.style.top = (e.pageY + 8) + 'px';
          popup.style.display = 'block';
          setTimeout(() => {
            const btn = document.getElementById('toggleCalPointBtn');
            if (btn) {
              btn.onclick = async (ev) => {
                ev.stopPropagation();
                btn.disabled = true;
                btn.textContent = hitObj.enabled ? 'Disabling...' : 'Enabling...';
                try {
                  const resp = await fetch(hitObj.enabled ? '/disable_cal_point' : '/enable_cal_point', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({index: hitObj.index})
                  });
                  if (!resp.ok) throw new Error('Request failed');
                  await fetchCalPoints();
                  setTimeout(() => {
                    popup.style.display = 'none';
                  }, 200);
                } catch (err) {
                  btn.textContent = 'Error';
                  btn.style.background = '#a00';
                  setTimeout(() => { popup.style.display = 'none'; }, 1200);
                }
              };
            }
          }, 0);
        } else {
          if (altInput && azInput && typeof hitObj.altDeg === 'number' && typeof hitObj.azDeg === 'number') {
            altInput.value = degToDMS(hitObj.altDeg);
            azInput.value = degToDMS(hitObj.azDeg);
          }
        }
        draw();
      }
    }

    // --- Tap-and-hold for object selection (touch only, if nothing was selected above) ---
    if (e.pointerType === 'touch' && candidates.length === 0) {
      tapHoldStart = {mx, my, time: Date.now()};
      tapHoldTarget = e;
      tapHoldLastEvent = e;
      tapHoldTimer = setTimeout(() => {
        // Use the latest pointer position for hit test
        let event = tapHoldLastEvent || tapHoldTarget;
        let {mx, my} = transformEvent(event);
        // Gather all hits at this point (including cal points)
        let candidates2 = [];
        function addHits2(arr) {
          for (let obj of arr) {
            if (Math.hypot(mx - obj.screenX, my - obj.screenY) < obj.r + HIT_PADDING) {
              candidates2.push(obj);
            }
          }
        }
        addHits2(starHits);
        addHits2(galaxyHits);
        addHits2(openHits);
        addHits2(globularHits);
        addHits2(nebulaHits);
        addHits2(planetaryHits);
        if (toggleCalPoints && toggleCalPoints.checked && calPointHits.length) {
          for (let pt of calPointHits) {
            if (Math.hypot(mx - pt.x, my - pt.y) < pt.r + HIT_PADDING) {
              candidates2.push({
                ...pt,
                isCalPoint: true,
                altDeg: pt.dec,
                az: (((pt.ra - 180) % 360) + 360) % 360,
                r: pt.r || 19,
                screenX: pt.x,
                screenY: pt.y
              });
            }
          }
        }
        // If multiple, pick the closest
        let hitObj2 = null;
        let minDist2 = Infinity;
        for (let obj of candidates2) {
          let dist = Math.hypot(mx - obj.screenX, my - obj.screenY);
          if (dist < minDist2) {
            minDist2 = dist;
            hitObj2 = obj;
          }
        }
        if (hitObj2) {
          selectedObject = hitObj2;
          showSelectedAttributes(selectedObject);
          if (hitObj2.isCalPoint) {
            if (altInput && azInput) {
              altInput.value = degToDMS(hitObj2.dec);
              azInput.value = degToDMS(hitObj2.ra);
            }
            let html = `<div><strong>Cal Point #${hitObj2.index}</strong></div>` +
              `<div>Az: ${hitObj2.ra.toFixed(5)}°</div>` +
              `<div>Alt: ${hitObj2.dec.toFixed(5)}°</div>` +
              `<div>RMS: ${hitObj2.error.toFixed(5)}</div>` +
              `<div>Status: <span style='color:${hitObj2.enabled ? 'yellow' : 'red'}'>${hitObj2.enabled ? 'Enabled' : 'Disabled'}</span></div>` +
              `<button id='toggleCalPointBtn' style="min-width: 100px; padding: 6px 18px; font-size: 1em; margin-top: 6px; border-radius: 6px; border: 2px solid #888; background: #222; color: #fff; cursor: pointer;">${hitObj2.enabled ? 'Disable' : 'Enable'}</button>`;
            popup.innerHTML = html;
            popup.style.left = (event.pageX + 8) + 'px';
            popup.style.top = (event.pageY + 8) + 'px';
            popup.style.display = 'block';
            setTimeout(() => {
              const btn = document.getElementById('toggleCalPointBtn');
              if (btn) {
                btn.onclick = async (ev) => {
                  ev.stopPropagation();
                  btn.disabled = true;
                  btn.textContent = hitObj2.enabled ? 'Disabling...' : 'Enabling...';
                  try {
                    const resp = await fetch(hitObj2.enabled ? '/disable_cal_point' : '/enable_cal_point', {
                      method: 'POST',
                      headers: {'Content-Type': 'application/json'},
                      body: JSON.stringify({index: hitObj2.index})
                    });
                    if (!resp.ok) throw new Error('Request failed');
                    await fetchCalPoints();
                    setTimeout(() => {
                      popup.style.display = 'none';
                    }, 200);
                  } catch (err) {
                    btn.textContent = 'Error';
                    btn.style.background = '#a00';
                    setTimeout(() => { popup.style.display = 'none'; }, 1200);
                  }
                };
              }
            }, 0);
          } else {
            if (altInput && azInput && typeof hitObj2.altDeg === 'number' && typeof hitObj2.azDeg === 'number') {
              altInput.value = degToDMS(hitObj2.altDeg);
              azInput.value = degToDMS(hitObj2.azDeg);
            }
          }
          draw();
        }
        tapHoldTimer = null;
        tapHoldTarget = null;
        tapHoldStart = null;
        tapHoldLastEvent = null;
      }, TAP_HOLD_DELAY);
    }

    // --- Normal pan/zoom logic ---
    canvas.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = e;
    const ids = Object.keys(pointers);
    if(ids.length===2){
      const [p1,p2] = ids.map(i=>pointers[i]);
      initialDist = Math.hypot(p1.clientX-p2.clientX, p1.clientY-p2.clientY);
    } else {
      panStartX = e.clientX; panStartY = e.clientY;
      panOrigX  = translateX; panOrigY  = translateY;
    }
  });

  // Cancel tap-hold if pointer moves too far or is released, and track last pointer event
  // (removed duplicate declaration of tapHoldLastEvent)
  canvas.addEventListener('pointermove', e => {
    if (tapHoldStart && tapHoldTimer) {
      tapHoldLastEvent = e;
      const {mx, my} = transformEvent(e);
      const dx = mx - tapHoldStart.mx;
      const dy = my - tapHoldStart.my;
      if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
        clearTimeout(tapHoldTimer);
        tapHoldTimer = null;
        tapHoldTarget = null;
        tapHoldStart = null;
        tapHoldLastEvent = null;
      }
    }
  });
  canvas.addEventListener('pointerup', e => {
    // Mouse: fast click selection
    if (pointerDownInfo && pointerDownInfo.pointerType === 'mouse') {
      const dt = Date.now() - pointerDownInfo.time;
      const {mx: downX, my: downY} = pointerDownInfo;
      const {mx: upX, my: upY} = transformEvent(e);
      const moveDist = Math.hypot(upX - downX, upY - downY);
      if (dt < CLICK_SELECT_MAX_MS && moveDist < CLICK_SELECT_MOVE_THRESH) {
        // Gather all hits at pointerup position, including cal points
        let candidates = [];
        function addHits(arr) {
          for (let obj of arr) {
            if (Math.hypot(upX - obj.screenX, upY - obj.screenY) < obj.r + HIT_PADDING) {
              candidates.push(obj);
            }
          }
        }
        addHits(starHits);
        addHits(galaxyHits);
        addHits(openHits);
        addHits(globularHits);
        addHits(nebulaHits);
        addHits(planetaryHits);
        if (toggleCalPoints && toggleCalPoints.checked && calPointHits.length) {
          for (let pt of calPointHits) {
            if (Math.hypot(upX - pt.x, upY - pt.y) < pt.r + HIT_PADDING) {
              candidates.push({
                ...pt,
                isCalPoint: true,
                altDeg: pt.dec,
                az: (((pt.ra - 180) % 360) + 360) % 360,
                r: pt.r || 19,
                screenX: pt.x,
                screenY: pt.y
              });
            }
          }
        }
        // If multiple, pick the closest
        let hitObj = null;
        let minDist = Infinity;
        for (let obj of candidates) {
          let dist = Math.hypot(upX - obj.screenX, upY - obj.screenY);
          if (dist < minDist) {
            minDist = dist;
            hitObj = obj;
          }
        }
        if (hitObj) {
          selectedObject = hitObj;
          showSelectedAttributes(selectedObject);
          if (hitObj.isCalPoint) {
            if (altInput && azInput) {
              altInput.value = degToDMS(hitObj.dec);
              azInput.value = degToDMS(hitObj.ra);
            }
            let html = `<div><strong>Cal Point #${hitObj.index}</strong></div>` +
              `<div>Az: ${hitObj.ra.toFixed(5)}°</div>` +
              `<div>Alt: ${hitObj.dec.toFixed(5)}°</div>` +
              `<div>RMS: ${hitObj.error.toFixed(5)}</div>` +
              `<div>Status: <span style='color:${hitObj.enabled ? 'yellow' : 'red'}'>${hitObj.enabled ? 'Enabled' : 'Disabled'}</span></div>` +
              `<button id='toggleCalPointBtn' style="min-width: 100px; padding: 6px 18px; font-size: 1em; margin-top: 6px; border-radius: 6px; border: 2px solid #888; background: #222; color: #fff; cursor: pointer;">${hitObj.enabled ? 'Disable' : 'Enable'}</button>`;
            popup.innerHTML = html;
            popup.style.left = (e.pageX + 8) + 'px';
            popup.style.top = (e.pageY + 8) + 'px';
            popup.style.display = 'block';
            setTimeout(() => {
              const btn = document.getElementById('toggleCalPointBtn');
              if (btn) {
                btn.onclick = async (ev) => {
                  ev.stopPropagation();
                  btn.disabled = true;
                  btn.textContent = hitObj.enabled ? 'Disabling...' : 'Enabling...';
                  try {
                    const resp = await fetch(hitObj.enabled ? '/disable_cal_point' : '/enable_cal_point', {
                      method: 'POST',
                      headers: {'Content-Type': 'application/json'},
                      body: JSON.stringify({index: hitObj.index})
                    });
                    if (!resp.ok) throw new Error('Request failed');
                    await fetchCalPoints();
                    setTimeout(() => {
                      popup.style.display = 'none';
                    }, 200);
                  } catch (err) {
                    btn.textContent = 'Error';
                    btn.style.background = '#a00';
                    setTimeout(() => { popup.style.display = 'none'; }, 1200);
                  }
                };
              }
            }, 0);
          } else {
            if (altInput && azInput && typeof hitObj.altDeg === 'number' && typeof hitObj.azDeg === 'number') {
              altInput.value = degToDMS(hitObj.altDeg);
              azInput.value = degToDMS(hitObj.azDeg);
            }
          }
          draw();
        }
      }
    }
    pointerDownInfo = null;
    // Touch: cancel tap-hold timer if released early
    if (tapHoldTimer) {
      clearTimeout(tapHoldTimer);
      tapHoldTimer = null;
      tapHoldTarget = null;
      tapHoldStart = null;
      tapHoldLastEvent = null;
    }
    delete pointers[e.pointerId];
    const ids = Object.keys(pointers);
    if(ids.length === 1) {
      const remaining = pointers[ids[0]];
      panStartX = remaining.clientX;
      panStartY = remaining.clientY;
      panOrigX = translateX;
      panOrigY = translateY;
    }
    if(ids.length < 2) initialDist = 0;
  });

  canvas.addEventListener('pointermove', e=>{
    if(!pointers[e.pointerId]) return;
    pointers[e.pointerId] = e;
    const ids = Object.keys(pointers);

    if(ids.length===2 && initialDist>0){
      // ** prevent default so browser pinch doesn't interfere **
      e.preventDefault();

      // pinch-zoom
      const [p1,p2] = ids.map(i=>pointers[i]);
      const newDist = Math.hypot(p1.clientX-p2.clientX, p1.clientY-p2.clientY);
      let factor = newDist / initialDist;
      initialDist = newDist;

      const rect = canvas.getBoundingClientRect();
      const fx   = ((p1.clientX + p2.clientX) / 2 - rect.left);
      const fy   = ((p1.clientY + p2.clientY) / 2 - rect.top);

      // Convert pinch center to canvas pixel coordinates
      const fx_canvas = ((p1.clientX + p2.clientX) / 2 - rect.left) * (canvas.width / rect.width);
      const fy_canvas = ((p1.clientY + p2.clientY) / 2 - rect.top) * (canvas.height / rect.height);

      // update canvasScale
      const oldScale = canvasScale;
      let newScale = oldScale * factor;
      newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
      factor = newScale / oldScale;
      canvasScale = newScale;

      // *** pivot formula in canvas pixel space ***
      translateX = factor * translateX + (1 - factor) * fx_canvas;
      translateY = factor * translateY + (1 - factor) * fy_canvas;

      draw();
    } else {
      // Calculate the delta for panning
      let dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      
      translateX = panOrigX + dx;
      translateY = panOrigY + dy;
      draw();
    }
  });

  canvas.addEventListener('pointerup', e=>{
    delete pointers[e.pointerId];
    const ids = Object.keys(pointers);
    if(ids.length === 1) {
      // If transitioning from pinch to pan, reset pan start variables
      const remaining = pointers[ids[0]];
      panStartX = remaining.clientX;
      panStartY = remaining.clientY;
      panOrigX = translateX;
      panOrigY = translateY;
    }
    if(ids.length < 2) initialDist = 0;
  });

  // Wheel-zoom (desktop)
  canvas.addEventListener('wheel', e=>{
    const rect = canvas.getBoundingClientRect();
    // Use canvas pixel coordinates for correct zoom-at-cursor
    const fx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const fy = (e.clientY - rect.top) * (canvas.height / rect.height);

    const oldScale = canvasScale;
    let factor = 1 - e.deltaY*0.002;
    let newScale = oldScale * factor;
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    factor = newScale / oldScale;
    canvasScale = newScale;

    // --- correct pivot formula for zoom at cursor (canvas pixel space) ---
    translateX = factor * translateX + (1 - factor) * fx;
    translateY = factor * translateY + (1 - factor) * fy;

    draw();
    e.preventDefault();
  }, { passive: false });

  // Drawing helpers
  // If you need to re-render the handpad/buttons after certain actions, call renderHandpadAndActions() again.
  function drawGrid(r, drawLabels = true){
    ctx.save(); // Save transform state before drawing grid
    
    // Border is now drawn separately in the main draw function
    
    ctx.setLineDash([4,4]);
    // Draw altitude circles at 30° and 60°
    [30,60].forEach(a=>{
      const rr=(90-a)/90*r;
      ctx.lineWidth = 0.7 / canvasScale; // dashed grid lines narrower
      ctx.strokeStyle = '#888'; // gray dashed
      ctx.beginPath(); ctx.arc(cx,cy,rr,0,2*Math.PI); ctx.stroke();
    });
    
    // Draw azimuth lines at 30° intervals
    ctx.beginPath();
    for(let az=0; az<360; az+=30) {
      const rad = az * Math.PI / 180;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * Math.sin(rad), cy - r * Math.cos(rad));
    }
    ctx.stroke();
    
    ctx.setLineDash([]);
    
    // Only draw labels if requested
    if (drawLabels) {
      ctx.fillStyle = 'white';
      ctx.font = `${Math.max(12,r*0.04)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // Use drawFlippableText for cardinal points
      drawFlippableText('N', cx, cy-r-14);
      drawFlippableText('S', cx, cy+r+14);
      drawFlippableText('W', cx-r-14, cy);
      drawFlippableText('E', cx+r+14, cy);
    }
    
    ctx.restore(); // Restore transform state after drawing grid
  }

  function project(raH,decDeg,r){
    const {alt,az} = eqToAltAz(raH,decDeg,lat,lon,new Date());
    const rr=(90-alt)/90*r;
    const ang=(az+180)*Math.PI/180;
    return { alt, az,
      x: cx + rr * Math.sin(ang),
      y: cy - rr * Math.cos(ang)
    };
  }

  // Project Alt/Az directly to (x, y) on the chart
  function altAzToXY(alt, az, r) {
    // az: 0 = N, 90 = E, 180 = S, 270 = W
    const rr = (90 - alt) / 90 * r;
    const ang = (az + 180) * Math.PI / 180;
    return {
      x: cx + rr * Math.sin(ang),
      y: cy - rr * Math.cos(ang)
    };
  }

  // Helper function to set transform for drawing in screen space
  function prepareScreenSpaceDrawing() {
    // Save current transform state
    ctx.save();
    // Reset to identity matrix
    ctx.resetTransform();
    
    // If flipped, we need to mirror the screen space drawing
    const flip = localStorage.getItem('flipSkyView') === 'true';
    if (flip) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    
    // Return whether we're in flipped mode so functions can make further adjustments if needed
    return flip;
  }
  
  // Helper function to draw text that remains readable when flipped
  function drawFlippableText(text, x, y, options = {}) {
    const flip = localStorage.getItem('flipSkyView') === 'true';
    ctx.save();
    if (options.font) ctx.font = options.font;
    if (options.fillStyle) ctx.fillStyle = options.fillStyle;
    if (options.textAlign) ctx.textAlign = options.textAlign;
    if (options.textBaseline) ctx.textBaseline = options.textBaseline;
    
    if (flip) {
      // Save original transform, apply reversed scale just for text
      ctx.scale(-1, 1);
      ctx.fillText(text, -x, y);
    } else {
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  }

  function draw(){
    // Debug: log mountPos before drawing reticle
    console.log('[SkyView] draw() called, mountPos:', mountPos);
    console.log('[SkyView] Canvas size:', canvas.width, 'x', canvas.height, 'CSS:', canvas.style.width, 'x', canvas.style.height, 'dpr:', dpr, 'canvasScale:', canvasScale, 'translateX:', translateX, 'translateY:', translateY, 'currentVpScale:', currentVpScale);
    
    // Clear the entire canvas and reset transform stack
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.resetTransform();
    
    // Get flip state for use in drawing functions
    const flip = localStorage.getItem('flipSkyView') === 'true';
    
    // Apply transforms in a cleaner sequence:
    const zoomFactor = dpr * currentVpScale * canvasScale;
    
    // First apply zoom
    ctx.scale(zoomFactor, zoomFactor);
    
    // Then pan (with appropriate scaling)
    ctx.translate(translateX / zoomFactor, translateY / zoomFactor);
    
    // Then flip if needed (after pan)
    if (flip) {
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
    }
    
    // Flip is now applied before panning in our new transform sequence above
    
    // Continue with drawing...
    const r = baseRadius, effR = r;
    
    // Draw circular horizon (background)
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = '#000';
    ctx.fill();
    
    // Draw the border
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2 / (dpr * currentVpScale * canvasScale);
    ctx.stroke();
    
    // Save context before clipping
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.clip();  // Clip to the circular horizon
    
    // Draw Alt/Az grid (but not the NSEW labels yet, they'll be drawn outside clip area)
    drawGrid(r, false);
    
    // Draw sky objects - DO NOT CALL ctx.setTransform() in any of these functions!
    // --- constellations ---
    if(toggleConst.checked){
      console.log('[SkyView] Drawing constellations:', constLines.length);
      if (constLines.length > 0) {
        let sample = constLines[0].slice(0, 3).map(pt => project(pt[0]/15, pt[1], effR));
        console.log('[SkyView] Sample projected constellation points:', sample);
      }
      ctx.save();
      ctx.lineWidth = 1 / canvasScale; // narrower lines
      ctx.strokeStyle='#a259e6'; // purple
      constLines.forEach(line=>{
        let prev=project(line[0][0]/15,line[0][1],effR);
        for(let i=1;i<line.length;i++){
          const cur=project(line[i][0]/15,line[i][1],effR);
          if(Math.abs(prev.az-cur.az)<180&&(prev.alt>0||cur.alt>0)){
            ctx.beginPath();
            ctx.moveTo(prev.x,prev.y);
            ctx.lineTo(cur.x,cur.y);
            ctx.stroke();
          }
          prev=cur;
        }
      });
      ctx.restore();
    }
    if(toggleConstLabels && toggleConstLabels.checked){
      console.log('[SkyView] Drawing constellation labels:', constFeatures.length);
      ctx.save();
      ctx.fillStyle='rgba(224,195,252,0.98)'; // more opaque for labels
      ctx.font=`${Math.max(10, effR*0.045/Math.max(canvasScale,0.01))}px sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      constFeatures.forEach(f=>{
        let pts=[]; const g=f.geometry;
        if(g.type==='MultiLineString') g.coordinates.forEach(l=>pts.push(...l));
        else if(g.type==='LineString') pts=g.coordinates;
        const ppts=pts.map(p=>project(p[0]/15,p[1],effR)).filter(p=>p.alt>0);
        if(!ppts.length) return;
        const avgX=ppts.reduce((s,p)=>s+p.x,0)/ppts.length;
        const avgY=ppts.reduce((s,p)=>s+p.y,0)/ppts.length;
        // Use drawFlippableText for constellation labels
        drawFlippableText(f.id, avgX, avgY);
      });
      ctx.restore();
    }

    // --- stars ---
    starHits=[]; if(toggleStars.checked){
      console.log('[SkyView] Drawing stars:', stars.length);
      if (stars.length > 0) {
        let s = stars[0];
        let p = project(s.RtAsc, s.Declin, effR);
        console.log('[SkyView] Sample projected star:', p, 'Mag:', s.Mag, 'RA:', s.RtAsc, 'Dec:', s.Declin);
      }
      // Stepwise reveal of fainter stars as you zoom in
      // At canvasScale < 2.0: Mag < 3
      // At canvasScale < 3.0: Mag < 4
      // At canvasScale < 4.0: Mag < 5
      // At canvasScale < 5.0: Mag < 6
      // At canvasScale < 6.0: Mag < 7
      // At canvasScale >= 6.0: Mag < 8
      // Show stars with Mag < 5 at default zoom, then resume stepped reveal at higher zoom
      let magLimit = 5;
      if (canvasScale >= 4.0) magLimit = 6;
      if (canvasScale >= 5.0) magLimit = 7;
      if (canvasScale >= 6.0) magLimit = 8;
      stars.forEach(s=>{
        if(s.Mag >= magLimit) return;
        const p=project(s.RtAsc,s.Declin,effR);
        if(p.alt<=0) return;
        // --- Discrete star sizes by magnitude, 5x area per step ---
        // 8 bins: <2, 2–3, 3–4, 4–5, 5–6, 6–7, 7–8, >=8
        const minRadius = 1.2; // Reduce smallest star radius for default zoom
        const areaStep = 1.5;  // Each step is 1.5x the area
        // Compute bin index (0 = brightest, 7 = faintest)
        let bin = Math.floor(Math.max(0, Math.min(7, s.Mag < 2 ? 0 : Math.floor(s.Mag - 1))));
        // Area for this bin
        const area = Math.PI * minRadius * minRadius * Math.pow(areaStep, 7 - bin);
        const sz = Math.sqrt(area / Math.PI);
        // --- Color by spectral type ---
        let color = 'white';
        if (s.SpectType && typeof s.SpectType === 'string') {
          switch (s.SpectType.charAt(0).toUpperCase()) {
            case 'O': color = '#9bb0ff'; break; // blue
            case 'B': color = '#aabfff'; break; // blue-white
            case 'A': color = '#cad7ff'; break; // white
            case 'F': color = '#f8f7ff'; break; // yellow-white
            case 'G': color = '#fff4ea'; break; // yellow
            case 'K': color = '#ffd2a1'; break; // orange
            case 'M': color = '#b83d3b'; break; // red
            default: color = 'white';
          }
        }
        ctx.save();
        // Save current transform state
        ctx.save();
        // Apply the necessary transforms to draw in screen space while preserving flip
        const flip = localStorage.getItem('flipSkyView') === 'true';
        ctx.resetTransform();
        // If flipped, we need to mirror the screen space drawing
        if (flip) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.beginPath(); ctx.arc(p.x * dpr * currentVpScale * canvasScale + translateX, p.y * dpr * currentVpScale * canvasScale + translateY, sz, 0, 2*Math.PI); ctx.fillStyle = color; ctx.fill();
        ctx.restore();
        // For hit-test, use a larger radius: icon size or a minimum (e.g. 12px), whichever is greater
        const hitR = Math.max(sz, 12);
        starHits.push({
          ...p,
          r: hitR,
          ...s,
          altDeg: p.alt,
          azDeg: (p.az + 180) % 360,
          screenX: p.x * dpr * currentVpScale * canvasScale + translateX,
          screenY: p.y * dpr * currentVpScale * canvasScale + translateY
        });
      });
    }

    // --- galaxies ---
    galaxyHits=[]; if(toggleGal.checked){
      console.log('[SkyView] Drawing galaxies:', galaxies.length);
      if (galaxies.length > 0) {
        let g = galaxies[0];
        let p = project(g.RtAsc, g.Declin, effR);
        console.log('[SkyView] Sample projected galaxy:', p, 'Mag:', g.mag, 'RA:', g.RtAsc, 'Dec:', g.Declin);
      }
      // Galaxy magnitude bins: 8 bins, 2.2–20, largest for <10, then step up
      const galMinRadius = 2.2; // Smallest ellipse radius
      const galAreaStep = 1.5;  // Each step is 1.5x the area
      // Bin edges: <10, 10–12.25, 12.25–14.5, 14.5–16.75, 16.75–19, 19–20
      // We'll use 8 bins, but most galaxies are faint, so bins are not uniform in width
      galaxies.forEach(g=>{
        // Visibility by zoom: show <10 at all zooms, then step in fainter bins as you zoom
        let galLimit = 10;
        if (canvasScale >= 4.0) galLimit = 12.25;
        if (canvasScale >= 5.0) galLimit = 14.5;
        if (canvasScale >= 6.0) galLimit = 16.75;
        if (canvasScale >= 7.0) galLimit = 19;
        if (canvasScale >= 8.0) galLimit = 20.1;
        if(g.mag >= galLimit) return;
        const p=project(g.RtAsc,g.Declin,effR);
        if(p.alt<=0) return;
        // Bin index: 0 = brightest (<10), 1 = 10–12.25, ..., 7 = 19–20
        let bin = 0;
        if (g.mag >= 10) bin = Math.min(7, Math.floor((g.mag - 10) / ((20 - 10) / 7)) + 1);
        const area = Math.PI * galMinRadius * galMinRadius * Math.pow(galAreaStep, 7 - bin);
        const maj = Math.sqrt(area / Math.PI);
        const min = maj / 2;
        const isFlipped = prepareScreenSpaceDrawing();
        ctx.strokeStyle = 'rgb(255,64,64)'; // fully opaque red
        ctx.lineWidth = 1.2 + Math.min((canvasScale - 1) * 0.7, 2.2); // gentler scaling
        ctx.beginPath(); ctx.ellipse(p.x * dpr * currentVpScale * canvasScale + translateX, p.y * dpr * currentVpScale * canvasScale + translateY, maj, min, 0, 0, 2*Math.PI); ctx.stroke();
        ctx.restore();
        galaxyHits.push({
          ...p,
          r: maj,
          ...g,
          altDeg: p.alt,
          azDeg: (p.az + 180) % 360,
          screenX: p.x * dpr * currentVpScale * canvasScale + translateX,
          screenY: p.y * dpr * currentVpScale * canvasScale + translateY
        });
      });
    }

    // --- open clusters ---
    openHits=[]; if(toggleOpen.checked){
      console.log('[SkyView] Drawing open clusters:', openClusters.length);
      if (openClusters.length > 0) {
        let o = openClusters[0];
        let p = project(o.RtAsc, o.Declin, effR);
        console.log('[SkyView] Sample projected open cluster:', p, 'Mag:', o.Mag, 'RA:', o.RtAsc, 'Dec:', o.Declin);
      }
      ctx.strokeStyle='rgb(100,100,255)'; // fully opaque blue
      openClusters.forEach(o=>{
        const p=project(o.RtAsc,o.Declin,effR);
        if(p.alt<=0) return;
        const cl=Math.max(1,Math.min(25,o.Size));
        const frac=(cl-1)/(25-1);
        const pix=4+frac*(12-4);
        const isFlipped = prepareScreenSpaceDrawing();
        ctx.lineWidth = 1.2 + Math.min((canvasScale - 1) * 0.7, 2.2); // gentler scaling
        ctx.beginPath(); ctx.arc(p.x * dpr * currentVpScale * canvasScale + translateX, p.y * dpr * currentVpScale * canvasScale + translateY, pix, 0, 2*Math.PI); ctx.stroke();
        ctx.restore();
        openHits.push({
          ...p,
          r: pix,
          ...o,
          altDeg: p.alt,
          azDeg: (p.az + 180) % 360,
          screenX: p.x * dpr * currentVpScale * canvasScale + translateX,
          screenY: p.y * dpr * currentVpScale * canvasScale + translateY
        });
      });
    }

    // --- globular clusters ---
    globularHits=[]; if(toggleGlobular.checked){
      console.log('[SkyView] Drawing globular clusters:', globularClusters.length);
      if (globularClusters.length > 0) {
        let g = globularClusters[0];
        let p = project(g.RtAsc, g.Declin, effR);
        console.log('[SkyView] Sample projected globular:', p, 'Mag:', g.Mag, 'RA:', g.RtAsc, 'Dec:', g.Declin);
      }
      ctx.strokeStyle='rgb(0,180,80)'; // fully opaque green
      globularClusters.forEach(g=>{
        const p=project(g.RtAsc,g.Declin,effR);
        if(p.alt<=0) return;
        // --- Fix: parse Size and Mag as float, and use smaller default icon size ---
        let mag = parseFloat(g.Mag || g.mag || 10);
        mag = Math.max(3.5, Math.min(20, mag));
        const minR = 4, maxR = 12; // smaller than before
        const r = maxR - ((mag-3.5)/(20-3.5))*(maxR-minR);
        const isFlipped = prepareScreenSpaceDrawing();
        ctx.lineWidth = 1.1 + Math.min((canvasScale - 1) * 0.6, 1.8); // slightly thinner
        ctx.beginPath(); ctx.arc(p.x * dpr * currentVpScale * canvasScale + translateX, p.y * dpr * currentVpScale * canvasScale + translateY, r, 0, 2*Math.PI); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x * dpr * currentVpScale * canvasScale + translateX - r*0.7, p.y * dpr * currentVpScale * canvasScale + translateY - r*0.7);
        ctx.lineTo(p.x * dpr * currentVpScale * canvasScale + translateX + r*0.7, p.y * dpr * currentVpScale * canvasScale + translateY + r*0.7);
        ctx.moveTo(p.x * dpr * currentVpScale * canvasScale + translateX + r*0.7, p.y * dpr * currentVpScale * canvasScale + translateY - r*0.7);
        ctx.lineTo(p.x * dpr * currentVpScale * canvasScale + translateX - r*0.7, p.y * dpr * currentVpScale * canvasScale + translateY + r*0.7);
        ctx.stroke();
        ctx.restore();
        globularHits.push({
          ...p,
          r: r,
          ...g,
          Mag: mag, // ensure Mag is always present and numeric
          altDeg: p.alt,
          azDeg: (p.az + 180) % 360,
          screenX: p.x * dpr * currentVpScale * canvasScale + translateX,
          screenY: p.y * dpr * currentVpScale * canvasScale + translateY
        });
      });
    }

    // --- nebulae ---
    nebulaHits=[]; if(toggleNebula.checked){
      console.log('[SkyView] Drawing nebulae:', nebulae.length);
      if (nebulae.length > 0) {
        let n = nebulae[0];
        let p = project(n.RtAsc, n.Declin, effR);
        console.log('[SkyView] Sample projected nebula:', p, 'Mag:', n.Mag, 'RA:', n.RtAsc, 'Dec:', n.Declin);
      }
      ctx.strokeStyle='rgb(255,100,255)'; // fully opaque pink
      nebulae.forEach(n=>{
        const p=project(n.RtAsc,n.Declin,effR);
        if(p.alt<=0) return;
        let mag = parseFloat(n.Mag || n.mag || 10);
        mag = Math.max(3.5, Math.min(20, mag));
        const minSz = 6, maxSz = 16; // smaller than before
        const sz = maxSz - ((mag-3.5)/(20-3.5))*(maxSz-minSz);
        const isFlipped = prepareScreenSpaceDrawing();
        ctx.lineWidth = 1.1 + Math.min((canvasScale - 1) * 0.6, 1.8);
        const x = p.x * dpr * currentVpScale * canvasScale + translateX;
        const y = p.y * dpr * currentVpScale * canvasScale + translateY;
        ctx.beginPath(); ctx.rect(x-sz/2, y-sz/2, sz, sz); ctx.stroke();
        ctx.restore();
        nebulaHits.push({
          ...p,
          r: sz/1.5,
          ...n,
          Mag: mag,
          altDeg: p.alt,
          azDeg: (p.az + 180) % 360,
          screenX: x,
          screenY: y
        });
      });
    }

    // --- planetary nebulae ---
    planetaryHits=[]; if(togglePlanetary.checked){
      console.log('[SkyView] Drawing planetary nebulae:', planetaryNebulae.length);
      if (planetaryNebulae.length > 0) {
        let pn = planetaryNebulae[0];
        let p = project(pn.RtAsc, pn.Declin, effR);
        console.log('[SkyView] Sample projected planetary:', p, 'Mag:', pn.Mag, 'RA:', pn.RtAsc, 'Dec:', pn.Declin);
      }
      ctx.strokeStyle='rgb(127,255,0)'; // fully opaque chartreuse
      planetaryNebulae.forEach(pn=>{
        const p=project(pn.RtAsc,pn.Declin,effR);
        if(p.alt<=0) return;
        let mag = parseFloat(pn.Mag || pn.mag || 12);
        mag = Math.max(7.3, Math.min(20, mag));
        const minSz = 8, maxSz = 14; // smaller than before
        const sz = maxSz - ((mag-7.3)/(20-7.3))*(maxSz-minSz);
        const isFlipped = prepareScreenSpaceDrawing();
        ctx.lineWidth = 1.1 + Math.min((canvasScale - 1) * 0.6, 1.8);
        const x = p.x * dpr * currentVpScale * canvasScale + translateX;
        const y = p.y * dpr * currentVpScale * canvasScale + translateY;
        ctx.beginPath();
        ctx.moveTo(x, y - sz/1.2);
        ctx.lineTo(x - sz/1.2, y + sz/1.2);
        ctx.lineTo(x + sz/1.2, y + sz/1.2);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
        planetaryHits.push({
          ...p,
          r: sz/1.3,
          ...pn,
          Mag: mag,
          altDeg: p.alt,
          azDeg: (p.az + 180) % 360,
          screenX: x,
          screenY: y
        });
      });
    }

    // --- reticle ---
    if (mountPos.alt !== null && mountPos.az !== null) {
      const azForDraw = (mountPos.az + 180) % 360;
      const p = altAzToXY(mountPos.alt, azForDraw, effR);
      // Reticle radius fixed in screen space (like orange crosshair)
      const reticleRadius = 18; // px, visually matches orange crosshair
      const screenX = p.x * dpr * currentVpScale * canvasScale + translateX;
      const screenY = p.y * dpr * currentVpScale * canvasScale + translateY;
      console.log('[SkyView] Reticle debug:', {
        mountPos,
        azForDraw,
        effR,
        p,
        screenX,
        screenY,
        canvas: { width: canvas.width, height: canvas.height },
        css: { width: canvas.style.width, height: canvas.style.height },
        dpr,
        canvasScale,
        translateX,
        translateY,
        currentVpScale
      });
      const isFlipped = prepareScreenSpaceDrawing();
      ctx.strokeStyle='red'; ctx.lineWidth=2;
      // Crosshairs only
      ctx.beginPath();
      ctx.moveTo(screenX - reticleRadius * 1.3, screenY);
      ctx.lineTo(screenX + reticleRadius * 1.3, screenY);
      ctx.moveTo(screenX, screenY - reticleRadius * 1.3);
      ctx.lineTo(screenX, screenY + reticleRadius * 1.3);
      ctx.stroke();
      ctx.restore();
      console.log('[SkyView] Reticle drawn at:', screenX, screenY, 'for mountPos:', mountPos);
    } else {
      console.log('[SkyView] Reticle not drawn, mountPos.alt or az is null:', mountPos);
    }

    // --- highlight selected object (dark orange circle only) ---
    if (selectedObject && selectedObject.altDeg !== undefined && selectedObject.az !== undefined) {
      // Recompute the object's current screen position based on its Alt/Az (use raw azimuth, not azDeg)
      const p = altAzToXY(selectedObject.altDeg, selectedObject.az, baseRadius);
      const screenX = p.x * dpr * currentVpScale * canvasScale + translateX;
      const screenY = p.y * dpr * currentVpScale * canvasScale + translateY;
      const r = selectedObject.r || 12;
      const isFlipped = prepareScreenSpaceDrawing();
      // Orange circle only (no crosshair)
      ctx.beginPath();
      ctx.arc(screenX, screenY, r + 6, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(255,120,30,0.75)'; // dark orange
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // restore sky circle clip before overlay

    // Draw NSEW labels outside clipping area
    drawGrid(r, true);
    
    // --- STOP button overlay (drawn on canvas, after main sky objects) ---
    // Only draw if SkyView overlay is active
    const skyViewContainer = document.getElementById('skyviewContainer');
    // Get btnStack safely inside draw to avoid ReferenceError
    const btnStackDraw = document.getElementById('skyviewBtnStack');
    if (skyViewContainer && skyViewContainer.style.display !== 'none') {
      // Removed extra STOP button overlay (red octagon) from canvas drawing
    }
  }

  // === Data loading ===
  try {
    stars = await (await fetch('/stars-data')).json();
    console.log('[SkyView] Loaded stars:', stars.length);
  } catch(e) {
    console.error('stars load', e);
  }

  try {
    const geo = await (await fetch('/static/constellations.json')).json();
    constFeatures = geo.features;
    geo.features.forEach(f=>{
      const g=f.geometry;
      if(g.type==='MultiLineString') g.coordinates.forEach(l=>constLines.push(l));
      else if(g.type==='LineString')    constLines.push(g.coordinates);
    });
    console.log('[SkyView] Loaded constellations:', constFeatures.length, 'lines:', constLines.length);
  } catch(e) {
    console.error('constellations load', e);
  }

  try {
    const resp = await fetch('/static/galaxies.json');
    if(!resp.ok) throw resp;
    const raw = await resp.json();
    galaxies = raw.map(g=>{
      return {
        ...g,
        RtAsc:  parseFloat(g.RtAsc), // always in hours
        Declin: parseFloat(g.Declin),
        mag:    parseFloat(g.mag ?? g.Mag ?? 0),
        Size:   parseFloat(g.Size),
        Name:   g.Name
      };
    });
    galaxyMags = galaxies.map(g=>g.mag).sort((a,b)=>a-b);
    const mid = Math.floor(galaxyMags.length/2);
    galThreshold = galaxyMags[mid];
    console.log('[SkyView] Loaded galaxies:', galaxies.length);
  } catch(e) {
    console.error('galaxies load', e);
  }

  try {
    openClusters = await (await fetch('/static/open_clusters.json')).json();
    // ensure RtAsc is float (in hours)
    openClusters = openClusters.map(o => ({
      ...o,
      RtAsc: parseFloat(o.RtAsc),
      Declin: parseFloat(o.Declin),
      Mag: parseFloat(o.Mag),
      Size: parseFloat(o.Size)
    }));
    console.log('[SkyView] Loaded open clusters:', openClusters.length);
  } catch(e) {
    console.error('open clusters load', e);
  }

  // Load new object data
  const [globularData, nebulaData, planetaryData] = await Promise.all([
    fetch('static/globular_clusters.json').then(r=>r.json()),
    fetch('static/nebula.json').then(r=>r.json()),
    fetch('static/planetary_nebula.json').then(r=>r.json())
  ]);
  globularClusters = globularData;
  nebulae = nebulaData;
  planetaryNebulae = planetaryData;
  console.log('[SkyView] Loaded globular:', globularClusters.length, 'nebulae:', nebulae.length, 'planetary:', planetaryNebulae.length);


  // --- Calibration Points ---
  let calPoints = [];
  let calPointHits = [];
  const toggleCalPoints = document.getElementById('toggleCalPoints');

  async function fetchCalPoints() {
    try {
      const resp = await fetch('/cal_points');
      const data = await resp.json();
      calPoints = data.points || [];
      draw();
    } catch (e) {
      console.error('Failed to load calibration points', e);
      calPoints = [];
    }
  }

  if (toggleCalPoints) {
    toggleCalPoints.addEventListener('change', draw);
  }

  // Fetch cal points on load and every 10s
  fetchCalPoints();
  setInterval(fetchCalPoints, 10000);

  // --- Mount Position: fetch and update reticle ---
  // (Removed duplicate/incorrect fetchMount definition)

  // --- Patch draw() to plot cal points ---
  const origDraw = draw;
  draw = function() {
    origDraw();
    if (!toggleCalPoints || !toggleCalPoints.checked) return;
    if (!calPoints.length) return;
    calPointHits = [];
    const effR = baseRadius;
    calPoints.forEach(pt => {
      // Use pt.dec as Alt, pt.ra as Az, but ensure Az is measured from North (0=N, 90=E, 180=S, 270=W)
      // If pt.ra is not in [0,360), wrap it
      // --- Fix: Subtract 180° from azimuth to correct projection ---
      let az = (((pt.ra - 180) % 360) + 360) % 360;
      let alt = pt.dec;
      // Project using altAzToXY (Alt, Az, r)
      const p = altAzToXY(alt, az, effR);
      if (!p) return;
      const isFlipped = prepareScreenSpaceDrawing();
      const x = p.x * dpr * currentVpScale * canvasScale + translateX;
      const y = p.y * dpr * currentVpScale * canvasScale + translateY;
      const r = 13;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.strokeStyle = pt.enabled ? 'yellow' : 'red';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // Crosshair
      ctx.beginPath();
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      ctx.strokeStyle = pt.enabled ? 'yellow' : 'red';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      calPointHits.push({
        ...pt,
        x, y, r: r + 6, // hit area
        screenX: x, screenY: y
      });
    });
  };



  // hide popup only if click is outside both popup and canvas
  document.addEventListener('pointerdown', e=>{
    if (!popup.contains(e.target) && e.target !== canvas) {
      popup.style.display = 'none';
    }
  });

  // top-bar GoTo
  gotoBtn.addEventListener('click', () => {
    const azDeg  = dmsToDeg(azInput.value),
          altDeg = dmsToDeg(altInput.value);
    if (isNaN(azDeg) || isNaN(altDeg)) {
      alert('Enter valid Az/Alt in DDD:MM:SS');
      return;
    }
    fetch('/goto-altaz',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({alt:altDeg,az:azDeg})
    }).then(fetchMount);
  });

  // Move and update redraw button
  // (moved to top for immediate creation)

  // --- Do not move or style the control buttons here; let HTML/CSS handle layout ---
  // Remove tooltip for fullscreenBtn (button removed)
  // (No fullscreenBtn present)

  // --- Button visibility is handled by HTML/CSS and main page JS ---

  // --- Remove tooltips for buttons (desktop) ---
  // Remove any existing tooltip event listeners and do not add new ones
  // (If you want to keep tooltips on mobile, you could check user agent, but here we remove for desktop)
  // No addCustomTooltip calls

  // --- Remove all highlight from Alt/Az textboxes on focus and hover (desktop and mobile) ---
  const style = document.createElement('style');
  style.textContent = `
    #gotoAz:focus, #gotoAlt:focus, #gotoAz:hover, #gotoAlt:hover {
      outline: none !important;
      box-shadow: none !important;
      border: 2px solid red !important;
      background: #111 !important;
      color: #fff !important;
      -webkit-box-shadow: none !important;
      -moz-box-shadow: none !important;
      caret-color: red !important;
    }
    #gotoAz, #gotoAlt {
      outline: none !important;
      box-shadow: none !important;
      border: 2px solid #444 !important;
      background: #111 !important;
      color: #fff !important;
      -webkit-box-shadow: none !important;
      -moz.box-shadow: none !important;
      caret-color: red !important;
      transition: none !important;
    }
    body.night #gotoAz:focus, body.night #gotoAlt:focus, body.night #gotoAz:hover, body.night #gotoAlt:hover {
      outline: none !important;
      box-shadow: none !important;
      border: 2px solid red !important;
      background: #111 !important;
      color: #fff !important;
      -webkit-box-shadow: none !important;
      -moz.box-shadow: none !important;
      caret-color: red !important;
    }
    body.night #gotoAz, body.night #gotoAlt {
      outline: none !important;
      box-shadow: none !important;
      border: 2px solid #444 !important;
      background: #111 !important;
      color: #fff !important;
      -webkit-box-shadow: none !important;
      -moz.box-shadow: none !important;
      caret-color: red !important;
      transition: none !important;
    }
  `;
  document.head.appendChild(style);

  // --- View toggle initialization ---
  // IDs of all toggles
  const toggleIds = [
    'toggleStars',
    'toggleConst',
    'toggleConstLabels',
    'toggleGal',
    'toggleOpen',
    'toggleGlobular',
    'toggleNebula',
    'togglePlanetary',
    'toggleCalPoints'
  ];
  // Default state
  const defaultToggles = {
    toggleStars: true,
    toggleConst: true,
    toggleConstLabels: false,
    toggleGal: false,
    toggleOpen: false,
    toggleGlobular: false,
    toggleNebula: false,
    togglePlanetary: false,
    toggleCalPoints: false
  };
  // Restore from localStorage or set defaults
  function initToggles() {
    let restored = false;
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem('skyviewToggles'));
    } catch (e) { saved = null; }
    toggleIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (saved && typeof saved[id] === 'boolean') {
        el.checked = saved[id];
        restored = true;
      } else {
        el.checked = defaultToggles[id];
      }
      // Save on change
      el.addEventListener('change', () => {
        saveToggles();
        draw();
      });
    });
    if (restored) {
      console.log('[SkyView] Restored toggle state from localStorage:', saved);
    } else {
      console.log('[SkyView] Set toggles to default:', defaultToggles);
    }
    draw();
  }
  function saveToggles() {
    const state = {};
    toggleIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) state[id] = el.checked;
    });
    localStorage.setItem('skyviewToggles', JSON.stringify(state));
  }
  initToggles();

  console.log('✅ SkyView renderer ready');
});

// --- Object info box: show only selected attributes ---
function showSelectedAttributes(selected) {
  const attrs = [
    'nameInfo','magInfo','hipInfo','hdInfo','hrInfo','specInfo','colorInfo','distInfo'
  ];
  // Hide all info fields and clear their text
  attrs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
    el.textContent = '';
  });
  if (!selected) return;
  // Name
  if (selected.Name) {
    const el = document.getElementById('nameInfo');
    if (el) {
      el.classList.add('active');
      el.textContent = `Name: ${selected.Name}`;
    }
  }
  // Magnitude
  if (selected.Mag || selected.mag) {
    const el = document.getElementById('magInfo');
    if (el) {
      el.classList.add('active');
      el.textContent = `Mag: ${selected.Mag !== undefined ? selected.Mag : selected.mag}`;
    }
  }
  // HIP
  if (selected.HIPNum || selected.HIP) {
    const el = document.getElementById('hipInfo');
    if (el) {
      el.classList.add('active');
      el.textContent = `HIP: ${selected.HIPNum !== undefined ? selected.HIPNum : selected.HIP}`;
    }
  }
  // HD
  if (selected.HDNum || selected.HD) {
    const el = document.getElementById('hdInfo');
    if (el) {
      el.classList.add('active');
      el.textContent = `HD: ${selected.HDNum !== undefined ? selected.HDNum : selected.HD}`;
    }
  }
  // HR
  if (selected.HRNum || selected.HR) {
    const el = document.getElementById('hrInfo');
    if (el) {
      el.classList.add('active');
      el.textContent = `HR: ${selected.HRNum !== undefined ? selected.HRNum : selected.HR}`;
    }
  }
  // Spectral Type
  if (selected.SpectType) {
    const el = document.getElementById('specInfo');
    if (el) {
      el.classList.add('active');
      el.textContent = `Spectral Type: ${selected.SpectType}`;
    }
  }
  // Color Index
  if (selected.ColorIDX) {
    const el = document.getElementById('colorInfo');
    if (el) {
      el.classList.add('active');
      el.textContent = `Color Index: ${selected.ColorIDX}`;
    }
  }
  // Distance or Size
  if (selected.Distance || selected.Size) {
    const el = document.getElementById('distInfo');
    if (el) {
      el.classList.add('active');
      if (selected.Distance) {
        el.textContent = `Distance: ${selected.Distance}`;
      } else {
        el.textContent = `Size: ${selected.Size}`;
      }
    }
  }
}
