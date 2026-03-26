/** @param {string} url @param {RequestInit} opts */
async function api(url, opts = {}) {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/';
    return;
  }

  const headers = { ...opts.headers, Authorization: `Bearer ${token}` };
  const res = await fetch(url, { ...opts, headers });

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/';
    return;
  }

  return res;
}

// Redirect to login if no token
if (!localStorage.getItem('token')) {
  window.location.href = '/';
}

// --- Logout ---
document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  localStorage.removeItem('token');
  window.location.href = '/';
});

// --- Tabs ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
});

// --- Upload ---
document.getElementById('upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('receipt-file');
  const statusEl = document.getElementById('upload-status');
  const resultsEl = document.getElementById('upload-results');
  const submitBtn = document.getElementById('upload-btn');

  if (!fileInput.files.length) return;

  statusEl.textContent = 'Processing receipt...';
  statusEl.className = 'status processing';
  statusEl.classList.remove('hidden');
  resultsEl.innerHTML = '';
  submitBtn.disabled = true;

  const formData = new FormData();
  formData.append('receipt', fileInput.files[0]);

  try {
    const res = await api('/api/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res) return;

    const data = await res.json();

    if (!res.ok) {
      statusEl.textContent = data.error || 'Upload failed';
      statusEl.className = 'status error';
      return;
    }

    if (data.reviewQueued && data.itemsInserted === 0) {
      statusEl.textContent = 'Receipt could not be parsed automatically.';
      statusEl.className = 'status error';
      resultsEl.innerHTML = `<div class="review-notice">Queued for manual review: ${escapeHtml(data.reviewReason)}</div>`;
      return;
    }

    const msg = `${data.itemsInserted} item${data.itemsInserted === 1 ? '' : 's'} saved.`;
    statusEl.textContent = data.itemsFailed ? `${msg} ${data.itemsFailed} failed.` : msg;
    statusEl.className = data.itemsFailed ? 'status error' : 'status success';

    if (data.reviewQueued) {
      resultsEl.innerHTML = `<div class="review-notice">Some items queued for review: ${escapeHtml(data.reviewReason)}</div>`;
    }

    resultsEl.innerHTML += renderItems(data.items);
    fileInput.value = '';
  } catch (err) {
    statusEl.textContent = `Network error: ${err.message}`;
    statusEl.className = 'status error';
  } finally {
    submitBtn.disabled = false;
  }
});

/** @param {Array} items */
function renderItems(items) {
  if (!items || items.length === 0) return '';
  return `<div class="results-wrap">
    <table>
      <thead><tr><th>Store</th><th>Product</th><th>Category</th><th>Date</th><th>Cost</th><th>Qty</th></tr></thead>
      <tbody>
        ${items.map(i => `<tr>
            <td>${escapeHtml(i.store)}</td>
            <td>${escapeHtml(i.product)}</td>
            <td>${escapeHtml(i.category)}</td>
            <td>${escapeHtml(i.date)}</td>
            <td>$${Number(i.cost).toFixed(2)}</td>
            <td>${i.quantity}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

// --- Query ---
document.getElementById('query-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const question = document.getElementById('question').value.trim();
  const resultsEl = document.getElementById('query-results');
  const submitBtn = document.getElementById('query-btn');

  if (!question) return;

  resultsEl.innerHTML = '<p class="loading">Thinking...</p>';
  submitBtn.disabled = true;

  try {
    const res = await api('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    if (!res) return;

    const data = await res.json();

    if (!res.ok) {
      resultsEl.innerHTML = `<p class="error">${escapeHtml(data.error || 'Query failed')}</p>`;
      if (data.sql) {
        resultsEl.innerHTML += `<details><summary>Generated SQL</summary><pre>${escapeHtml(data.sql)}</pre></details>`;
      }
      return;
    }

    let html = '';

    if (!data.results || data.results.length === 0) {
      html = '<p>No results found.</p>';
    } else {
      const keys = Object.keys(data.results[0]);
      html = `<div class="results-wrap">
        <table>
          <thead><tr>${keys.map(k => `<th>${escapeHtml(k)}</th>`).join('')}</tr></thead>
          <tbody>
            ${data.results.map(row => `<tr>${keys.map(k => `<td>${escapeHtml(String(row[k] ?? ''))}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    }

    html += `<details><summary>Generated SQL</summary><pre>${escapeHtml(data.sql)}</pre></details>`;
    resultsEl.innerHTML = html;
  } catch (err) {
    resultsEl.innerHTML = `<p class="error">Network error: ${err.message}</p>`;
  } finally {
    submitBtn.disabled = false;
  }
});

/** @param {string} str */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
