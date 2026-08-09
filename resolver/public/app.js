let channelsData = [];
let sidebarHls = null;
let currentInspectedId = null;

async function fetchChannels() {
  try {
    const res = await fetch('/api/channels');
    channelsData = await res.json();
    document.getElementById('channel-count').textContent = channelsData.length;
    renderTable(channelsData);

    if (currentInspectedId) {
      const activeCh = channelsData.find(c => c.id === currentInspectedId || c.name === currentInspectedId);
      if (activeCh) populateInspector(activeCh, currentFeedType);
    }
  } catch (e) {
    console.error('Failed to fetch channels:', e);
  }
}

function copyToClipboard(text, btnElement) {
  function showSuccess() {
    const originalContent = btnElement.innerHTML;
    btnElement.innerHTML = `
      <svg class="copy-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <span>Copied!</span>
    `;
    btnElement.classList.add('copied');
    setTimeout(() => {
      btnElement.innerHTML = originalContent;
      btnElement.classList.remove('copied');
    }, 2000);
  }

  function fallbackCopy() {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-99999px';
    textarea.style.top = '-99999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      const successful = document.execCommand('copy');
      if (successful) showSuccess();
      else alert('Failed to copy URL: ' + text);
    } catch (err) {
      console.error('Fallback copy error:', err);
      prompt('Copy stream URL:', text);
    }
    document.body.removeChild(textarea);
  }

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(showSuccess).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
}

let currentFeedType = 'primary';

