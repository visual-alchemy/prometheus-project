# Graph Report - prometheus-project  (2026-08-10)

## Corpus Check
- 15 files · ~6,250 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 77 nodes · 95 edges · 12 communities (9 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `74c96a71`
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
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]

## God Nodes (most connected - your core abstractions)
1. `fetchChannels()` - 7 edges
2. `Prometheus IP Stream Gateway — Product Requirement Document (PRD) & Tech Stack` - 7 edges
3. `Prometheus Stream Gateway` - 6 edges
4. `syncAllChannels()` - 5 edges
5. `4. Technology Stack Specification` - 5 edges
6. `resolveStreamUrl()` - 4 edges
7. `updateMediaMtxPath()` - 4 edges
8. `switchInspectorFeed()` - 4 edges
9. `2. Product Requirements Document (PRD)` - 4 edges
10. `loadChannels()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `syncAllChannels()` --calls--> `resolveStreamUrl()`  [EXTRACTED]
  resolver/index.js → resolver/index.js  _Bridges community 7 → community 9_
- `syncAllChannels()` --calls--> `updateMediaMtxPath()`  [EXTRACTED]
  resolver/index.js → resolver/index.js  _Bridges community 8 → community 9_
- `fetchChannels()` --calls--> `filterChannels()`  [EXTRACTED]
  resolver/public/app.js → resolver/public/app.js  _Bridges community 5 → community 11_
- `fetchChannels()` --calls--> `populateInspector()`  [EXTRACTED]
  resolver/public/app.js → resolver/public/app.js  _Bridges community 5 → community 6_
- `saveStreamForm()` --calls--> `fetchChannels()`  [EXTRACTED]
  resolver/public/app.js → resolver/public/app.js  _Bridges community 5 → community 10_

## Import Cycles
- None detected.

## Communities (12 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.13
Nodes (14): 1. Executive Summary, 2.1 Problem Statement, 2.2 Functional Requirements, 2.3 Non-Functional Requirements, 2. Product Requirements Document (PRD), 3. System Architecture & Technical Stack, 4.1 Backend Engine & API Layer, 4.2 Edge Proxy & Token Management Layer (+6 more)

### Community 1 - "Community 1"
Cohesion: 0.18
Nodes (10): dependencies, axios, cors, express, description, main, name, scripts (+2 more)

### Community 2 - "Community 2"
Cohesion: 0.20
Nodes (8): app, axios, channelHealthMap, channelsPath, cors, express, fs, path

### Community 3 - "Community 3"
Cohesion: 0.22
Nodes (8): 1. Build and Start the Gateway, 2. Check Container Health & Logs, 📁 Architecture Overview, 📺 Available Stream Endpoints, ⚙️ Configuration & Custom Channels, 🚀 Key Features, Prometheus Stream Gateway, 🛠️ Quick Start & Running

### Community 5 - "Community 5"
Cohesion: 0.40
Nodes (5): closeSidebar(), deleteChannel(), fetchChannels(), refreshAllChannels(), refreshChannel()

### Community 6 - "Community 6"
Cohesion: 0.50
Nodes (4): inspectChannel(), loadVideoPlayerForFeed(), populateInspector(), switchInspectorFeed()

### Community 7 - "Community 7"
Cohesion: 0.50
Nodes (4): checkChannelHealth(), findM3u8Urls(), pingUrl(), resolveStreamUrl()

### Community 8 - "Community 8"
Cohesion: 0.50
Nodes (4): registerSingleMtxPath(), removeMediaMtxPath(), removeSingleMtxPath(), updateMediaMtxPath()

### Community 9 - "Community 9"
Cohesion: 1.00
Nodes (3): checkAllChannelsHealth(), loadChannels(), syncAllChannels()

## Knowledge Gaps
- **34 isolated node(s):** `fs`, `path`, `express`, `cors`, `axios` (+29 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `fs`, `path`, `express` to the rest of the system?**
  _34 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._