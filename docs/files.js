let authToken = localStorage.getItem("chengjiukaReviewToken") || "";
let currentUser = null;

const loginPanel = document.querySelector("#loginPanel");
const maintenanceApp = document.querySelector("#maintenanceApp");
const loginForm = document.querySelector("#loginForm");
const loginName = document.querySelector("#loginName");
const loginSecret = document.querySelector("#loginSecret");
const loginMessage = document.querySelector("#loginMessage");
const statusCards = document.querySelector("#statusCards");
const historyImportForm = document.querySelector("#historyImportForm");
const historyFileInput = document.querySelector("#historyFileInput");
const cardDimFileInput = document.querySelector("#cardDimFileInput");
const historyImportMessage = document.querySelector("#historyImportMessage");
const rosterImportForm = document.querySelector("#rosterImportForm");
const rosterFileInput = document.querySelector("#rosterFileInput");
const rosterImportMessage = document.querySelector("#rosterImportMessage");
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

function showLogin() {
  currentUser = null;
  authToken = "";
  localStorage.removeItem("chengjiukaReviewToken");
  localStorage.removeItem("chengjiukaReviewUser");
  loginPanel.hidden = false;
  maintenanceApp.hidden = true;
  if (typeof renderPageNav === "function") renderPageNav();
}

function showMaintenance(user) {
  currentUser = user;
  loginPanel.hidden = true;
  maintenanceApp.hidden = false;
  if (typeof renderPageNav === "function") renderPageNav();
}

function renderStatusCards(status = {}) {
  const submissions = status.submissions || {};
  const roster = status.roster || {};
  const statusCounts = submissions.statusCounts || {};
  const cards = [
    ["申请记录", submissions.total || 0],
    ["已通过展示", submissions.publishedPassed || 0],
    ["待评审", statusCounts["待评审"] || 0],
    ["不通过", statusCounts["不通过"] || 0],
    ["花名册人数", roster.count || 0],
    ["部门数量", Array.isArray(roster.departments) ? roster.departments.length : 0]
  ];

  statusCards.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="summary-card">
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(label)}</span>
        </article>
      `
    )
    .join("");
}

async function loadMaintenanceStatus() {
  const response = await fetch(apiUrl("/api/maintenance/status"), {
    headers: authHeaders()
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "文件维护状态加载失败");
  renderStatusCards(result);
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
      setMessage(loginMessage, "当前账号没有文件维护权限。", "error");
      showLogin();
      return;
    }
    localStorage.setItem("chengjiukaReviewUser", JSON.stringify(result.user));
    showMaintenance(result.user);
    await loadMaintenanceStatus();
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
    if (!isAdminUser(result.user)) throw new Error("当前账号没有文件维护权限。");
    authToken = result.token;
    localStorage.setItem("chengjiukaReviewToken", authToken);
    localStorage.setItem("chengjiukaReviewUser", JSON.stringify(result.user));
    loginSecret.value = "";
    showMaintenance(result.user);
    await loadMaintenanceStatus();
  } catch (error) {
    setMessage(loginMessage, error.message, "error");
  }
});

historyImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const historyFile = historyFileInput.files[0];
  if (!historyFile) {
    setMessage(historyImportMessage, "请选择历史申请数据文件。", "error");
    return;
  }

  const submitButton = historyImportForm.querySelector('button[type="submit"]');
  const data = new FormData();
  data.append("historyFile", historyFile, historyFile.name);
  if (cardDimFileInput.files[0]) {
    data.append("cardDimFile", cardDimFileInput.files[0], cardDimFileInput.files[0].name);
  }

  submitButton.disabled = true;
  setMessage(historyImportMessage, "", "");
  try {
    const response = await fetch(apiUrl("/api/history/import"), {
      method: "POST",
      headers: authHeaders(),
      body: data
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "历史数据导入失败");
    historyFileInput.value = "";
    cardDimFileInput.value = "";
    setMessage(historyImportMessage, result.message || "历史数据已导入。", "success");
    await loadMaintenanceStatus();
  } catch (error) {
    setMessage(historyImportMessage, error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

rosterImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const rosterFile = rosterFileInput.files[0];
  if (!rosterFile) {
    setMessage(rosterImportMessage, "请选择花名册文件。", "error");
    return;
  }

  const submitButton = rosterImportForm.querySelector('button[type="submit"]');
  const data = new FormData();
  data.append("rosterFile", rosterFile, rosterFile.name);

  submitButton.disabled = true;
  setMessage(rosterImportMessage, "", "");
  try {
    const response = await fetch(apiUrl("/api/roster/import"), {
      method: "POST",
      headers: authHeaders(),
      body: data
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "花名册导入失败");
    rosterFileInput.value = "";
    setMessage(rosterImportMessage, result.message || "花名册已导入。", "success");
    await loadMaintenanceStatus();
  } catch (error) {
    setMessage(rosterImportMessage, error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

restoreSession();
