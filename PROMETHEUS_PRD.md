# Prometheus IP Stream Gateway — Product Requirement Document (PRD) & Tech Stack

> **Protocol Redistribution & Optimized Media Engine for Token-Isolated HLS & Enterprise Utility Streaming**  
> **Author:** Video Operations & Engineering Team  
> **Status:** Production / Approved  
> **Version:** 2.1.0  

---

## 1. Executive Summary

**Prometheus IP Stream Gateway** is a high-performance broadcast utility service designed to solve CDN token expiry, protocol fragmentation, and dual-ISP redundancy monitoring for enterprise IP video infrastructure. 

It ingest tokenized live HLS feeds (e.g. Akamai HDNT tokenized master playlists), strips transient token limitations via an edge proxy layer, remuxes incoming HLS streams into low-latency **RTSP** and **fMP4 HLS** endpoints, and maintains independent telemetry for **Primary (ISP 1)** and **Backup (ISP 2)** hardware encoders.

---

## 2. Product Requirements Document (PRD)

### 2.1 Problem Statement
1. **Transient CDN Token Expiry**: Live CDN streams (Akamai `hdnts` / `hdntl` tokens) expire periodically, causing standard broadcast monitoring decoders, VLC instances, and Multiviewer grids to freeze or fail with `403 Forbidden`.
2. **Protocol Incompatibility**: Monitoring decoders, OBS, and legacy hardware multiviewers require **RTSP** or zero-cookie HLS feeds, whereas web origins provide tokenized HTTP HLS.
3. **Dual-ISP & Hardware Encoder Isolation**: Broadcast operations require independent, side-by-side monitoring of **Primary (Hardware Encoder 1 / ISP 1)** and **Backup (Hardware Encoder 2 / ISP 2)** feeds per channel.
4. **Bandwidth Efficiency**: Continuous upstream pulling for 24+ channels on both primary and backup paths consumes excessive WAN bandwidth if streams are pulled when nobody is watching.

---

### 2.2 Functional Requirements

| ID | Feature Area | Description | Priority |
| :--- | :--- | :--- | :---: |
| **FR-01** | **Automated Token Resolution** | Automatically fetch, resolve, and rewrite tokenized Vidio/Akamai HLS master playlists via API every 15 minutes. | **P0 (Critical)** |
| **FR-02** | **Dual Primary & Backup Sub-Paths** | Expose independent sub-paths (`/live/:channel/primary` & `/live/:channel/backup`) per channel profile for dual hardware/ISP isolation. | **P0 (Critical)** |
| **FR-03** | **Single-Encoder Detection (`N/A` Rule)** | If a channel has no backup encoder or if `customBackupUrl` is blank, bypass backup probing/registration and display `N/A` in the UI. | **P1 (High)** |
| **FR-04** | **On-Demand Remuxing** | Utilize MediaMTX `sourceOnDemand` so upstream WAN bandwidth is consumed **only** when a client opens a specific stream endpoint. | **P0 (Critical)** |
| **FR-05** | **Zero-Redirect HLS & RTSP Output** | Serve static HLS manifests and RTSP stream tracks with zero 302 cookie redirects, ensuring universal VLC, HLS.js, and decoder compatibility. | **P0 (Critical)** |
| **FR-06** | **Live Feed Inspector** | Interactive UI drawer featuring a embedded HLS player with instant `[ PRIMARY ] / [ BACKUP ]` telemetry A/B switching and resolution/bitrate analytics. | **P1 (High)** |
| **FR-07** | **Config Import / Export** | One-click JSON export of channel inventory and full-state replacement import (`POST /api/channels/import`). | **P1 (High)** |

---

### 2.3 Non-Functional Requirements

- **Latency**: Internal remuxing delay $\le$ 1.0 second from origin to local RTSP/HLS endpoint.
- **Availability**: 99.99% uptime with automatic Docker container restart (`restart: unless-stopped`).
- **Telemetry Probing**: Background health check probes all active primary & backup URLs every 8 seconds via parallel non-blocking HTTP GET requests.
- **Resource Footprint**: Base memory footprint $\le$ 150 MB RAM for Gateway Resolver and MediaMTX container idle states.

