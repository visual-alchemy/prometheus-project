# Prometheus IP Stream Gateway

> **Protocol Redistribution & Optimized Media Engine for Token-Isolated HLS & Enterprise Utility Streaming**

> **v2.2.0**: Manifest TTL cache for upstream fan-out reduction, dual Primary/Backup ISP isolation, Direct HLS Pass-Through, RTSP redistribution, 49 active channel profiles.

---

## Features

### Core Capabilities

| Category | Features |
|----------|----------|
| **Upstream Fan-Out Reduction** | Reduces WAN bandwidth from `N × Multiviewers` upstream pulls to a **guaranteed constant pull count** via 3-second background manifest puller & request coalescing |
| **Zero Token Expiry** | Background resolver auto-refreshes Vidio/Akamai `hdnts` tokens every 15 minutes. Downstream clients connect to static local URLs that **never expire** |
| **Dual ISP Isolation** | Independent `/primary` (ISP 1) and `/backup` (ISP 2) sub-paths per channel for side-by-side hardware encoder monitoring |
| **Single-Encoder Detection** | Automatic `N/A` badge and bypass of backup probing/registration when `customBackupUrl` is blank |
| **Direct HLS Pass-Through** | Zero-demuxing manifest proxy on `:3000` that preserves Akamai's native fMP4 timestamps with **0 frame skips** and **0 timestamp resets** |
| **RTSP Redistribution** | MediaMTX-powered RTSP endpoints on `:8554` for hardware decoders and broadcast monitors |
| **Live Feed Inspector** | Built-in telemetry console with HLS.js player, instant Primary/Backup A/B switching, resolution/bitrate analytics |
| **Config Export & Import** | One-click JSON export and full-state replacement import (`POST /api/channels/import`) |
| **Search Filter Preservation** | UI search state maintained across 5-second background polling ticks |
| **Edge Segment Caching** | NGINX OpenResty proxy caches `.m4s` segments in RAM, serving repeated requests in sub-millisecond |

---

## Architecture

### System Overview

```mermaid
graph TB
    subgraph "Akamai CDN (WAN)"
        AK["Akamai Origin<br/>(Tokenized HLS)<br/>hdnts tokens"]
    end

    subgraph "Prometheus Gateway Server (192.168.40.54)"
        subgraph "Edge Proxy Layer"
            NX["NGINX Edge Proxy<br/>(OpenResty + Lua)<br/>Port: 80"]
        end

        subgraph "Gateway Resolver"
            GW["Express.js API<br/>(Token Resolver + REST)<br/>Port: 3000"]
            PULL["Background Manifest Puller<br/>(Every 3s Loop)<br/>Request Coalescing Store"]
        end

        subgraph "Stream Engine"
            MTX_HLS["MediaMTX HLS Engine<br/>(Golang fMP4 Remux)<br/>Port: 8880"]
            MTX_RTSP["MediaMTX RTSP Engine<br/>(Low-Latency)<br/>Port: 8554"]
            MTX_API["MediaMTX Control API<br/>(Path Registration)<br/>Port: 9997"]
        end

        subgraph "Dashboard"
            UI["Web Console<br/>(Vanilla JS + HLS.js)<br/>Port: 3000"]
        end
    end

    subgraph "Consumers (LAN)"
        MV["HLS Multiviewers<br/>(Browser Grid)"]
        VLC["VLC / Mividi<br/>(Master Control Room)"]
        DEC["Hardware Decoders<br/>(OBS / Playout)"]
    end

    AK -->|"Tokenized HLS<br/>(Primary & Backup)"| NX
    NX -->|"Lua Rewrite +<br/>Segment Cache"| PULL
    PULL -->|"Pre-Fetched Manifest Store"| GW
    GW -->|"Source URL<br/>Registration"| MTX_API
    MTX_API -->|"Path Config"| MTX_HLS
    MTX_API -->|"Path Config"| MTX_RTSP
    NX -->|"HLS Source"| MTX_HLS

    GW -->|"Direct HLS<br/>Pass-Through :3000<br/>(Served from Store)"| MV
    GW -->|"Direct HLS<br/>Pass-Through :3000<br/>(Served from Store)"| VLC
    MTX_RTSP -->|"RTSP :8554"| DEC

    UI <-->|"REST API"| GW

    classDef cdn fill:#1e3a8a,stroke:#3b82f6,stroke-width:3px,color:#ffffff
    classDef proxy fill:#7c2d12,stroke:#ea580c,stroke-width:3px,color:#ffffff
    classDef gateway fill:#166534,stroke:#22c55e,stroke-width:3px,color:#ffffff
    classDef engine fill:#581c87,stroke:#a855f7,stroke-width:3px,color:#ffffff
    classDef consumer fill:#1e3a8a,stroke:#3b82f6,stroke-width:3px,color:#ffffff
    classDef ui fill:#4a1d96,stroke:#8b5cf6,stroke-width:3px,color:#ffffff

    class AK cdn
    class NX proxy
    class GW,PULL gateway
    class MTX_HLS,MTX_RTSP,MTX_API engine
    class MV,VLC,DEC consumer
    class UI ui
```

