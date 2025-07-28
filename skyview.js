// static/js/skyview.js

// Device Performance Profiling and Adaptive Optimizations
class DeviceProfiler {
  constructor() {
    this.profile = null;
    this.initialized = false;
  }
  
  async detectPerformance() {
    console.log("[PERF] Starting device performance detection...");
    
    // Create test canvas for performance measurement
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 200;
    testCanvas.height = 200;
    const ctx = testCanvas.getContext('2d');
    
    // Performance test - draw 1000 circles
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 200, Math.random() * 200, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    const renderTime = performance.now() - start;
    
    // Gather device info
    const deviceInfo = {
      render_time: renderTime,
      screen_width: screen.width,
      screen_height: screen.height,
      pixel_ratio: window.devicePixelRatio || 1,
      memory: navigator.deviceMemory || 4,
      user_agent: navigator.userAgent
    };
    
    console.log("[PERF] Performance test results:", {
      renderTime: renderTime.toFixed(2) + 'ms',
      screenSize: `${deviceInfo.screen_width}x${deviceInfo.screen_height}`,
      pixelRatio: deviceInfo.pixel_ratio,
      memory: deviceInfo.memory + 'GB'
    });
    
    // Get optimized profile from backend
    try {
      const response = await fetch('/device_profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deviceInfo)
      });
      
      this.profile = await response.json();
      console.log("[PERF] Device tier:", this.profile.tier);
      console.log("[PERF] Applied optimizations:", this.profile);
      
      return this.profile;
    } catch (error) {
      console.warn("[PERF] Failed to get device profile, using defaults:", error);
      // Fallback profile
      this.profile = {
        tier: 'medium',
        max_pixel_ratio: 2,
        throttle_ms: 33,
        max_stars: 3000,
        max_messier: 100,
        max_galaxies: 500,
        max_clusters: 200,
        anti_aliasing: true,
        batch_drawing: true,
        viewport_culling: true,
        lod_enabled: false,
        animation_quality: 'medium',
        constellation_detail: 'high',
        label_density: 'medium'
      };
      return this.profile;
    }
  }
  
  async initialize() {
    if (this.initialized) return this.profile;
    
    await this.detectPerformance();
    this.applyOptimizations();
    this.initialized = true;
    
    return this.profile;
  }
  
  applyOptimizations() {
    if (!this.profile) return;
    
    console.log(`[PERF] Applying ${this.profile.tier}-tier optimizations...`);
    
    // Apply canvas optimizations
    this.optimizeCanvas();
    
    // Apply event throttling
    this.setupEventThrottling();
    
    // Show performance info to user (optional)
    this.showPerformanceInfo();
  }
  
  optimizeCanvas() {
    const canvas = document.getElementById('skyviewCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Apply anti-aliasing setting
    ctx.imageSmoothingEnabled = this.profile.anti_aliasing;
    
    // Force hardware acceleration for all devices
    canvas.style.transform = 'translateZ(0)';
    
    console.log(`[PERF] Canvas optimized: anti-aliasing=${this.profile.anti_aliasing}`);
  }
  
  setupEventThrottling() {
    // Store original event handlers for throttling
    const throttleMs = this.profile.throttle_ms;
    
    // Create throttled versions of event handlers
    const throttle = (func, limit) => {
      let inThrottle;
      return function(...args) {
        if (!inThrottle) {
          func.apply(this, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    };
    
    // Apply throttling to zoom/pan handlers if they exist
    if (window.handleZoom) {
      window.handleZoomThrottled = throttle(window.handleZoom, throttleMs);
    }
    
    if (window.handlePan) {
      window.handlePanThrottled = throttle(window.handlePan, throttleMs);
    }
    
    console.log(`[PERF] Event throttling set to ${throttleMs}ms`);
  }
  
  // Adaptive magnitude limits based on device tier and zoom
  getMagnitudeLimit(objectType, zoom) {
    const tier = this.profile.tier;
    
    switch (objectType) {
      case 'stars':
        if (tier === 'low') {
          return zoom < 2 ? 4 : (zoom < 4 ? 5 : 6);
        } else if (tier === 'medium') {
          return zoom < 2 ? 5 : (zoom < 4 ? 6 : 7);
        } else {
          return zoom < 2 ? 5 : (zoom < 4 ? 6 : (zoom < 6 ? 7 : 8));
        }
      
      case 'galaxies':
        if (tier === 'low') {
          return zoom < 4 ? 12 : (zoom < 6 ? 14 : 16);
        } else if (tier === 'medium') {
          return zoom < 4 ? 14 : (zoom < 6 ? 16 : 18);
        } else {
          return zoom < 4 ? 10 : (zoom < 6 ? 14.5 : (zoom < 8 ? 19 : 20.1));
        }
      
      case 'clusters':
        if (tier === 'low') {
          return zoom < 2 ? 10 : (zoom < 4 ? 12 : 14);
        } else if (tier === 'medium') {
          return zoom < 2 ? 12 : (zoom < 4 ? 14 : 16);
        } else {
          return zoom < 2 ? 8 : (zoom < 4 ? 12 : (zoom < 6 ? 16 : 18));
        }
      
      default:
        return 20; // Conservative default
    }
  }
  
  // Check if object should be drawn based on performance profile
  shouldDrawObject(ra, dec, magnitude, objectType, zoom) {
    // Viewport culling - only skip objects clearly outside view
    if (this.profile.viewport_culling) {
      const p = project(ra, dec, baseRadius);
      if (p.alt <= 0) return false; // Below horizon
      
      // Screen bounds check with generous padding to avoid clipping near edges
      const padding = 100; // Generous padding to ensure no visible objects are culled
      if (p.x < -padding || p.x > canvas.width + padding || 
          p.y < -padding || p.y > canvas.height + padding) {
        return false;
      }
    }
    
    // Magnitude-based culling using existing zoom-dependent limits
    // This preserves the original magnitude progression logic
    const magLimit = this.getMagnitudeLimit(objectType, zoom);
    if (magnitude > magLimit) return false;
    
    return true;
  }
  
  showPerformanceInfo() {
    // Optional: Show performance tier to user
    const tierColors = {
      'high': '#4CAF50',
      'medium': '#FF9800', 
      'low': '#F44336'
    };
    
    const tierNames = {
      'high': 'High Performance',
      'medium': 'Optimized',
      'low': 'Battery Saver'
    };
    
    console.log(`[PERF] Running in ${tierNames[this.profile.tier]} mode`);
  }
}

// Global profiler instance
const deviceProfiler = new DeviceProfiler();

document.addEventListener('DOMContentLoaded', async () => {
  console.log('📡 SkyView init - Initializing adaptive performance optimizations...');
  
  // Initialize device profiler first
  await deviceProfiler.initialize();
  console.log('[PERF] Performance optimizations applied successfully!');

  // how many extra pixels to expand every hit area by (for easier touch)
  // Increase hit area for easier touch selection
  const HIT_PADDING = 18;
  // zoom limits - default zoom (1.0) is now the minimum
  const MIN_SCALE   = 1.0;
  const MAX_SCALE   = 50;

  // Flip state for East/West mirroring
  let isFlipped = localStorage.getItem('flipSkyView') === 'true';

  // Convert degrees → "DDD:MM:SS"
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
  
  // Flip button handler (temporary for testing)
  const flipBtn = document.getElementById('flipBtn');
  if (flipBtn) {
    flipBtn.onclick = function() {
      toggleFlip();
    };
  }

  // Make GoTo button wider for text
  if (gotoBtn) {
    gotoBtn.style.minWidth = '70px';
    gotoBtn.style.width = 'auto';
    gotoBtn.style.padding = '4px 18px';
    gotoBtn.style.fontSize = '1.1em';
  }

  // Toggle flip function
  function toggleFlip() {
    isFlipped = !isFlipped;
    localStorage.setItem('flipSkyView', isFlipped ? 'true' : 'false');
    draw(); // Redraw with new flip state
  }

  // Data arrays
  let stars        = [];
  let constLines   = [], constFeatures = [];
  let galaxies     = [], galaxyMags = [];
  let openClusters = [];
  let globularClusters = [];
  let nebulae = [];
  let planetaryNebulae = [];
  let messierObjects = [];

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
      { id: 'toggleStarNames', def: true },
      { id: 'toggleConst', def: true },
      { id: 'toggleConstLabels', def: false },
      { id: 'toggleMessierNames', def: true },
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
    'toggleStars','toggleStarNames','toggleConst','toggleConstLabels','toggleMessierNames','toggleGal','toggleOpen','toggleGlobular','toggleNebula','togglePlanetary','toggleCalPoints'
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

  // --- Utility: Determine label positioning based on object type ---
  function getLabelPosition(objectX, objectY, text, objectType, canvasScale) {
    const ctx = canvas.getContext('2d');
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    
    // Even shorter fixed offsets for closer labels and shorter pointer lines
    const offsetX = 2;
    const offsetY = 1.5;
    
    let textX, textY, pointerStartX, pointerStartY;
    
    if (objectType === 'messier') {
      // Messier Objects: always right and below, pointer from first character
      textX = objectX + offsetX;
      textY = objectY + offsetY;
      pointerStartX = textX; // First character position
      pointerStartY = textY;
    } else {
      // Stars: always left and below, pointer from last character
      textX = objectX - offsetX;
      textY = objectY + offsetY;
      // For right-aligned text, the last character is at textX (since text extends leftward)
      pointerStartX = textX; // Last character position for right-aligned text
      pointerStartY = textY;
    }
    
    return {
      textX: textX,
      textY: textY,
      pointerStartX: pointerStartX,
      pointerStartY: pointerStartY,
      pointerEndX: objectX,
      pointerEndY: objectY
    };
  }

  // --- Utility: Draw label with appropriate positioning and pointer line ---
  function drawLabelWithPointer(text, objectX, objectY, objectType, color, canvasScale) {
    const pos = getLabelPosition(objectX, objectY, text, objectType, canvasScale);
    
    // Set text alignment based on object type
    ctx.save();
    if (objectType === 'messier') {
      // Right side positioning: left-align text
      ctx.textAlign = 'left';
    } else {
      // Left side positioning: right-align text  
      ctx.textAlign = 'right';
    }
    ctx.textBaseline = 'top';
    
    // Draw pointer line with consistent thickness
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.3, 1.0 / canvasScale);
    
    ctx.beginPath();
    ctx.moveTo(pos.pointerStartX, pos.pointerStartY);
    ctx.lineTo(pos.pointerEndX, pos.pointerEndY);
    ctx.stroke();
    
    // Draw text
    drawFlippableText(text, pos.textX, pos.textY);
    ctx.restore();
  }

  // --- Utility: Convert pointer event to canvas pixel coordinates (untransformed) ---
  function transformEvent(e) {
    // Returns {mx, my} in canvas pixel coordinates (screen space)
    const rect = canvas.getBoundingClientRect();
    // Scale mouse/touch position to canvas pixel space
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    
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
            popup.style.display = 'none';
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

  // Pan and pinch handling with adaptive throttling
  const handlePointerMove = (e) => {
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
      // pan
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      translateX = panOrigX + dx;
      translateY = panOrigY + dy;
      draw();
    }
  };

  // Apply adaptive throttling for touch/pan events
  let panTimeout;
  const throttledPointerMove = (e) => {
    if (panTimeout) {
      // Update pointer data but don't redraw yet
      if(pointers[e.pointerId]) {
        pointers[e.pointerId] = e;
      }
      return;
    }
    panTimeout = setTimeout(() => {
      panTimeout = null;
    }, throttleMs);
    handlePointerMove(e);
  };

  canvas.addEventListener('pointermove', throttledPointerMove);

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

  // Wheel-zoom (desktop) - with adaptive throttling
  const handleWheel = (e) => {
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
  };

  // Apply adaptive throttling based on device performance
  const throttleMs = deviceProfiler.profile ? deviceProfiler.profile.throttle_ms : 16;
  let wheelTimeout;
  const throttledWheel = (e) => {
    if (wheelTimeout) return;
    wheelTimeout = setTimeout(() => {
      wheelTimeout = null;
    }, throttleMs);
    handleWheel(e);
  };

  canvas.addEventListener('wheel', throttledWheel, { passive: false });

  // Helper function to get current zoom level (used by device profiler)
  window.getCurrentZoom = function() {
    return canvasScale;
  };

  // Drawing helpers
  // If you need to re-render the handpad/buttons after certain actions, call renderHandpadAndActions() again.
  function drawGrid(r){
    ctx.strokeStyle = '#888'; ctx.lineWidth = 2 / canvasScale; // gray border
    ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI); ctx.stroke();
    
    // Add altitude lines (radial lines from center to edge) - dashed
    ctx.setLineDash([4,4]);
    ctx.strokeStyle = '#666'; 
    ctx.lineWidth = 0.5 / canvasScale;
    // Draw lines every 22.5 degrees (doubled from 45 degrees)
    for (let az = 0; az < 360; az += 22.5) {
      const ang = (az + 180) * Math.PI / 180; // Rotate coordinate system
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * Math.sin(ang), cy - r * Math.cos(ang));
      ctx.stroke();
    }
    
    // Altitude circles (concentric circles for elevation angles)
    [30,60].forEach(a=>{
      const rr=(90-a)/90*r;
      ctx.lineWidth = 0.7 / canvasScale; // dashed grid lines narrower
      ctx.strokeStyle = '#888'; // gray dashed
      ctx.beginPath(); ctx.arc(cx,cy,rr,0,2*Math.PI); ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  // Draw NSEW labels outside the projection (called before clipping)
  function drawNSEWLabels(r) {
    ctx.fillStyle = 'white';
    ctx.font = `${Math.max(14,r*0.05)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    
    // Position NSEW labels very close to the circle border
    const labelOffset = Math.max(8, r*0.03); // Even closer to circle
    
    drawFlippableText('N', cx, cy-r-labelOffset);
    drawFlippableText('S', cx, cy+r+labelOffset);
    // When flipped, E and W swap positions AND labels
    if (isFlipped) {
      drawFlippableText('W', cx-r-labelOffset, cy);
      drawFlippableText('E', cx+r+labelOffset, cy);
    } else {
      drawFlippableText('W', cx-r-labelOffset, cy);
      drawFlippableText('E', cx+r+labelOffset, cy);
    }
  }

  // Parse RA string "HH:MM:SS" to decimal hours
  function parseRA(raStr) {
    const parts = raStr.split(':').map(parseFloat);
    return parts[0] + parts[1]/60 + parts[2]/3600;
  }

  // Parse Dec string "+DD:MM:SS" to decimal degrees
  function parseDec(decStr) {
    const sign = decStr.startsWith('-') ? -1 : 1;
    const parts = decStr.replace(/^[+-]/, '').split(':').map(parseFloat);
    return sign * (parts[0] + parts[1]/60 + parts[2]/3600);
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

  // Helper function to draw text that remains readable when flipped
  function drawFlippableText(text, x, y) {
    if (isFlipped) {
      ctx.save();
      // When flipped, change alignment to connect upper-left corner
      const originalAlign = ctx.textAlign;
      const originalBaseline = ctx.textBaseline;
      ctx.textAlign = originalAlign === 'left' ? 'right' : 'left';
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.fillText(text, 0, 0);
      ctx.textAlign = originalAlign;
      ctx.textBaseline = originalBaseline;
      ctx.restore();
    } else {
      ctx.fillText(text, x, y);
    }
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

  function draw(){
    // Debug: log mountPos before drawing reticle
    console.log('[SkyView] draw() called, mountPos:', mountPos);
    console.log('[SkyView] draw() called');
    console.log('[SkyView] Canvas size:', canvas.width, 'x', canvas.height, 'CSS:', canvas.style.width, 'x', canvas.style.height, 'dpr:', dpr, 'canvasScale:', canvasScale, 'translateX:', translateX, 'translateY:', translateY, 'currentVpScale:', currentVpScale);
    // clear
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.restore();

    // apply pan & zoom
    ctx.resetTransform();
    ctx.translate(translateX, translateY);
    ctx.scale(dpr * currentVpScale * canvasScale, dpr * currentVpScale * canvasScale);

    // Apply horizontal flip if enabled
    if (isFlipped) {
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
    }

    const effR = baseRadius;
    
    // Draw NSEW labels BEFORE clipping to ensure they're visible
    drawNSEWLabels(effR);
    
    ctx.save();
    ctx.beginPath(); ctx.arc(cx,cy,effR,0,2*Math.PI); ctx.clip();

    drawGrid(effR);

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
      ctx.font=`${Math.max(2, 10/(canvasScale * canvasScale))}px sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      constFeatures.forEach(f=>{
        let pts=[]; const g=f.geometry;
        if(g.type==='MultiLineString') g.coordinates.forEach(l=>pts.push(...l));
        else if(g.type==='LineString') pts=g.coordinates;
        const ppts=pts.map(p=>project(p[0]/15,p[1],effR)).filter(p=>p.alt>0);
        if(!ppts.length) return;
        const avgX=ppts.reduce((s,p)=>s+p.x,0)/ppts.length;
        const avgY=ppts.reduce((s,p)=>s+p.y,0)/ppts.length;
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
      
      // Adaptive magnitude limit based on device performance (preserves original zoom progression)
      const magLimit = deviceProfiler.getMagnitudeLimit('stars', canvasScale);
      console.log(`[PERF] Star rendering - magLimit: ${magLimit}, canvasScale: ${canvasScale}`);
      
      // Filter stars using magnitude and viewport culling only (no count limiting)
      let drawnStars = 0;
      
      // Batch drawing for better performance
      ctx.save();
      stars.forEach(s=>{
        if (s.Mag >= magLimit) return;
        if (!deviceProfiler.shouldDrawObject(s.RtAsc, s.Declin, s.Mag, 'stars', canvasScale)) return;
        
        const p=project(s.RtAsc,s.Declin,effR);
        if(p.alt<=0) return;
        
        drawnStars++;
        
        // --- Discrete star sizes by magnitude, 5x area per step ---
        const minRadius = 1.2;
        const areaStep = 1.5;
        let bin = Math.floor(Math.max(0, Math.min(7, s.Mag < 2 ? 0 : Math.floor(s.Mag - 1))));
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
        ctx.setTransform(1,0,0,1,0,0); // reset transform to draw icon in screen space
        
        // Manually apply the same transformation sequence as the main canvas
        let x = p.x * dpr * currentVpScale * canvasScale;
        let y = p.y * dpr * currentVpScale * canvasScale;
        
        if (isFlipped) {
          x = x - translateX;
          y = y + translateY;
        } else {
          x = x + translateX;
          y = y + translateY;
        }
        
        if (isFlipped) {
          const canvasCenterX = cx * dpr * currentVpScale * canvasScale;
          x = canvasCenterX + (canvasCenterX - x);
        }
        
        const starX = x;
        const starY = y;
        
        ctx.beginPath(); ctx.arc(starX, starY, sz, 0, 2*Math.PI); ctx.fillStyle = color; ctx.fill();
        ctx.restore();
        
        const hitR = Math.max(sz, 12);
        starHits.push({
          ...p,
          r: hitR,
          ...s,
          altDeg: p.alt,
          azDeg: (p.az + 180) % 360,
          screenX: starX,
          screenY: starY
        });
      });
      ctx.restore();
      
      console.log(`[PERF] Drew ${drawnStars}/${stars.length} stars (magnitude filtered, no count limits)`);
    }

    // --- Named Stars ---
    if(stars && stars.length > 0) {
      console.log('[SkyView] Drawing named stars, canvasScale:', canvasScale);
      ctx.save();
      ctx.fillStyle='rgba(255,255,255,0.9)'; // White for star names (different from Messier purple)
      // Use same scaling pattern as constellation labels - account for canvas scaling
      ctx.font=`${Math.max(2, 8/(canvasScale * canvasScale))}px sans-serif`;
      ctx.textAlign='right'; ctx.textBaseline='top'; // Right-align so last letter connects to line
      
      // Determine visibility threshold based on zoom level and magnitude
      let magThreshold;
      if (canvasScale < 1.5) {
        magThreshold = 2.5; // Show only very bright named stars when zoomed out
      } else if (canvasScale < 3.0) {
        magThreshold = 3.5; // Show brighter named stars at medium zoom
      } else if (canvasScale < 5.0) {
        magThreshold = 4.5; // Show more named stars when zoomed in
      } else {
        magThreshold = 6.0; // Show most named stars at high zoom
      }
      
      console.log('[SkyView] Star name magnitude threshold:', magThreshold);
      let namedStarCount = 0;
      
      // Check if star names toggle is enabled
      const toggleStarNames = document.getElementById('toggleStarNames');
      if (toggleStarNames && toggleStarNames.checked) {
        stars.forEach(s => {
          if (s.Name && s.Name !== 'NoName' && s.Mag <= magThreshold) {
            const p = project(s.RtAsc, s.Declin, effR);
            if (p.alt > 0) { // Only draw if above horizon
              // Use new positioning system
              drawLabelWithPointer(s.Name, p.x, p.y, 'star', 'rgba(255,255,255,0.7)', canvasScale);
              namedStarCount++;
            }
          }
        });
      }
      
      console.log('[SkyView] Drew', namedStarCount, 'named stars above horizon');
      ctx.restore();
    }

    // --- Messier Objects ---
    const toggleMessierNames = document.getElementById('toggleMessierNames');
    if(messierObjects && messierObjects.length > 0 && toggleMessierNames && toggleMessierNames.checked) {
      console.log('[SkyView] Drawing Messier objects:', messierObjects.length, 'canvasScale:', canvasScale);
      ctx.save();
      ctx.fillStyle='rgba(224,195,252,0.8)'; // Same color as constellation labels but slightly transparent
      // Fixed base size that accounts for canvas scaling
      ctx.font=`${Math.max(2, 10/(canvasScale * canvasScale))}px sans-serif`;
      // Text alignment will be set in drawLabelWithPointer function
      
      // Determine visibility threshold based on zoom level (show labels earlier)
      let magThreshold;
      if (canvasScale < 1.2) {
        magThreshold = 5.0; // Show more objects earlier when zoomed out
      } else if (canvasScale < 2.0) {
        magThreshold = 7.0; // Show even more objects at medium zoom
      } else {
        magThreshold = 9.0; // Show all objects when zoomed in
      }
      
      console.log('[SkyView] Magnitude threshold:', magThreshold);
      let visibleCount = 0;
      
      messierObjects.forEach(obj => {
        if (obj.mag <= magThreshold) {
          // Use corrected coordinates if available, otherwise parse from original strings
          let ra, dec;
          if (obj.ra_corrected_hours !== undefined && obj.dec_corrected_degrees !== undefined) {
            ra = obj.ra_corrected_hours;
            dec = obj.dec_corrected_degrees;
          } else {
            ra = parseRA(obj.ra);
            dec = parseDec(obj.dec);
          }
          
          const p = project(ra, dec, effR);
          if (p.alt > 0) { // Only draw if above horizon
            // Use new positioning system for Messier objects
            drawLabelWithPointer(obj.name, p.x, p.y, 'messier', 'rgba(224,195,252,0.9)', canvasScale);
            visibleCount++;
          }
        }
      });
      
      console.log('[SkyView] Drew', visibleCount, 'Messier objects above horizon');
      ctx.restore();
    } else {
      console.log('[SkyView] No Messier objects available:', messierObjects);
    }

    // --- galaxies ---
    galaxyHits=[]; if(toggleGal.checked){
      console.log('[SkyView] Drawing galaxies:', galaxies.length);
      if (galaxies.length > 0) {
        let g = galaxies[0];
        let p = project(g.RtAsc, g.Declin, effR);
        console.log('[SkyView] Sample projected galaxy:', p, 'Mag:', g.mag, 'RA:', g.RtAsc, 'Dec:', g.Declin);
      }
      
      // Adaptive magnitude limit based on device performance (preserves zoom progression)
      const galLimit = deviceProfiler.getMagnitudeLimit('galaxies', canvasScale);
      console.log(`[PERF] Galaxy rendering - magLimit: ${galLimit}`);
      
      let drawnGalaxies = 0;
      
      // Galaxy magnitude bins: 8 bins, 2.2–20, largest for <10, then step up
      const galMinRadius = 2.2;
      const galAreaStep = 1.5;
      
      galaxies.forEach(g=>{
        if (g.mag >= galLimit) return;
        if (!deviceProfiler.shouldDrawObject(g.RtAsc, g.Declin, g.mag, 'galaxies', canvasScale)) return;
        
        const p=project(g.RtAsc,g.Declin,effR);
        if(p.alt<=0) return;
        
        drawnGalaxies++;
        
        // Bin index: 0 = brightest (<10), 1 = 10–12.25, ..., 7 = 19–20
        let bin = 0;
        if (g.mag >= 10) bin = Math.min(7, Math.floor((g.mag - 10) / ((20 - 10) / 7)) + 1);
        const area = Math.PI * galMinRadius * galMinRadius * Math.pow(galAreaStep, 7 - bin);
        const maj = Math.sqrt(area / Math.PI);
        const min = maj / 2;
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
        ctx.strokeStyle = 'rgb(255,64,64)'; // fully opaque red
        ctx.lineWidth = 1.2 + Math.min((canvasScale - 1) * 0.7, 2.2); // gentler scaling
        
        // Manually apply the same transformation sequence as the main canvas
        let x = p.x * dpr * currentVpScale * canvasScale;
        let y = p.y * dpr * currentVpScale * canvasScale;
        
        if (isFlipped) {
          x = x - translateX;
          y = y + translateY;
        } else {
          x = x + translateX;
          y = y + translateY;
        }
        
        if (isFlipped) {
          const canvasCenterX = cx * dpr * currentVpScale * canvasScale;
          x = canvasCenterX + (canvasCenterX - x);
        }
        
        const galX = x;
        const galY = y;
        
        ctx.beginPath(); ctx.ellipse(galX, galY, maj, min, 0, 0, 2*Math.PI); ctx.stroke();
        ctx.restore();
        galaxyHits.push({
          ...p,
          r: maj,
          ...g,
          altDeg: p.alt,
          azDeg: (p.az + 180) % 360,
          screenX: galX,
          screenY: galY
        });
      });
      
      console.log(`[PERF] Drew ${drawnGalaxies}/${galaxies.length} galaxies (magnitude filtered, no count limits)`);
    }

    // --- open clusters ---
    openHits=[]; if(toggleOpen.checked){
      console.log('[SkyView] Drawing open clusters:', openClusters.length);
      if (openClusters.length > 0) {
        let o = openClusters[0];
        let p = project(o.RtAsc, o.Declin, effR);
        console.log('[SkyView] Sample projected open cluster:', p, 'Mag:', o.Mag, 'RA:', o.RtAsc, 'Dec:', o.Declin);
      }
      
      // Adaptive magnitude limit based on device performance (preserves zoom progression)
      const magLimit = deviceProfiler.getMagnitudeLimit('clusters', canvasScale);
      let drawnClusters = 0;
      
      console.log(`[PERF] Drawing open clusters with magLimit: ${magLimit}`);
      
      ctx.strokeStyle='rgb(100,100,255)'; // fully opaque blue
      openClusters.forEach(o=>{
        if (o.Mag >= magLimit) return;
        if (!deviceProfiler.shouldDrawObject(o.RtAsc, o.Declin, o.Mag, 'clusters', canvasScale)) return;
        
        const p=project(o.RtAsc,o.Declin,effR);
        if(p.alt<=0) return;
        
        drawnClusters++;
        
        const cl=Math.max(1,Math.min(25,o.Size));
        const frac=(cl-1)/(25-1);
        const pix=4+frac*(12-4);
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
        ctx.lineWidth = 1.2 + Math.min((canvasScale - 1) * 0.7, 2.2); // gentler scaling
        
        // Manually apply the same transformation sequence as the main canvas
        let x = p.x * dpr * currentVpScale * canvasScale;
        let y = p.y * dpr * currentVpScale * canvasScale;
        
        if (isFlipped) {
          x = x - translateX;
          y = y + translateY;
        } else {
          x = x + translateX;
          y = y + translateY;
        }
        
        if (isFlipped) {
          const canvasCenterX = cx * dpr * currentVpScale * canvasScale;
          x = canvasCenterX + (canvasCenterX - x);
        }
        
        const openX = x;
        const openY = y;
        
        ctx.beginPath(); ctx.arc(openX, openY, pix, 0, 2*Math.PI); ctx.stroke();
        ctx.restore();
        openHits.push({
          ...p,
          r: pix,
          ...o,
          altDeg: p.alt,
          azDeg: (p.az + 180) % 360,
          screenX: openX,
          screenY: openY
        });
      });
      
      console.log(`[PERF] Drew ${drawnClusters}/${openClusters.length} open clusters (magnitude filtered, no count limits)`);
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
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
        ctx.lineWidth = 1.1 + Math.min((canvasScale - 1) * 0.6, 1.8); // slightly thinner
        
        // Manually apply the same transformation sequence as the main canvas
        // 1. Scale to canvas pixel coordinates
        let x = p.x * dpr * currentVpScale * canvasScale;
        let y = p.y * dpr * currentVpScale * canvasScale;
        
        // 2. Apply translation (but flip translateX if we're in flipped mode)
        if (isFlipped) {
          x = x - translateX; // Reverse translateX for flipped mode
          y = y + translateY;
        } else {
          x = x + translateX;
          y = y + translateY;
        }
        
        // 3. Apply flip transformation around center if needed (same as main canvas)
        if (isFlipped) {
          const canvasCenterX = cx * dpr * currentVpScale * canvasScale; // Include canvasScale for zoom
          x = canvasCenterX + (canvasCenterX - x); // equivalent to translate(cx,0), scale(-1,1), translate(-cx,0)
        }
        
        const globX = x;
        const globY = y;
        
        ctx.beginPath(); ctx.arc(globX, globY, r, 0, 2*Math.PI); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(globX - r*0.7, globY - r*0.7);
        ctx.lineTo(globX + r*0.7, globY + r*0.7);
        ctx.moveTo(globX + r*0.7, globY - r*0.7);
        ctx.lineTo(globX - r*0.7, globY + r*0.7);
        ctx.stroke();
        ctx.restore();
        globularHits.push({
          ...p,
          r: r,
          ...g,
          Mag: mag, // ensure Mag is always present and numeric
          altDeg: p.alt,
          azDeg: (p.az + 180) % 360,
          screenX: globX,
          screenY: globY
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
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
        ctx.lineWidth = 1.1 + Math.min((canvasScale - 1) * 0.6, 1.8);
        
        // Manually apply the same transformation sequence as the main canvas
        // 1. Scale to canvas pixel coordinates
        let x = p.x * dpr * currentVpScale * canvasScale;
        let y = p.y * dpr * currentVpScale * canvasScale;
        
        // 2. Apply translation (but flip translateX if we're in flipped mode)
        if (isFlipped) {
          x = x - translateX; // Reverse translateX for flipped mode
          y = y + translateY;
        } else {
          x = x + translateX;
          y = y + translateY;
        }
        
        // 3. Apply flip transformation around center if needed (same as main canvas)
        if (isFlipped) {
          const canvasCenterX = cx * dpr * currentVpScale * canvasScale; // Include canvasScale for zoom
          x = canvasCenterX + (canvasCenterX - x); // equivalent to translate(cx,0), scale(-1,1), translate(-cx,0)
        }
        
        const nebX = x;
        const nebY = y;
        
        ctx.beginPath(); ctx.rect(nebX-sz/2, nebY-sz/2, sz, sz); ctx.stroke();
        ctx.restore();
        nebulaHits.push({
          ...p,
          r: sz/1.5,
          ...n,
          Mag: mag,
          altDeg: p.alt,
          azDeg: (p.az + 180) % 360,
          screenX: nebX,
          screenY: nebY
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
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
        ctx.lineWidth = 1.1 + Math.min((canvasScale - 1) * 0.6, 1.8);
        
        // Manually apply the same transformation sequence as the main canvas
        // 1. Scale to canvas pixel coordinates
        let x = p.x * dpr * currentVpScale * canvasScale;
        let y = p.y * dpr * currentVpScale * canvasScale;
        
        // 2. Apply translation (but flip translateX if we're in flipped mode)
        if (isFlipped) {
          x = x - translateX; // Reverse translateX for flipped mode
          y = y + translateY;
        } else {
          x = x + translateX;
          y = y + translateY;
        }
        
        // 3. Apply flip transformation around center if needed (same as main canvas)
        if (isFlipped) {
          const canvasCenterX = cx * dpr * currentVpScale * canvasScale; // Include canvasScale for zoom
          x = canvasCenterX + (canvasCenterX - x); // equivalent to translate(cx,0), scale(-1,1), translate(-cx,0)
        }
        
        const planX = x;
        const planY = y;
        
        ctx.beginPath();
        ctx.moveTo(planX, planY - sz/1.2);
        ctx.lineTo(planX - sz/1.2, planY + sz/1.2);
        ctx.lineTo(planX + sz/1.2, planY + sz/1.2);
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
          screenX: planX,
          screenY: planY
        });
      });
    }

    // --- reticle ---
    if (mountPos.alt !== null && mountPos.az !== null) {
      const azForDraw = (mountPos.az + 180) % 360;
      const p = altAzToXY(mountPos.alt, azForDraw, effR);
      // Reticle radius fixed in screen space (like orange crosshair)
      const reticleRadius = 18; // px, visually matches orange crosshair
      
      // Manually apply the same transformation sequence as the main canvas
      // 1. Scale to canvas pixel coordinates
      let x = p.x * dpr * currentVpScale * canvasScale;
      let y = p.y * dpr * currentVpScale * canvasScale;
      
      // 2. Apply translation (but flip translateX if we're in flipped mode)
      if (isFlipped) {
        x = x - translateX; // Reverse translateX for flipped mode
        y = y + translateY;
      } else {
        x = x + translateX;
        y = y + translateY;
      }
      
      // 3. Apply flip transformation around center if needed (same as main canvas)
      if (isFlipped) {
        const canvasCenterX = cx * dpr * currentVpScale * canvasScale; // Include canvasScale for zoom
        x = canvasCenterX + (canvasCenterX - x); // equivalent to translate(cx,0), scale(-1,1), translate(-cx,0)
      }
      
      const screenX = x;
      const screenY = y;
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
      ctx.save();
      ctx.setTransform(1,0,0,1,0,0);
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
      
      // Manually apply the same transformation sequence as the main canvas
      // 1. Scale to canvas pixel coordinates
      let x = p.x * dpr * currentVpScale * canvasScale;
      let y = p.y * dpr * currentVpScale * canvasScale;
      
      // 2. Apply translation (but flip translateX if we're in flipped mode)
      if (isFlipped) {
        x = x - translateX; // Reverse translateX for flipped mode
        y = y + translateY;
      } else {
        x = x + translateX;
        y = y + translateY;
      }
      
      // 3. Apply flip transformation around center if needed (same as main canvas)
      if (isFlipped) {
        const canvasCenterX = cx * dpr * currentVpScale * canvasScale; // Include canvasScale for zoom
        x = canvasCenterX + (canvasCenterX - x); // equivalent to translate(cx,0), scale(-1,1), translate(-cx,0)
      }
      
      const screenX = x;
      const screenY = y;
      
      const r = selectedObject.r || 12;
      ctx.save();
      ctx.setTransform(1,0,0,1,0,0);
      // Orange circle only (no crosshair)
      ctx.beginPath();
      ctx.arc(screenX, screenY, r + 6, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(255,120,30,0.75)'; // dark orange
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // restore sky circle clip before overlay

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
    stars = await (await fetch('/corrected_stars.json')).json();
    console.log('[SkyView] Loaded stars:', stars.length);
  } catch(e) {
    console.error('stars load', e);
  }

  try {
    const geo = await (await fetch('/corrected_constellations.json')).json();
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
    const resp = await fetch('/corrected_galaxies.json');
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
    openClusters = await (await fetch('/corrected_open_clusters.json')).json();
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
  try {
    const [globularData, nebulaData, planetaryData] = await Promise.all([
      fetch('/corrected_globular_clusters.json').then(r=>r.json()),
      fetch('/corrected_nebula.json').then(r=>r.json()),
      fetch('/corrected_planetary_nebula.json').then(r=>r.json())
    ]);
    globularClusters = globularData;
    nebulae = nebulaData;
    planetaryNebulae = planetaryData;
    console.log('[SkyView] Loaded globular:', globularClusters.length, 'nebulae:', nebulae.length, 'planetary:', planetaryNebulae.length);
  } catch(e) {
    console.error('Error loading object data:', e);
    globularClusters = [];
    nebulae = [];
    planetaryNebulae = [];
  }

  // Load Messier objects separately with error handling
  try {
    messierObjects = await (await fetch('/corrected_messier.json')).json();
    console.log('[SkyView] Loaded Messier objects:', messierObjects.length);
  } catch(e) {
    console.error('Failed to load messier.json:', e);
    messierObjects = [];
  }


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
      ctx.save();
      ctx.setTransform(1,0,0,1,0,0);
      
      // Manually apply the same transformation sequence as the main canvas
      // 1. Scale to canvas pixel coordinates
      let x = p.x * dpr * currentVpScale * canvasScale;
      let y = p.y * dpr * currentVpScale * canvasScale;
      
      // 2. Apply translation (but flip translateX if we're in flipped mode)
      if (isFlipped) {
        x = x - translateX; // Reverse translateX for flipped mode
        y = y + translateY;
      } else {
        x = x + translateX;
        y = y + translateY;
      }
      
      // 3. Apply flip transformation around center if needed (same as main canvas)
      if (isFlipped) {
        const canvasCenterX = cx * dpr * currentVpScale * canvasScale; // Include canvasScale for zoom
        x = canvasCenterX + (canvasCenterX - x); // equivalent to translate(cx,0), scale(-1,1), translate(-cx,0)
      }
      
      const finalX = x;
      const finalY = y;
      
      const r = 13;
      ctx.beginPath();
      ctx.arc(finalX, finalY, r, 0, 2 * Math.PI);
      ctx.strokeStyle = pt.enabled ? 'yellow' : 'red';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // Crosshair
      ctx.beginPath();
      ctx.moveTo(finalX - r, finalY);
      ctx.lineTo(finalX + r, finalY);
      ctx.moveTo(finalX, finalY - r);
      ctx.lineTo(finalX, finalY + r);
      ctx.strokeStyle = pt.enabled ? 'yellow' : 'red';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      calPointHits.push({
        ...pt,
        x: finalX, y: finalY, r: r + 6, // hit area
        screenX: finalX, screenY: finalY
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
      -moz.box.shadow: none !important;
      caret-color: red !important;
      transition: none !important;
    }
  `;
  document.head.appendChild(style);

  // --- View toggle initialization ---
  // IDs of all toggles
  const toggleIds = [
    'toggleStars',
    'toggleStarNames',
    'toggleConst',
    'toggleConstLabels',
    'toggleMessierNames',
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
    toggleStarNames: true,
    toggleConst: true,
    toggleConstLabels: false,
    toggleMessierNames: true,
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
