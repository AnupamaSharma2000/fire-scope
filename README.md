# 🔥 FireScope — Global Wildfire Intelligence Dashboard

A real-time global wildfire intelligence dashboard that pulls live NASA satellite fire detections, overlays weather conditions, computes fire danger indices, and maps everything on an interactive 3D globe.

## 🌐 Live Demo

**[fire-scope-git.vercel.app](https://fire-scope-git.vercel.app)**

## ✨ Features

- **3D Interactive Globe** — WebGL-rendered globe with live fire points colored by Fire Radiative Power (FRP)
- **2D Live Map** — Leaflet.js dark-mode map with clickable fire markers
- **Real-time Analytics** — 6 charts: fire distribution by continent, country rankings, FRP histogram, brightness distribution, day/night breakdown, confidence levels
- **High-Priority Alerts** — Automatically surfaces fires with FRP > 300 MW or brightness > 430 K
- **Live Weather** — Open-Meteo API for current conditions at any selected fire location
- **Filters** — Filter by brightness temperature, minimum FRP, and time range

## 🛰️ Data Sources

| Source | Description |
|--------|-------------|
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | Fire Information for Resource Management System — MODIS/VIIRS satellite fire detections |
| [Open-Meteo](https://open-meteo.com/) | Free open-source weather API |
| [Natural Earth](https://www.naturalearthdata.com/) | Country boundary reference data |

## 🔑 Key Metrics

- **FRP (Fire Radiative Power)** — Radiant heat output in Megawatts
- **Brightness** — Brightness temperature in Kelvin from satellite sensor
- **Confidence** — Detection algorithm confidence: Low / Nominal / High
- **Day/Night** — Whether the satellite overpass occurred during day or night

## 🧰 Tech Stack

- **Globe.gl** — 3D WebGL globe rendering (Three.js under the hood)
- **Leaflet.js** — 2D interactive map
- **Chart.js** — Analytics visualizations
- **D3.js** — Data utilities
- **NASA FIRMS API** — Live satellite fire data (MODIS NRT, 24h/48h/7d)
- **Open-Meteo API** — Real-time weather at fire locations

## 🚀 Running Locally

This is a pure static site — no build step required:

```bash
git clone https://github.com/AnupamaSharma2000/fire-scope.git
cd fire-scope
# Open index.html in your browser, or use a local server:
npx serve .
```

## 📁 Project Structure

```
fire-scope/
├── index.html    # Main application shell
├── style.css     # All styles (dark theme, responsive)
├── app.js        # Application logic: boot, data fetching, globe, map, charts
└── README.md
```

## 👤 Author

**Anupama Sharma** · [github.com/AnupamaSharma2000](https://github.com/AnupamaSharma2000)

## 📄 License

MIT
