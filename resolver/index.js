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

// In-memory health cache for all channels: { [id]: { primary: boolean, backup: boolean | null } }
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
 * Resolve Primary and Backup M3U8 source URLs for a channel.
 * If backup source is explicitly blank or not configured, backup is set to null.
 */
async function resolveStreamUrl(channel) {
  const primaryFallback = `${PROXY_HOST}/primary/etslive-v3-vidio-com-tokenized.akamaized.net/stream/${channel.id}/file/master.m3u8`;
  const backupFallback = `${PROXY_HOST}/backup/etslive-v3-vidio-com-tokenized.akamaized.net/stream/${channel.id}/file/master.m3u8`;

  const customPri = (channel.customPrimaryUrl || channel.customUrl || '').trim();
  const customBak = (channel.customBackupUrl || '').trim();

  // Rule 1: If custom primary URL is set and custom backup URL is empty, BACKUP IS NULL (N/A)
  if (customPri && !customBak) {
    return { primary: customPri, backup: null };
  }

  // Rule 2: If custom backup URL is explicitly empty string ""
  if (channel.customBackupUrl === '') {
    return { primary: customPri || primaryFallback, backup: null };
  }

  // Rule 3: If both custom URLs are provided
  if (customPri && customBak) {
    return { primary: customPri, backup: customBak };
  }

  // Rule 4: Auto-resolve Vidio channels
  let primaryUrl = customPri;
  let backupUrl = customBak;

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
        if (!primaryUrl) primaryUrl = `${PROXY_HOST}/primary/${proxyPrefixMatch[2]}`;
        if (!backupUrl && channel.customBackupUrl !== '') {
          backupUrl = `${PROXY_HOST}/backup/${proxyPrefixMatch[2]}`;
        }
      }
    }
  } catch (err) {}

  return {
    primary: primaryUrl || primaryFallback,
    backup: channel.customBackupUrl === '' ? null : (backupUrl || backupFallback)
  };
}

/**
 * Register or update a single sub-path in MediaMTX
 */
async function registerSingleMtxPath(fullPath, sourceUrl) {
  const pathEndpoint = `${MEDIAMTX_API}/v3/config/paths/add/${fullPath}`;
  const replaceEndpoint = `${MEDIAMTX_API}/v3/config/paths/replace/${fullPath}`;
  const payload = {
    source: sourceUrl,
    sourceProtocol: 'automatic',
    sourceOnDemand: true,
    sourceOnDemandCloseAfter: '60s',
    overridePublisher: true
  };

  try {
    await axios.post(pathEndpoint, payload);
    console.log(`[Resolver] Registered ${fullPath}`);
  } catch (err) {
    try {
      await axios.post(replaceEndpoint, payload);
      console.log(`[Resolver] Updated ${fullPath}`);
    } catch (replaceErr) {
      console.error(`[Resolver] Failed ${fullPath}:`, replaceErr.response?.data || replaceErr.message);
    }
  }
}

/**
 * Remove path from MediaMTX
 */
async function removeSingleMtxPath(fullPath) {
  const deleteEndpoint = `${MEDIAMTX_API}/v3/config/paths/delete/${fullPath}`;
  try {
    await axios.delete(deleteEndpoint);
    console.log(`[Resolver] Removed ${fullPath}`);
  } catch (err) {}
}

/**
 * Register primary and backup stream paths in MediaMTX
 */
async function updateMediaMtxPath(pathName, sources) {
  if (sources.primary) {
    await registerSingleMtxPath(`live/${pathName}/primary`, sources.primary);
  }
  
  if (sources.backup) {
    await registerSingleMtxPath(`live/${pathName}/backup`, sources.backup);
  } else {
    await removeSingleMtxPath(`live/${pathName}/backup`);
  }
}

/**
 * Remove primary & backup sub-paths from MediaMTX
 */
async function removeMediaMtxPath(pathName) {
  await removeSingleMtxPath(`live/${pathName}/primary`);
  await removeSingleMtxPath(`live/${pathName}/backup`);
}

/**
 * Test HTTP 200/300 health of a URL
 */
async function pingUrl(url) {
  if (!url) return false;
  try {
    const res = await axios.get(url, { 
      timeout: 3000,
      validateStatus: (status) => status >= 200 && status < 400
    });
    return res.status >= 200 && res.status < 400;
  } catch (err) {
    return false;
  }
}

/**
 * Perform background health check on primary and backup streams
 */
async function checkChannelHealth(channel) {
  const sources = channel.resolvedSources || await resolveStreamUrl(channel);

  const primaryOk = sources.primary ? await pingUrl(sources.primary) : false;
  const backupOk = sources.backup ? await pingUrl(sources.backup) : null;

  channelHealthMap[channel.id] = { primary: primaryOk, backup: backupOk };
  return channelHealthMap[channel.id];
}

