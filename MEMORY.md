# MEMORY.md — Prometheus IP Stream Gateway

> **Persistent Context & Incident Log for AI Models and Agents**  
> *Last Updated: August 18, 2026*  
> *Active Server: `192.168.40.54` (`woi@192.168.40.54`)*  
> *Repository: `visual-alchemy/prometheus-project` (Branch: `main`)*

---

## 1. Executive Summary & Mission

Prometheus IP Stream Gateway is a high-performance broadcast stream reflector, proxy, and multiviewer distribution engine designed for 24/7 mission-critical video walls (specifically **Mividi VideoWall** with 25+ simultaneous panels).

### Port & Service Topology:
- **`:80` (OpenResty NGINX Proxy)**: Caches media segments (`.m4s`, `.mp4` init maps) in RAM (`STREAM_CACHE`), filters out AV1 (`av01`) video tracks in Lua to ensure clean H.264/360p delivery, resolves DNS via IPv4 only (`ipv6=off`).
- **`:3000` (Node.js Gateway Resolver)**: Manages channel inventory (`channels.json`), resolves ephemeral Akamai tokens on-demand, coalesces upstream master manifests every 3 seconds into RAM (`manifestStore`), serves static local HLS endpoints (`/live/:id/:feed/index.m3u8`).
- **`:8554` / `:9997` (MediaMTX Golang Engine)**: On-demand RTSP engine for surveillance/multiviewer decoders.

---

## 2. Deep Incident Analysis: The 4-Hour Mividi Drop (Resolved)

### Symptom:
Every 4 hours and 2–4 minutes (240–244 minutes, exactly ~14,500s), all 25 panels on Mividi VideoWall (`p1`–`p25`) stalled simultaneously with `System.ServiceModel.CommunicationException (0x6d)` (*ERROR_BROKEN_PIPE*) and showed **"No Input"**, requiring a manual restart of Mividi. Meanwhile, direct playback on Port `:80` ran 24/7 without issues.

### Log Signatures:
- **File**: `Logs/VwLog.txt`
- **Pattern**: 24 distinct sessions over 3 days (Aug 16–18), every single run lasted 242–244 minutes.

### Root Causes Discovered & Fixed:

| # | Root Cause | Mechanism of Failure | Fix Applied (Commit) |
|---|---|---|---|
| **1** | **Synchronous Disk I/O Thrashing** | `loadChannels()` executed synchronous `fs.readFileSync()` on every 3-second manifest tick AND every incoming HTTP request (over 4,800 disk reads per 4 hours), blocking Node's event loop. | Implemented in-memory `channelsCache` with `fs.statSync` `mtime` invalidation. Disk is read only when `channels.json` actually changes. (`9cfe6f8`) |
| **2** | **TCP Socket Exhaustion (TIME_WAIT)** | `pingUrl()` in health checker and `resolveStreamUrl()` for Vidio API used raw `axios.get()`, creating fresh TCP sockets on every call and accumulating thousands of orphaned sockets in Linux `TIME_WAIT`. | Converted ALL HTTP calls (`pingUrl`, `resolveStreamUrl`, `fetchManifestWithAutoHealing`) to use `httpClient` with persistent `http.Agent`/`https.Agent` connection pooling (`keepAlive: true, maxSockets: 100`). (`9cfe6f8`) |
| **3** | **Overlapping Background Timer Thrash** | Three concurrent intervals ran every 3s, 8s, and 10s, generating ~56 internal HTTP requests/sec (>800,000 requests per 4h) and hammering MediaMTX REST API `:9997`. | Removed the 10-second `syncAllChannels()` loop completely (now syncs on startup and UI edits only). Relaxed health checks from 8s to 60s. (`ae10de9`) |
| **4** | **A/V Timestamp Drift from `#EXT-X-START`** | Injected `#EXT-X-START:TIME-OFFSET=-18.0` and segment trimming caused Mividi DirectShow demuxers to drift between separated Audio (`/aac/`) and Video (`/avc-360p/`) tracks over ~2,400 segments. | Removed `#EXT-X-START` and segment trimming from `rewriteManifest()`. Manifests are delivered 100% pure and untouched, identical to direct Port `:80` streams. (`a3555bc`) |
| **5** | **NGINX IPv6 Resolution Failures** | NGINX DNS resolver queried AAAA records for Akamai (`akamaized.net`), attempting IPv6 connections that failed with `101: Network unreachable`. | Configured `resolver 192.168.40.1 1.1.1.1 8.8.8.8 valid=300s ipv6=off;` in `nginx_proxy.conf`. (`a3555bc`) |

---

## 3. Key Source Files & Architecture

| Path | Purpose |
|---|---|
| [`resolver/index.js`](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/resolver/index.js) | Express server, `manifestStore` (coalesced 3s RAM cache), `channelsCache` (stat-based RAM cache), `httpClient` (keep-alive agent pool), `/live/:id/:feed/index.m3u8` pass-through endpoint. |
| [`resolver/channels.json`](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/resolver/channels.json) | Channel configuration database. Primary/backup URLs, custom stream overrides, channel slugs. |
| [`proxyremote/nginx_proxy.conf`](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/proxyremote/nginx_proxy.conf) | OpenResty NGINX configuration: Lua AV1 filter, `STREAM_CACHE` (RAM segment cache), `ipv6=off` DNS resolver. |
| [`resolver/public/app.js`](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/resolver/public/app.js) | Frontend UI logic, 5s polling, search filter retention, Live Inspector HLS player. |
| [`Logs/VwLog.txt`](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/Logs/VwLog.txt) | Mividi VideoWall event log file (IPC, pipe status, panel restart timestamps). |
| [`Logs/Mividi V3 Backup Gateway.xml`](file:///Users/eldyreynanda/Developer/Antigravity/prometheus-project/Logs/Mividi%20V3%20Backup%20Gateway.xml) | Mividi 25-panel layout and endpoint mapping configuration. |

---

## 4. Diagnostics & Verification Reference

### Quick Python One-Liner to Check Mividi Session Durations:
```bash
python3 -c '
import re, datetime
with open("Logs/VwLog.txt") as f: lines = f.readlines()
restarts = [m.group(1) for line in lines if (m := re.match(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*p1 has been restarted", line))]
print(f"Total sessions: {len(restarts)}")
for i in range(len(restarts)-1):
    s = datetime.datetime.strptime(restarts[i], "%Y-%m-%d %H:%M:%S")
    e = datetime.datetime.strptime(restarts[i+1], "%Y-%m-%d %H:%M:%S")
    d = (e - s).total_seconds() / 60
    print(f"  Session {i+1}: {restarts[i]} -> {restarts[i+1]} ({d:.0f} min)")
'
```

### Remote Server Deployment Commands (`192.168.40.54`):
```bash
# Pull latest code and rebuild gateway-resolver
cd ~/prometheus-project && git pull origin main
sudo docker compose up -d --build gateway-resolver

# Check container logs
sudo docker logs prometheus-gateway-resolver --tail 50
sudo docker logs custom-nginx-proxy --tail 50
```