function renderTable(channels) {
  const tbody = document.getElementById('channel-list');
  tbody.innerHTML = '';

  channels.forEach(ch => {
    const tr = document.createElement('tr');
    tr.id = `row-${ch.id}`;
    if (currentInspectedId === ch.id) tr.classList.add('active-row');

    const hasBackup = Boolean(ch.backup);
    const priOk = ch.primary ? ch.primary.isReady : ch.isReady;
    const bakOk = hasBackup ? ch.backup.isReady : false;

    const priDotClass = priOk ? 'status-indicator active pulse' : 'status-indicator offline';
    const bakDotHtml = hasBackup 
      ? `<span class="${bakOk ? 'status-indicator active pulse' : 'status-indicator offline'}" title="Backup Feed (ISP 2): ${bakOk ? 'Online' : 'Offline'}"></span>`
      : `<span class="status-indicator" style="background:#4b5563; box-shadow:none; opacity:0.5;" title="No Backup Source Configured (Single Encoder)"></span>`;

    const priHls = ch.primary ? ch.primary.outputHls : ch.outputHls;
    const bakHls = hasBackup ? ch.backup.outputHls : '';

    const backupUrlRow = hasBackup
      ? `<div style="margin-top:2px; opacity:0.8;"><span class="feed-badge-bak">BAK</span> ${ch.backup.source}</div>`
      : `<div style="margin-top:2px; opacity:0.5;"><span class="feed-badge-na" style="background:rgba(255,255,255,0.08); color:#9ca3af; border:1px solid rgba(255,255,255,0.15); font-size:9px; padding:2px 5px; border-radius:4px; font-weight:800;">N/A</span> <span style="font-style:italic; color:#9ca3af;">Single Encoder (No Backup)</span></div>`;

    const backupEndpointRow = hasBackup
      ? `<div style="display:flex; align-items:center; gap:6px;">
            <span class="feed-badge-bak">BAK</span>
            <span class="url-text full-url" style="font-size:10px;" title="${bakHls}">${bakHls}</span>
            <button class="btn-copy" onclick="copyToClipboard('${bakHls}', this)" title="Copy Backup HLS URL">
              <svg class="copy-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>Copy</span>
            </button>
          </div>`
      : `<div style="display:flex; align-items:center; gap:6px; opacity:0.5;">
            <span class="feed-badge-na" style="background:rgba(255,255,255,0.08); color:#9ca3af; border:1px solid rgba(255,255,255,0.15); font-size:9px; padding:2px 5px; border-radius:4px; font-weight:800;">N/A</span>
            <span class="url-text" style="font-size:10px; font-style:italic; color:#9ca3af;">No Backup Endpoint</span>
          </div>`;

    tr.innerHTML = `
      <td>
        <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
          <span class="${priDotClass}" title="Primary Feed (ISP 1): ${priOk ? 'Online' : 'Offline'}"></span>
          ${bakDotHtml}
        </div>
      </td>
      <td>
        <button class="channel-btn" onclick="inspectChannel('${ch.id}')" title="Click to inspect telemetry">
          <svg class="play-icon-svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span>${ch.title}</span>
        </button>
        <div style="color: var(--text-muted); font-size:10px; padding-left: 22px;">ID: ${ch.id} | Slug: ${ch.name}</div>
      </td>
      <td>
        <div class="url-text" style="font-size:10px;" title="Primary: ${ch.primary?.source || ch.resolvedSource}">
          <div><span class="feed-badge-pri">PRI</span> ${ch.primary?.source || ch.resolvedSource || 'Resolving...'}</div>
          ${backupUrlRow}
        </div>
      </td>
      <td>
        <div class="endpoint-cell" style="display:flex; flex-direction:column; gap:4px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="feed-badge-pri">PRI</span>
            <span class="url-text full-url" style="font-size:10px;" title="${priHls}">${priHls}</span>
            <button class="btn-copy" onclick="copyToClipboard('${priHls}', this)" title="Copy Primary HLS URL">
              <svg class="copy-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>Copy</span>
            </button>
          </div>
          ${backupEndpointRow}
        </div>
      </td>
      <td>
        <div style="display:flex; gap:4px; justify-content: flex-end;">
          <button class="btn-icon edit" onclick="openEditModal('${ch.id}')">Edit</button>
          <button class="btn-icon" onclick="refreshChannel('${ch.id}')">Sync</button>
          <button class="btn-icon delete" onclick="deleteChannel('${ch.id}')">✕</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function switchInspectorFeed(feedType) {
  currentFeedType = feedType;
  const btnPri = document.getElementById('btn-feed-primary');
  const btnBak = document.getElementById('btn-feed-backup');
  const feedLabel = document.getElementById('player-feed-label');

  if (feedType === 'primary') {
    btnPri.classList.add('active');
    btnBak.classList.remove('active');
    if (feedLabel) feedLabel.textContent = 'PRIMARY LIVE';
  } else {
    btnBak.classList.add('active');
    btnPri.classList.remove('active');
    if (feedLabel) feedLabel.textContent = 'BACKUP LIVE';
  }

  const activeCh = channelsData.find(c => c.id === currentInspectedId || c.name === currentInspectedId);
  if (activeCh) {
    populateInspector(activeCh, feedType);
    loadVideoPlayerForFeed(activeCh, feedType);
  }
}

function loadVideoPlayerForFeed(ch, feedType) {
  const video = document.getElementById('sidebar-video');
  if (sidebarHls) sidebarHls.destroy();

  const feedObj = (feedType === 'backup' && ch.backup) ? ch.backup : (ch.primary || ch);
  const streamUrl = feedObj.outputHls || ch.outputHls;

  if (Hls.isSupported()) {
    sidebarHls = new Hls({ enableWorker: true, lowLatencyMode: true });
    sidebarHls.loadSource(streamUrl);
    sidebarHls.attachMedia(video);
    
    sidebarHls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
      video.play().catch(() => {});
      if (data.levels && data.levels[0]) {
        const level = data.levels[0];
        document.getElementById('meta-res').textContent = `${level.width || 640}x${level.height || 360}`;
        document.getElementById('meta-fps').textContent = `${level.frameRate ? level.frameRate.toFixed(2) : '30.00'} fps`;
        if (level.bitrate) {
          document.getElementById('meta-bitrate').textContent = `${(level.bitrate / 1000).toFixed(0)} kbps`;
        }
      }
    });

    sidebarHls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
      if (data.details && data.details.totalduration) {
        document.getElementById('meta-buffer').textContent = 'Healthy';
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = streamUrl;
    video.play().catch(() => {});
  }
}

function inspectChannel(id) {
  const ch = channelsData.find(c => c.id === id || c.name === id);
  if (!ch) return;

  document.querySelectorAll('#channel-list tr').forEach(tr => tr.classList.remove('active-row'));
  const activeRow = document.getElementById(`row-${ch.id}`);
  if (activeRow) activeRow.classList.add('active-row');

  currentInspectedId = ch.id;

  document.getElementById('workspace').classList.add('sidebar-open');
  const sidebar = document.getElementById('sidebar-inspector');
  sidebar.classList.add('open');

  const toggleContainer = document.getElementById('feed-toggle-container');
  if (toggleContainer) toggleContainer.style.display = 'flex';

  const btnBak = document.getElementById('btn-feed-backup');
  if (btnBak) {
    if (!ch.backup) {
      btnBak.style.opacity = '0.4';
      btnBak.style.pointerEvents = 'none';
      btnBak.title = 'No Backup Source Configured (Single Encoder)';
    } else {
      btnBak.style.opacity = '1.0';
      btnBak.style.pointerEvents = 'auto';
      btnBak.title = 'Switch to Backup Feed';
    }
  }

  const priDot = document.getElementById('inspector-pri-dot');
  const bakDot = document.getElementById('inspector-bak-dot');
  if (priDot) priDot.className = ch.primary?.isReady ? 'status-indicator active pulse' : 'status-indicator offline';
  if (bakDot) {
    if (!ch.backup) {
      bakDot.className = 'status-indicator';
      bakDot.style.background = '#4b5563';
      bakDot.style.boxShadow = 'none';
    } else {
      bakDot.className = ch.backup.isReady ? 'status-indicator active pulse' : 'status-indicator offline';
    }
  }

  // If currently on backup but channel has no backup, force switch to primary
  const targetFeed = (!ch.backup && currentFeedType === 'backup') ? 'primary' : (currentFeedType || 'primary');
  switchInspectorFeed(targetFeed);
}

function populateInspector(ch, feedType = 'primary') {
  document.getElementById('inspector-title').textContent = ch.title;
  document.getElementById('inspector-empty').style.display = 'none';
  document.getElementById('inspector-details').style.display = 'flex';

  const isBackup = (feedType === 'backup' && ch.backup);
  const feedObj = isBackup ? ch.backup : (ch.primary || ch);

  const hlsInput = document.getElementById('endpoint-hls');
  const rtspInput = document.getElementById('endpoint-rtsp');
  const upstreamInput = document.getElementById('endpoint-upstream');

  if (hlsInput) hlsInput.value = isBackup ? (ch.backup ? ch.backup.outputHls : 'No Backup Endpoint') : (ch.primary ? ch.primary.outputHls : ch.outputHls);
  if (rtspInput) rtspInput.value = isBackup ? (ch.backup ? ch.backup.outputRtsp : 'No Backup Endpoint') : (ch.primary ? ch.primary.outputRtsp : ch.outputRtsp);
  if (upstreamInput) upstreamInput.value = isBackup ? (ch.backup ? ch.backup.source : 'No Backup Source Configured') : (ch.primary ? ch.primary.source : (ch.customPrimaryUrl || ch.customUrl || ch.resolvedSource || 'Auto-resolving...'));
}

function closeSidebar() {
  document.getElementById('sidebar-inspector').classList.remove('open');
  document.getElementById('workspace').classList.remove('sidebar-open');
  document.querySelectorAll('#channel-list tr').forEach(tr => tr.classList.remove('active-row'));
  currentInspectedId = null;

  if (sidebarHls) {
    sidebarHls.destroy();
    sidebarHls = null;
  }
  const video = document.getElementById('sidebar-video');
  video.pause();
  video.src = '';
}

function filterChannels() {
  const query = document.getElementById('search-input').value.toLowerCase();
  const filtered = channelsData.filter(c => 
    c.title.toLowerCase().includes(query) || 
    c.name.toLowerCase().includes(query) ||
    c.id.includes(query)
  );
  renderTable(filtered);
}

function openAddModal() {
  document.getElementById('modal-title').textContent = 'Add New HLS Stream Source';
  document.getElementById('edit-id').value = '';
  document.getElementById('form-title').value = '';
  document.getElementById('form-slug').value = '';
  document.getElementById('form-vidio-id').value = '';
  document.getElementById('form-custom-primary-url').value = '';
  document.getElementById('form-custom-backup-url').value = '';
  document.getElementById('stream-modal').classList.add('open');
}

function openEditModal(id) {
  const ch = channelsData.find(c => c.id === id || c.name === id);
  if (!ch) return;

  document.getElementById('modal-title').textContent = `Edit Source: ${ch.title}`;
  document.getElementById('edit-id').value = ch.id;
  document.getElementById('form-title').value = ch.title;
  document.getElementById('form-slug').value = ch.name;
  document.getElementById('form-vidio-id').value = ch.id;
  document.getElementById('form-custom-primary-url').value = ch.customPrimaryUrl || ch.customUrl || '';
  document.getElementById('form-custom-backup-url').value = ch.customBackupUrl || '';
  document.getElementById('stream-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('stream-modal').classList.remove('open');
}

async function saveStreamForm() {
  const editId = document.getElementById('edit-id').value;
  const title = document.getElementById('form-title').value;
  const name = document.getElementById('form-slug').value;
  const id = document.getElementById('form-vidio-id').value;
  const customPrimaryUrl = document.getElementById('form-custom-primary-url').value;
  const customBackupUrl = document.getElementById('form-custom-backup-url').value;

  if (!title || !name) {
    alert('Please fill in Display Title and Channel Slug.');
    return;
  }

  const payload = { 
    id: id || Date.now().toString(), 
    name, 
    title, 
    customPrimaryUrl, 
    customBackupUrl 
  };

  try {
    if (editId) {
      await fetch(`/api/channels/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    closeModal();
    fetchChannels();
  } catch (e) {
    alert('Failed to save channel: ' + e.message);
  }
}

async function refreshChannel(id) {
  try {
    await fetch(`/api/channels/${id}/refresh`, { method: 'POST' });
    fetchChannels();
  } catch (e) {
    console.error('Refresh error:', e);
  }
}

async function refreshAllChannels() {
  fetchChannels();
}

async function deleteChannel(id) {
  if (!confirm('Are you sure you want to delete this channel path?')) return;
  try {
    await fetch(`/api/channels/${id}`, { method: 'DELETE' });
    if (currentInspectedId === id) closeSidebar();
    fetchChannels();
  } catch (e) {
    alert('Failed to delete channel: ' + e.message);
  }
}

function exportChannelsConfig() {
  window.location.href = '/api/channels/export';
}

function triggerImportFileInput() {
  const input = document.getElementById('import-file-input');
  if (input) {
    input.value = '';
    input.click();
  }
}

async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const parsedData = JSON.parse(e.target.result);
      if (!Array.isArray(parsedData)) {
        alert('Invalid JSON file format: Content must be an array of channel objects.');
        return;
      }

      const confirmed = confirm(`⚠️ WARNING: Importing will COMPLETELY REPLACE all ${channelsData.length} existing channel configurations with ${parsedData.length} channels from "${file.name}".\n\nDo you want to proceed?`);
      if (!confirmed) return;

      const res = await fetch('/api/channels/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedData)
      });

      const result = await res.json();
      if (res.ok && result.success) {
        alert(`✅ Configuration Replaced Successfully!\n\n${result.count} channels imported and synced to MediaMTX.`);
        fetchChannels();
      } else {
        alert('❌ Import failed: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      alert('❌ Failed to parse JSON file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// Initial fetch & 5s status polling
fetchChannels();
setInterval(fetchChannels, 5000);
