const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const MEDIAMTX_API = process.env.MEDIAMTX_API || 'http://mediamtx:9997';
const PROXY_HOST = process.env.PROXY_HOST || 'http://192.168.40.54:80';
const REFRESH_INTERVAL_MS = (parseInt(process.env.REFRESH_INTERVAL_MINUTES, 10) || 15) * 60 * 1000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const channelsPath = path.join(__dirname, 'channels.json');

// In-memory health cache for all channels
const channelHealthMap = {};

function loadChannels() {
  try {
    const raw = fs.readFileSync(channelsPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[Resolver] Failed to load channels.json:', err.message);
    return [];
  }
}

function saveChannels(channels) {
  try {
    fs.writeFileSync(channelsPath, JSON.stringify(channels, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Resolver] Failed to save channels.json:', err.message);
    return false;
  }
}

function findM3u8Urls(obj) {
  let urls = [];
  if (typeof obj === 'string' && obj.includes('.m3u8')) {
    urls.push(obj);
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      urls = urls.concat(findM3u8Urls(item));
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const key of Object.keys(obj)) {
      urls = urls.concat(findM3u8Urls(obj[key]));
    }
  }
  return urls;
}

/**
 * Resolve fresh M3U8 source URL for a channel
 */
async function resolveStreamUrl(channel) {
  if (channel.customUrl && channel.customUrl.trim() !== '') {
    return channel.customUrl.trim();
  }

  const vidioApiUrl = `https://api.vidio.com/livestreamings/${channel.id}/stream?initialize=true`;
  const headers = {
    'Referer': 'https://www.vidio.com/',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    'X-Secure-Level': '2',
    'X-API-Platform': 'web-desktop',
    'X-API-App-Info': 'js/www.vidio.com'
  };

  if (process.env.VIDIO_API_KEY) headers['X-Api-Key'] = process.env.VIDIO_API_KEY;
  if (process.env.VIDIO_USER_ID) headers['X-User-Id'] = process.env.VIDIO_USER_ID;
  if (process.env.VIDIO_VISITOR_ID) headers['X-Visitor-Id'] = process.env.VIDIO_VISITOR_ID;

  try {
    const response = await axios.get(vidioApiUrl, { headers, timeout: 8000 });
    const urls = findM3u8Urls(response.data);
    if (urls.length > 0) {
      let resolvedUrl = urls[0];
      const proxyPrefixMatch = resolvedUrl.match(/^(https?:\/\/[^\/]+\/)(.*)$/);
      if (proxyPrefixMatch) {
        return `${PROXY_HOST}/primary/${proxyPrefixMatch[2]}`;
      }
      return resolvedUrl;
    }
  } catch (err) {
    // Fall back to headend proxy format
  }

  return `${PROXY_HOST}/primary/etslive-v3-vidio-com-tokenized.akamaized.net/stream/${channel.id}/file/master.m3u8`;
}

/**
 * Register or update stream path in MediaMTX via REST API (On-Demand)
 */
async function updateMediaMtxPath(pathName, sourceUrl) {
  const pathEndpoint = `${MEDIAMTX_API}/v3/config/paths/add/live/${pathName}`;
  const replaceEndpoint = `${MEDIAMTX_API}/v3/config/paths/replace/live/${pathName}`;
  const payload = {
    source: sourceUrl,
    sourceProtocol: 'automatic',
    sourceOnDemand: true,
    sourceOnDemandCloseAfter: '60s',
    overridePublisher: true
  };

  try {
    await axios.post(pathEndpoint, payload);
    console.log(`[Resolver] Registered live/${pathName}`);
  } catch (err) {
    try {
      await axios.post(replaceEndpoint, payload);
      console.log(`[Resolver] Updated live/${pathName}`);
    } catch (replaceErr) {
      console.error(`[Resolver] Failed live/${pathName}:`, replaceErr.response?.data || replaceErr.message);
    }
  }
}

/**
 * Remove path from MediaMTX
 */
async function removeMediaMtxPath(pathName) {
  const deleteEndpoint = `${MEDIAMTX_API}/v3/config/paths/delete/live/${pathName}`;
  try {
    await axios.delete(deleteEndpoint);
    console.log(`[Resolver] Removed live/${pathName}`);
  } catch (err) {
    console.error(`[Resolver] Failed to delete live/${pathName}:`, err.message);
  }
}

/**
 * Perform background health check on a single channel source URL
 */
async function checkChannelHealth(channel) {
  const targetUrl = channel.customUrl || channel.resolvedSource;
  if (!targetUrl) {
    channelHealthMap[channel.id] = false;
    return false;
  }

  try {
    const res = await axios.get(targetUrl, { 
      timeout: 3000,
      validateStatus: (status) => status >= 200 && status < 400
    });
    const isOk = res.status >= 200 && res.status < 400;
    channelHealthMap[channel.id] = isOk;
    return isOk;
  } catch (err) {
    channelHealthMap[channel.id] = false;
    return false;
  }
}

/**
 * Perform health checks across all 24 channels in parallel
 */
async function checkAllChannelsHealth() {
  const channels = loadChannels();
  await Promise.all(channels.map(ch => checkChannelHealth(ch)));
}

/**
 * Sync all channel paths to MediaMTX
 */
async function syncAllChannels() {
  const channels = loadChannels();
  console.log(`[Resolver] Syncing ${channels.length} channels to MediaMTX...`);

  for (const channel of channels) {
    try {
      const sourceUrl = await resolveStreamUrl(channel);
      channel.resolvedSource = sourceUrl;
      
      if (channel.id) {
        await updateMediaMtxPath(channel.id, sourceUrl);
      }
      
      if (channel.name && channel.name !== channel.id) {
        await updateMediaMtxPath(channel.name, sourceUrl);
      }
    } catch (err) {
      console.error(`[Resolver] Error on ${channel.name}:`, err.message);
    }
  }

  await checkAllChannelsHealth();
}

// REST API Endpoints
app.get('/api/channels', async (req, res) => {
  const channels = loadChannels();
  const hostHeader = req.get('host') || 'localhost:3000';
  const serverIp = hostHeader.split(':')[0];

  // Also query MediaMTX paths to detect actively streamed paths
  let mtxPaths = {};
  try {
    const mtxRes = await axios.get(`${MEDIAMTX_API}/v3/paths/list`, { timeout: 2000 });
    if (mtxRes.data && mtxRes.data.items) {
      for (const item of mtxRes.data.items) {
        mtxPaths[item.name] = item;
      }
    }
  } catch (e) {}

  const enriched = channels.map(ch => {
    const pathKey = ch.id || ch.name;
    const pathData = mtxPaths[`live/${pathKey}`] || mtxPaths[`live/${ch.name}`];
    
    // A channel is ready if EITHER:
    // 1) MediaMTX path is ready (stream actively playing/requested), OR
    // 2) Our background health-checker confirmed upstream URL returns 200 OK
    const mtxReady = pathData ? pathData.ready === true : false;
    const originHealth = channelHealthMap[ch.id] === true;
    const isReady = mtxReady || originHealth;

    return {
      ...ch,
      isReady,
      status: isReady ? 'online' : 'offline',
      resolvedSource: ch.customUrl || ch.resolvedSource || `${PROXY_HOST}/primary/etslive-v3-vidio-com-tokenized.akamaized.net/stream/${ch.id}/file/master.m3u8`,
      outputHls: `http://${serverIp}:8888/live/${pathKey}/index.m3u8?cookieCheck=1`,
      outputRtsp: `rtsp://${serverIp}:8554/live/${pathKey}`,
      outputWebRtc: `http://${serverIp}:8889/live/${pathKey}`,
    };
  });
  res.json(enriched);
});

app.post('/api/channels', async (req, res) => {
  const { id, name, title, customUrl } = req.body;
  if (!name) return res.status(400).json({ error: 'Channel name slug is required' });

  const channels = loadChannels();
  const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (channels.some(c => c.name === cleanName)) {
    return res.status(400).json({ error: `Channel slug '${cleanName}' already exists` });
  }

  const newChannel = {
    id: id || Date.now().toString(),
    name: cleanName,
    title: title || cleanName.toUpperCase(),
    customUrl: customUrl || ''
  };

  channels.push(newChannel);
  saveChannels(channels);

  const sourceUrl = await resolveStreamUrl(newChannel);
  if (newChannel.id) await updateMediaMtxPath(newChannel.id, sourceUrl);
  if (newChannel.name && newChannel.name !== newChannel.id) await updateMediaMtxPath(newChannel.name, sourceUrl);

  await checkChannelHealth(newChannel);

  res.status(201).json({ success: true, channel: newChannel, sourceUrl });
});

app.put('/api/channels/:id', async (req, res) => {
  const { id } = req.params;
  const { name, title, customUrl } = req.body;
  const channels = loadChannels();

  const idx = channels.findIndex(c => c.id === id || c.name === id);
  if (idx === -1) return res.status(404).json({ error: 'Channel not found' });

  const target = channels[idx];
  if (title) target.title = title;
  if (customUrl !== undefined) target.customUrl = customUrl;
  if (name && name !== target.name) {
    await removeMediaMtxPath(target.name);
    target.name = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  saveChannels(channels);

  const sourceUrl = await resolveStreamUrl(target);
  if (target.id) await updateMediaMtxPath(target.id, sourceUrl);
  if (target.name && target.name !== target.id) await updateMediaMtxPath(target.name, sourceUrl);

  await checkChannelHealth(target);

  res.json({ success: true, channel: target, sourceUrl });
});

app.delete('/api/channels/:id', async (req, res) => {
  const { id } = req.params;
  let channels = loadChannels();

  const target = channels.find(c => c.id === id || c.name === id);
  if (!target) return res.status(404).json({ error: 'Channel not found' });

  channels = channels.filter(c => c.id !== id && c.name !== id);
  saveChannels(channels);
  delete channelHealthMap[id];

  if (target.id) await removeMediaMtxPath(target.id);
  if (target.name) await removeMediaMtxPath(target.name);

  res.json({ success: true, message: `Channel ${id} removed` });
});

app.post('/api/channels/:id/refresh', async (req, res) => {
  const { id } = req.params;
  const channels = loadChannels();
  const target = channels.find(c => c.id === id || c.name === id);
  if (!target) return res.status(404).json({ error: 'Channel not found' });

  try {
    const freshUrl = await resolveStreamUrl(target);
    target.resolvedSource = freshUrl;
    if (target.id) await updateMediaMtxPath(target.id, freshUrl);
    if (target.name && target.name !== target.id) await updateMediaMtxPath(target.name, freshUrl);
    await checkChannelHealth(target);
    res.json({ success: true, channel: target, sourceUrl: freshUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Express server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Resolver] Prometheus Gateway Resolver API running on port ${PORT}`);
  
  // Initial sync & background origin health check
  syncAllChannels();

  // Background health check every 8 seconds for all 24 channels
  setInterval(() => {
    checkAllChannelsHealth();
  }, 8000);

  // Background token refresh interval (every 15 minutes)
  setInterval(() => {
    console.log('[Resolver] Running scheduled token sync...');
    syncAllChannels();
  }, REFRESH_INTERVAL_MS);
});