### Fan-Out Reduction Flow (Background Puller / Request Coalescing)

```mermaid
sequenceDiagram
    autonumber
    participant PULL as Background Puller<br/>(Every 3s)
    participant NX as NGINX :80
    participant AK as Akamai CDN
    participant GW as Gateway Store<br/>(:3000 RAM)
    participant MV1 as Multiviewer 1
    participant MV2 as Multiviewer 2
    participant MV3 as Multiviewer 3

    Note over PULL, AK: Background Loop (Independent of Clients)
    PULL->>NX: Fetch /stream/204/file/master.m3u8
    NX->>AK: Proxy request to Akamai
    AK-->>NX: Tokenized manifest
    NX-->>PULL: Upstream manifest
    PULL->>GW: Rewrite URLs & Save to Manifest Store

    Note over MV1, MV3: Downstream Clients Fetching Continuously
    MV1->>GW: GET /live/204/primary/index.m3u8
    GW-->>MV1: Serve from RAM Store (X-Cache: HIT)

    MV2->>GW: GET /live/204/primary/index.m3u8
    GW-->>MV2: Serve from RAM Store (X-Cache: HIT)

    MV3->>GW: GET /live/204/primary/index.m3u8
    GW-->>MV3: Serve from RAM Store (X-Cache: HIT)

    Note over PULL, MV3: 0 client requests reach upstream. Upstream load is strictly 1 pull per 3s per channel.
```

### Dual Primary & Backup ISP Flow

```mermaid
graph LR
    subgraph "Akamai CDN"
        P_CDN["Primary Origin<br/>(ISP 1 / Encoder 1)"]
        B_CDN["Backup Origin<br/>(ISP 2 / Encoder 2)"]
    end

    subgraph "NGINX Edge Proxy :80"
        P_NX["/primary/..."]
        B_NX["/backup/..."]
    end

    subgraph "Prometheus Gateway :3000"
        P_HLS["/live/204/primary/index.m3u8"]
        B_HLS["/live/204/backup/index.m3u8"]
    end

    subgraph "MediaMTX :8554"
        P_RTSP["rtsp://.../live/204/primary"]
        B_RTSP["rtsp://.../live/204/backup"]
    end

    P_CDN --> P_NX --> P_HLS
    B_CDN --> B_NX --> B_HLS
    P_NX --> P_RTSP
    B_NX --> B_RTSP

    classDef pri fill:#065f46,stroke:#10b981,stroke-width:2px,color:#ffffff
    classDef bak fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#ffffff

    class P_CDN,P_NX,P_HLS,P_RTSP pri
    class B_CDN,B_NX,B_HLS,B_RTSP bak
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Backend** | Node.js 18 + Express 4 | Token resolver API, Direct HLS Pass-Through proxy, manifest cache |
| **Stream Engine** | MediaMTX (Golang) | RTSP/HLS/WebRTC fan-out with `sourceOnDemand` |
| **Edge Proxy** | OpenResty / NGINX | Lua token proxy, AV1 codec exclusion, RAM segment caching |
| **Frontend** | Vanilla JS + HLS.js | Telemetry dashboard, Live Feed Inspector, search/filter |
| **Typography** | Inter + JetBrains Mono | Sans-serif UI + monospace telemetry |
| **Container** | Docker Compose | Two-service orchestration on bridge network |
| **HTTP Client** | Axios | Upstream health probes, Vidio API, MediaMTX REST API |

---

## Port Allocations

| Port | Service | Description | Protocol |
|------|---------|-------------|:--------:|
| **`3000`** | **Gateway Resolver & REST API** | Control Dashboard, Channels API, Direct HLS Pass-Through (`/live/:id/:feed/index.m3u8`) with manifest TTL cache | HTTP |
| **`80`** | **NGINX Edge Proxy** | OpenResty Lua token proxy & AV1 exclusion (`/primary/...` & `/backup/...`), RAM segment cache | HTTP |
| **`8554`** | **MediaMTX RTSP Engine** | Low-latency RTSP endpoints (`rtsp://<SERVER_IP>:8554/live/:id/:feed`) | RTSP |
| **`8880`** | **MediaMTX HLS Engine** | Remuxed HLS endpoints (used internally by MediaMTX, not primary consumer path) | HTTP |
| **`9997`** | **MediaMTX Control API** | Internal REST API for dynamic path registration | HTTP |
| **`9998`** | **MediaMTX Metrics** | Prometheus metrics endpoint | HTTP |

