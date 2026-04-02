/* =============================================
   FIRESCOPE — Global Wildfire Intelligence
   app.js — Main Application Logic
   ============================================= */

'use strict';

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const CONFIG = {
  // NASA FIRMS public demo map key (no auth required for CSV)
  FIRMS_MAP_KEY: 'DEMO_KEY',
  // We use the public CSV endpoint which doesn't require sign-in
  FIRMS_BASE: 'https://firms.modaps.eosdis.nasa.gov/api/area/csv',
  FIRMS_MAP_KEY_REAL: 'd1c4e040b0a8cef6e0aa3a50fe6ef3d8',
  WEATHER_BASE: 'https://api.open-meteo.com/v1/forecast',
  // CORS proxy for NASA FIRMS (browser request)
  PROXY: 'https://corsproxy.io/?',
};

// ─── STATE ───────────────────────────────────────────────────────────────────

let state = {
  fires: [],
  filteredFires: [],
  currentView: 'globe',
  globe: null,
  map: null,
  mapMarkers: [],
  charts: {},
  filters: { brightness: 310, frp: 0, time: '24h' },
  loading: false,
};

// ─── BOOT SEQUENCE ───────────────────────────────────────────────────────────

const BOOT_STEPS = [
  'Initializing satellite link…',
  'Connecting to NASA FIRMS…',
  'Loading fire detection algorithms…',
  'Calibrating FRP sensors…',
  'Rendering globe…',
  'System ready.',
];

async function boot() {
  const bar = document.getElementById('boot-bar');
  const status = document.getElementById('boot-status');
  const total = BOOT_STEPS.length;

  for (let i = 0; i < total; i++) {
    status.textContent = BOOT_STEPS[i];
    bar.style.width = ((i + 1) / total * 100) + '%';
    await sleep(350 + Math.random() * 200);
  }

  // Fade out boot screen
  const bootScreen = document.getElementById('boot-screen');
  bootScreen.classList.add('fade-out');
  await sleep(600);
  bootScreen.style.display = 'none';

  // Show app
  document.getElementById('app').classList.remove('hidden');

  // Initialize everything
  initNavigation();
  initGlobe();
  initMap();
  fetchFireData();
  fetchWeather();
  setInterval(fetchWeather, 10 * 60 * 1000); // refresh weather every 10min
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

function sleep_sync(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Parse NASA FIRMS CSV text → array of fire objects */
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i]?.trim() ?? ''; });
    return obj;
  }).filter(f => f.latitude && f.longitude && !isNaN(parseFloat(f.latitude)));
}

function frpColor(frp) {
  const v = parseFloat(frp) || 0;
  if (v > 1000) return '#9c27b0';
  if (v > 500)  return '#f44336';
  if (v > 100)  return '#ff9800';
  return '#ffeb3b';
}

function frpRadius(frp) {
  const v = parseFloat(frp) || 0;
  if (v > 1000) return 6;
  if (v > 500)  return 4.5;
  if (v > 100)  return 3;
  return 1.8;
}

function frpCategory(frp) {
  const v = parseFloat(frp) || 0;
  if (v > 1000) return 'extreme';
  if (v > 500)  return 'high';
  return 'medium';
}

/** Very basic lat/lon → continent */
function getContinent(lat, lon) {
  const la = parseFloat(lat), lo = parseFloat(lon);
  if (la > 15 && lo > -30 && lo < 65)  return 'Asia / Middle East';
  if (la > 0  && lo > 65  && lo < 180) return 'Asia / Pacific';
  if (la > -40 && lo > -30 && lo < 55) return 'Africa';
  if (la > 10 && lo > -170 && lo < -50) return 'North America';
  if (la < 10 && la > -60 && lo > -90 && lo < -30) return 'South America';
  if (la > 35 && lo > -15 && lo < 40)  return 'Europe';
  if (la < -10 && lo > 100 && lo < 180) return 'Australia / Oceania';
  return 'Other';
}

