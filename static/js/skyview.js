// static/js/skyview.js
document.addEventListener('DOMContentLoaded', async () => {
  console.log('📡 SkyView init');


  // how many extra pixels to expand every hit area by (for easier touch)
  const HIT_PADDING = 4;
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

  // Track the currently selected object (star, galaxy, or open cluster)
  let selectedObject = null;

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

  canvas.addEventListener('pointerdown', e=>{
    // Always redraw to ensure hit-test arrays are up-to-date
    draw();
    const {mx,my}=transformEvent(e);
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
      // pan
      const dx = e.clientX - panStartX;
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
  function drawGrid(r){
    ctx.strokeStyle = '#888'; ctx.lineWidth = 2 / canvasScale; // gray border
    ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI); ctx.stroke();
    ctx.setLineDash([4,4]);
    [30,60].forEach(a=>{
      const rr=(90-a)/90*r;
      ctx.lineWidth = 0.7 / canvasScale; // dashed grid lines narrower
      ctx.strokeStyle = '#888'; // gray dashed
      ctx.beginPath(); ctx.arc(cx,cy,rr,0,2*Math.PI); ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.fillStyle = 'white';
    ctx.font = `${Math.max(12,r*0.04)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N',cx,cy-r-14);
    ctx.fillText('S',cx,cy+r+14);
    ctx.fillText('W',cx-r-14,cy);
    ctx.fillText('E',cx+r+14,cy);
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

  function draw(){
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

    const effR = baseRadius;
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
        ctx.fillText(f.id,avgX,avgY);
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
        ctx.setTransform(1,0,0,1,0,0); // reset transform to draw icon in screen space
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
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
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
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
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
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
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
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
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
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
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
    if(mountPos.alt!=null&&mountPos.alt>0){
      const p = altAzToXY(mountPos.alt, (mountPos.az + 180) % 360, effR);
      // Reticle radius fixed in screen space (like orange crosshair)
      const reticleRadius = 18; // px, visually matches orange crosshair
      const screenX = p.x * dpr * currentVpScale * canvasScale + translateX;
      const screenY = p.y * dpr * currentVpScale * canvasScale + translateY;
      ctx.save();
      ctx.setTransform(1,0,0,1,0,0);
      ctx.strokeStyle='red'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(screenX, screenY, reticleRadius, 0, 2*Math.PI); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(screenX - reticleRadius * 1.3, screenY);
      ctx.lineTo(screenX + reticleRadius * 1.3, screenY);
      ctx.moveTo(screenX, screenY - reticleRadius * 1.3);
      ctx.lineTo(screenX, screenY + reticleRadius * 1.3);
      ctx.stroke();
      ctx.restore();
    }

    // --- highlight selected object (dark orange circle only) ---
    if (selectedObject && selectedObject.altDeg !== undefined && selectedObject.az !== undefined) {
      // Recompute the object's current screen position based on its Alt/Az (use raw azimuth, not azDeg)
      const p = altAzToXY(selectedObject.altDeg, selectedObject.az, baseRadius);
      const screenX = p.x * dpr * currentVpScale * canvasScale + translateX;
      const screenY = p.y * dpr * currentVpScale * canvasScale + translateY;
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

  // === Mount polling ===
  async function fetchMount(){
    try {
      const s = await (await fetch('/status')).json();
      const a = parseFloat(s.alt), z = parseFloat(s.az);
      if(!isNaN(a)&&!isNaN(z)){
        mountPos = {alt:a,az:z};
        draw();
      }
    } catch {}
  }
  fetchMount();
  setInterval(fetchMount,500);

  // === UI handlers ===
  if (toggleStars) toggleStars.addEventListener('change',()=>{ console.log('[SkyView] toggleStars:', toggleStars.checked); draw(); });
  if (toggleConst) toggleConst.addEventListener('change',()=>{ console.log('[SkyView] toggleConst:', toggleConst.checked); draw(); });
  if (toggleGal) toggleGal.addEventListener('change',()=>{ console.log('[SkyView] toggleGal:', toggleGal.checked); draw(); });
  if (toggleOpen) toggleOpen.addEventListener('change',()=>{ console.log('[SkyView] toggleOpen:', toggleOpen.checked); draw(); });
  if (toggleGlobular) toggleGlobular.addEventListener('change',()=>{ console.log('[SkyView] toggleGlobular:', toggleGlobular.checked); draw(); });
  if (toggleNebula) toggleNebula.addEventListener('change',()=>{ console.log('[SkyView] toggleNebula:', toggleNebula.checked); draw(); });
  if (togglePlanetary) togglePlanetary.addEventListener('change',()=>{ console.log('[SkyView] togglePlanetary:', togglePlanetary.checked); draw(); });
  if (toggleConstLabels) toggleConstLabels.addEventListener('change',()=>{ console.log('[SkyView] toggleConstLabels:', toggleConstLabels.checked); draw(); });

  // --- Object toggle persistence ---
  const toggleDefaults = {
    toggleStars: true,
    toggleConst: true,
    toggleConstLabels: false,
    toggleGal: false,
    toggleOpen: false,
    toggleGlobular: false,
    toggleNebula: false,
    togglePlanetary: false
  };
  function saveToggles() {
    const state = {};
    Object.keys(toggleDefaults).forEach(id => {
      const el = window[id];
      if (el) state[id] = el.checked;
    });
    localStorage.setItem('skyviewToggles', JSON.stringify(state));
  }
  function restoreToggles() {
    let state = {};
    try {
      state = JSON.parse(localStorage.getItem('skyviewToggles')) || {};
    } catch {}
    Object.keys(toggleDefaults).forEach(id => {
      const el = window[id];
      if (el) {
        // Use saved value if present, else default
        el.checked = (id in state) ? state[id] : toggleDefaults[id];
      }
    });
  }
  // Restore on load
  restoreToggles();
  // Save on change
  Object.keys(toggleDefaults).forEach(id => {
    const el = window[id];
    if (el) el.addEventListener('change', saveToggles);
  });

  // transformEvent → world coords (robust, correct order, screen space)
  function transformEvent(e) {
    const rect = canvas.getBoundingClientRect();
    // Step 1: event position relative to canvas CSS pixels
    let x = (e.clientX - rect.left) * (canvas.width / rect.width);
    let y = (e.clientY - rect.top) * (canvas.height / rect.height);
    return { mx: x, my: y };
  }

  // click to populate info
  canvas.addEventListener('pointerdown', e=>{
    draw(); // ensure hit-test arrays are up-to-date
    const {mx,my}=transformEvent(e);
    if (toggleStars.checked) {
      for(let s of starHits){
        if(Math.hypot(mx-s.screenX,my-s.screenY)<s.r+HIT_PADDING){
          selectedObject = s;
          draw();
          azInput.value   = degToDMS(s.azDeg);
          altInput.value  = degToDMS(s.altDeg);
          magInfo.textContent   = `Magnitude: ${s.Mag}`;
          hipInfo.textContent   = `HIP: ${s.HIPNum}`;
          hdInfo.textContent    = `HD: ${s.HDNum}`;
          hrInfo.textContent    = `HR: ${s.HRNum}`;
          specInfo.textContent  = `Spectral Type: ${s.SpectType}`;
          colorInfo.textContent = `Color Index: ${s.ColorIDX}`;
          distInfo.textContent  = `Distance: ${s.Distance}`;
          nameInfo.textContent  = `Name: ${s.Name}`;
          showSelectedAttributes(s);
          return;
        }
      }
    }
    if (toggleGal.checked) {
      for(let g of galaxyHits){
        if(Math.hypot(mx-g.screenX,my-g.screenY)<g.r+HIT_PADDING){
          selectedObject = g;
          draw();
          azInput.value   = degToDMS(g.azDeg);
          altInput.value  = degToDMS(g.altDeg);
          magInfo.textContent   = `Magnitude: ${g.mag}`;
          distInfo.textContent  = `Size: ${g.Size}`;
          nameInfo.textContent  = `Name: ${g.Name}`;
          showSelectedAttributes(g);
          return;
        }
      }
    }
    if (toggleOpen.checked) {
      for(let o of openHits){
        if(Math.hypot(mx-o.screenX,my-o.screenY)<o.r+HIT_PADDING){
          selectedObject = o;
          draw();
          azInput.value   = degToDMS(o.azDeg);
          altInput.value  = degToDMS(o.altDeg);
          magInfo.textContent   = `Magnitude: ${o.Mag}`;
          distInfo.textContent  = `Size: ${o.Size}`;
          nameInfo.textContent  = `Name: ${o.Name}`;
          showSelectedAttributes(o);
          return;
        }
      }
    }
    if (toggleGlobular.checked) {
      for(let g of globularHits){
        if(Math.hypot(mx-g.screenX,my-g.screenY)<g.r+HIT_PADDING){
          selectedObject = g;
          draw();
          azInput.value   = degToDMS(g.azDeg);
          altInput.value  = degToDMS(g.altDeg);
          magInfo.textContent   = `Magnitude: ${g.Mag}`;
          distInfo.textContent  = `Size: ${g.Size}`;
          nameInfo.textContent  = `Name: ${g.Name}`;
          showSelectedAttributes(g);
          return;
        }
      }
    }
    if (toggleNebula.checked) {
      for(let n of nebulaHits){
        if(Math.hypot(mx-n.screenX,my-n.screenY)<n.r+HIT_PADDING){
          selectedObject = n;
          draw();
          azInput.value   = degToDMS(n.azDeg);
          altInput.value  = degToDMS(n.altDeg);
          magInfo.textContent   = `Magnitude: ${n.Mag}`;
          distInfo.textContent  = `Size: ${n.Size}`;
          nameInfo.textContent  = `Name: ${n.Name}`;
          showSelectedAttributes(n);
          return;
        }
      }
    }
    if (togglePlanetary.checked) {
      for(let pn of planetaryHits){
        if(Math.hypot(mx-pn.screenX,my-pn.screenY)<pn.r+HIT_PADDING){
          selectedObject = pn;
          draw();
          azInput.value   = degToDMS(pn.azDeg);
          altInput.value  = degToDMS(pn.altDeg);
          magInfo.textContent   = `Magnitude: ${pn.Mag}`;
          distInfo.textContent  = `Size: ${pn.Size}`;
          nameInfo.textContent  = `Name: ${pn.Name}`;
          showSelectedAttributes(pn);
          return;
        }
      }
    }
  });

  // right-click / long-press popup
  canvas.addEventListener('contextmenu', e=>{
    e.preventDefault(); // Always suppress browser menu
    const {mx,my}=transformEvent(e);
    let nearest={dist:Infinity,obj:null,type:null};

    if(toggleStars.checked) starHits.forEach(s=>{
      const d=Math.hypot(mx-s.x,my-s.y);
      if(d<s.r+HIT_PADDING && d<nearest.dist) nearest={dist:d,obj:s,type:'star'};
    });
    if(toggleGal.checked) galaxyHits.forEach(g=>{
      const d=Math.hypot(mx-g.x,my-g.y);
      if(d<g.r+HIT_PADDING && d<nearest.dist) nearest={dist:d,obj:g,type:'gal'};
    });
    if(toggleOpen.checked) openHits.forEach(o=>{
      const d=Math.hypot(mx-o.x,my-o.y);
      if(d<o.r+HIT_PADDING && d<nearest.dist) nearest={dist:d,obj:o,type:'open'};
    });
    if(toggleGlobular.checked) globularHits.forEach(g=>{
      const d=Math.hypot(mx-g.x,my-g.y);
      if(d<g.r+HIT_PADDING && d<nearest.dist) nearest={dist:d,obj:g,type:'globular'};
    });
    if(toggleNebula.checked) nebulaHits.forEach(n=>{
      const d=Math.hypot(mx-n.x,my-n.y);
      if(d<n.r+HIT_PADDING && d<nearest.dist) nearest={dist:d,obj:n,type:'nebula'};
    });
    if(togglePlanetary.checked) planetaryHits.forEach(pn=>{
      const d=Math.hypot(mx-pn.x,my-pn.y);
      if(d<pn.r+HIT_PADDING && d<nearest.dist) nearest={dist:d,obj:pn,type:'planetary'};
    });

    if(nearest.obj){
      const o=nearest.obj;
      const scale=window.visualViewport?window.visualViewport.scale:1;
      popup.style.transformOrigin='0 0';
      popup.style.transform=`scale(${1/scale})`;

      let html=`<div><strong>${o.Name}</strong></div>
                <div>Az:  ${degToDMS(o.azDeg)}</div>
                <div>Alt: ${degToDMS(o.altDeg)}</div>`;
      if(nearest.type==='gal'){
        html+=`<div>Mag: ${o.mag}</div><div>Size: ${o.Size}</div>`;
      } else if(nearest.type==='open'){
        html+=`<div>Mag: ${o.Mag}</div><div>Size: ${o.Size}</div>`;
      }
      html+=`<button id="popupGoTo">GoTo</button>`;
      popup.innerHTML=html;
      popup.style.left=(e.pageX+8)+'px';
      popup.style.top =(e.pageY+8)+'px';
      popup.style.display='block';

      document.getElementById('popupGoTo').onclick=()=>{
        const alt = o.altDeg, az = o.azDeg;
        fetch('/goto-altaz',{method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({alt,az})
        }).then(fetchMount);
        popup.style.display='none';
      };
    }
  });

  // hide popup
  document.addEventListener('pointerdown', e=>{
    if(!popup.contains(e.target)) popup.style.display='none';
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
      -moz-box-shadow: none !important;
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

  console.log('✅ SkyView renderer ready');
});

// --- Object info box: show only selected attributes ---
function showSelectedAttributes(selected) {
  const attrs = [
    'nameInfo','magInfo','hipInfo','hdInfo','hrInfo','specInfo','colorInfo','distInfo'
  ];
  attrs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
  });
  if (!selected) return;
  if (selected.Name) document.getElementById('nameInfo').classList.add('active');
  if (selected.Mag || selected.mag) document.getElementById('magInfo').classList.add('active');
  if (selected.HIPNum || selected.HIP) document.getElementById('hipInfo').classList.add('active');
  if (selected.HDNum || selected.HD) document.getElementById('hdInfo').classList.add('active');
  if (selected.HRNum || selected.HR) document.getElementById('hrInfo').classList.add('active');
  if (selected.SpectType) document.getElementById('specInfo').classList.add('active');
  if (selected.ColorIDX) document.getElementById('colorInfo').classList.add('active');
  if (selected.Distance || selected.Size) document.getElementById('distInfo').classList.add('active');
}
