let authToken = localStorage.getItem("chengjiukaReviewToken") || "";
let currentUser = null;

const loginPanel = document.querySelector("#loginPanel");
const backupApp = document.querySelector("#backupApp");
const loginForm = document.querySelector("#loginForm");
const loginName = document.querySelector("#loginName");
const loginSecret = document.querySelector("#loginSecret");
const loginMessage = document.querySelector("#loginMessage");
const backupStatusCards = document.querySelector("#backupStatusCards");
const backupFileRows = document.querySelector("#backupFileRows");
const backupMessage = document.querySelector("#backupMessage");
const runBackupBtn = document.querySelector("#runBackupBtn");
const refreshBackupBtn = document.querySelector("#refreshBackupBtn");
const downloadBackupLink = document.querySelector("#downloadBackupLink");
const localTestApiBase = "http://localhost:3000";
const configuredApiBase = (window.CHENGJIUKA_API_BASE || localTestApiBase).replace(/\/$/, "");
const isGithubPages = window.location.hostname.endsWith("github.io");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}

function hasBackend() {
  return Boolean(configuredApiBase || !isGithubPages);
}

function apiUrl(path) {
  return configuredApiBase ? `${configuredApiBase}${path}` : path;
}

function authHeaders(extra = {}) {
  return {
    ...extra,
    "x-review-token": authToken
  };
}

function setMessage(element, text, type) {
  element.textContent = text;
  element.className = `message ${type || ""}`;
}

function isAdminUser(user = currentUser) {
  return user && (user.role === "admin" || user.name === "孙立柱");
}

function formatDateTime(value) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatFileSize(size) {
  const bytes = Number(size || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function showLogin() {
  currentUser = null;
  authToken = "";
  localStorage.removeItem("chengjiukaReviewToken");
  localStorage.removeItem("chengjiukaReviewUser");
  loginPanel.hidden = false;
  backupApp.hidden = true;
  if (typeof renderPageNav === "function") renderPageNav();
}

function showBackupApp(user) {
  currentUser = user;
  loginPanel.hidden = true;
  backupApp.hidden = false;
  if (typeof renderPageNav === "function") renderPageNav();
}

function renderStatus(status = {}) {
  const cards = [
    ["备份状态", status.exists ? "已生成" : "暂无备份"],
    ["最近备份时间", formatDateTime(status.generatedAt)],
    ["备份来源", status.reason === "manual" ? "手动备份" : status.reason === "scheduled" ? "自动备份" : "暂无"],
    ["备份大小", formatFileSize(status.size)],
    ["备份文件数", status.fileCount || 0],
    ["操作人", status.actorName || "系统"]
  ];

  backupStatusCards.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="summary-card">
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(label)}</span>
        </article>
      `
    )
    .join("");

  const files = Array.isArray(status.files) ? status.files : [];
  backupFileRows.innerHTML = files.length
    ? files
        .map(
          (file) => `
            <tr>
              <td>${escapeHtml(file.name)}</td>
              <td>${escapeHtml(formatFileSize(file.size))}</td>
              <td>${escapeHtml(formatDateTime(file.modifiedAt))}</td>
            </tr>
          `
        )
        .join("")
    : '<tr><td colspan="3">暂无备份文件明细。</td></tr>';

  if (status.exists) {
    downloadBackupLink.href = apiUrl(`/api/backups/latest?reviewToken=${encodeURIComponent(authToken)}`);
    downloadBackupLink.removeAttribute("aria-disabled");
    downloadBackupLink.classList.remove("is-disabled");
  } else {
    downloadBackupLink.href = "#";
    downloadBackupLink.setAttribute("aria-disabled", "true");
    downloadBackupLink.classList.add("is-disabled");
  }
}

async function loadBackupStatus() {
  const response = await fetch(apiUrl("/api/backups/status"), {
    headers: authHeaders()
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "备份状态加载失败");
  renderStatus(result);
}

async function restoreSession() {
  if (!authToken || !hasBackend()) return;
  try {
    const response = await fetch(apiUrl("/api/auth/me"), {
      headers: authHeaders()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "登录已过期");
    if (!isAdminUser(result.user)) {
      setMessage(loginMessage, "当前账号没有备份中心权限。", "error");
      showLogin();
      return;
    }
    localStorage.setItem("chengjiukaReviewUser", JSON.stringify(result.user));
    showBackupApp(result.user);
    await loadBackupStatus();
  } catch {
    showLogin();
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!hasBackend()) {
    setMessage(loginMessage, "当前固定入口还没有配置后端地址。", "error");
    return;
  }

  const payload = {
    name: loginName.value.trim(),
    secret: loginSecret.value.trim()
  };
  setMessage(loginMessage, "", "");

  try {
    const response = await fetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "登录失败");
    if (!isAdminUser(result.user)) throw new Error("当前账号没有备份中心权限。");
    authToken = result.token;
    localStorage.setItem("chengjiukaReviewToken", authToken);
    localStorage.setItem("chengjiukaReviewUser", JSON.stringify(result.user));
    loginSecret.value = "";
    showBackupApp(result.user);
    await loadBackupStatus();
  } catch (error) {
    setMessage(loginMessage, error.message, "error");
  }
});

refreshBackupBtn.addEventListener("click", async () => {
  setMessage(backupMessage, "", "");
  try {
    await loadBackupStatus();
    setMessage(backupMessage, "备份状态已刷新。", "success");
  } catch (error) {
    setMessage(backupMessage, error.message, "error");
  }
});

runBackupBtn.addEventListener("click", async () => {
  runBackupBtn.disabled = true;
  setMessage(backupMessage, "", "");
  try {
    const response = await fetch(apiUrl("/api/backups/run"), {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "备份失败");
    renderStatus(result.status);
    setMessage(backupMessage, result.message || "备份已生成。", "success");
  } catch (error) {
    setMessage(backupMessage, error.message, "error");
  } finally {
    runBackupBtn.disabled = false;
  }
});

downloadBackupLink.addEventListener("click", (event) => {
  if (downloadBackupLink.getAttribute("aria-disabled") === "true") {
    event.preventDefault();
  }
});

restoreSession();
