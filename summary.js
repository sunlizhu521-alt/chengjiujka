let allRecords = [];
let authToken = localStorage.getItem("chengjiukaReviewToken") || "";

const adminNameInput = document.querySelector("#adminName");
const adminSecretInput = document.querySelector("#adminSecret");
const cardFilter = document.querySelector("#cardFilter");
const statusFilter = document.querySelector("#statusFilter");
const searchInput = document.querySelector("#searchInput");
const loadBtn = document.querySelector("#loadBtn");
const summaryRow = document.querySelector("#summaryRow");
const summaryBody = document.querySelector("#summaryBody");
const summaryMessage = document.querySelector("#summaryMessage");
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

function normalizeReviewStatus(status) {
  if (status === "驳回") return "不通过";
  if (status === "需补充") return "需补资料";
  return status || "待评审";
}

function statusBadge(status) {
  const normalized = normalizeReviewStatus(status);
  if (normalized === "通过") return "badge pass";
  if (normalized === "不通过") return "badge reject";
  if (normalized === "待评审" || normalized === "需补资料") return "badge pending";
  return "badge";
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function setSummaryMessage(text, type) {
  summaryMessage.textContent = text;
  summaryMessage.className = `message ${type || ""}`;
}

function filteredRecords() {
  const card = cardFilter.value;
  const status = statusFilter.value;
  const keyword = searchInput.value.trim().toLowerCase();

  return allRecords.filter((item) => {
    const matchesCard = !card || item.cardType === card;
    const matchesStatus = !status || normalizeReviewStatus(item.reviewStatus) === status;
    const haystack = [
      item.cardType,
      item.applicantName,
      item.department,
      item.position,
      item.applicationDate,
      item.reviewStatus,
      item.reviewer,
      item.reviewComment
    ]
      .join(" ")
      .toLowerCase();
    return matchesCard && matchesStatus && (!keyword || haystack.includes(keyword));
  });
}

function renderSummary(records) {
  const total = records.length;
  const passed = records.filter((item) => normalizeReviewStatus(item.reviewStatus) === "通过").length;
  const rejected = records.filter((item) => normalizeReviewStatus(item.reviewStatus) === "不通过").length;
  const needMore = records.filter((item) => normalizeReviewStatus(item.reviewStatus) === "需补资料").length;
  const pending = records.filter((item) => normalizeReviewStatus(item.reviewStatus) === "待评审").length;
  const totalScore = records
    .filter((item) => normalizeReviewStatus(item.reviewStatus) === "通过")
    .reduce((sum, item) => sum + Number(item.score || 0), 0);

  summaryRow.innerHTML = [
    ["汇总记录", total],
    ["通过", passed],
    ["不通过", rejected],
    ["需补资料", needMore],
    ["待评审", pending],
    ["通过分值", totalScore]
  ]
    .map((item) => `<div class="summary-card"><strong>${item[1]}</strong><span>${item[0]}</span></div>`)
    .join("");
}

function renderTable() {
  const records = filteredRecords();
  renderSummary(records);

  if (records.length === 0) {
    summaryBody.innerHTML = '<tr><td colspan="11">暂无符合条件的记录。</td></tr>';
    return;
  }

  summaryBody.innerHTML = records
    .map((item, index) => {
      const status = normalizeReviewStatus(item.reviewStatus);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.cardType)}</td>
          <td>${escapeHtml(item.applicantName)}</td>
          <td>${escapeHtml(item.department)}</td>
          <td>${escapeHtml(item.position)}</td>
          <td>${escapeHtml(item.applicationDate || "")}</td>
          <td><span class="${statusBadge(status)}">${escapeHtml(status)}</span></td>
          <td>${escapeHtml(item.score || "")}</td>
          <td>${escapeHtml(item.reviewer || "")}</td>
          <td class="summary-comment">${escapeHtml(item.reviewComment || "")}</td>
          <td>${escapeHtml(item.reviewDate || "")}</td>
        </tr>
      `;
    })
    .join("");
}

async function loadRecords() {
  if (!hasBackend()) {
    setSummaryMessage("当前固定入口还没有配置后端地址，请管理员先部署后端并填写 docs/config.js。", "error");
    return;
  }

  if (authToken) {
    const meResponse = await fetch(apiUrl("/api/auth/me"), {
      headers: authHeaders()
    });
    const meResult = await meResponse.json();
    if (!meResponse.ok || !meResult.user || meResult.user.role !== "admin") {
      authToken = "";
      localStorage.removeItem("chengjiukaReviewToken");
    }
  }

  if (!authToken) {
    const name = adminNameInput.value.trim();
    const secret = adminSecretInput.value.trim();
    if (!name || !secret) {
      setSummaryMessage("请输入管理员秘钥。", "error");
      adminSecretInput.focus();
      return;
    }

    const loginResponse = await fetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, secret })
    });
    const loginResult = await loginResponse.json();
    if (!loginResponse.ok) {
      setSummaryMessage(loginResult.message || "登录失败", "error");
      return;
    }
    if (!loginResult.user || loginResult.user.role !== "admin") {
      setSummaryMessage("只有管理员可以查看结果汇总。", "error");
      return;
    }
    authToken = loginResult.token;
    localStorage.setItem("chengjiukaReviewToken", authToken);
  }

  loadBtn.disabled = true;
  loadBtn.textContent = "加载中...";
  setSummaryMessage("", "");

  try {
    const response = await fetch(apiUrl("/api/submissions"), {
      headers: authHeaders()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "加载失败");
    allRecords = result;
    renderTable();
    setSummaryMessage("汇总已加载。", "success");
  } catch (error) {
    setSummaryMessage(error.message, "error");
  } finally {
    loadBtn.disabled = false;
    loadBtn.textContent = "加载汇总";
  }
}

[cardFilter, statusFilter, searchInput].forEach((input) => {
  input.addEventListener("input", renderTable);
});

loadBtn.addEventListener("click", loadRecords);
