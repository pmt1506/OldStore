const ACCESS_KEY = "oldstore_access_password";

function accessHeaders() {
  const pw = localStorage.getItem(ACCESS_KEY);
  return pw ? { "X-Access-Password": pw } : {};
}

async function api(path, options = {}) {
  const resp = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...accessHeaders(),
      ...(options.headers || {}),
    },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok && resp.status !== 202 && data.needsCode === undefined) {
    throw new Error(data.error || `HTTP ${resp.status}`);
  }
  return data;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

// --- Access password gate ---
const accessGate = document.getElementById("access-gate");
if (!localStorage.getItem(ACCESS_KEY)) {
  // Only show if the API actually rejects us; avoids nagging when disabled.
  // Uses /mode (always reachable regardless of full vs Vercel-lite mode).
  api("/mode").catch((err) => {
    if (String(err.message).includes("401") || String(err.message).includes("Sai")) {
      accessGate.classList.remove("hidden");
    }
  });
}
document.getElementById("access-save").addEventListener("click", () => {
  const val = document.getElementById("access-password").value;
  localStorage.setItem(ACCESS_KEY, val);
  accessGate.classList.add("hidden");
  init();
});

// --- Mode detection (full self-host vs limited Vercel deploy) ---
let isVercel = false;

async function detectMode() {
  const mode = await api("/mode").catch(() => ({ vercel: false }));
  isVercel = !!mode.vercel;
  if (isVercel) {
    document.getElementById("vercel-banner").classList.remove("hidden");
    document.getElementById("section-accounts").classList.add("hidden");
    document.getElementById("section-library").classList.add("hidden");
  }
}

// --- Accounts ---
let accounts = [];
let pendingDeviceId = null;

async function refreshAccounts() {
  accounts = await api("/accounts").catch(() => []);
  const list = document.getElementById("account-list");
  list.innerHTML = "";
  for (const acc of accounts) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="meta">
        <strong>${acc.email}</strong>
        <small>${acc.firstName} ${acc.lastName} · store ${acc.store || "?"}</small>
      </div>
      <div class="actions">
        <button class="secondary" data-remove="${acc.email}">Xoá</button>
      </div>`;
    list.appendChild(row);
  }
  list.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/accounts/${encodeURIComponent(btn.dataset.remove)}`, { method: "DELETE" });
      await refreshAccounts();
    });
  });
  populateAccountSelectIfPresent();
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const codeField = document.getElementById("login-code");
  const code = codeField.value.trim();
  const statusEl = document.getElementById("login-status");
  statusEl.textContent = "Đang đăng nhập...";
  statusEl.className = "status";

  try {
    const result = await api("/accounts/login", {
      method: "POST",
      body: JSON.stringify({ email, password, code: code || undefined, deviceId: pendingDeviceId }),
    });
    if (result.needsCode) {
      pendingDeviceId = result.deviceId;
      codeField.classList.remove("hidden");
      statusEl.textContent = result.message || "Nhập mã 2FA và đăng nhập lại.";
      return;
    }
    pendingDeviceId = null;
    codeField.classList.add("hidden");
    codeField.value = "";
    statusEl.textContent = `Đăng nhập thành công: ${result.email}`;
    statusEl.className = "status ok";
    await refreshAccounts();
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "status error";
  }
});

// --- Lookup ---
let currentSoftware = null;

document.getElementById("lookup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = document.getElementById("lookup-input").value.trim();
  const country = document.getElementById("lookup-country").value.trim();
  const resultEl = document.getElementById("lookup-result");
  resultEl.classList.remove("hidden");
  resultEl.innerHTML = "Đang tra cứu...";

  try {
    const params = new URLSearchParams({ q });
    if (country) params.set("country", country);
    const software = await api(`/lookup?${params.toString()}`);
    currentSoftware = software;
    renderLookupResult(software);
  } catch (err) {
    resultEl.innerHTML = `<p class="status error">${err.message}</p>`;
  }
});