/** Approx country from lat/lon using a lookup dict (top fire-prone countries) */
function approxCountry(lat, lon) {
  const la = parseFloat(lat), lo = parseFloat(lon);
  // Bounding boxes for top fire-prone countries
  const countries = [
    { name: 'Brazil',       minLa: -34, maxLa: 5,   minLo: -74, maxLo: -34 },
    { name: 'Australia',    minLa: -44, maxLa: -10,  minLo: 113, maxLo: 154 },
    { name: 'USA',          minLa: 24,  maxLa: 50,   minLo: -125, maxLo: -66 },
    { name: 'Russia',       minLa: 41,  maxLa: 82,   minLo: 28,  maxLo: 180 },
    { name: 'Canada',       minLa: 41,  maxLa: 83,   minLo: -141, maxLo: -52 },
    { name: 'Indonesia',    minLa: -11, maxLa: 6,    minLo: 95,  maxLo: 141 },
    { name: 'DR Congo',     minLa: -13, maxLa: 5,    minLo: 12,  maxLo: 32 },
    { name: 'Angola',       minLa: -18, maxLa: -5,   minLo: 12,  maxLo: 24 },
    { name: 'Mozambique',   minLa: -26, maxLa: -10,  minLo: 33,  maxLo: 41 },
    { name: 'Bolivia',      minLa: -23, maxLa: -10,  minLo: -69, maxLo: -58 },
    { name: 'Colombia',     minLa: -4,  maxLa: 12,   minLo: -79, maxLo: -67 },
    { name: 'Venezuela',    minLa: 1,   maxLa: 12,   minLo: -73, maxLo: -60 },
    { name: 'India',        minLa: 8,   maxLa: 37,   minLo: 68,  maxLo: 97 },
    { name: 'China',        minLa: 18,  maxLa: 53,   minLo: 73,  maxLo: 135 },
    { name: 'Argentina',    minLa: -55, maxLa: -22,  minLo: -73, maxLo: -53 },
    { name: 'Zambia',       minLa: -18, maxLa: -8,   minLo: 22,  maxLo: 34 },
  ];
  for (const c of countries) {
    if (la >= c.minLa && la <= c.maxLa && lo >= c.minLo && lo <= c.maxLo) return c.name;
  }
  return 'Other';
}

function formatCoords(lat, lon) {
  const la = parseFloat(lat).toFixed(3);
  const lo = parseFloat(lon).toFixed(3);
  return `${la >= 0 ? la + '°N' : Math.abs(la) + '°S'}, ${lo >= 0 ? lo + '°E' : Math.abs(lo) + '°W'}`;
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────────

function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const view = item.dataset.view;
      switchView(view);
    });
  });

  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });

  document.getElementById('btn-refresh').addEventListener('click', () => {
    fetchFireData();
  });

  document.getElementById('btn-apply-filters').addEventListener('click', applyFilters);

  // Range labels
  const bRange = document.getElementById('filter-brightness');
  const bVal = document.getElementById('filter-brightness-val');
  bRange.addEventListener('input', () => { bVal.textContent = bRange.value; });

  const fRange = document.getElementById('filter-frp');
  const fVal = document.getElementById('filter-frp-val');
  fRange.addEventListener('input', () => { fVal.textContent = fRange.value; });

  // Search
  document.getElementById('search-btn').addEventListener('click', handleSearch);
  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSearch();
  });

  // Fire popup close
  document.getElementById('fp-close').addEventListener('click', () => {
    document.getElementById('fire-popup').classList.add('hidden');
  });
  document.getElementById('map-info-close').addEventListener('click', () => {
    document.getElementById('map-info-panel').classList.add('hidden');
  });
}

function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(`view-${view}`)?.classList.add('active');
  document.querySelector(`[data-view="${view}"]`)?.classList.add('active');

  const breadcrumbs = {
    globe: 'Global Overview', map: 'Live Map',
    analytics: 'Analytics', alerts: 'Alerts', info: 'About'
  };
  document.getElementById('breadcrumb').textContent = breadcrumbs[view] || '';
  state.currentView = view;

  if (view === 'analytics' && state.filteredFires.length) buildCharts();
  if (view === 'map') setTimeout(() => state.map?.invalidateSize(), 100);
}

function handleSearch() {
  const q = document.getElementById('search-input').value.trim().toLowerCase();
  if (!q) return;
  // Find fires matching country/region and fly to first one
  const match = state.filteredFires.find(f =>
    approxCountry(f.latitude, f.longitude).toLowerCase().includes(q)
  );
  if (match && state.map) {
    switchView('map');
    state.map.setView([parseFloat(match.latitude), parseFloat(match.longitude)], 6, { animate: true });
  }
}

