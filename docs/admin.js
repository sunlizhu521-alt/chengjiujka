let allRecords = [];

const tokenInput = document.querySelector("#adminToken");
const cardFilter = document.querySelector("#cardFilter");
const statusFilter = document.querySelector("#statusFilter");
const searchInput = document.querySelector("#searchInput");
const loadBtn = document.querySelector("#loadBtn");
const recordsEl = document.querySelector("#records");
const summaryRow = document.querySelector("#summaryRow");
const adminMessage = document.querySelector("#adminMessage");
const configuredApiBase = (window.CHENGJIUKA_API_BASE || "").replace(/\/$/, "");
const isGithubPages = window.location.hostname.endsWith("github.io");

tokenInput.value = localStorage.getItem("chengjiukaAdminToken") || "";

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

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function setAdminMessage(text, type) {
  adminMessage.textContent = text;
  adminMessage.className = `message admin-message ${type || ""}`;
}

function hasBackend() {
  return Boolean(configuredApiBase || !isGithubPages);
}

function apiUrl(path) {
  return configuredApiBase ? `${configuredApiBase}${path}` : path;
}

function badgeClass(status) {
  if (status === "通过") return "badge pass";
  if (status === "驳回") return "badge reject";
  if (status === "待评审" || status === "需补充") return "badge pending";
  return "badge";
}

function filteredRecords() {
  const card = cardFilter.value;
  const status = statusFilter.value;
  const keyword = searchInput.value.trim().toLowerCase();

  return allRecords.filter((item) => {
    const matchesCard = !card || item.cardType === card;
    const matchesStatus = !status || item.reviewStatus === status;
    const haystack = [
      item.cardType,
      item.applicantName,
      item.department,
      item.position,
      item.description,
      item.reviewComment
    ]
      .join(" ")
      .toLowerCase();
    return matchesCard && matchesStatus && (!keyword || haystack.includes(keyword));
  });
}

function renderSummary(records) {
  const total = records.length;
  const pending = records.filter((item) => item.reviewStatus === "待评审").length;
  const passed = records.filter((item) => item.reviewStatus === "通过").length;
  const needMore = records.filter((item) => item.reviewStatus === "需补充").length;

  summaryRow.innerHTML = [
    ["当前记录", total],
    ["待评审", pending],
    ["已通过", passed],
    ["需补充", needMore]
  ]
    .map((item) => `<div class="summary-card"><strong>${item[1]}</strong><span>${item[0]}</span></div>`)
    .join("");
}

function renderRecords() {
  const records = filteredRecords();
  renderSummary(records);

  if (records.length === 0) {
    recordsEl.innerHTML = '<section class="record"><p>暂无符合条件的记录。</p></section>';
    return;
  }

  const token = encodeURIComponent(tokenInput.value.trim());
  recordsEl.innerHTML = records
    .map((item) => {
      const attachments = (item.attachments || [])
        .map((file) => {
          const href = apiUrl(`/api/files/${encodeURIComponent(file.filename)}?token=${token}`);
          return `<a href="${href}" target="_blank" rel="noreferrer">${escapeHtml(file.originalName)}</a>`;
        })
        .join("");

      return `
        <article class="record" data-id="${escapeHtml(item.id)}">
          <div class="record-head">
            <div>
              <h3 class="record-title">${escapeHtml(item.cardType)} - ${escapeHtml(item.applicantName)}</h3>
              <p>提交时间：${escapeHtml(formatDate(item.submittedAt))}</p>
            </div>
            <span class="${badgeClass(item.reviewStatus)}">${escapeHtml(item.reviewStatus)}</span>
          </div>

          <div class="record-grid">
            <div><strong>部门</strong>${escapeHtml(item.department)}</div>
            <div><strong>岗位</strong>${escapeHtml(item.position)}</div>
            <div><strong>联系方式</strong>${escapeHtml(item.contact || "未填写")}</div>
            <div><strong>申报日期</strong>${escapeHtml(item.applicationDate)}</div>
            <div><strong>最终分值</strong>${escapeHtml(item.score || "未评定")}</div>
            <div><strong>评审人</strong>${escapeHtml(item.reviewer || "未填写")}</div>
          </div>

          <div class="description-block">
            <strong>申报说明</strong>
            <p>${escapeHtml(item.description)}</p>
          </div>

          <div class="attachments">
            <strong>附件</strong>
            <div class="attachment-list">${attachments || "无附件"}</div>
          </div>

          <form class="review-form">
            <label class="field">
              <span>评审状态</span>
              <select name="reviewStatus">
                ${["待评审", "通过", "驳回", "需补充"]
                  .map((status) => `<option ${status === item.reviewStatus ? "selected" : ""}>${status}</option>`)
                  .join("")}
              </select>
            </label>
            <label class="field">
              <span>分值</span>
              <input name="score" type="number" min="0" step="1" value="${escapeHtml(item.score)}" />
            </label>
            <label class="field">
              <span>评审意见</span>
              <input name="reviewComment" value="${escapeHtml(item.reviewComment)}" />
            </label>
            <label class="field">
              <span>评审人</span>
              <input name="reviewer" value="${escapeHtml(item.reviewer)}" />
            </label>
            <button type="submit">保存</button>
          </form>
        </article>
      `;
    })
    .join("");
}

async function loadRecords() {
  if (!hasBackend()) {
    setAdminMessage("当前固定入口还没有配置后端地址，请管理员先部署后端并填写 docs/config.js。", "error");
    return;
  }

  const token = tokenInput.value.trim();
  if (!token) {
    setAdminMessage("请输入评审口令。", "error");
    tokenInput.focus();
    return;
  }

  localStorage.setItem("chengjiukaAdminToken", token);
  loadBtn.disabled = true;
  loadBtn.textContent = "加载中...";
  setAdminMessage("", "");

  try {
    const response = await fetch(apiUrl("/api/submissions"), {
      headers: { "x-admin-token": token }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "加载失败");
    allRecords = result;
    renderRecords();
    setAdminMessage("记录已加载。", "success");
  } catch (error) {
    setAdminMessage(error.message, "error");
  } finally {
    loadBtn.disabled = false;
    loadBtn.textContent = "加载记录";
  }
}

recordsEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target.closest(".review-form");
  if (!form) return;

  const record = event.target.closest(".record");
  const id = record.dataset.id;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await fetch(apiUrl(`/api/submissions/${id}/review`), {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-admin-token": tokenInput.value.trim()
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "保存失败");
    allRecords = allRecords.map((item) => (item.id === id ? result : item));
    renderRecords();
    setAdminMessage("评审结果已保存。", "success");
  } catch (error) {
    setAdminMessage(error.message, "error");
  }
});

[cardFilter, statusFilter, searchInput].forEach((input) => {
  input.addEventListener("input", renderRecords);
});

loadBtn.addEventListener("click", loadRecords);
