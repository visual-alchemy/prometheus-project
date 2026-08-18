# AGENTS.md — Prometheus IP Stream Gateway

## Current Branch: `main`
## Server IP: `192.168.40.54` (SSH: `woi@192.168.40.54`)
## Full Memory & Incident Log: See [`MEMORY.md`](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/MEMORY.md)

---

## Project Summary & Core Mission

**Prometheus IP Stream Gateway** is a high-performance broadcast stream reflector and proxy engine built on **Node.js/Express** (`gateway-resolver`), **MediaMTX** (Golang RTSP/HLS engine), and **OpenResty NGINX** (`custom-nginx-proxy`).

It ingests tokenized live Vidio/Akamai HLS feeds over WAN/Akamai, strips transient token expiration limits, exposes dual **Primary (ISP 1)** and **Backup (ISP 2)** sub-paths per channel profile, and redistributes static local **RTSP** (`:8554`) and **Direct Pass-Through HLS** (`:3000`) endpoints across local network multiviewers (specifically **Mividi VideoWall** with 25+ simultaneous panels), decoders, and monitoring stations.

---

## Key Architecture & Reliability Decisions (24/7 Stability)

### 1. Zero-Disk-Thrash Channel Caching (`channelsCache`)
- `loadChannels()` uses an in-memory cache validated against `fs.statSync(channelsPath).mtimeMs`.
- Eliminates 4,800+ synchronous `fs.readFileSync` disk operations per 4-hour window, preventing event-loop freezes.

### 2. Persistent TCP Connection Pooling (`httpClient`)
- All outbound HTTP calls (`fetchManifestWithAutoHealing`, `pingUrl`, Vidio API resolution) use a shared `httpClient` backed by `http.Agent` and `https.Agent` (`keepAlive: true, maxSockets: 100`).
- Prevents Linux socket exhaustion and eliminates thousands of orphaned sockets in `TIME_WAIT` state.

### 3. Pure HLS Pass-Through Manifests (`:3000`)
- Manifest rewriting in `rewriteManifest()` **only** modifies relative `/etslive-v3-` paths to point to NGINX Port `:80`.
- **Does NOT inject `#EXT-X-START`** or trim segments, preventing A/V timestamp drift in Mividi DirectShow demuxers.

### 4. Background Manifest Coalescing (`manifestStore`)
- Background worker (`pullAllManifests()`) refreshes all 50 channel master manifests every 3 seconds in controlled batches of 8.
- Client requests to `/live/:id/:feed/index.m3u8` are served **100% from RAM (`X-Cache: HIT`)**, reducing WAN/Akamai traffic by **98%**.

### 5. NGINX Edge Proxy Segment Caching & DNS Tuning
- Segments (`.m4s`, `.mp4` init maps) are cached in NGINX RAM (`STREAM_CACHE`), returning in **0.1ms**.
- Lua filter excludes AV1 (`av01`) codec tracks.
- DNS resolver explicitly sets `ipv6=off` and public fallbacks (`192.168.40.1 1.1.1.1 8.8.8.8 valid=300s ipv6=off;`) to prevent `(101: Network unreachable)` errors.

---

## Key Files & Roles

| File Path | Role & Description |
| :--- | :--- |
| [`resolver/index.js`](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/resolver/index.js) | Core worker daemon, token resolution API, Express Direct HLS Pass-Through proxy (`/live/:id/:feed/index.m3u8`), Export/Import REST endpoints, Keep-Alive pool, and in-memory cache. |
| [`resolver/channels.json`](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/resolver/channels.json) | Persistent channel inventory database file. |
| [`proxyremote/nginx_proxy.conf`](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/proxyremote/nginx_proxy.conf) | OpenResty NGINX config: Lua codec filter, RAM segment cache (`STREAM_CACHE`), and `ipv6=off` DNS resolver. |
| [`resolver/public/index.html`](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/resolver/public/index.html) | Gateway Dashboard HTML layout, header controls, telemetry inventory table, Live Inspector sidebar drawer. |
| [`resolver/public/app.js`](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/resolver/public/app.js) | Frontend UI logic, 5s status polling, search filter retention, Live Inspector video player, JSON export/import handlers. |
| [`mediamtx.yml`](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/mediamtx.yml) | MediaMTX RTSP (`:8554`) and HLS (`:8880`) configuration. |
| [`docker-compose.yml`](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/docker-compose.yml) | Container orchestration for `gateway-resolver` and `mediamtx`. |
| [`MEMORY.md`](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/MEMORY.md) | Complete session incident log, 4-hour drop timeline, and architectural history. |
| [`Logs/VwLog.txt`](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/Logs/VwLog.txt) | Mividi VideoWall event log file (IPC, pipe status, panel restart timestamps). |
| [`Logs/Mividi V3 Backup Gateway.xml`](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/Logs/Mividi%20V3%20Backup%20Gateway.xml) | Mividi 25-panel layout and endpoint mapping configuration. |

---

## Build & Verification Commands

```bash
# 1. Syntax check resolver API code
node -c resolver/index.js

# 2. Deploy on destination server (192.168.40.54)
cd ~/prometheus-project && git pull origin main
sudo docker compose up -d --build gateway-resolver
sudo docker compose restart mediamtx
```
