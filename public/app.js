// Redirect to login if no token
const token = localStorage.getItem('token');
if (!token) window.location.href = '/';

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = '/';
});

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
});

// Upload
document.getElementById('upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('receipt-file');
  const statusEl = document.getElementById('upload-status');
  const resultsEl = document.getElementById('upload-results');

  statusEl.textContent = 'Processing...';
  resultsEl.innerHTML = '';

  const formData = new FormData();
  formData.append('receipt', fileInput.files[0]);

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    const data = await res.json();

    if (!res.ok) {
      statusEl.textContent = '';
      resultsEl.innerHTML = `<p class="error">${data.error || 'Upload failed'}</p>`;
      return;
    }

    if (data.status === 'review') {
      statusEl.textContent = '';
      resultsEl.innerHTML = `<p>Receipt queued for manual review. Reason: ${data.reason}</p>`;
      return;
    }

    statusEl.textContent = '';
    resultsEl.innerHTML = renderItems(data.items);
    fileInput.value = '';
  } catch (err) {
    statusEl.textContent = '';
    resultsEl.innerHTML = `<p class="error">Network error: ${err.message}</p>`;
  }
});

function renderItems(items) {
  if (!items || items.length === 0) return '<p>No items found.</p>';
  return `
    <table>
      <thead><tr><th>Store</th><th>Product</th><th>Category</th><th>Date</th><th>Cost</th><th>Qty</th></tr></thead>
      <tbody>
        ${items.map(i => `
          <tr>
            <td>${i.store}</td>
            <td>${i.product}</td>
            <td>${i.category}</td>
            <td>${i.date}</td>
            <td>$${i.cost.toFixed(2)}</td>
            <td>${i.quantity}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// Query
document.getElementById('query-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const question = document.getElementById('question').value.trim();
  const resultsEl = document.getElementById('query-results');

  resultsEl.innerHTML = '<p class="loading">Thinking...</p>';

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();

    if (!res.ok) {
      resultsEl.innerHTML = `<p class="error">${data.error || 'Query failed'}</p>`;
      return;
    }

    if (!data.results || data.results.length === 0) {
      resultsEl.innerHTML = `<p>No results found.</p><details><summary>SQL</summary><pre>${data.sql}</pre></details>`;
      return;
    }

    const keys = Object.keys(data.results[0]);
    resultsEl.innerHTML = `
      <details><summary>SQL</summary><pre>${data.sql}</pre></details>
      <table>
        <thead><tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr></thead>
        <tbody>
          ${data.results.map(row => `<tr>${keys.map(k => `<td>${row[k] ?? ''}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    resultsEl.innerHTML = `<p class="error">Network error: ${err.message}</p>`;
  }
});
