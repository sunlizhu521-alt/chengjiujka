let allRecords = [];
let selectedRecordIds = new Set();
let authToken = localStorage.getItem("chengjiukaReviewToken") || "";
let currentUser = null;

const adminNameInput = document.querySelector("#adminName");
const adminSecretInput = document.querySelector("#adminSecret");
const cardFilter = document.querySelector("#cardFilter");
const statusFilter = document.querySelector("#statusFilter");
const searchInput = document.querySelector("#searchInput");
const loadBtn = document.querySelector("#loadBtn");
const bulkDeleteBtn = document.querySelector("#bulkDeleteBtn");
const summarySelectAll = document.querySelector("#summarySelectAll");
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

function canViewSummary(user) {
  const access = Array.isArray(user?.pageAccess) ? user.pageAccess : [];
  return user && (user.role === "admin" || access.includes("resultSummary") || access.includes("summary"));
}

function canDeleteAnyStatusRecords(user = currentUser) {
  return user && user.name === "孙立柱" && user.role === "admin";
}

function normalizeReviewStatus(status) {
  if (status === "驳回") return "不通过";
  if (status === "需补充" || status === "需补资料") return "不通过";
  return status || "待评审";
}

function statusBadge(status) {
  const normalized = normalizeReviewStatus(status);
  if (normalized === "通过") return "badge pass";
  if (normalized === "不通过") return "badge reject";
  if (normalized === "待评审") return "badge pending";
  return "badge";
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function materialSummary(item) {
  const files = item.attachments || [];
  if (!files.length) return "无";
  return `${files.length} 个：${files.map((file) => file.originalName || file.filename || "未命名材料").join("；")}`;
}

function publishedLabel(item) {
  if (!item.resultPublished) return "未展示";
  return item.resultPublishedAt ? `已展示 ${formatDate(item.resultPublishedAt)}` : "已展示";
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
      item.id,
      item.applicantName,
      item.department,
      item.position,
      item.contact,
      item.applicationDate,
      item.submittedAt,
      item.description,
      item.commitment,
      item.reviewStatus,
      item.reviewer,
      item.reviewComment,
      item.resultPublished ? "已展示" : "未展示"
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
  const pending = records.filter((item) => normalizeReviewStatus(item.reviewStatus) === "待评审").length;
  const totalScore = records
    .filter((item) => normalizeReviewStatus(item.reviewStatus) === "通过")
    .reduce((sum, item) => sum + Number(item.score || 0), 0);

  summaryRow.innerHTML = [
    ["汇总记录", total],
    ["通过", passed],
    ["不通过", rejected],
    ["待评审", pending],
    ["通过分值", totalScore]
  ]
    .map((item) => `<div class="summary-card"><strong>${item[1]}</strong><span>${item[0]}</span></div>`)
    .join("");
}

function updateSelectionState(records = filteredRecords()) {
  const visibleIds = records.map((item) => item.id).filter(Boolean);
  const selectedVisibleCount = visibleIds.filter((id) => selectedRecordIds.has(id)).length;
  const canBulkDelete = canDeleteAnyStatusRecords();

  if (summarySelectAll) {
    summarySelectAll.disabled = !canBulkDelete || visibleIds.length === 0;
    summarySelectAll.checked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
    summarySelectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
  }

  if (bulkDeleteBtn) {
    bulkDeleteBtn.disabled = !canBulkDelete || selectedRecordIds.size === 0;
    bulkDeleteBtn.textContent = selectedRecordIds.size > 0 ? `批量删除（${selectedRecordIds.size}）` : "批量删除";
  }
}

function renderTable() {
  const records = filteredRecords();
  renderSummary(records);

  selectedRecordIds = new Set([...selectedRecordIds].filter((id) => allRecords.some((item) => item.id === id)));

  if (records.length === 0) {
    summaryBody.innerHTML = '<tr><td colspan="18">暂无符合条件的记录。</td></tr>';
    updateSelectionState(records);
    return;
  }

  summaryBody.innerHTML = records
    .map((item, index) => {
      const status = normalizeReviewStatus(item.reviewStatus);
      const checked = selectedRecordIds.has(item.id) ? "checked" : "";
      const disabled = canDeleteAnyStatusRecords() ? "" : "disabled";
      return `
        <tr>
          <td data-label="选择" class="summary-select-cell">
            <input class="summary-record-checkbox" type="checkbox" data-id="${escapeHtml(item.id)}" aria-label="选择 ${escapeHtml(item.applicantName)} ${escapeHtml(item.cardType)}" ${checked} ${disabled} />
          </td>
          <td data-label="序号">${index + 1}</td>
          <td data-label="申请编号">${escapeHtml(item.id || "")}</td>
          <td data-label="申报人">${escapeHtml(item.applicantName)}</td>
          <td data-label="部门">${escapeHtml(item.department)}</td>
          <td data-label="岗位">${escapeHtml(item.position)}</td>
          <td data-label="联系方式">${escapeHtml(item.contact || "")}</td>
          <td data-label="申请项目">${escapeHtml(item.cardType)}</td>
          <td data-label="申请内容" class="summary-application-content">${escapeHtml(item.description || "")}</td>
          <td data-label="申请材料" class="summary-materials">${escapeHtml(materialSummary(item))}</td>
          <td data-label="申报日期">${escapeHtml(item.applicationDate || "")}</td>
          <td data-label="提交时间">${escapeHtml(formatDate(item.submittedAt))}</td>
          <td data-label="当前状态"><span class="${statusBadge(status)}">${escapeHtml(status)}</span></td>
          <td data-label="分值">${escapeHtml(item.score || "")}</td>
          <td data-label="评审日期">${escapeHtml(item.reviewDate || "")}</td>
          <td data-label="最终展示">${escapeHtml(publishedLabel(item))}</td>
          <td data-label="承诺确认">${escapeHtml(item.commitment || "")}</td>
          <td data-label="操作">
            ${
              canDeleteAnyStatusRecords()
                ? `<button type="button" class="delete-summary-record-btn danger-button" data-id="${escapeHtml(item.id)}">删除</button>`
                : ""
            }
          </td>
        </tr>
      `;
    })
    .join("");
  updateSelectionState(records);
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
    if (!meResponse.ok || !canViewSummary(meResult.user)) {
      authToken = "";
      currentUser = null;
      localStorage.removeItem("chengjiukaReviewToken");
    } else {
      currentUser = meResult.user;
      localStorage.setItem("chengjiukaReviewUser", JSON.stringify(meResult.user));
      if (typeof renderPageNav === "function") renderPageNav();
    }
  }

  if (!authToken) {
    const name = adminNameInput.value.trim();
    const secret = adminSecretInput.value.trim();
    if (!name || !secret) {
      setSummaryMessage("请输入姓名和登录秘钥。", "error");
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
    if (!canViewSummary(loginResult.user)) {
      setSummaryMessage("当前账号暂无结果汇总权限，请联系管理员孙立柱授权。", "error");
      return;
    }
    authToken = loginResult.token;
    currentUser = loginResult.user;
    localStorage.setItem("chengjiukaReviewToken", authToken);
    localStorage.setItem("chengjiukaReviewUser", JSON.stringify(loginResult.user));
    if (typeof renderPageNav === "function") renderPageNav();
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
    selectedRecordIds.clear();
    renderTable();
    setSummaryMessage(`已加载全部 ${allRecords.length} 条申请记录。`, "success");
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

if (summarySelectAll) {
  summarySelectAll.addEventListener("change", () => {
    if (!canDeleteAnyStatusRecords()) return;
    const records = filteredRecords();
    if (summarySelectAll.checked) {
      records.forEach((item) => selectedRecordIds.add(item.id));
    } else {
      records.forEach((item) => selectedRecordIds.delete(item.id));
    }
    renderTable();
  });
}

if (bulkDeleteBtn) {
  bulkDeleteBtn.addEventListener("click", async () => {
    if (!canDeleteAnyStatusRecords()) {
      setSummaryMessage("只有孙立柱管理员可以批量删除申请记录。", "error");
      return;
    }

    const ids = [...selectedRecordIds].filter((id) => allRecords.some((item) => item.id === id));
    if (ids.length === 0) {
      setSummaryMessage("请先选择要删除的申请记录。", "error");
      return;
    }

    if (!window.confirm(`确认批量删除 ${ids.length} 条申请记录？删除后附件也会一并删除。`)) return;

    bulkDeleteBtn.disabled = true;
    bulkDeleteBtn.textContent = "删除中...";
    try {
      const response = await fetch(apiUrl("/api/submissions/bulk-delete"), {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ ids })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "批量删除失败");
      const deletedIds = new Set(result.deletedIds || ids);
      allRecords = allRecords.filter((item) => !deletedIds.has(item.id));
      selectedRecordIds.clear();
      renderTable();
      setSummaryMessage(result.message || "申请记录已批量删除。", "success");
    } catch (error) {
      setSummaryMessage(error.message, "error");
      updateSelectionState();
    }
  });
}

summaryBody.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-summary-record-btn");
  if (!button) return;
  if (!canDeleteAnyStatusRecords()) {
    setSummaryMessage("只有孙立柱管理员可以删除申请记录。", "error");
    return;
  }

  const id = button.dataset.id;
  const record = allRecords.find((item) => item.id === id);
  const label = record ? `${record.applicantName} - ${record.cardType}` : id;
  if (!window.confirm(`确认删除申请记录：${label}？删除后附件也会一并删除。`)) return;

  button.disabled = true;
  try {
    const response = await fetch(apiUrl(`/api/submissions/${encodeURIComponent(id)}/delete`), {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "删除失败");
    allRecords = allRecords.filter((item) => item.id !== id);
    selectedRecordIds.delete(id);
    renderTable();
    setSummaryMessage(result.message || "申请记录已删除。", "success");
  } catch (error) {
    setSummaryMessage(error.message, "error");
    button.disabled = false;
  }
});

summaryBody.addEventListener("change", (event) => {
  const checkbox = event.target.closest(".summary-record-checkbox");
  if (!checkbox) return;
  if (!canDeleteAnyStatusRecords()) {
    checkbox.checked = false;
    setSummaryMessage("只有孙立柱管理员可以选择并删除申请记录。", "error");
    return;
  }

  const id = checkbox.dataset.id;
  if (checkbox.checked) {
    selectedRecordIds.add(id);
  } else {
    selectedRecordIds.delete(id);
  }
  updateSelectionState();
});
