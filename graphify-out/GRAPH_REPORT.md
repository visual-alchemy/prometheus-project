# Graph Report - prometheus-project  (2026-08-18)

## Corpus Check
- 18 files · ~89,239 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 124 nodes · 143 edges · 8 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8b7e838a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]

## God Nodes (most connected - your core abstractions)
1. `Prometheus IP Stream Gateway` - 11 edges
2. `AGENTS.md — Prometheus IP Stream Gateway` - 8 edges
3. `fetchChannels()` - 7 edges
4. `Prometheus IP Stream Gateway — Product Requirement Document (PRD) & Tech Stack` - 7 edges
5. `Key Architecture & Reliability Decisions (24/7 Stability)` - 6 edges
6. `Architecture` - 6 edges
7. `resolveStreamUrl()` - 5 edges
8. `syncAllChannels()` - 5 edges
9. `MEMORY.md — Prometheus IP Stream Gateway` - 5 edges
10. `4. Technology Stack Specification` - 5 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (8 total, 0 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.13
Nodes (14): 1. Executive Summary, 2.1 Problem Statement, 2.2 Functional Requirements, 2.3 Non-Functional Requirements, 2. Product Requirements Document (PRD), 3. System Architecture & Technical Stack, 4.1 Backend Engine & API Layer, 4.2 Edge Proxy & Token Management Layer (+6 more)

### Community 1 - "Community 1"
Cohesion: 0.18
Nodes (10): dependencies, axios, cors, express, description, main, name, scripts (+2 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (28): app, axios, channelHealthMap, channelsPath, checkAllChannelsHealth(), checkChannelHealth(), cors, express (+20 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (14): API Reference, Background Timers, Build & Deploy, Core Capabilities, Documentation & Knowledge Base, Environment Variables, Features, HLS Endpoints (Port 3000 — Recommended) (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.15
Nodes (14): channelsData, closeModal(), closeSidebar(), deleteChannel(), fetchChannels(), filterChannels(), inspectChannel(), loadVideoPlayerForFeed() (+6 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (13): 1. Zero-Disk-Thrash Channel Caching (`channelsCache`), 2. Persistent TCP Connection Pooling (`httpClient`), 3. Pure HLS Pass-Through Manifests (`:3000`), 4. Background Manifest Coalescing (`manifestStore`), 5. NGINX Edge Proxy Segment Caching & DNS Tuning, AGENTS.md — Prometheus IP Stream Gateway, Build & Verification Commands, Current Branch: `main` (+5 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (11): 1. Executive Summary & Mission, 2. Deep Incident Analysis: The 4-Hour Mividi Drop (Resolved), 3. Key Source Files & Architecture, 4. Diagnostics & Verification Reference, Log Signatures:, MEMORY.md — Prometheus IP Stream Gateway, Port & Service Topology:, Quick Python One-Liner to Check Mividi Session Durations: (+3 more)

### Community 7 - "Community 7"
Cohesion: 0.33
Nodes (6): Architecture, Dual Primary & Backup ISP Flow, Fan-Out Reduction Flow (Background Puller / Request Coalescing), System Overview, Technology Stack, Upstream Request Reduction Matrix

## Knowledge Gaps
- **67 isolated node(s):** `fs`, `http`, `https`, `path`, `express` (+62 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Prometheus IP Stream Gateway` connect `Community 3` to `Community 7`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `Architecture` connect `Community 7` to `Community 3`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `fs`, `http`, `https` to the rest of the system?**
  _67 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09885057471264368 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._