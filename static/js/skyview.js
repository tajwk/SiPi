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
  // Note: This method will be moved inside main scope where project() is accessible
  shouldDrawObject(ra, dec, magnitude, objectType, zoom) {
    // This method is moved to main scope - see below
    return true; // Placeholder
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
  
  // Test basic connectivity first
  try {
    console.log('[SkyView] Testing server connectivity...');
    const testResponse = await fetch('/status');
    console.log('[SkyView] Connectivity test:', testResponse.status, testResponse.statusText);
    if (!testResponse.ok) {
      console.warn('[SkyView] Server connectivity issue detected');
    }
  } catch (e) {
    console.error('[SkyView] Connectivity test failed:', e);
  }
  
  // Initialize device profiler first
  await deviceProfiler.initialize();
  console.log('[PERF] Performance optimizations applied successfully!');

  // how many extra pixels to expand every hit area by (for easier touch)
  // Increase hit area for easier touch selection
  const HIT_PADDING = 18;
  // zoom limits - default zoom (1.0) is now the minimum
  const MIN_SCALE   = 1.0;
  const MAX_SCALE   = 200;

  // Flip state for East/West mirroring
  let isFlipped = localStorage.getItem('flipSkyView') === 'true';

  // Guard to prevent overlapping draws
  let isDrawing = false;

  // --- Label Collision Detection System ---
  var placedLabels = []; // Array to track all placed label bounding boxes
  
  // Reset collision tracking for each draw cycle
  function resetLabelCollisions() {
    placedLabels = [];
  }
  
  // Check if a text bounding box collides with any existing labels
  function checkLabelCollision(textX, textY, textWidth, textHeight, objectType, padding = 2) {
    // Account for center-aligned text (drawFlippableText uses center alignment)
    const newBox = {
      left: textX - textWidth/2 - padding,
      right: textX + textWidth/2 + padding,
      top: textY - textHeight/2 - padding,
      bottom: textY + textHeight/2 + padding
    };
    
    // Define object type priority (lower number = higher priority)
    const typePriority = {
      'star': 1,      // Highest priority
      'messier': 2,   // Medium priority  
      'constellation': 3  // Lowest priority
    };
    
    const currentPriority = typePriority[objectType] || 3;
    
    // Dynamic padding based on object type and zoom level
    let effectivePadding;
    if (objectType === 'constellation') {
      // Constellations can be more aggressive about overlapping
      effectivePadding = padding * 0.5; // 50% less padding for constellations
    } else if (objectType === 'messier') {
      // Moderate padding for messier objects
      effectivePadding = padding * 0.8; // 20% less padding for messier
    } else {
      // Stars get full padding (highest priority)
      effectivePadding = padding;
    }
    
    for (let existing of placedLabels) {
      // Check if boxes overlap with effective padding
      const adjustedNewBox = {
        left: textX - textWidth/2 - effectivePadding,
        right: textX + textWidth/2 + effectivePadding,
        top: textY - textHeight/2 - effectivePadding,
        bottom: textY + textHeight/2 + effectivePadding
      };
      
      if (adjustedNewBox.left < existing.right && 
          adjustedNewBox.right > existing.left && 
          adjustedNewBox.top < existing.bottom && 
          adjustedNewBox.bottom > existing.top) {
        
        const existingPriority = typePriority[existing.objectType] || 3;
        
        // Fixed priority logic: Higher priority objects (lower number) can displace lower priority ones
        // But for now, we'll try to find a different position rather than displacing
        if (currentPriority > existingPriority) {
          return true; // Current has lower priority - can't place here, collision detected
        } else if (currentPriority < existingPriority) {
          // Current has higher priority - could displace, but try other positions first
          return true; // For now, still try other positions to avoid complexity
        } else {
          // Same priority - avoid collision
          return true; // Collision detected - can't place here
        }
      }
    }
    return false; // No collision
  }
  
  // Register a placed label's bounding box
  function registerLabelPlacement(textX, textY, textWidth, textHeight, objectType) {
    // Account for center-aligned text (drawFlippableText uses center alignment)
    placedLabels.push({
      left: textX - textWidth/2,
      right: textX + textWidth/2,
      top: textY - textHeight/2,
      bottom: textY + textHeight/2,
      objectType: objectType
    });
  }

  // --- Enhanced Label Positioning with Collision Detection ---
  function getLabelPositionWithCollisionDetection(objectX, objectY, text, objectType, canvasScale) {
    const ctx = canvas.getContext('2d');
    
    // Set the correct font BEFORE measuring text
    let fontSize;
    if (objectType === 'messier' || objectType === 'constellation') {
      fontSize = 12 / canvasScale;
    } else {
      fontSize = 10 / canvasScale; // Star font size
    }
    ctx.font = `${fontSize}px sans-serif`;
    
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    
    // Calculate text height based on object type and current zoom
    // Use more accurate height calculation
    const textHeight = fontSize * 1.2; // Account for font ascent/descent
    
    // Define label priority and position options based on object type
    let positions = [];
    // Improved scaling for all zoom levels - ensure minimum separation and scale appropriately
    const baseOffset = Math.max(textHeight * 0.8, Math.min(8, 6 / canvasScale)); // Scale with text size, but have reasonable limits
    
    if (objectType === 'star') {
      // HIGHEST PRIORITY: Stars get the closest positions first
      positions = [
        // Ultra-close primary positions
        { x: objectX + baseOffset, y: objectY + baseOffset, priority: 1 },
        { x: objectX - baseOffset, y: objectY + baseOffset, priority: 1 },
        { x: objectX + baseOffset, y: objectY - baseOffset, priority: 1 },
        { x: objectX - baseOffset, y: objectY - baseOffset, priority: 1 },
        // Close secondary positions
        { x: objectX + baseOffset * 1.2, y: objectY, priority: 2 },
        { x: objectX - baseOffset * 1.2, y: objectY, priority: 2 },
        { x: objectX, y: objectY + baseOffset * 1.2, priority: 2 },
        { x: objectX, y: objectY - baseOffset * 1.2, priority: 2 },
      ];
    } else if (objectType === 'messier') {
      // MEDIUM PRIORITY: Messier objects get slightly more distant options
      positions = [
        // Primary positions
        { x: objectX + baseOffset * 1.1, y: objectY + baseOffset * 1.1, priority: 1 },
        { x: objectX - baseOffset * 1.1, y: objectY + baseOffset * 1.1, priority: 1 },
        { x: objectX + baseOffset * 1.1, y: objectY - baseOffset * 1.1, priority: 1 },
        { x: objectX - baseOffset * 1.1, y: objectY - baseOffset * 1.1, priority: 1 },
        // Secondary positions
        { x: objectX + baseOffset * 1.5, y: objectY, priority: 2 },
        { x: objectX - baseOffset * 1.5, y: objectY, priority: 2 },
        { x: objectX, y: objectY + baseOffset * 1.5, priority: 2 },
        { x: objectX, y: objectY - baseOffset * 1.5, priority: 2 },
        // Tertiary positions (farther out)
        { x: objectX + baseOffset * 2, y: objectY, priority: 3 },
        { x: objectX - baseOffset * 2, y: objectY, priority: 3 },
      ];
    } else if (objectType === 'constellation') {
      // LOWEST PRIORITY: Constellations can be placed much farther away
      // Improved positioning to reduce overlaps with more varied spacing
      positions = [
        // PRIMARY PREFERENCE: Centered below (most natural for constellation names)
        { x: objectX, y: objectY + baseOffset * 1.8, priority: 1 },
        { x: objectX, y: objectY + baseOffset * 2.5, priority: 1 },
        { x: objectX, y: objectY + baseOffset * 3.2, priority: 1 },
        // SECONDARY: Centered above with more spacing
        { x: objectX, y: objectY - baseOffset * 1.8, priority: 2 },
        { x: objectX, y: objectY - baseOffset * 2.5, priority: 2 },
        { x: objectX, y: objectY - baseOffset * 3.2, priority: 2 },
        // TERTIARY: Slightly off-center below/above with increased spacing
        { x: objectX + baseOffset * 0.8, y: objectY + baseOffset * 2, priority: 3 },
        { x: objectX - baseOffset * 0.8, y: objectY + baseOffset * 2, priority: 3 },
        { x: objectX + baseOffset * 0.8, y: objectY - baseOffset * 2, priority: 3 },
        { x: objectX - baseOffset * 0.8, y: objectY - baseOffset * 2, priority: 3 },
        // FALLBACK: Traditional diagonal positions with more spacing
        { x: objectX + baseOffset * 1.8, y: objectY + baseOffset * 1.8, priority: 4 },
        { x: objectX - baseOffset * 1.8, y: objectY + baseOffset * 1.8, priority: 4 },
        { x: objectX + baseOffset * 1.8, y: objectY - baseOffset * 1.8, priority: 4 },
        { x: objectX - baseOffset * 1.8, y: objectY - baseOffset * 1.8, priority: 4 },
        // LAST RESORT: Much farther positions if everything else is blocked
        { x: objectX, y: objectY + baseOffset * 4, priority: 5 },
        { x: objectX, y: objectY - baseOffset * 4, priority: 5 },
        { x: objectX + baseOffset * 3, y: objectY, priority: 5 },
        { x: objectX - baseOffset * 3, y: objectY, priority: 5 },
        // EXTREME FALLBACK: Very distant positions
        { x: objectX + baseOffset * 2.5, y: objectY + baseOffset * 2.5, priority: 6 },
        { x: objectX - baseOffset * 2.5, y: objectY + baseOffset * 2.5, priority: 6 },
        { x: objectX + baseOffset * 2.5, y: objectY - baseOffset * 2.5, priority: 6 },
        { x: objectX - baseOffset * 2.5, y: objectY - baseOffset * 2.5, priority: 6 },
      ];
    }
    
    // Try each position in priority order
    for (let pos of positions) {
      const textX = pos.x;
      const textY = pos.y;
      
      // Check for collision
      if (!checkLabelCollision(textX, textY, textWidth, textHeight, objectType)) {
        // No collision - use this position
        registerLabelPlacement(textX, textY, textWidth, textHeight, objectType);
        return { textX, textY, success: true };
      }
    }
    
    // If all positions collide, use a smarter fallback that scales with text size
    // Still don't register to avoid affecting other collision calculations
    const fallbackOffset = Math.max(textHeight, baseOffset * 1.5);
    let textX, textY;
    
    if (objectType === 'constellation') {
      // For constellations, try a far-below position
      textX = objectX;
      textY = objectY + fallbackOffset * 3;
    } else if (objectType === 'messier') {
      // For messier objects, offset to the right
      textX = objectX + fallbackOffset * 1.5;
      textY = objectY + fallbackOffset;
    } else {
      // For stars, offset to the left
      textX = objectX - fallbackOffset * 1.5;
      textY = objectY + fallbackOffset;
    }
    
    return { textX, textY, success: false };
  }

  // UI Toggle Elements
  const toggleCalPoints = document.getElementById('toggleCalPoints');

  // Convert degrees → "DDD:MM:SS"
  function degToDMS(deg) {
    const isNegative = deg < 0;
    const absDeg = Math.abs(deg);
    const d = Math.floor(absDeg);
    const m = Math.floor((absDeg - d) * 60);
    const s = Math.round(((absDeg - d) * 60 - m) * 60);
    const sign = isNegative ? '-' : '';
    return `${sign}${String(d).padStart(3, '0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  
  // Convert RA degrees → "HH:MM:SS" (RA is in hours, so divide by 15)
  function degToHMS(deg) {
    const hours = deg / 15; // Convert degrees to hours
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    const s = Math.round(((hours - h) * 60 - m) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  
  // Convert decimal HMS (like 9.764188) to HH:MM:SS format  
  function decimalHMStoHMS(decimalHMS) {
    console.log('[SkyView] DEBUG - decimalHMStoHMS input:', decimalHMS);
    const h = Math.floor(decimalHMS);
    const minutesDecimal = (decimalHMS - h) * 60;
    const m = Math.floor(minutesDecimal);
    const s = Math.round((minutesDecimal - m) * 60);
    const result = `${String(h).padStart(2, '0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    console.log('[SkyView] DEBUG - decimalHMStoHMS output:', result, 'from h:', h, 'm:', m, 's:', s);
    return result;
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
  const raInput       = document.getElementById('gotoRA');
  const decInput      = document.getElementById('gotoDec');
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
  
  // Toggle elements
  const toggleStars          = document.getElementById('toggleStars');
  const toggleStarNames      = document.getElementById('toggleStarNames');
  const toggleConst          = document.getElementById('toggleConst');
  const toggleConstLabels    = document.getElementById('toggleConstLabels');
  const toggleMessierNames   = document.getElementById('toggleMessierNames');
  const toggleGal            = document.getElementById('toggleGal');
  const toggleOpen           = document.getElementById('toggleOpen');
  const toggleGlobular       = document.getElementById('toggleGlobular');
  const toggleNebula         = document.getElementById('toggleNebula');
  const togglePlanetary      = document.getElementById('togglePlanetary');
  const toggleSolarSystem    = document.getElementById('toggleSolarSystem');
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
  let solarSystemData = {}; // Solar system objects (planets, sun, moon)

  // Hit-test buffers
  let starHits     = [];
  let galaxyHits   = [];
  let openHits     = [];
  let globularHits = [];
  let nebulaHits   = [];
  let planetaryHits = [];
  let solarSystemHits = []; // Solar system hit detection

  // Performance-based object culling function (moved here to access canvas variables)
  function shouldDrawObject(ra, dec, magnitude, objectType, zoom) {
    if (!deviceProfiler.profile) return true; // No profile yet, draw everything
    
    // Viewport culling - only skip objects clearly outside view
    if (deviceProfiler.profile.viewport_culling) {
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
    const magLimit = deviceProfiler.getMagnitudeLimit(objectType, zoom);
    if (magnitude > magLimit) return false;
    
    return true;
  }

  // Current mount pointing
  let mountPos     = { alt: null, az: null };

  // --- Mount position polling ---
  function parseDMS(dmsString) {
    // Parse formatted DMS string like "045:30:15" or "-12:30:45" to decimal degrees
    if (typeof dmsString === 'number') return dmsString;
    if (typeof dmsString !== 'string') return NaN;
    
    const match = dmsString.match(/^([+-]?)(\d+):(\d+):(\d+)$/);
    if (!match) {
      // Try to parse as plain number if DMS parsing fails
      const num = parseFloat(dmsString);
      return isNaN(num) ? NaN : num;
    }
    
    const sign = match[1] === '-' ? -1 : 1;
    const degrees = parseInt(match[2]);
    const minutes = parseInt(match[3]);
    const seconds = parseInt(match[4]);
    
    return sign * (degrees + minutes/60 + seconds/3600);
  }

  async function fetchMount() {
    try {
      const resp = await fetch('/status');
      if (!resp.ok) throw new Error('Failed to fetch mount position');
      const data = await resp.json();
      
      // Parse DMS formatted strings to decimal degrees
      const alt = parseDMS(data.alt);
      const az = parseDMS(data.az);
      
      if (!isNaN(alt) && !isNaN(az)) {
        mountPos.alt = alt;
        mountPos.az = az;
        console.log('[SkyView] Mount position updated:', mountPos, 'from raw data:', {alt: data.alt, az: data.az});
      } else {
        mountPos.alt = null;
        mountPos.az = null;
        console.warn('[SkyView] Invalid mount position data:', data, 'parsed as:', {alt, az});
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
  setInterval(fetchMount, 2000);  // --- Solar system position polling ---
  async function fetchSolarSystem() {
    try {
      const resp = await fetch('/solar_system');
      if (!resp.ok) throw new Error('Failed to fetch solar system positions');
      const data = await resp.json();
      if (data.error) {
        console.error('[SkyView] Solar system fetch error:', data.error);
        solarSystemData = {};
        return;
      }
      solarSystemData = data;
      console.log('[SkyView] Solar system positions updated:', Object.keys(solarSystemData).length, 'objects');
      console.log('[SkyView] Solar system data details:', data);
      // Log a few sample coordinates
      if (data.sun) console.log('[SkyView] Sun coordinates:', data.sun);
      if (data.moon) console.log('[SkyView] Moon coordinates:', data.moon);
      if (data.mars) console.log('[SkyView] Mars coordinates:', data.mars);
    } catch (e) {
      solarSystemData = {};
      console.error('[SkyView] Error fetching solar system positions:', e);
    }
    draw();
  }

  // Fetch solar system positions on load and every minute (60 seconds)
  fetchSolarSystem();
  // Comment out the interval to stop auto-updates for debugging
  // setInterval(fetchSolarSystem, 60000);

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
      { id: 'toggleCalPoints', def: false },
      { id: 'toggleSolarSystem', def: true }
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
    'toggleStars','toggleStarNames','toggleConst','toggleConstLabels','toggleMessierNames','toggleGal','toggleOpen','toggleGlobular','toggleNebula','togglePlanetary','toggleCalPoints','toggleSolarSystem'
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
  // Server time synchronization
  let serverTimeOffset = 0; // Difference between server and client time
  let lastServerTimeUpdate = 0;
  
  function updateServerTimeOffset() {
    // Get server time from status endpoint
    fetch('/status')
      .then(response => response.json())
      .then(data => {
        // Parse server time (assuming it's in format HH:MM:SS)
        const serverTimeStr = data.time;
        if (serverTimeStr && serverTimeStr.includes(':')) {
          const now = new Date();
          const [hours, minutes, seconds] = serverTimeStr.split(':').map(Number);
          
          // Create a Date object for today with server time
          const serverTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, seconds);
          
          // Calculate offset (server time - client time)
          serverTimeOffset = serverTime.getTime() - now.getTime();
          lastServerTimeUpdate = now.getTime();
          
          console.log('[SkyView] Server time sync: offset =', serverTimeOffset / 1000, 'seconds');
        }
      })
      .catch(e => console.warn('[SkyView] Failed to sync server time:', e));
  }
  
  function getServerTime() {
    // Return current time adjusted for server offset
    const clientTime = new Date();
    
    // Update server time offset every 30 seconds
    if (Date.now() - lastServerTimeUpdate > 30000) {
      updateServerTimeOffset();
    }
    
    return new Date(clientTime.getTime() + serverTimeOffset);
  }
  
  // Initialize server time sync
  updateServerTimeOffset();
  setInterval(updateServerTimeOffset, 60000); // Update every minute

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
    // Use server time if no date provided
    if (!date) date = getServerTime();
    
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

  // Convert Alt/Az to RA/Dec (inverse of eqToAltAz)
  function altAzToEq(altDeg, azDeg, latDeg, lonDeg, date) {
    const lst = computeLST(date, lonDeg);
    console.log('[SkyView] DEBUG - altAzToEq inputs:', { altDeg, azDeg, latDeg, lonDeg, date });
    console.log('[SkyView] DEBUG - LST calculated:', lst, 'hours');
    
    const altR = altDeg * Math.PI / 180;
    const azR = azDeg * Math.PI / 180;
    const latR = latDeg * Math.PI / 180;
    
    const decR = Math.asin(
      Math.sin(altR) * Math.sin(latR) +
      Math.cos(altR) * Math.cos(latR) * Math.cos(azR)
    );
    
    const haR = Math.atan2(
      -Math.sin(azR),  // Change sign here
      Math.cos(azR) * Math.sin(latR) - Math.tan(altR) * Math.cos(latR)
    );
    
    const ha = haR * 180 / Math.PI;
    console.log('[SkyView] DEBUG - Hour angle calculated:', ha, 'degrees, or', ha/15, 'hours');
    
    let raH = lst - ha / 15;
    if (raH < 0) raH += 24;
    if (raH >= 24) raH -= 24;
    
    console.log('[SkyView] DEBUG - Final RA calculation: lst(', lst, ') - ha/15(', ha/15, ') = raH(', raH, ')');
    
    return { 
      ra: raH * 15, // Convert back to degrees
      dec: decR * 180 / Math.PI 
    };
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
    
    // Very small offsets to place labels immediately next to objects
    const offsetX = 1;
    const offsetY = 1;
    
    let textX, textY;
    
    if (objectType === 'messier') {
      // Messier Objects: right and slightly below
      textX = objectX + offsetX;
      textY = objectY + offsetY;
    } else {
      // Stars: left and slightly below
      textX = objectX - offsetX;
      textY = objectY + offsetY;
    }
    
    return {
      textX: textX,
      textY: textY
    };
  }

  // --- Night Mode Color Helper ---
  function getNightModeColor(defaultColor, objectType = 'default') {
    // Check for SkyView-specific night mode toggle first, then fall back to main UI toggle
    const skyViewNightModeToggle = document.getElementById('toggleSkyViewNightMode');
    const isSkyViewNightMode = skyViewNightModeToggle && skyViewNightModeToggle.checked;
    
    // If SkyView night mode is explicitly enabled, use night mode colors
    // If SkyView night mode is explicitly disabled (unchecked), use day mode colors
    // This overrides the main UI night mode setting
    const isNightMode = isSkyViewNightMode;
    
    if (!isNightMode) {
      return defaultColor;
    }
    
    // In night mode, everything should be red or black
    switch (objectType) {
      case 'background':
        return 'black';
      case 'star':
      case 'constellation':
      case 'messier':
      case 'galaxy':
      case 'nebula':
      case 'cluster':
      case 'text':
      case 'line':
      case 'border':
      case 'compass':
      default:
        return 'red';
    }
  }

  // --- Utility: Draw label with appropriate positioning (no pointer lines) ---
  function drawLabelWithPointer(text, objectX, objectY, objectType, color, canvasScale) {
    const pos = getLabelPositionWithCollisionDetection(objectX, objectY, text, objectType, canvasScale);
    
    // Set text alignment based on position success and object type
    ctx.save();
    if (pos.success) {
      // For constellation labels, prefer center alignment when positioned directly above/below
      if (objectType === 'constellation') {
        const isVerticallyAligned = Math.abs(pos.textX - objectX) < 1; // Very close to center
        if (isVerticallyAligned) {
          ctx.textAlign = 'center';
        } else {
          // Use smart alignment for off-center positions
          const isRight = pos.textX > objectX;
          ctx.textAlign = isRight ? 'left' : 'right';
        }
      } else {
        // Use smart positioning for stars and messier objects
        const isRight = pos.textX > objectX;
        ctx.textAlign = isRight ? 'left' : 'right';
      }
    } else {
      // Fallback to original logic
      if (objectType === 'messier') {
        ctx.textAlign = 'left';
      } else if (objectType === 'constellation') {
        ctx.textAlign = 'center'; // Default center for constellations
      } else {
        ctx.textAlign = 'right';
      }
    }
    ctx.textBaseline = 'top';
    
    // Draw text only (no pointer line)
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
    addHits(solarSystemHits);
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
        console.log(`[SkyView] Click at screen coordinates: (${upX}, ${upY})`);
        addHits(starHits);
        addHits(galaxyHits);
        addHits(openHits);
        addHits(globularHits);
        addHits(nebulaHits);
        addHits(planetaryHits);
        addHits(solarSystemHits);
        console.log('[SkyView] Click detection - Solar system hits:', solarSystemHits.length, 'total candidates:', candidates.length);
        if (solarSystemHits.length > 0) {
          console.log('[SkyView] Solar system objects available for click:', solarSystemHits.map(s => `${s.Name} at (${s.screenX},${s.screenY}) r=${s.r}`));
        }
        if (candidates.length > 0) {
          console.log('[SkyView] Found candidates:', candidates.map(c => c.Name || c.name || 'unnamed'));
        }
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
          console.log('[SkyView] Object selected:', hitObj.Name || hitObj.name, 'type:', hitObj.type);
          console.log('[SkyView] DEBUG - Full object properties:');
          for (let key in hitObj) {
            console.log(`[SkyView] DEBUG - ${key}:`, hitObj[key]);
          }
          console.log('[SkyView] DEBUG - isCalPoint:', hitObj.isCalPoint);
          console.log('[SkyView] DEBUG - Has RA/Dec:', hitObj.ra !== undefined, hitObj.dec !== undefined);
          console.log('[SkyView] DEBUG - Has RtAsc/Declin:', hitObj.RtAsc !== undefined, hitObj.Declin !== undefined);
          showSelectedAttributes(selectedObject);
          if (hitObj.isCalPoint) {
            if (altInput && azInput) {
              altInput.value = degToDMS(hitObj.dec);
              azInput.value = degToDMS(hitObj.ra);
            }
            if (raInput && decInput) {
              raInput.value = degToHMS(hitObj.ra);
              decInput.value = degToDMS(hitObj.dec);
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
            // Update coordinate textboxes for catalog objects (stars, galaxies, etc.)
            console.log('[SkyView] Selected object:', hitObj.Name || hitObj.name);
            
            // All catalog objects have RtAsc/Declin - use them directly
            if (hitObj.RtAsc !== undefined && hitObj.Declin !== undefined) {
              console.log('[SkyView] DEBUG - hitObj.RtAsc value:', hitObj.RtAsc, 'type:', typeof hitObj.RtAsc);
              console.log('[SkyView] DEBUG - Expected: 9.787334 should give 09:47:14');
              
              // Set RA/Dec textboxes from catalog values
              raInput.value = decimalHMStoHMS(hitObj.RtAsc);  // RtAsc decimal hours → HH:MM:SS
              decInput.value = degToDMS(hitObj.Declin);       // Declin degrees → DDD:MM:SS
              
              // Calculate Alt/Az from catalog RA/Dec
              const raHours = hitObj.RtAsc; // RA is already in decimal hours format
              console.log('[SkyView] DEBUG - Converting to Alt/Az with:', {
                raHours: raHours,
                decDeg: hitObj.Declin,
                lat: lat,
                lon: lon,
                date: getServerTime() // Use server time for debug info
              });
              const coords = eqToAltAz(raHours, hitObj.Declin, lat, lon); // Use server time
              console.log('[SkyView] DEBUG - eqToAltAz result:', coords);
              
              // Fix azimuth reference frame - add 180° if needed
              let correctedAz = coords.az;
              if (correctedAz < 180) {
                correctedAz += 180;
              } else {
                correctedAz -= 180;
              }
              
              console.log('[SkyView] DEBUG - Azimuth correction:', {
                originalAz: coords.az,
                correctedAz: correctedAz,
                objectAz: hitObj.az
              });
              
              altInput.value = degToDMS(coords.alt);
              azInput.value = degToDMS(correctedAz); // Use corrected azimuth
              
              console.log('[SkyView] Using catalog RtAsc/Declin - RA:', raInput.value, 'Dec:', decInput.value);
              console.log('[SkyView] Calculated Alt/Az - Alt:', altInput.value, 'Az:', azInput.value);
            } else if (hitObj.ra !== undefined && hitObj.dec !== undefined) {
              // Fallback for objects with ra/dec properties
              raInput.value = decimalHMStoHMS(hitObj.ra);
              decInput.value = degToDMS(hitObj.dec);
              
              const raHours = hitObj.ra;
              const coords = eqToAltAz(raHours, hitObj.dec, lat, lon); // Use server time
              
              // Apply the same azimuth reference frame correction as catalog objects
              let correctedAz = coords.az;
              if (correctedAz < 180) {
                correctedAz += 180;
              } else {
                correctedAz -= 180;
              }
              
              altInput.value = degToDMS(coords.alt);
              azInput.value = degToDMS(correctedAz);
            } else {
              console.log('[SkyView] Warning: Object has no RA/Dec coordinates');
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
    ctx.strokeStyle = getNightModeColor('#888', 'border'); ctx.lineWidth = 2 / canvasScale; // gray border
    ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI); ctx.stroke();
    
    // Add altitude lines (radial lines from center to edge) - dashed
    ctx.setLineDash([4,4]);
    ctx.strokeStyle = getNightModeColor('#666', 'line'); 
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
      ctx.strokeStyle = getNightModeColor('#888', 'line'); // gray dashed
      ctx.beginPath(); ctx.arc(cx,cy,rr,0,2*Math.PI); ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  // Draw NSEW labels outside the projection (called before clipping)
  function drawNSEWLabels(r) {
    ctx.fillStyle = getNightModeColor('white', 'text');
    ctx.font = `${Math.max(14,r*0.05)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    
    // Position NSEW labels very close to the circle border
    const labelOffset = Math.max(8, r*0.03); // Even closer to circle
    
    drawFlippableText('N', cx, cy-r-labelOffset);
    drawFlippableText('S', cx, cy+r+labelOffset);
    // When flipped, E and W swap positions
    if (isFlipped) {
      drawFlippableText('W', cx-r-labelOffset, cy);  // W goes to left position
      drawFlippableText('E', cx+r+labelOffset, cy);  // E goes to right position
    } else {
      drawFlippableText('E', cx+r+labelOffset, cy);  // E goes to right position
      drawFlippableText('W', cx-r-labelOffset, cy);  // W goes to left position
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
    const {alt,az} = eqToAltAz(raH,decDeg,lat,lon); // Use server time
    const rr=(90-alt)/90*r;
    const ang=(az+180)*Math.PI/180;
    return { alt, az,
      x: cx + rr * Math.sin(ang),
      y: cy - rr * Math.cos(ang)
    };
  }

  // Helper function to draw text that remains readable when flipped
  function drawFlippableText(text, x, y) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (isFlipped) {
      // When flipped, apply scale transform but keep text centered
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.fillText(text, 0, 0);
    } else {
      ctx.fillText(text, x, y);
    }
    ctx.restore();
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
    if (isDrawing) {
      console.log('[SkyView] Draw already in progress, skipping...');
      return;
    }
    
    // Reset label collision tracking for this draw cycle
    resetLabelCollisions();
    
    isDrawing = true;
    try {
      // Debug: log mountPos before drawing reticle
      console.log('[SkyView] draw() called, mountPos:', mountPos);
      console.log('[SkyView] draw() called');
      console.log('[SkyView] Canvas size:', canvas.width, 'x', canvas.height, 'CSS:', canvas.style.width, 'x', canvas.style.height, 'dpr:', dpr, 'canvasScale:', canvasScale, 'translateX:', translateX, 'translateY:', translateY, 'currentVpScale:', currentVpScale);
      // clear canvas with proper coordinate system
      ctx.save();
      ctx.resetTransform(); // Ensure we clear in untransformed space
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

    // --- PHASE 1: Draw all objects WITHOUT labels ---
    // This allows us to establish visual positions first, then add labels with priorities
    
    // --- constellations (lines only) ---
    if(toggleConst.checked){
      console.log('[SkyView] Drawing constellations:', constLines.length);
      if (constLines.length > 0) {
        let sample = constLines[0].slice(0, 3).map(pt => project(pt[0]/15, pt[1], effR));
        console.log('[SkyView] Sample projected constellation points:', sample);
      }
      ctx.save();
      ctx.lineWidth = 1 / canvasScale; // narrower lines
      ctx.strokeStyle = getNightModeColor('#a259e6', 'constellation'); // purple
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
    // Constellation labels will be drawn in PHASE 2 with priority system

    // --- stars (visual points only) ---
    starHits=[]; if(toggleStars.checked){
      console.log('[SkyView] Drawing stars:', stars.length);
      if (stars.length > 0) {
        let s = stars[0];
        let p = project(s.RtAsc, s.Declin, effR);
        console.log('[SkyView] Sample projected star:', p, 'Mag:', s.Mag, 'RA:', s.RtAsc, 'Dec:', s.Declin);
      }
      
      // Adaptive magnitude limit based on device performance (preserves original zoom progression)
      const deviceMagLimit = deviceProfiler.getMagnitudeLimit('stars', canvasScale);
      
      // Override with user slider selection
      const starMagSlider = document.getElementById('starMagSlider');
      const sliderValue = starMagSlider ? parseInt(starMagSlider.value) : 18;
      // Convert slider position to magnitude: position 1 = 0.5, position 2 = 1.0, position 18 = 9.0
      const userStarMagLimit = sliderValue * 0.5;
      const magLimit = Math.min(deviceMagLimit, userStarMagLimit);
      
      console.log(`[PERF] Star rendering - deviceLimit: ${deviceMagLimit}, sliderPos: ${sliderValue}, userLimit: ${userStarMagLimit}, final: ${magLimit}, canvasScale: ${canvasScale}`);
      
      // Filter stars using magnitude and viewport culling only (no count limiting)
      let drawnStars = 0;
      
      // Batch drawing for better performance
      ctx.save();
      stars.forEach(s=>{
        if (s.Mag >= magLimit) return;
        if (!shouldDrawObject(s.RtAsc, s.Declin, s.Mag, 'stars', canvasScale)) return;
        
        // Debug: log first few star coordinates for comparison
        if (drawnStars < 3) {
          console.log(`[SkyView] Star ${drawnStars}: RA=${s.RtAsc} Dec=${s.Declin} Mag=${s.Mag}`);
        }
        
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
        
        // Apply night mode color override
        color = getNightModeColor(color, 'star');
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
          visualRadius: sz, // Store the actual visual size for selection circle
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
    // Star names will be drawn in PHASE 2 with priority system

    // --- Messier Objects (visual indicators only) ---
    // Messier names will be drawn in PHASE 2 with priority system

    // --- galaxies ---
    galaxyHits=[]; if(toggleGal.checked){
      console.log('[SkyView] Drawing galaxies:', galaxies.length);
      if (galaxies.length > 0) {
        let g = galaxies[0];
        let p = project(g.RtAsc, g.Declin, effR);
        console.log('[SkyView] Sample projected galaxy:', p, 'Mag:', g.mag, 'RA:', g.RtAsc, 'Dec:', g.Declin);
      }
      
      // Adaptive magnitude limit based on device performance (preserves zoom progression)
      const deviceGalLimit = deviceProfiler.getMagnitudeLimit('galaxies', canvasScale);
      
      // Override with user slider selection
      const galMagSlider = document.getElementById('galMagSlider');
      const galSliderValue = galMagSlider ? parseInt(galMagSlider.value) : 18;
      
      // Custom galaxy magnitude scale based on actual data distribution
      // Most galaxies are 11-17, so give more resolution in that range
      let userGalMagLimit;
      if (galSliderValue <= 6) {
        // Positions 1-6: 2.2, 8, 10, 11, 12, 13
        const earlyMags = [2.2, 8, 10, 11, 12, 13];
        userGalMagLimit = earlyMags[galSliderValue - 1];
      } else {
        // Positions 7-18: 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 17, 17.5, 18, 19, 20
        userGalMagLimit = 13 + (galSliderValue - 6) * 0.5;
      }
      
      // ZOOM-BASED MAGNITUDE LIMITING (independent of slider)
      // At default zoom, only show brightest galaxies. As we zoom in, show more.
      let zoomBasedMagLimit;
      if (canvasScale < 1.2) {
        zoomBasedMagLimit = 11.0; // Only show very bright galaxies when zoomed out
      } else if (canvasScale < 2.0) {
        zoomBasedMagLimit = 12.5; // Show more galaxies at medium zoom
      } else if (canvasScale < 3.0) {
        zoomBasedMagLimit = 14.0; // Show even more galaxies when zoomed in
      } else if (canvasScale < 5.0) {
        zoomBasedMagLimit = 15.5; // Show most galaxies at high zoom
      } else {
        zoomBasedMagLimit = 17.0; // Show all galaxies at very high zoom
      }
      
      // Final limit is the most restrictive of: device limit, user slider, and zoom-based limit
      const galLimit = Math.min(deviceGalLimit, userGalMagLimit, zoomBasedMagLimit);
      
      console.log(`[PERF] Galaxy rendering - deviceLimit: ${deviceGalLimit}, sliderPos: ${galSliderValue}, userLimit: ${userGalMagLimit}, zoomLimit: ${zoomBasedMagLimit}, final: ${galLimit}, canvasScale: ${canvasScale}`);
      
      let drawnGalaxies = 0;
      
      // Galaxy magnitude bins: 8 bins, 2.2–20, largest for <10, then step up
      const galMinRadius = 2.2;
      const galAreaStep = 1.5;
      
      galaxies.forEach(g=>{
        if (g.mag >= galLimit) return;
        if (!shouldDrawObject(g.RtAsc, g.Declin, g.mag, 'galaxies', canvasScale)) return;
        
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
        ctx.strokeStyle = getNightModeColor('rgb(255,100,150)', 'galaxy'); // more pink but still reddish
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
      
      ctx.strokeStyle = getNightModeColor('rgb(100,100,255)', 'cluster'); // fully opaque blue
      openClusters.forEach(o=>{
        if (o.Mag >= magLimit) return;
        if (!shouldDrawObject(o.RtAsc, o.Declin, o.Mag, 'clusters', canvasScale)) return;
        
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
      ctx.strokeStyle = getNightModeColor('rgb(0,180,80)', 'cluster'); // fully opaque green
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
      ctx.strokeStyle = getNightModeColor('rgb(255,100,255)', 'nebula'); // fully opaque pink
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
      ctx.strokeStyle = getNightModeColor('rgb(127,255,0)', 'nebula'); // fully opaque chartreuse
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

    // --- solar system objects ---
    solarSystemHits = []; // Clear previous hits
    if (solarSystemData && toggleSolarSystem && toggleSolarSystem.checked) {
      console.log('[SkyView] Drawing solar system objects, data:', solarSystemData);
      ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'sun', 'moon'].forEach(objName => {
        const obj = solarSystemData[objName];
        if (!obj || obj.ra === null || obj.dec === null) {
          return;
        }
        
        console.log(`[SkyView] ${objName}: RA=${obj.ra}° Dec=${obj.dec}°`);
        const p = project(obj.ra, obj.dec, effR);
        console.log(`[SkyView] ${objName}: Alt=${p.alt}° Az=${p.az}° Screen=(${p.x}, ${p.y})`);
        if (p.alt <= 0) {
          console.log(`[SkyView] ${objName}: Below horizon, skipping`);
          return;
        }
        
        const azForDraw = (p.az + 180) % 360;
        const planX = p.x;
        const planY = p.y;
        
        if (planX >= -50 && planX <= canvas.width + 50 && planY >= -50 && planY <= canvas.height + 50) {
          // Size similar to open clusters (4-12 pixel range), scaled with zoom
          let baseSz = 8; // base size
          let color = '#FFFF00'; // default yellow
          
          // Object-specific styling
          switch(objName) {
            case 'sun':
              baseSz = 12;
              color = '#FFDD00';
              break;
            case 'moon':
              baseSz = 10;
              color = '#DDDDDD';
              break;
            case 'mercury':
              baseSz = 6;
              color = '#8C7853';
              break;
            case 'venus':
              baseSz = 7;
              color = '#FFC649';
              break;
            case 'mars':
              baseSz = 7;
              color = '#CD5C5C';
              break;
            case 'jupiter':
              baseSz = 10;
              color = '#D8CA9D';
              break;
            case 'saturn':
              baseSz = 9;
              color = '#FAD5A5';
              break;
            case 'uranus':
              baseSz = 7;
              color = '#4FD0E7';
              break;
            case 'neptune':
              baseSz = 7;
              color = '#4B70DD';
              break;
            case 'pluto':
              baseSz = 5;
              color = '#967117';
              break;
          }
          
          // Apply night mode color override
          color = getNightModeColor(color, 'star');
          
          // Scale size with zoom level to maintain constant visual size on screen
          const sz = baseSz / canvasScale;
          
          ctx.fillStyle = color;
          ctx.beginPath();
          if (objName === 'sun') {
            // Sun with rays
            ctx.arc(planX, planY, sz/2, 0, 2 * Math.PI);
            ctx.fill();
            // Add rays that scale with the sun's size
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            const rayInnerOffset = sz/2 + (2 / canvasScale); // Scale ray start distance
            const rayLength = 3 / canvasScale; // Scale ray length
            for (let i = 0; i < 8; i++) {
              const angle = (i * Math.PI) / 4;
              const startX = planX + Math.cos(angle) * rayInnerOffset;
              const startY = planY + Math.sin(angle) * rayInnerOffset;
              const endX = planX + Math.cos(angle) * (rayInnerOffset + rayLength);
              const endY = planY + Math.sin(angle) * (rayInnerOffset + rayLength);
              ctx.beginPath();
              ctx.moveTo(startX, startY);
              ctx.lineTo(endX, endY);
              ctx.stroke();
            }
          } else if (objName === 'saturn') {
            // Saturn with rings
            ctx.arc(planX, planY, sz/2, 0, 2 * Math.PI);
            ctx.fill();
            // Add rings
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(planX, planY, sz/2 + 2, 0, 2 * Math.PI);
            ctx.stroke();
          } else {
            // Regular circle for other objects
            ctx.arc(planX, planY, sz/2, 0, 2 * Math.PI);
            ctx.fill();
          }
          
          // Store hit detection info with screen coordinates
          // Apply the same transformation sequence as calibration points and reticle
          let screenX = planX * dpr * currentVpScale * canvasScale;
          let screenY = planY * dpr * currentVpScale * canvasScale;
          
          // Apply translation (but flip translateX if we're in flipped mode)
          if (isFlipped) {
            screenX = screenX - translateX; // Reverse translateX for flipped mode
            screenY = screenY + translateY;
          } else {
            screenX = screenX + translateX;
            screenY = screenY + translateY;
          }
          
          // Apply flip transformation around center if needed (same as main canvas)
          if (isFlipped) {
            const canvasCenterX = cx * dpr * currentVpScale * canvasScale; // Include canvasScale for zoom
            screenX = canvasCenterX + (canvasCenterX - screenX); // equivalent to translate(cx,0), scale(-1,1), translate(-cx,0)
          }
          
          const hitObj = {
            Name: objName.charAt(0).toUpperCase() + objName.slice(1), // Use uppercase Name to match other objects
            name: objName.charAt(0).toUpperCase() + objName.slice(1), // Also include lowercase for compatibility
            type: 'Solar System',
            ra: obj.ra,
            dec: obj.dec,
            x: planX,
            y: planY,
            r: sz/2 + 3, // slightly larger hit area
            altDeg: p.alt,
            azDeg: (p.az + 180) % 360,
            screenX: screenX,
            screenY: screenY
          };
          solarSystemHits.push(hitObj);
          console.log(`[SkyView] Added ${objName} to solarSystemHits:`, hitObj);
        }
      });
      console.log(`[SkyView] Solar system drawing complete. Total objects in solarSystemHits: ${solarSystemHits.length}`);
    }

    // --- reticle ---
    if (mountPos.alt !== null && mountPos.az !== null) {
      // Mount azimuth needs -180° transformation to match display coordinate system
      const azForDraw = ((mountPos.az - 180) + 360) % 360;
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
        azForDraw: azForDraw,
        azTransform: 'mountPos.az - 180°',
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
      
      console.log('[SkyView] Reticle debug - selectedObject:', selectedObject);
      console.log('[SkyView] selectedObject has ra/dec?', selectedObject ? (selectedObject.ra !== undefined && selectedObject.dec !== undefined) : 'no selectedObject');
      
      // DEBUGGING: Compare mount coordinates with calculated coordinates for selected object
      if (selectedObject && selectedObject.ra !== undefined && selectedObject.dec !== undefined) {
        const calcCoords = eqToAltAz(selectedObject.ra, selectedObject.dec, lat, lon); // Use server time
        
        // Use the correct azimuth transformation (-180°)
        const mountAzCorrected = ((mountPos.az - 180) + 360) % 360;
        
        const altDiff = calcCoords.alt - mountPos.alt;
        const azDiff = calcCoords.az - mountAzCorrected;
        
        // Handle azimuth wraparound
        let azDiffNormalized = azDiff;
        if (azDiff > 180) azDiffNormalized = azDiff - 360;
        if (azDiff < -180) azDiffNormalized = azDiff + 360;
        
        const totalError = Math.sqrt(altDiff*altDiff + azDiffNormalized*azDiffNormalized);
        
        console.log('COORDS COMPARISON:');
        console.log('  Mount Raw    - Alt: ' + mountPos.alt.toFixed(3) + '°, Az: ' + mountPos.az.toFixed(3) + '°');
        console.log('  Mount Corr   - Alt: ' + mountPos.alt.toFixed(3) + '°, Az: ' + mountAzCorrected.toFixed(3) + '° (az-180°)');
        console.log('  Expected     - Alt: ' + calcCoords.alt.toFixed(3) + '°, Az: ' + calcCoords.az.toFixed(3) + '°');
        console.log('  Difference   - Alt: ' + altDiff.toFixed(3) + '°, Az: ' + azDiffNormalized.toFixed(3) + '°');
        console.log('  Object       - RA: ' + selectedObject.ra + 'h, Dec: ' + selectedObject.dec + '°');
        
        if (totalError > 1.0) {
          console.warn('  ⚠️ Large pointing error: ' + totalError.toFixed(3) + '° total');
        } else {
          console.log('  ✅ Pointing error: ' + totalError.toFixed(3) + '° total');
        }
      } else {
        console.log('COORDS: No valid selectedObject for comparison');
      }
      ctx.save();
      ctx.setTransform(1,0,0,1,0,0);
      ctx.strokeStyle = getNightModeColor('red', 'reticle'); 
      ctx.lineWidth = 2;
      
      // Crosshairs only
      ctx.beginPath();
      ctx.moveTo(screenX - reticleRadius * 1.3, screenY);
      ctx.lineTo(screenX + reticleRadius * 1.3, screenY);
      ctx.moveTo(screenX, screenY - reticleRadius * 1.3);
      ctx.lineTo(screenX, screenY + reticleRadius * 1.3);
      ctx.stroke();
      ctx.restore();
      console.log('[SkyView] Reticle drawn at screen coords:', screenX.toFixed(1), screenY.toFixed(1), 'for mount Alt/Az:', mountPos.alt.toFixed(3), mountPos.az.toFixed(3));
    } else {
      console.log('[SkyView] Reticle not drawn - mount position invalid:', {
        alt: mountPos.alt, 
        az: mountPos.az,
        altValid: mountPos.alt !== null && !isNaN(mountPos.alt),
        azValid: mountPos.az !== null && !isNaN(mountPos.az)
      });
    }

    // --- highlight selected object (dark orange circle only) ---
    if (selectedObject && selectedObject.altDeg !== undefined && (selectedObject.az !== undefined || selectedObject.azDeg !== undefined)) {
      // Use azDeg if available, otherwise use az, but handle the azimuth conversion properly
      let azValue = selectedObject.azDeg !== undefined ? selectedObject.azDeg : selectedObject.az;
      
      // If this is azDeg (which has the +180 applied), undo it
      if (selectedObject.azDeg !== undefined) {
        azValue = (azValue - 180 + 360) % 360;
      }
      
      // Recompute the object's current screen position using the same method as other objects
      const p = altAzToXY(selectedObject.altDeg, azValue, baseRadius);
      
      // Use the object's actual radius for appropriate sizing, but keep circle size constant on screen
      let objectRadius = selectedObject.r || 3; // Default to 3 if no radius specified
      
      // Handle different object types appropriately
      if (selectedObject.visualRadius !== undefined) {
        // Stars store their visual radius separately
        objectRadius = selectedObject.visualRadius;
      } else if (selectedObject.Mag !== undefined && selectedObject.SpectType !== undefined) {
        // This is likely a star, calculate visual radius from magnitude
        const minRadius = 1.2;
        const areaStep = 1.5;
        let bin = Math.floor(Math.max(0, Math.min(7, selectedObject.Mag < 2 ? 0 : Math.floor(selectedObject.Mag - 1))));
        const area = Math.PI * minRadius * minRadius * Math.pow(areaStep, 7 - bin);
        objectRadius = Math.sqrt(area / Math.PI);
      } else {
        // For other objects (galaxies, nebulae, planetary nebulae, globular clusters, etc.)
        // Use their stored radius directly as it represents their visual size
        objectRadius = selectedObject.r || 3;
      }
      
      // Make selection circle proportional to object size but maintain constant visual size regardless of zoom
      let baseSelectionRadius;
      if (objectRadius <= 2) {
        // For very small objects like stars, use a small highlight
        baseSelectionRadius = objectRadius + 0.3;
      } else if (objectRadius <= 5) {
        // For medium objects, add a bit more
        baseSelectionRadius = objectRadius + 1;
      } else if (objectRadius <= 10) {
        // For larger objects, add proportionally more
        baseSelectionRadius = objectRadius + 1.5;
      } else {
        // For very large objects, add even more space
        baseSelectionRadius = objectRadius + 2;
      }
      
      // Divide by canvasScale to maintain constant visual size on screen
      const selectionRadius = baseSelectionRadius / canvasScale;
      
      // Orange circle only (no crosshair) - draw within the same transformation context as the objects
      ctx.beginPath();
      ctx.arc(p.x, p.y, selectionRadius, 0, 2 * Math.PI);
      ctx.strokeStyle = getNightModeColor('rgba(255,120,30,0.75)', 'selection'); // dark orange
      ctx.lineWidth = 1 / canvasScale; // Keep line width constant on screen
      ctx.stroke();
    }

    ctx.restore(); // restore sky circle clip before overlay

    // --- PHASE 2: Draw labels in priority order ---
    // This ensures high-priority labels (stars) get first choice of positions
    ctx.save();
    ctx.beginPath(); ctx.arc(cx,cy,effR,0,2*Math.PI); ctx.clip(); // Re-apply clipping for labels
    
    // PRIORITY 1: Star names (highest priority)
    const toggleStarNames = document.getElementById('toggleStarNames');
    if(stars && stars.length > 0 && toggleStarNames && toggleStarNames.checked) {
      console.log('[SkyView] Drawing named stars with PRIORITY 1, canvasScale:', canvasScale);
      ctx.save();
      ctx.fillStyle=getNightModeColor('rgba(255,255,255,0.9)', 'text'); // White for star names
      ctx.font=`${10/canvasScale}px sans-serif`; // Constant visual size
      
      // Determine visibility threshold based on zoom level
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
      
      let namedStarCount = 0;
      stars.forEach(s => {
        if (s.Name && s.Name !== 'NoName' && s.Mag <= magThreshold) {
          const p = project(s.RtAsc, s.Declin, effR);
          if (p.alt > 0) { // Only draw if above horizon
            const labelColor = getNightModeColor('rgba(255,255,255,0.7)', 'text');
            drawLabelWithPointer(s.Name, p.x, p.y, 'star', labelColor, canvasScale);
            namedStarCount++;
          }
        }
      });
      
      console.log('[SkyView] Drew', namedStarCount, 'PRIORITY 1 star names above horizon');
      ctx.restore();
    }
    
    // PRIORITY 2: Messier object names (medium priority)
    const toggleMessierNames = document.getElementById('toggleMessierNames');
    if(messierObjects && messierObjects.length > 0 && toggleMessierNames && toggleMessierNames.checked) {
      console.log('[SkyView] Drawing Messier objects with PRIORITY 2:', messierObjects.length, 'canvasScale:', canvasScale);
      ctx.save();
      ctx.fillStyle = getNightModeColor('rgba(224,195,252,0.8)', 'text'); // Purple for Messier
      ctx.font=`${12/canvasScale}px sans-serif`; // Constant visual size
      
      // Determine visibility threshold based on zoom level - made less strict
      let magThreshold;
      if (canvasScale < 1.2) {
        magThreshold = 7.0; // Show more objects when zoomed out (was 5.0)
      } else if (canvasScale < 2.0) {
        magThreshold = 9.5; // Show even more objects at medium zoom (was 7.0)
      } else {
        magThreshold = 12.0; // Show all objects when zoomed in (was 9.0)
      }
      
      let visibleCount = 0;
      let filteredByMag = 0;
      let filteredByHorizon = 0;
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
            const labelColor = getNightModeColor('rgba(224,195,252,0.9)', 'text');
            drawLabelWithPointer(obj.name, p.x, p.y, 'messier', labelColor, canvasScale);
            visibleCount++;
          } else {
            filteredByHorizon++;
          }
        } else {
          filteredByMag++;
        }
      });
      
      console.log(`[SkyView] Drew ${visibleCount} PRIORITY 2 Messier objects above horizon. Filtered: ${filteredByMag} by magnitude (>${magThreshold}), ${filteredByHorizon} below horizon`);
      ctx.restore();
    }
    
    // PRIORITY 3: Constellation names (lowest priority)
    if(toggleConstLabels && toggleConstLabels.checked){
      console.log('[SkyView] Drawing constellation labels with PRIORITY 3:', constFeatures.length);
      ctx.save();
      ctx.fillStyle = getNightModeColor('rgba(224,195,252,0.98)', 'text'); // Same purple as Messier but more opaque
      ctx.font=`${12/canvasScale}px sans-serif`; // Constant visual size
      
      constFeatures.forEach(f=>{
        let pts=[]; const g=f.geometry;
        if(g.type==='MultiLineString') g.coordinates.forEach(l=>pts.push(...l));
        else if(g.type==='LineString') pts=g.coordinates;
        const ppts=pts.map(p=>project(p[0]/15,p[1],effR)).filter(p=>p.alt>0);
        if(!ppts.length) return;
        const avgX=ppts.reduce((s,p)=>s+p.x,0)/ppts.length;
        const avgY=ppts.reduce((s,p)=>s+p.y,0)/ppts.length;
        
        const labelColor = getNightModeColor('rgba(224,195,252,0.98)', 'text');
        drawLabelWithPointer(f.id, avgX, avgY, 'constellation', labelColor, canvasScale);
      });
      
      console.log('[SkyView] Drew PRIORITY 3 constellation labels');
      ctx.restore();
    }
    
    ctx.restore(); // restore clipping for labels

    // --- Selection circle overlay ---

    // --- STOP button overlay (drawn on canvas, after main sky objects) ---
    // Only draw if SkyView overlay is active
    const skyViewContainer = document.getElementById('skyviewContainer');
    // Get btnStack safely inside draw to avoid ReferenceError
    const btnStackDraw = document.getElementById('skyviewBtnStack');
    if (skyViewContainer && skyViewContainer.style.display !== 'none') {
      // Removed extra STOP button overlay (red octagon) from canvas drawing
    }
    } finally {
      isDrawing = false;
    }
  }

  // === Data loading ===
  console.log('[SkyView] Starting catalog data loading...');
  
  // Load stars first
  try {
    console.log('[SkyView] Fetching stars data...');
    const starsResponse = await fetch('/corrected_stars.json');
    console.log('[SkyView] Stars response status:', starsResponse.status, starsResponse.statusText);
    
    if (!starsResponse.ok) {
      throw new Error(`HTTP ${starsResponse.status}: ${starsResponse.statusText}`);
    }
    
    stars = await starsResponse.json();
    console.log('[SkyView] Loaded stars:', stars.length);
  } catch(e) {
    console.error('[SkyView] Stars load error:', e);
    console.error('[SkyView] Error details:', {
      name: e.name,
      message: e.message,
      stack: e.stack
    });
    // Try fallback to original stars.json
    try {
      console.log('[SkyView] Attempting fallback to original stars.json...');
      const fallbackResponse = await fetch('/static/stars.json');
      if (fallbackResponse.ok) {
        stars = await fallbackResponse.json();
        console.log('[SkyView] Loaded fallback stars:', stars.length);
      }
    } catch(fallbackError) {
      console.error('[SkyView] Fallback stars load failed:', fallbackError);
    }
  }

  // Small delay before loading constellations
  await new Promise(resolve => setTimeout(resolve, 100));

  try {
    console.log('[SkyView] Fetching constellations data...');
    const constResponse = await fetch('/corrected_constellations.json');
    console.log('[SkyView] Constellations response status:', constResponse.status, constResponse.statusText);
    
    if (!constResponse.ok) {
      throw new Error(`HTTP ${constResponse.status}: ${constResponse.statusText}`);
    }
    
    const geo = await constResponse.json();
    constFeatures = geo.features;
    geo.features.forEach(f=>{
      const g=f.geometry;
      if(g.type==='MultiLineString') g.coordinates.forEach(l=>constLines.push(l));
      else if(g.type==='LineString')    constLines.push(g.coordinates);
    });
    console.log('[SkyView] Loaded constellations:', constFeatures.length, 'lines:', constLines.length);
  } catch(e) {
    console.error('[SkyView] Constellations load error:', e);
    console.error('[SkyView] Constellations error details:', {
      name: e.name,
      message: e.message,
      stack: e.stack
    });
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
    console.log('[SkyView] Loaded corrected Messier objects:', messierObjects.length);
  } catch(e) {
    console.warn('Failed to load corrected_messier.json, falling back to regular messier.json:', e);
    try {
      messierObjects = await (await fetch('/static/messier.json')).json();
      console.log('[SkyView] Loaded fallback Messier objects:', messierObjects.length);
    } catch(e2) {
      console.error('Failed to load messier.json:', e2);
      messierObjects = [];
    }
  }


  // --- Calibration Points ---
  let calPoints = [];
  let calPointHits = [];

  let fetchingCalPoints = false; // Guard to prevent overlapping fetches

  async function fetchCalPoints() {
    if (fetchingCalPoints) {
      console.log('[SkyView] Cal points fetch already in progress, skipping...');
      return;
    }
    
    fetchingCalPoints = true;
    try {
      console.log('[SkyView] Fetching calibration points...');
      const resp = await fetch('/cal_points');
      console.log('[SkyView] Cal points response status:', resp.status, resp.statusText);
      
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
      
      const data = await resp.json();
      calPoints = data.points || [];
      console.log('[SkyView] Loaded calibration points:', calPoints.length);
      // Don't call draw() automatically - let the main update loop handle it
    } catch (e) {
      console.error('[SkyView] Failed to load calibration points:', e);
      console.error('[SkyView] Cal points error details:', {
        name: e.name,
        message: e.message,
        stack: e.stack
      });
      calPoints = [];
    } finally {
      fetchingCalPoints = false;
    }
  }

  if (toggleCalPoints) {
    toggleCalPoints.addEventListener('change', draw);
  }

  if (toggleSolarSystem) {
    toggleSolarSystem.addEventListener('change', draw);
  }

  // Add slider event listeners for magnitude filtering
  const starMagSlider = document.getElementById('starMagSlider');
  if (starMagSlider) {
    starMagSlider.addEventListener('input', () => {
      updateSliderStyle(starMagSlider);
      draw();
    });
  }

  const galMagSlider = document.getElementById('galMagSlider');
  if (galMagSlider) {
    galMagSlider.addEventListener('input', () => {
      updateSliderStyle(galMagSlider);
      draw();
    });
  }

  // Function to update slider styling based on current value and night mode
  function updateSliderStyle(slider) {
    if (!slider) return;
    
    const value = slider.value;
    const min = slider.min;
    const max = slider.max;
    const percentage = ((value - min) / (max - min)) * 100;
    
    // Check if night mode is active
    const isNightMode = document.body.classList.contains('night-mode');
    
    if (isNightMode) {
      // Night mode: filled part red, unfilled dark gray
      const filledColor = '#ff0000';
      const unfilledColor = '#333333';
      const gradient = `linear-gradient(to right, ${filledColor} 0%, ${filledColor} ${percentage}%, ${unfilledColor} ${percentage}%, ${unfilledColor} 100%)`;
      
      slider.style.background = gradient;
    } else {
      // Day mode: default browser styling
      slider.style.background = '';
    }
  }

  // Initialize slider styles
  if (starMagSlider) updateSliderStyle(starMagSlider);
  if (galMagSlider) updateSliderStyle(galMagSlider);

  // Update slider styles when night mode changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        if (starMagSlider) updateSliderStyle(starMagSlider);
        if (galMagSlider) updateSliderStyle(galMagSlider);
      }
    });
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

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
      ctx.strokeStyle = getNightModeColor(pt.enabled ? 'yellow' : 'red', 'label');
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // Crosshair
      ctx.beginPath();
      ctx.moveTo(finalX - r, finalY);
      ctx.lineTo(finalX + r, finalY);
      ctx.moveTo(finalX, finalY - r);
      ctx.lineTo(finalX, finalY + r);
      ctx.strokeStyle = getNightModeColor(pt.enabled ? 'yellow' : 'red', 'label');
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
    'toggleCalPoints',
    'toggleSolarSystem',
    'toggleSkyViewNightMode'
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
    toggleCalPoints: false,
    toggleSolarSystem: true,
    toggleSkyViewNightMode: false
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
        // Special handling for True Night Mode toggle
        if (id === 'toggleSkyViewNightMode') {
          const skyviewContainer = document.getElementById('skyviewContainer');
          if (skyviewContainer) {
            if (el.checked) {
              skyviewContainer.classList.add('skyview-true-night-mode');
            } else {
              skyviewContainer.classList.remove('skyview-true-night-mode');
            }
          }
        }
        saveToggles();
        draw();
      });
    });
    if (restored) {
      console.log('[SkyView] Restored toggle state from localStorage:', saved);
    } else {
      console.log('[SkyView] Set toggles to default:', defaultToggles);
    }
    
    // Apply initial CSS class state for True Night Mode
    const toggleSkyViewNightMode = document.getElementById('toggleSkyViewNightMode');
    const skyviewContainer = document.getElementById('skyviewContainer');
    if (toggleSkyViewNightMode && skyviewContainer) {
      if (toggleSkyViewNightMode.checked) {
        skyviewContainer.classList.add('skyview-true-night-mode');
      } else {
        skyviewContainer.classList.remove('skyview-true-night-mode');
      }
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
  // Name (handle both uppercase Name and lowercase name properties)
  if (selected.Name || selected.name) {
    const el = document.getElementById('nameInfo');
    if (el) {
      el.classList.add('active');
      el.textContent = `Name: ${selected.Name || selected.name}`;
    }
  }
  // Type (for solar system objects)
  if (selected.type && selected.type === 'Solar System') {
    const el = document.getElementById('specInfo');
    if (el) {
      el.classList.add('active');
      el.textContent = `Type: ${selected.type}`;
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
