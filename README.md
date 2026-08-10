# Prometheus IP Stream Gateway

> **Protocol Redistribution & Optimized Media Engine for Token-Isolated HLS & Enterprise Utility Streaming**

Prometheus Stream Gateway is a high-performance broadcast utility service designed to solve CDN token expiry, protocol fragmentation, and dual-ISP redundancy monitoring for enterprise IP video infrastructure.

It ingests tokenized live HLS feeds (e.g. Akamai HDNT tokenized master playlists), strips transient token limitations via an edge proxy layer, remuxes incoming HLS streams into low-latency **RTSP** (`:8554`) and **Direct HLS Pass-Through** (`:3000`) endpoints, and maintains independent telemetry for **Primary (ISP 1)** and **Backup (ISP 2)** hardware encoders.

---

## 🚀 Key Features

* **Akamai Upstream Fan-Out Reduction**: Reduces WAN bandwidth from $24 \times N$ PCs down to **constant single-pull origins**.
* **Zero Token Expiry on Clients**: Background `gateway-resolver` service auto-refreshes Vidio/Akamai tokens periodically. Downstream consumers connect to static local URLs (e.g. `http://<SERVER_IP>:3000/live/204/primary/index.m3u8`) that **never expire**.
* **Dual Primary & Backup ISP Isolation**: Independent sub-paths (`/primary` & `/backup`) per channel profile for side-by-side hardware encoder and ISP health monitoring.
* **Single-Encoder (`N/A`) Handling**: Automatic bypass of backup probing and registration when a channel has no backup encoder (`customBackupUrl: ""`).
* **Direct Pass-Through HLS (`:3000`)**: Zero-demuxing HLS pass-through proxy that preserves Akamai's native continuous video timestamps with **0 frame skips** and **0 timestamp resets** in VLC, HLS Multiviewer, and Mividi.
* **Low-Latency RTSP (`:8554`)**: MediaMTX-powered RTSP streaming for hardware decoders and broadcast monitors.
* **Live Feed Inspector**: Built-in telemetry console with interactive HLS player, instant `[ PRIMARY ] / [ BACKUP ]` A/B switching, and resolution/bitrate analytics.
* **Config Export & Import**: One-click JSON export of channel inventory and full-state replacement import (`POST /api/channels/import`).
* **Search Filter Preservation**: UI search filter state is maintained across 5s background polling ticks.

---

## 📁 System Architecture & Port Mapping

```
                                  [ AKAMAI CDN ORIGIN ]
                                (Primary & Backup Feeds)
                                           │
                                           ▼
                            [ NGINX EDGE PROXY (Port 80) ]
                             (Lua Token Proxy & Rewrite)
                                           │
                                           ▼
                       [ PROMETHEUS GATEWAY RESOLVER (Port 3000) ]
                         (Node.js / Express / Health-Checker)
                                           │
                        ┌──────────────────┴──────────────────┐
                        ▼                                     ▼
           [ MediaMTX Engine (Port 8880) ]       [ MediaMTX RTSP (Port 8554) ]
            /live/:channel/primary/index.m3u8     rtsp://.../live/:channel/primary
            /live/:channel/backup/index.m3u8      rtsp://.../live/:channel/backup
                        │                                     │
                        └──────────────────┬──────────────────┘
                                           ▼
                          [ CONSUMERS & MONITORING SUITE ]
                         - HLS Multiviewer (Browser Grid)
                         - Master Control Room (MCR) VLC
                         - Hardware Decoders & OBS
```

### Port Allocations

| Port | Service | Description | Protocol |
| :--- | :--- | :--- | :---: |
| **`3000`** | **Prometheus Gateway & REST API** | Control Dashboard, Channels API, Direct HLS Pass-Through (`/live/:id/:feed/index.m3u8`). | HTTP |
| **`80`** | **NGINX Edge Proxy** | OpenResty Lua token proxy & variant rewrite (`/primary/...` & `/backup/...`). | HTTP |
| **`8554`** | **MediaMTX RTSP Engine** | Low-latency RTSP streaming endpoints (`rtsp://<SERVER_IP>:8554/live/:id/:feed`). | RTSP |
| **`8880`** | **MediaMTX HLS Engine** | Remuxed HLS endpoints (`http://<SERVER_IP>:8880/live/:id/:feed/index.m3u8`). | HTTP |
| **`9997`** | **MediaMTX Control API** | Internal REST API for dynamic path registration. | HTTP |

---

## 📺 Stream Endpoints Guide

Downstream clients (Multiviewers, Monitoring PCs, VLC, Mividi, OBS) can consume live streams using static local URLs:

| Channel Name | Channel ID | Primary HLS (`:3000`) | Primary RTSP (`:8554`) |
| :--- | :---: | :--- | :--- |
| **SCTV** | `204` | `http://192.168.40.54:3000/live/204/primary/index.m3u8` | `rtsp://192.168.40.54:8554/live/204/primary` |
| **Indosiar** | `205` | `http://192.168.40.54:3000/live/205/primary/index.m3u8` | `rtsp://192.168.40.54:8554/live/205/primary` |
| **MOJI** | `206` | `http://192.168.40.54:3000/live/206/primary/index.m3u8` | `rtsp://192.168.40.54:8554/live/206/primary` |
| **Trans TV** | `733` | `http://192.168.40.54:3000/live/733/primary/index.m3u8` | `rtsp://192.168.40.54:8554/live/733/primary` |
| **Trans 7** | `734` | `http://192.168.40.54:3000/live/734/primary/index.m3u8` | `rtsp://192.168.40.54:8554/live/734/primary` |
| **ANTV** | `782` | `http://192.168.40.54:3000/live/782/primary/index.m3u8` | `rtsp://192.168.40.54:8554/live/782/primary` |

---

## 🛠️ Build & Deploy Commands

Run on destination host `192.168.40.54`:

```bash
# 1. Update repository
cd ~/prometheus-project && git pull origin main

# 2. Build and restart Gateway Resolver container
sudo docker compose up -d --build gateway-resolver

# 3. Restart MediaMTX container
sudo docker compose restart mediamtx
```

---

## 📑 Documentation & Knowledge Base

- **Product Requirement Document (PRD)**: [PROMETHEUS_PRD.md](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/PROMETHEUS_PRD.md)
- **Agent Guidelines & Rules**: [AGENTS.md](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/AGENTS.md)
- **Graphify Knowledge Graph**: [graphify-out/GRAPH_REPORT.md](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/graphify-out/GRAPH_REPORT.md)
