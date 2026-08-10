# AGENTS.md — Prometheus IP Stream Gateway

## Current Branch: `main`

## Project Summary & Core Mission

**Prometheus IP Stream Gateway** is a high-performance broadcast stream reflector and proxy engine built on **Node.js/Express** (`gateway-resolver`), **MediaMTX** (Golang RTSP/HLS engine), and **OpenResty NGINX** (`custom-nginx-proxy`).

It ingests tokenized live Vidio/Akamai HLS feeds over WAN/Akamai, strips transient token expiration limits, exposes dual **Primary (ISP 1)** and **Backup (ISP 2)** sub-paths per channel profile, and redistributes static local **RTSP** (`:8554`) and **Direct Pass-Through HLS** (`:3000`) endpoints across local network multiviewers, decoders, and monitoring stations.

---

## Technical Session History & Key Architecture Decisions

### 1. Dual Primary & Backup ISP Sub-Path Architecture
- **MediaMTX & Gateway Sub-Paths**: Every channel profile registers dual sub-paths:
  - Primary: `live/${pathKey}/primary` $\rightarrow$ points to Akamai Primary (`/primary/...`)
  - Backup: `live/${pathKey}/backup` $\rightarrow$ points to Akamai Backup (`/backup/...`)
- **Endpoints**:
  - Direct HLS Pass-Through: `http://192.168.40.54:3000/live/:id/primary/index.m3u8`
  - MediaMTX RTSP: `rtsp://192.168.40.54:8554/live/:id/primary`

### 2. Single-Encoder Rule (`N/A` Badge)
- If `customBackupUrl` is blank `""` or not provided, `backup` is set to `null`.
- Gateway **bypasses MediaMTX path registration** and **bypasses background health pinging** for `backup`.
- UI renders a grey **`N/A`** badge (*"Single Encoder (No Backup)"*) and disables the `[ BACKUP FEED ]` inspector button.

### 3. Direct HLS Pass-Through (`:3000`) Architecture
- **Problem**: MediaMTX's internal Go HLS engine (`:8880`) re-parsed Akamai streams and dropped video frames whenever non-zero timestamps (`PTS = 161370s`) occurred, causing frame skipping and backward jumping in VLC/Mividi.
- **Solution**: Express Gateway on Port `:3000` exposes direct pass-through endpoint `GET /live/:id/:feed/index.m3u8`.
- **Manifest Rewriting**: Rewrites relative `/etslive-v3-` paths (both `URI="..."` and segment lines) to point directly to NGINX Edge Proxy on Port `:80` (`http://192.168.40.54:80/etslive-v3-...`).
- **Result**: Native, untouched fMP4 stream pass-through with **0 frame skips**, **0 timestamp resets**, and **full unmuted audio** across VLC, HLS Multiviewer, and Mividi.

### 4. NGINX Edge Proxy Lua Filtering & Segment Caching
- **AV1 Codec Exclusion**: OpenResty Lua filter in `nginx_proxy.conf` explicitly excludes AV1 (`av01`) codec tracks (`is_stream_match()`) to ensure only clean H.264 (AVC) 360p streams are served, eliminating NAL unit decoding errors in decoders.
- **In-Memory RAM Segment Caching (`STREAM_CACHE`)**: NGINX Proxy caches `.mp4` init headers (`-idx.mp4`) and `.m4s` segment chunks in RAM (`proxy_cache STREAM_CACHE`), serving segment requests in **0.1ms** and eliminating TLS network latency spikes from Akamai.

### 5. Config Import / Export & UI Filter Retention
- **Export**: `GET /api/channels/export` downloads `channels.json` as a `.json` backup file.
- **Import**: `POST /api/channels/import` completely replaces `channels.json`, clears old paths, registers new MediaMTX paths, and syncs immediately.
- **UI Search State**: `fetchChannels()` calls `filterChannels()` on 5s polling ticks to preserve user search box query (`"bein"`) without resetting the UI view back to the full list.

---

## Key Files & Roles

| File Path | Role & Description |
| :--- | :--- |
| [resolver/index.js](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/resolver/index.js) | Core worker daemon, token resolution API, Express Direct HLS Pass-Through proxy (`/live/:id/:feed/index.m3u8`), Export/Import REST endpoints. |
| [resolver/channels.json](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/resolver/channels.json) | Persistent channel inventory database file. |
| [resolver/public/index.html](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/resolver/public/index.html) | Gateway Dashboard HTML layout, header controls, telemetry inventory table, Live Inspector sidebar drawer. |
| [resolver/public/app.js](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/resolver/public/app.js) | Frontend UI logic, 5s status polling, search filter retention, Live Inspector video player, JSON export/import handlers. |
| [mediamtx.yml](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/mediamtx.yml) | MediaMTX RTSP (`:8554`) and HLS (`:8880`) configuration. |
| [docker-compose.yml](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/docker-compose.yml) | Container orchestration for `gateway-resolver` and `mediamtx`. |
| [PROMETHEUS_PRD.md](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/PROMETHEUS_PRD.md) | Official Product Requirement Document (PRD) & Tech Stack specification. |
| [graphify-out/GRAPH_REPORT.md](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/graphify-out/GRAPH_REPORT.md) | Graphify code knowledge graph report. |

---

## Build & Verification Commands

```bash
# 1. Syntax check resolver API code
node -c resolver/index.js

# 2. Update knowledge graph
uv tool run --from graphifyy graphify update .

# 3. Deploy on destination server (192.168.40.54)
cd ~/prometheus-project && git pull origin main
sudo docker compose up -d --build gateway-resolver
sudo docker compose restart mediamtx
```