/**
 * Perform health checks across all channels in parallel
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
      const sources = await resolveStreamUrl(channel);
      channel.resolvedSources = sources;
      
      if (channel.id) {
        await updateMediaMtxPath(channel.id, sources);
      }
      
      if (channel.name && channel.name !== channel.id) {
        await updateMediaMtxPath(channel.name, sources);
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
    const primaryMtxData = mtxPaths[`live/${pathKey}/primary`] || mtxPaths[`live/${ch.name}/primary`];
    const backupMtxData = mtxPaths[`live/${pathKey}/backup`] || mtxPaths[`live/${ch.name}/backup`];

    const health = channelHealthMap[ch.id] || { primary: false, backup: null };

    const isPrimaryReady = (primaryMtxData ? primaryMtxData.ready === true : false) || (health.primary === true);
    
    const sources = ch.resolvedSources || {
      primary: (ch.customPrimaryUrl || ch.customUrl || '').trim() || `${PROXY_HOST}/primary/etslive-v3-vidio-com-tokenized.akamaized.net/stream/${ch.id}/file/master.m3u8`,
      backup: (ch.customPrimaryUrl || ch.customUrl) && !ch.customBackupUrl ? null : ((ch.customBackupUrl || '').trim() || null)
    };

    const hasBackup = Boolean(sources.backup);
    let backupObj = null;

    if (hasBackup) {
      const isBackupReady = (backupMtxData ? backupMtxData.ready === true : false) || (health.backup === true);
      backupObj = {
        source: sources.backup,
        isReady: isBackupReady,
        status: isBackupReady ? 'online' : 'offline',
        outputHls: `http://${serverIp}:8880/live/${pathKey}/backup/index.m3u8?cookieCheck=1`,
        outputRtsp: `rtsp://${serverIp}:8554/live/${pathKey}/backup`
      };
    }

    return {
      ...ch,
      isReady: isPrimaryReady || (backupObj ? backupObj.isReady : false),
      status: isPrimaryReady ? 'online' : 'offline',
      primary: {
        source: sources.primary,
        isReady: isPrimaryReady,
        status: isPrimaryReady ? 'online' : 'offline',
        outputHls: `http://${serverIp}:8880/live/${pathKey}/primary/index.m3u8?cookieCheck=1`,
        outputRtsp: `rtsp://${serverIp}:8554/live/${pathKey}/primary`
      },
      backup: backupObj,
      // Backward compatibility aliases
      resolvedSource: sources.primary,
      outputHls: `http://${serverIp}:8880/live/${pathKey}/primary/index.m3u8?cookieCheck=1`,
      outputRtsp: `rtsp://${serverIp}:8554/live/${pathKey}/primary`
    };
  });
  res.json(enriched);
});

app.post('/api/channels', async (req, res) => {
  const { id, name, title, customPrimaryUrl, customBackupUrl, customUrl } = req.body;
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
    customPrimaryUrl: (customPrimaryUrl || customUrl || '').trim(),
    customBackupUrl: (customBackupUrl || '').trim()
  };

  channels.push(newChannel);
  saveChannels(channels);

  const sources = await resolveStreamUrl(newChannel);
  newChannel.resolvedSources = sources;
  if (newChannel.id) await updateMediaMtxPath(newChannel.id, sources);
  if (newChannel.name && newChannel.name !== newChannel.id) await updateMediaMtxPath(newChannel.name, sources);

  await checkChannelHealth(newChannel);

  res.status(201).json({ success: true, channel: newChannel, sources });
});

app.put('/api/channels/:id', async (req, res) => {
  const { id } = req.params;
  const { name, title, customPrimaryUrl, customBackupUrl, customUrl } = req.body;
  const channels = loadChannels();

  const idx = channels.findIndex(c => c.id === id || c.name === id);
  if (idx === -1) return res.status(404).json({ error: 'Channel not found' });

  const target = channels[idx];
  if (title) target.title = title;
  if (customPrimaryUrl !== undefined) target.customPrimaryUrl = customPrimaryUrl.trim();
  if (customBackupUrl !== undefined) target.customBackupUrl = customBackupUrl.trim();
  if (customUrl !== undefined && !customPrimaryUrl) target.customPrimaryUrl = customUrl.trim();

  if (name && name !== target.name) {
    await removeMediaMtxPath(target.name);
    target.name = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  saveChannels(channels);

  const sources = await resolveStreamUrl(target);
  target.resolvedSources = sources;
  if (target.id) await updateMediaMtxPath(target.id, sources);
  if (target.name && target.name !== target.id) await updateMediaMtxPath(target.name, sources);

  await checkChannelHealth(target);

  res.json({ success: true, channel: target, sources });
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
    const sources = await resolveStreamUrl(target);
    target.resolvedSources = sources;
    if (target.id) await updateMediaMtxPath(target.id, sources);
    if (target.name && target.name !== target.id) await updateMediaMtxPath(target.name, sources);
    await checkChannelHealth(target);
    res.json({ success: true, channel: target, sources });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Express server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Resolver] Prometheus Gateway Resolver API running on port ${PORT}`);
  
  // Initial sync & background origin health check
  syncAllChannels();

  // Background health check every 8 seconds for all channels
  setInterval(() => {
    checkAllChannelsHealth();
  }, 8000);

  // Background token refresh interval (every 15 minutes)
  setInterval(() => {
    console.log('[Resolver] Running scheduled token sync...');
    syncAllChannels();
  }, REFRESH_INTERVAL_MS);
});