function renderLookupResult(software) {
  const resultEl = document.getElementById("lookup-result");
  const priceLabel = software.price > 0 ? (software.formattedPrice || `${software.price}`) : "Miễn phí";
  const header = `
    <div class="row">
      <img src="${software.artworkUrl || ""}" alt="" onerror="this.style.display='none'" />
      <div class="meta">
        <strong>${software.name}</strong>
        <small>${software.bundleId} · v${software.version} · min iOS ${software.minimumOsVersion || "?"} · ${priceLabel}</small>
      </div>
    </div>`;

  if (isVercel) {
    resultEl.innerHTML = `
      ${header}
      <form id="quick-license-form">
        <input id="ql-email" type="text" placeholder="Apple ID (email)" required autocomplete="username" />
        <input id="ql-password" type="password" placeholder="Mật khẩu" required autocomplete="current-password" />
        <input id="ql-code" type="text" placeholder="Mã 2FA (nếu được yêu cầu)" class="hidden" />
        <button type="submit">Lấy license</button>
        <span class="hint">Đăng nhập + lấy license chạy trong 1 request duy nhất, không lưu lại gì trên server.</span>
      </form>
      <p id="action-status" class="status"></p>
    `;
    document.getElementById("quick-license-form").addEventListener("submit", quickLicense);
    return;
  }

  resultEl.innerHTML = `
    ${header}
    <div class="row">
      <select id="account-select"></select>
      <select id="version-select"><option value="">Phiên bản mới nhất</option></select>
    </div>
    <div class="row actions">
      <button id="btn-versions" class="secondary">Xem phiên bản cũ</button>
      <button id="btn-license" class="secondary">Lấy license</button>
      <button id="btn-download">Lấy license &amp; tải IPA</button>
    </div>
    <p id="action-status" class="status"></p>
    <progress id="download-progress" class="hidden" max="100" value="0"></progress>
  `;
  populateAccountSelectIfPresent();

  document.getElementById("btn-versions").addEventListener("click", loadVersions);
  document.getElementById("btn-license").addEventListener("click", acquireLicense);
  document.getElementById("btn-download").addEventListener("click", startDownload);
}

let quickLicenseDeviceId = null;

async function quickLicense(e) {
  e.preventDefault();
  const email = document.getElementById("ql-email").value.trim();
  const password = document.getElementById("ql-password").value;
  const codeField = document.getElementById("ql-code");
  const code = codeField.value.trim();
  const statusEl = document.getElementById("action-status");
  statusEl.textContent = "Đang đăng nhập & lấy license...";
  statusEl.className = "status";

  try {
    const result = await api("/quick-license", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        code: code || undefined,
        deviceId: quickLicenseDeviceId,
        q: String(currentSoftware.trackId),
      }),
    });
    if (result.needsCode) {
      quickLicenseDeviceId = result.deviceId;
      codeField.classList.remove("hidden");
      statusEl.textContent = result.message || "Nhập mã 2FA và bấm Lấy license lại.";
      return;
    }
    quickLicenseDeviceId = null;
    codeField.classList.add("hidden");
    codeField.value = "";
    statusEl.textContent = `Đã xác nhận license cho ${result.account.email} — tự host bằng Docker để tải file IPA.`;
    statusEl.className = "status ok";
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "status error";
  }
}

function populateAccountSelectIfPresent() {
  const sel = document.getElementById("account-select");
  if (!sel) return;
  sel.innerHTML = accounts.map((a) => `<option value="${a.email}">${a.email}</option>`).join("");
}

function selectedAccountEmail() {
  const sel = document.getElementById("account-select");
  return sel ? sel.value : "";
}

async function loadVersions() {
  const statusEl = document.getElementById("action-status");
  const email = selectedAccountEmail();
  if (!email) {
    statusEl.textContent = "Chưa có tài khoản nào đăng nhập.";
    statusEl.className = "status error";
    return;
  }
  statusEl.textContent = "Đang lấy danh sách phiên bản...";
  statusEl.className = "status";
  try {
    const params = new URLSearchParams({ email, trackId: String(currentSoftware.trackId) });
    const { versions } = await api(`/versions?${params.toString()}`);
    const sel = document.getElementById("version-select");
    sel.innerHTML =
      '<option value="">Phiên bản mới nhất</option>' +
      versions.map((v) => `<option value="${v}">Build id ${v}</option>`).join("");
    statusEl.textContent = `Tìm thấy ${versions.length} phiên bản. Chọn build cũ nếu thiết bị không lên được iOS mới nhất.`;
    statusEl.className = "status ok";
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "status error";
  }
}

