# Prometheus Stream Gateway

An automated, high-performance Media Stream Gateway built on **MediaMTX** and **Node.js**.

Prometheus Stream Gateway acts as a central **Local LAN CDN Edge Node & Reflector** for live Vidio broadcast streams. It ingests 24+ live channels ONCE over WAN/Akamai and redistributes constant, static HLS/WebRTC endpoints across your local network to any number of Monitoring PCs, Multiviewers, or hardware decoders.

---

## 🚀 Key Features

* **Akamai Upstream Fan-Out Reduction**: Reduces WAN bandwidth from $24 \times N$ PCs down to **exactly 24 streams constant**.
* **Zero Token Expiry on Clients**: Background `gateway-resolver` service auto-refreshes Vidio/Akamai tokens periodically. Downstream consumers connect to static local URLs (e.g. `http://<server-ip>:8888/live/sctv/index.m3u8`) that **never expire**.
* **Ultra-Low Latency**: Supports HLS (`:8888`), WebRTC (`:8889` < 500ms latency), and RTSP (`:8554`).
* **Instant Dashboard Loading**: Pre-warmed local streams load in < 100ms when opened on frontend multiviewers.

---

## 📁 Architecture Overview

```
                  ┌───────────────────────────────┐
                  │       Akamai CDN (Vidio)      │
                  └──────────────┬────────────────┘
                                 │  (Pulls 24 Streams ONCE)
                                 ▼
                  ┌───────────────────────────────┐
                  │   Prometheus Stream Gateway   │  (Port 8888)
                  │      (MediaMTX Container)     │
                  └──────────────┬────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │  (Local LAN HLS / UDP) │                        │
        ▼                        ▼                        ▼
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│ Multiviewer  │         │ MonitoringPC1│         │ MonitoringPC2│
│ Dashboard    │         │ (VLC / Web)  │         │ (Obs / STB)  │
└──────────────┘         └──────────────┘         └──────────────┘
```

---

## 🛠️ Quick Start & Running

### 1. Build and Start the Gateway
```bash
cd /Users/eldyreynanda/Developer/Antigravity/prometheus-project
docker compose up -d --build
```

### 2. Check Container Health & Logs
```bash
docker compose ps
docker compose logs gateway-resolver -f
```

---

## 📺 Available Stream Endpoints

Downstream clients (Multiviewers, Monitoring PCs, VLC, OBS) can consume live streams using the following static URLs:

| Channel Name | Channel ID | Local Static HLS Stream URL |
|---|---|---|
| **SCTV** | `204` | `http://<SERVER_IP>:8888/live/sctv/index.m3u8` |
| **Indosiar** | `205` | `http://<SERVER_IP>:8888/live/indosiar/index.m3u8` |
| **MOJI** | `206` | `http://<SERVER_IP>:8888/live/moji/index.m3u8` |
| **Trans TV** | `733` | `http://<SERVER_IP>:8888/live/transtv/index.m3u8` |
| **Trans 7** | `734` | `http://<SERVER_IP>:8888/live/trans7/index.m3u8` |
| **ANTV** | `782` | `http://<SERVER_IP>:8888/live/antv/index.m3u8` |
| **Kompas TV** | `874` | `http://<SERVER_IP>:8888/live/kompastv/index.m3u8` |
| **Metro TV** | `777` | `http://<SERVER_IP>:8888/live/metrotv/index.m3u8` |
| **TVRI** | `6441` | `http://<SERVER_IP>:8888/live/tvri/index.m3u8` |
| **TV ONE** | `783` | `http://<SERVER_IP>:8888/live/tvone/index.m3u8` |
| **BTV** | `6165` | `http://<SERVER_IP>:8888/live/btv/index.m3u8` |
| **RTV** | `1561` | `http://<SERVER_IP>:8888/live/rtv/index.m3u8` |
| **MD TV** | `875` | `http://<SERVER_IP>:8888/live/mdtv/index.m3u8` |
| **AJWA** | `7464` | `http://<SERVER_IP>:8888/live/ajwa/index.m3u8` |

---

## ⚙️ Configuration & Custom Channels

To add new channels or modify existing ones, edit `resolver/channels.json`:

```json
[
  { "id": "204", "name": "sctv", "title": "204 | SCTV Akamai" },
  { "id": "205", "name": "indosiar", "title": "205 | Indosiar Akamai" }
]
```

Restart the gateway resolver container to apply changes:
```bash
docker compose restart gateway-resolver
```
