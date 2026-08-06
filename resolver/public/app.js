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
      if (activeCh) populateInspector(activeCh);
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

function renderTable(channels) {
  const tbody = document.getElementById('channel-list');
  tbody.innerHTML = '';

  channels.forEach(ch => {
    const tr = document.createElement('tr');
    tr.id = `row-${ch.id}`;
    if (currentInspectedId === ch.id) tr.classList.add('active-row');

    const isOnline = ch.isReady === true;
    const statusDotClass = isOnline ? 'status-indicator active pulse' : 'status-indicator offline';
    const statusTitle = isOnline ? 'MediaMTX Path Active & Ready' : 'Stream Disconnected / Token Expired / Error';

    tr.innerHTML = `
      <td><span class="${statusDotClass}" title="${statusTitle}"></span></td>
      <td>
        <button class="channel-btn" onclick="inspectChannel('${ch.id}')" title="Click to inspect telemetry">
          <svg class="play-icon-svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span>${ch.title}</span>
        </button>
        <div style="color: var(--text-muted); font-size:10px; padding-left: 22px;">ID: ${ch.id} | Slug: ${ch.name}</div>
      </td>
      <td>
        <div class="url-text" title="${ch.customUrl || ch.resolvedSource || 'Auto-resolving...'}">
          ${ch.customUrl ? '<span class="pin-badge">PINNED</span> ' + ch.customUrl : (ch.resolvedSource || 'Auto-resolving...')}
        </div>
      </td>
      <td>
        <div class="endpoint-cell">
          <span class="url-text full-url" title="${ch.outputHls}">${ch.outputHls}</span>
          <button class="btn-copy" onclick="copyToClipboard('${ch.outputHls}', this)" title="Copy HLS URL">
            <svg class="copy-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>Copy</span>
          </button>
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

function inspectChannel(id) {
  const ch = channelsData.find(c => c.id === id || c.name === id);
  if (!ch) return;

  document.querySelectorAll('#channel-list tr').forEach(tr => tr.classList.remove('active-row'));
  const activeRow = document.getElementById(`row-${ch.id}`);
  if (activeRow) activeRow.classList.add('active-row');

  currentInspectedId = ch.id;
  populateInspector(ch);

  document.getElementById('workspace').classList.add('sidebar-open');
  const sidebar = document.getElementById('sidebar-inspector');
  sidebar.classList.add('open');

  const video = document.getElementById('sidebar-video');
  if (sidebarHls) sidebarHls.destroy();

  if (Hls.isSupported()) {
    sidebarHls = new Hls({ enableWorker: true, lowLatencyMode: true });
    sidebarHls.loadSource(ch.outputHls);
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
    video.src = ch.outputHls;
    video.play().catch(() => {});
  }
}

function populateInspector(ch) {
  document.getElementById('inspector-title').textContent = ch.title;
  document.getElementById('inspector-empty').style.display = 'none';
  document.getElementById('inspector-details').style.display = 'flex';

  document.getElementById('endpoint-hls').value = ch.outputHls;
  document.getElementById('endpoint-rtsp').value = ch.outputRtsp;
  document.getElementById('endpoint-webrtc').value = ch.outputWebRtc;
  document.getElementById('endpoint-upstream').value = ch.customUrl || ch.resolvedSource || 'Auto-resolving...';
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
  document.getElementById('form-custom-url').value = '';
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
  document.getElementById('form-custom-url').value = ch.customUrl || '';
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
  const customUrl = document.getElementById('form-custom-url').value;

  if (!title || !name) {
    alert('Please fill in Display Title and Channel Slug.');
    return;
  }

  const payload = { id: id || Date.now().toString(), name, title, customUrl };

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

// Initial fetch & 5s status polling
fetchChannels();
setInterval(fetchChannels, 5000);