async function acquireLicense() {
  const statusEl = document.getElementById("action-status");
  const email = selectedAccountEmail();
  if (!email) {
    statusEl.textContent = "Chưa có tài khoản nào đăng nhập.";
    statusEl.className = "status error";
    return;
  }
  statusEl.textContent = "Đang lấy license...";
  statusEl.className = "status";
  try {
    await api("/license", {
      method: "POST",
      body: JSON.stringify({ email, trackId: currentSoftware.trackId }),
    });
    statusEl.textContent = "Đã có license cho tài khoản này.";
    statusEl.className = "status ok";
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "status error";
  }
}

async function startDownload() {
  const statusEl = document.getElementById("action-status");
  const progressEl = document.getElementById("download-progress");
  const email = selectedAccountEmail();
  if (!email) {
    statusEl.textContent = "Chưa có tài khoản nào đăng nhập.";
    statusEl.className = "status error";
    return;
  }
  const versionId = document.getElementById("version-select").value || undefined;

  statusEl.textContent = "Đang khởi tạo job tải...";
  statusEl.className = "status";
  progressEl.classList.remove("hidden");
  progressEl.value = 0;

  try {
    const job = await api("/downloads", {
      method: "POST",
      body: JSON.stringify({ email, trackId: currentSoftware.trackId, versionId }),
    });
    await pollJob(job.id, statusEl, progressEl);
    await refreshLibrary();
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "status error";
  }
}

function pollJob(jobId, statusEl, progressEl) {
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const job = await api(`/downloads/${jobId}`);
        progressEl.value = job.progress;
        statusEl.textContent = `Trạng thái: ${job.status} (${job.progress}%)`;
        statusEl.className = "status";
        if (job.status === "completed") {
          statusEl.textContent = "Hoàn tất! Đã lưu vào thư viện.";
          statusEl.className = "status ok";
          resolve(job);
          return;
        }
        if (job.status === "failed") {
          statusEl.textContent = job.error || "Tải thất bại.";
          statusEl.className = "status error";
          reject(new Error(job.error || "Tải thất bại"));
          return;
        }
        setTimeout(tick, 1500);
      } catch (err) {
        reject(err);
      }
    };
    tick();
  });
}

// --- Library ---
async function refreshLibrary() {
  const entries = await api("/library").catch(() => []);
  const list = document.getElementById("library-list");
  list.innerHTML = "";
  if (entries.length === 0) {
    list.innerHTML = '<p class="hint">Chưa có file IPA nào.</p>';
    return;
  }
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <img src="${entry.artworkUrl || ""}" alt="" onerror="this.style.display='none'" />
      <div class="meta">
        <strong>${entry.name}</strong>
        <small>${entry.bundleId} · v${entry.version} (${entry.bundleVersion}) · min iOS ${entry.minimumOsVersion || "?"} · ${formatBytes(entry.fileSize)}</small>
      </div>
      <div class="actions">
        <button class="secondary" data-download="${entry.id}" data-filename="${entry.name}-${entry.version}.ipa">Tải xuống</button>
        <button class="secondary" data-remove="${entry.id}">Xoá</button>
      </div>`;
    list.appendChild(row);
  }
  list.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/library/${btn.dataset.remove}`, { method: "DELETE" });
      await refreshLibrary();
    });
  });
  list.querySelectorAll("[data-download]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const resp = await fetch(`/api/library/${btn.dataset.download}/file`, { headers: accessHeaders() });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = btn.dataset.filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

document.getElementById("library-refresh").addEventListener("click", refreshLibrary);

async function init() {
  await detectMode();
  if (isVercel) return;
  await refreshAccounts();
  await refreshLibrary();
}

init();
