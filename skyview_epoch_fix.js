// Add this to skyview.js
// Function to get the catalog epoch from the server
async function getCatalogEpoch() {
  try {
    const response = await fetch('/catalog_status');
    const status = await response.json();
    
    // Get the correction JD from the stars catalog
    const starsStatus = status.stars;
    if (starsStatus && starsStatus.corrected && starsStatus.correction_jd) {
      return starsStatus.correction_jd;
    }
  } catch (e) {
    console.warn('[SkyView] Could not get catalog epoch:', e);
  }
  
  // Fallback to current time
  return toJulian(new Date());
}

// Modified computeLST function that accepts a specific Julian Day
function computeLSTForEpoch(jd, lonDeg) {
  const D = jd - 2451545.0;
  let GMST = (18.697374558 + 24.06570982441908*D) % 24;
  if (GMST<0) GMST+=24;
  let LST = GMST + lonDeg/15;
  LST%=24; if(LST<0)LST+=24;
  return LST;
}

// Usage in coordinate conversion:
// const catalogEpoch = await getCatalogEpoch();
// const lst = computeLSTForEpoch(catalogEpoch, lon);