function applyFilters() {
  const br = parseInt(document.getElementById('filter-brightness').value);
  const frp = parseInt(document.getElementById('filter-frp').value);
  const time = document.getElementById('filter-time').value;
  state.filters = { brightness: br, frp, time };
  filterFires();
  updateGlobe();
  updateMapMarkers();
  updateStats();
  if (state.currentView === 'analytics') buildCharts();
  buildAlerts();
}

// ─── DATA FETCHING ────────────────────────────────────────────────────────────

async function fetchFireData() {
  if (state.loading) return;
  state.loading = true;

  const refreshBtn = document.getElementById('btn-refresh');
  refreshBtn.textContent = '↻ Loading…';

  try {
    // Use NASA FIRMS public CSV with DEMO_KEY — MODIS last 24h world
    // The DEMO_KEY allows up to 1000 rows/day for development
    // Endpoint: /api/area/csv/{MAP_KEY}/{source}/{area}/{day_range}
    const dayRange = state.filters.time === '7d' ? 7 : state.filters.time === '48h' ? 2 : 1;
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/d1c4e040b0a8cef6e0aa3a50fe6ef3d8/MODIS_NRT/world/${dayRange}`;

    const proxyUrl = CONFIG.PROXY + encodeURIComponent(url);
    const res = await fetch(proxyUrl);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    state.fires = parseCSV(text);

    if (state.fires.length === 0) throw new Error('No data');

  } catch (err) {
    console.warn('FIRMS fetch failed, using sample data:', err.message);
    state.fires = generateSampleFireData();
  }

  filterFires();
  updateGlobe();
  updateMapMarkers();
  updateStats();
  buildAlerts();
  if (state.currentView === 'analytics') buildCharts();

  document.getElementById('last-updated-time').textContent = new Date().toLocaleTimeString();
  refreshBtn.textContent = '↻ Refresh';
  state.loading = false;
}

/** Generate realistic sample fire data for demo/fallback */
function generateSampleFireData() {
  const regions = [
    // Brazil Amazon
    { la: -5, lo: -55, count: 120, frpBase: 80 },
    // SE Australia
    { la: -33, lo: 149, count: 60, frpBase: 120 },
    // Western USA
    { la: 38, lo: -120, count: 45, frpBase: 200 },
    // Siberia Russia
    { la: 62, lo: 110, count: 80, frpBase: 60 },
    // Sub-Saharan Africa
    { la: -8, lo: 25, count: 200, frpBase: 50 },
    { la: 10, lo: 20, count: 150, frpBase: 45 },
    // Indonesia
    { la: -2, lo: 113, count: 70, frpBase: 90 },
    // Canada
    { la: 56, lo: -115, count: 35, frpBase: 150 },
    // India
    { la: 22, lo: 82, count: 50, frpBase: 40 },
    // SE Asia
    { la: 16, lo: 100, count: 60, frpBase: 55 },
    // Bolivia / Argentina
    { la: -18, lo: -63, count: 80, frpBase: 110 },
    // Mediterranean
    { la: 38, lo: 22, count: 25, frpBase: 180 },
  ];

  const fires = [];
  let id = 0;
  regions.forEach(r => {
    for (let i = 0; i < r.count; i++) {
      const lat = r.la + (Math.random() - 0.5) * 10;
      const lon = r.lo + (Math.random() - 0.5) * 12;
      const frp = r.frpBase * (0.3 + Math.random() * 2.5);
      const brightness = 310 + frp * 0.4 + Math.random() * 30;
      fires.push({
        latitude: lat.toFixed(4),
        longitude: lon.toFixed(4),
        brightness: brightness.toFixed(1),
        scan: (0.5 + Math.random()).toFixed(2),
        track: (0.5 + Math.random()).toFixed(2),
        acq_date: new Date().toISOString().slice(0, 10),
        acq_time: String(Math.floor(Math.random() * 2400)).padStart(4, '0'),
        satellite: ['Terra', 'Aqua'][Math.floor(Math.random() * 2)],
        instrument: 'MODIS',
        confidence: ['low', 'nominal', 'high'][Math.floor(Math.random() * 3)],
        version: '6.1',
        bright_t31: (brightness - 20 + Math.random() * 10).toFixed(1),
        frp: frp.toFixed(2),
        daynight: Math.random() > 0.5 ? 'D' : 'N',
      });
      id++;
    }
  });
  return fires;
}

function filterFires() {
  const { brightness, frp } = state.filters;
  state.filteredFires = state.fires.filter(f =>
    parseFloat(f.brightness) >= brightness &&
    parseFloat(f.frp) >= frp
  );
}

// ─── STATS ────────────────────────────────────────────────────────────────────

function updateStats() {
  const fires = state.filteredFires;
  document.getElementById('stat-fires').textContent = fires.length.toLocaleString();

  const countries = new Set(fires.map(f => approxCountry(f.latitude, f.longitude)));
  document.getElementById('stat-countries').textContent = countries.size;

  const maxFRP = Math.max(...fires.map(f => parseFloat(f.frp) || 0));
  document.getElementById('stat-max-frp').textContent = maxFRP > 0 ? maxFRP.toFixed(0) : '—';
}

// ─── GLOBE ────────────────────────────────────────────────────────────────────

function initGlobe() {
  const container = document.getElementById('globe-container');
  const w = container.clientWidth;
  const h = container.clientHeight;

  state.globe = Globe()(container)
    .width(w).height(h)
    .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-dark.jpg')
    .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
    .showAtmosphere(true)
    .atmosphereColor('#ff4b1f')
    .atmosphereAltitude(0.12)
    .pointsData([])
    .pointLat('latitude')
    .pointLng('longitude')
    .pointColor(d => frpColor(d.frp))
    .pointRadius(d => frpRadius(d.frp))
    .pointAltitude(0.005)
    .pointLabel(d =>
      `<div style="background:rgba(10,11,15,0.9);padding:10px 14px;border-radius:8px;border:1px solid rgba(255,75,31,0.4);font-family:system-ui;color:#e8eaf0;min-width:160px">
        <div style="font-size:12px;color:#ff8c00;font-weight:700;margin-bottom:6px">🔥 Fire Detection</div>
        <div style="font-size:11px;color:#8890a8">FRP</div>
        <div style="font-size:15px;font-weight:700;color:#f44336">${parseFloat(d.frp).toFixed(1)} MW</div>
        <div style="font-size:11px;color:#8890a8;margin-top:4px">Brightness</div>
        <div style="font-size:13px;color:#e8eaf0">${parseFloat(d.brightness).toFixed(0)} K</div>
        <div style="font-size:10px;color:#8890a8;margin-top:6px">${formatCoords(d.latitude, d.longitude)}</div>
       </div>`
    )
    .onPointClick(d => showFirePopup(d))
    .pointsMerge(false);

  // Auto-rotate
  state.globe.controls().autoRotate = true;
  state.globe.controls().autoRotateSpeed = 0.4;

  // Stop rotating on drag
  container.addEventListener('mousedown', () => {
    state.globe.controls().autoRotate = false;
  });

  window.addEventListener('resize', () => {
    if (state.globe) {
      state.globe.width(container.clientWidth).height(container.clientHeight);
    }
  });
}

function updateGlobe() {
  if (!state.globe) return;
  state.globe.pointsData(state.filteredFires);
}

// ─── MAP ──────────────────────────────────────────────────────────────────────

function initMap() {
  state.map = L.map('map-container', {
    center: [20, 10],
    zoom: 2,
    zoomControl: true,
    preferCanvas: true,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(state.map);
}

function updateMapMarkers() {
  // Remove old markers
  state.mapMarkers.forEach(m => m.remove());
  state.mapMarkers = [];

  const fires = state.filteredFires;
  if (!fires.length || !state.map) return;

  fires.forEach(f => {
    const lat = parseFloat(f.latitude);
    const lon = parseFloat(f.longitude);
    const r = frpRadius(f.frp);
    const color = frpColor(f.frp);

    const marker = L.circleMarker([lat, lon], {
      radius: r * 2,
      fillColor: color,
      color: 'transparent',
      fillOpacity: 0.75,
    }).addTo(state.map);

    marker.on('click', () => {
      showMapInfo(f);
      showFirePopup(f);
    });

    state.mapMarkers.push(marker);
  });
}

function showMapInfo(f) {
  const panel = document.getElementById('map-info-panel');
  const content = document.getElementById('map-info-content');
  const country = approxCountry(f.latitude, f.longitude);
  const continent = getContinent(f.latitude, f.longitude);
  const frp = parseFloat(f.frp).toFixed(1);
  const br = parseFloat(f.brightness).toFixed(0);

  content.innerHTML = `
    <h3>🔥 Fire Detection</h3>
    ${row('Coordinates', formatCoords(f.latitude, f.longitude))}
    ${row('Country', country)}
    ${row('Region', continent)}
    ${row('FRP', frp + ' MW')}
    ${row('Brightness', br + ' K')}
    ${row('Confidence', f.confidence || 'N/A')}
    ${row('Satellite', f.satellite || 'MODIS')}
    ${row('Date', f.acq_date || 'N/A')}
    ${row('Time (UTC)', f.acq_time || 'N/A')}
    ${row('Day/Night', f.daynight === 'D' ? '☀️ Day' : '🌙 Night')}
    ${row('Scan', f.scan || 'N/A')}
    ${row('Track', f.track || 'N/A')}
  `;

  panel.classList.remove('hidden');
  fetchWeatherForFire(f);
}

function row(label, value) {
  return `<div class="mi-row"><span>${label}</span><span>${value}</span></div>`;
}

// ─── FIRE POPUP ───────────────────────────────────────────────────────────────

function showFirePopup(f) {
  const popup = document.getElementById('fire-popup');
  document.getElementById('fp-title').textContent =
    `${approxCountry(f.latitude, f.longitude)} · ${f.acq_date || 'Recent'}`;
  document.getElementById('fp-coords').textContent = formatCoords(f.latitude, f.longitude);

  const grid = document.getElementById('fp-grid');
  const frp = parseFloat(f.frp).toFixed(1);
  const br  = parseFloat(f.brightness).toFixed(0);

  grid.innerHTML = `
    <div class="fp-stat"><div class="fp-stat-label">FRP</div><div class="fp-stat-value" style="color:#f44336">${frp} MW</div></div>
    <div class="fp-stat"><div class="fp-stat-label">Brightness</div><div class="fp-stat-value" style="color:#ff9800">${br} K</div></div>
    <div class="fp-stat"><div class="fp-stat-label">Confidence</div><div class="fp-stat-value">${(f.confidence||'N/A').toUpperCase()}</div></div>
    <div class="fp-stat"><div class="fp-stat-label">Day/Night</div><div class="fp-stat-value">${f.daynight === 'D' ? '☀️' : '🌙'}</div></div>
  `;

  document.getElementById('fp-weather').textContent = 'Loading weather…';
  popup.classList.remove('hidden');

  fetchWeatherForFire(f);
}

async function fetchWeatherForFire(f) {
  const lat = parseFloat(f.latitude).toFixed(2);
  const lon = parseFloat(f.longitude).toFixed(2);
  const fpWeather = document.getElementById('fp-weather');
  const mapInfoContent = document.getElementById('map-info-content');

  try {
    const url = `${CONFIG.WEATHER_BASE}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=mph&temperature_unit=fahrenheit`;
    const res = await fetch(url);
    const data = await res.json();
    const c = data.current;
    const temp = Math.round(c.temperature_2m);
    const hum  = Math.round(c.relative_humidity_2m);
    const wind = Math.round(c.wind_speed_10m);
    const prec = c.precipitation?.toFixed(1) || 0;

    const weatherStr = `🌡 ${temp}°F · 💧 ${hum}% humidity · 💨 ${wind} mph wind · 🌧 ${prec}mm precip`;
    if (fpWeather) fpWeather.textContent = weatherStr;

    // Also add weather to map info panel
    const existingWeather = document.getElementById('mi-weather');
    if (existingWeather) existingWeather.remove();

    const weatherEl = document.createElement('div');
    weatherEl.id = 'mi-weather';
    weatherEl.innerHTML = `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.07)">
        <div style="font-size:10px;color:#8890a8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Current Weather</div>
        <div style="font-size:13px;color:#e8eaf0">${weatherStr}</div>
      </div>`;
    if (mapInfoContent) mapInfoContent.appendChild(weatherEl);

  } catch (err) {
    if (fpWeather) fpWeather.textContent = 'Weather data unavailable';
  }
}

// ─── WEATHER WIDGET ──────────────────────────────────────────────────────────

async function fetchWeather() {
  try {
    // Default: Washington DC (UMD area)
    const res = await fetch(`${CONFIG.WEATHER_BASE}?latitude=38.99&longitude=-76.93&current=temperature_2m,weather_code&temperature_unit=fahrenheit`);
    const data = await res.json();
    const temp = Math.round(data.current.temperature_2m);
    const code = data.current.weather_code;
    const icon = weatherIcon(code);
    document.getElementById('weather-widget').textContent = `${icon} ${temp}°F · College Park, MD`;
  } catch {
    document.getElementById('weather-widget').textContent = '🌡 Weather N/A';
  }
}

function weatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 67) return '🌧';
  if (code <= 77) return '❄️';
  if (code <= 99) return '⛈';
  return '🌡';
}

// ─── ALERTS ───────────────────────────────────────────────────────────────────

function buildAlerts() {
  const highPriority = state.filteredFires
    .filter(f => parseFloat(f.frp) > 300 || parseFloat(f.brightness) > 430)
    .sort((a, b) => parseFloat(b.frp) - parseFloat(a.frp))
    .slice(0, 50);

  const badge = document.getElementById('alert-badge');
  badge.textContent = highPriority.length;
  badge.classList.toggle('visible', highPriority.length > 0);

  const list = document.getElementById('alerts-list');
  if (!highPriority.length) {
    list.innerHTML = `<div style="color:var(--text-muted);padding:20px">No high-priority alerts with current filters.</div>`;
    return;
  }

  list.innerHTML = highPriority.map(f => {
    const frp = parseFloat(f.frp).toFixed(0);
    const br  = parseFloat(f.brightness).toFixed(0);
    const cat = frpCategory(f.frp);
    const country = approxCountry(f.latitude, f.longitude);
    return `
      <div class="alert-card ${cat}" onclick="showFirePopup(${JSON.stringify(f).replace(/"/g, '&quot;')})">
        <div>
          <div class="alert-label">Country</div>
          <div class="alert-value">${country}</div>
          <div class="alert-coords">${formatCoords(f.latitude, f.longitude)}</div>
        </div>
        <div>
          <div class="alert-label">FRP</div>
          <div class="alert-value alert-frp">${frp} MW</div>
        </div>
        <div>
          <div class="alert-label">Brightness</div>
          <div class="alert-value">${br} K</div>
        </div>
        <div>
          <span class="alert-badge badge-${cat}">${cat}</span><br/>
          <span style="font-size:11px;color:var(--text-muted)">${f.daynight === 'D' ? '☀️ Day' : '🌙 Night'}</span>
        </div>
      </div>`;
  }).join('');
}

// ─── CHARTS ───────────────────────────────────────────────────────────────────

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: { legend: { labels: { color: '#8890a8', font: { size: 12 } } } },
  scales: {
    x: { ticks: { color: '#8890a8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
    y: { ticks: { color: '#8890a8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
  },
};

function buildCharts() {
  const fires = state.filteredFires;
  if (!fires.length) return;

  buildContinentChart(fires);
  buildFRPChart(fires);
  buildCountriesChart(fires);
  buildBrightnessChart(fires);
  buildDayNightChart(fires);
  buildConfidenceChart(fires);
}

function destroyChart(id) {
  if (state.charts[id]) {
    state.charts[id].destroy();
    delete state.charts[id];
  }
}

function buildContinentChart(fires) {
  destroyChart('continent');
  const counts = {};
  fires.forEach(f => {
    const c = getContinent(f.latitude, f.longitude);
    counts[c] = (counts[c] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const ctx = document.getElementById('chart-continent').getContext('2d');
  state.charts['continent'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(e => e[0]),
      datasets: [{
        label: 'Fire Count',
        data: sorted.map(e => e[1]),
        backgroundColor: ['#ff4b1f','#ff8c00','#ffd600','#00e676','#448aff','#9c27b0','#f44336','#00bcd4'],
        borderRadius: 6,
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
      indexAxis: 'x',
    }
  });
}

function buildFRPChart(fires) {
  destroyChart('frp');
  const buckets = { '<50': 0, '50–100': 0, '100–300': 0, '300–500': 0, '500–1000': 0, '>1000': 0 };
  fires.forEach(f => {
    const v = parseFloat(f.frp) || 0;
    if (v < 50) buckets['<50']++;
    else if (v < 100) buckets['50–100']++;
    else if (v < 300) buckets['100–300']++;
    else if (v < 500) buckets['300–500']++;
    else if (v < 1000) buckets['500–1000']++;
    else buckets['>1000']++;
  });
  const ctx = document.getElementById('chart-frp').getContext('2d');
  state.charts['frp'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(buckets),
      datasets: [{
        data: Object.values(buckets),
        backgroundColor: ['#ffeb3b','#ff9800','#f44336','#9c27b0','#e91e63','#b71c1c'],
        borderColor: '#11131a', borderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { position: 'bottom', labels: { color: '#8890a8', font: { size: 11 } } } }
    }
  });
}

function buildCountriesChart(fires) {
  destroyChart('countries');
  const counts = {};
  fires.forEach(f => {
    const c = approxCountry(f.latitude, f.longitude);
    counts[c] = (counts[c] || 0) + 1;
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const ctx = document.getElementById('chart-countries').getContext('2d');
  state.charts['countries'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(e => e[0]),
      datasets: [{
        label: 'Fires',
        data: top.map(e => e[1]),
        backgroundColor: 'rgba(255,75,31,0.7)',
        borderColor: '#ff4b1f', borderWidth: 1, borderRadius: 4,
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: 'y',
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
    }
  });
}

function buildBrightnessChart(fires) {
  destroyChart('brightness');
  // histogram with 20 bins
  const vals = fires.map(f => parseFloat(f.brightness)).filter(v => !isNaN(v));
  const min = Math.min(...vals), max = Math.max(...vals);
  const bins = 20;
  const binSize = (max - min) / bins || 1;
  const counts = Array(bins).fill(0);
  const labels = [];
  for (let i = 0; i < bins; i++) {
    labels.push((min + i * binSize).toFixed(0));
  }
  vals.forEach(v => {
    const idx = Math.min(Math.floor((v - min) / binSize), bins - 1);
    counts[idx]++;
  });
  const ctx = document.getElementById('chart-brightness').getContext('2d');
  state.charts['brightness'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Fire Count',
        data: counts,
        backgroundColor: 'rgba(255,140,0,0.6)',
        borderColor: '#ff8c00', borderWidth: 1,
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
    }
  });
}

function buildDayNightChart(fires) {
  destroyChart('daynight');
  const day = fires.filter(f => f.daynight === 'D').length;
  const night = fires.length - day;
  const ctx = document.getElementById('chart-daynight').getContext('2d');
  state.charts['daynight'] = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['☀️ Day', '🌙 Night'],
      datasets: [{
        data: [day, night],
        backgroundColor: ['rgba(255,214,0,0.7)', 'rgba(68,138,255,0.7)'],
        borderColor: ['#ffd600', '#448aff'], borderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { position: 'bottom', labels: { color: '#8890a8' } } }
    }
  });
}

function buildConfidenceChart(fires) {
  destroyChart('confidence');
  const counts = { 'Low': 0, 'Nominal': 0, 'High': 0 };
  fires.forEach(f => {
    const c = (f.confidence || '').toLowerCase();
    if (c === 'low') counts['Low']++;
    else if (c === 'high') counts['High']++;
    else counts['Nominal']++;
  });
  const ctx = document.getElementById('chart-confidence').getContext('2d');
  state.charts['confidence'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Low', 'Nominal', 'High'],
      datasets: [{
        data: Object.values(counts),
        backgroundColor: ['rgba(255,75,31,0.7)', 'rgba(255,140,0,0.7)', 'rgba(0,230,118,0.7)'],
        borderColor: ['#ff4b1f', '#ff8c00', '#00e676'], borderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { position: 'bottom', labels: { color: '#8890a8' } } }
    }
  });
}

// ─── BOOT ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', boot);