---

## Stream Endpoints Guide

Downstream clients connect to **static local URLs that never expire**:

### HLS Endpoints (Port 3000 — Recommended)

| Channel | Primary HLS | Backup HLS |
|---------|-------------|------------|
| **SCTV** | `http://192.168.40.54:3000/live/204/primary/index.m3u8` | `http://192.168.40.54:3000/live/204/backup/index.m3u8` |
| **Indosiar** | `http://192.168.40.54:3000/live/205/primary/index.m3u8` | `http://192.168.40.54:3000/live/205/backup/index.m3u8` |
| **Trans TV** | `http://192.168.40.54:3000/live/733/primary/index.m3u8` | `http://192.168.40.54:3000/live/733/backup/index.m3u8` |
| **Bein 1** | `http://192.168.40.54:3000/live/6299/primary/index.m3u8` | `http://192.168.40.54:3000/live/6299/backup/index.m3u8` |

### RTSP Endpoints (Port 8554)

| Channel | Primary RTSP | Backup RTSP |
|---------|-------------|------------|
| **SCTV** | `rtsp://192.168.40.54:8554/live/204/primary` | `rtsp://192.168.40.54:8554/live/204/backup` |
| **Indosiar** | `rtsp://192.168.40.54:8554/live/205/primary` | `rtsp://192.168.40.54:8554/live/205/backup` |

> **URL Pattern**: Replace the channel ID in the URL to access any of the 49 configured channels.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/channels` | Returns enriched list of all channels with primary/backup endpoints & health states |
| `POST` | `/api/channels` | Add a new channel profile with optional custom primary/backup URLs |
| `PUT` | `/api/channels/:id` | Update an existing channel profile configuration |
| `DELETE` | `/api/channels/:id` | Remove channel profile and deregister MediaMTX stream paths |
| `POST` | `/api/channels/:id/refresh` | Force-refresh tokenized Akamai URLs for a specific channel |
| `GET` | `/api/channels/export` | Download `channels.json` as a backup file |
| `POST` | `/api/channels/import` | Replace full channel configuration and sync MediaMTX instantly |
| `GET` | `/live/:id/:feed/index.m3u8` | Direct HLS Pass-Through with manifest TTL cache (fan-out reduction) |

---

## Build & Deploy

Run on destination host `192.168.40.54`:

```bash
# 1. Update repository
cd ~/prometheus-project && git pull origin main

# 2. Build and restart Gateway Resolver container
sudo docker compose up -d --build gateway-resolver

# 3. Restart MediaMTX container
sudo docker compose restart mediamtx
```

### Verify Cache is Working

```bash
# First request should return X-Cache: MISS
curl -sI http://192.168.40.54:3000/live/204/primary/index.m3u8 | grep X-Cache

# Second request within 2s should return X-Cache: HIT
curl -sI http://192.168.40.54:3000/live/204/primary/index.m3u8 | grep X-Cache
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Gateway API port | `3000` |
| `MEDIAMTX_API` | MediaMTX REST API endpoint | `http://mediamtx:9997` |
| `PROXY_HOST` | NGINX Edge Proxy address | `http://192.168.40.54:80` |
| `REFRESH_INTERVAL_MINUTES` | Token refresh cycle interval | `15` |
| `VIDIO_API_KEY` | Vidio API authentication key | *(optional)* |
| `VIDIO_USER_ID` | Vidio user ID for token resolution | *(optional)* |
| `VIDIO_VISITOR_ID` | Vidio visitor ID | *(optional)* |

---

## Background Timers

| Interval | Purpose |
|----------|---------|
| **2 seconds** | Manifest TTL cache expiry (per channel/feed) |
| **5 seconds** | Frontend UI polling for channel status updates |
| **8 seconds** | Background health-check probes on all primary & backup URLs |
| **10 seconds** | Auto-resync MediaMTX paths (recovery after container restarts) |
| **15 minutes** | Scheduled Vidio/Akamai token refresh cycle |

---

## Documentation & Knowledge Base

- **Product Requirement Document (PRD)**: [PROMETHEUS_PRD.md](./PROMETHEUS_PRD.md)
- **Agent Guidelines & Rules**: [AGENTS.md](./AGENTS.md)
- **Graphify Knowledge Graph**: [graphify-out/GRAPH_REPORT.md](./graphify-out/GRAPH_REPORT.md)