---

## 3. System Architecture & Technical Stack

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

---

## 4. Technology Stack Specification

### 4.1 Backend Engine & API Layer
- **Runtime**: **Node.js (v18+ Alpine)**
- **API Framework**: **Express.js (v4)**
- **Stream Engine**: **MediaMTX (bluenviron/mediamtx:latest)**
  - *Role*: High-performance Golang RTSP, HLS, WebRTC stream server.
  - *Modes*: `authMethod: internal`, `hlsAddress: :8880`, `rtspAddress: :8554`, `sourceOnDemand: true`.
- **HTTP Client**: **Axios** (parallel background origin probing & MediaMTX REST API control).

### 4.2 Edge Proxy & Token Management Layer
- **Reverse Proxy**: **OpenResty / NGINX**
  - *Role*: Resolves Akamai upstream origins, rewrites single-variant master playlists, bypasses ISP region locks, and injects dynamic CORS headers.

### 4.3 Frontend Telemetry Console
- **Core**: **Vanilla HTML5 / Modern JavaScript (ES2022)**
- **Styling**: **Vanilla Modular CSS** (Dark tech aesthetic, CSS Grid/Flexbox, custom micro-indicators).
- **Typography**: **Google Fonts (Inter & JetBrains Mono)**
- **HLS Playback Engine**: **HLS.js (v1.5+)** (tweak-free media attachment, live fMP4 demuxing).

### 4.4 Infrastructure & Containerization
- **Containerization**: **Docker & Docker Compose**
- **Network Mode**: Linux Bridge with `extra_hosts: "host.docker.internal:host-gateway"` to resolve host loopback.
- **Port Mapping**:
  - `3000`: Prometheus Control Console & REST API
  - `8880`: Prometheus HLS Redistribution Output
  - `8554`: Prometheus RTSP Redistribution Output
  - `9997`: MediaMTX Internal REST Control API

---

## 5. API Reference Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/channels` | Returns enriched list of all channels with primary and backup HLS/RTSP endpoints & health states. |
| `POST` | `/api/channels` | Adds a new channel profile to inventory with optional custom primary/backup URLs. |
| `PUT` | `/api/channels/:id` | Updates an existing channel profile configuration. |
| `DELETE` | `/api/channels/:id` | Removes channel profile and deletes MediaMTX stream paths. |
| `POST` | `/api/channels/:id/refresh` | Force-refreshes tokenized Akamai URLs for a specific channel. |
| `GET` | `/api/channels/export` | Downloads `channels.json` as a `.json` backup file. |
| `POST` | `/api/channels/import` | Replaces full `channels.json` configuration and syncs MediaMTX instantly. |

---

## 6. Endpoints Data Model Example

```json
{
  "id": "204",
  "name": "sctv",
  "title": "SCTV",
  "isReady": true,
  "status": "online",
  "primary": {
    "source": "http://192.168.40.54:80/primary/etslive-v3-vidio-com-tokenized.akamaized.net/stream/204/file/master.m3u8?hdnts=...",
    "isReady": true,
    "status": "online",
    "outputHls": "http://192.168.40.54:8880/live/204/primary/index.m3u8?cookieCheck=1",
    "outputRtsp": "rtsp://192.168.40.54:8554/live/204/primary"
  },
  "backup": {
    "source": "http://192.168.40.54:80/backup/etslive-v3-vidio-com-tokenized.akamaized.net/stream/204/file/master.m3u8?hdnts=...",
    "isReady": true,
    "status": "online",
    "outputHls": "http://192.168.40.54:8880/live/204/backup/index.m3u8?cookieCheck=1",
    "outputRtsp": "rtsp://192.168.40.54:8554/live/204/backup"
  }
}
```
