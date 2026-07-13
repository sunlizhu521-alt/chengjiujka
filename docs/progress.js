const progressForm = document.querySelector("#progressQueryForm");
const progressMessage = document.querySelector("#progressMessage");
const progressResults = document.querySelector("#progressResults");
const applicantNameInput = progressForm.elements.applicantName;
const localTestApiBase = "http://localhost:3000";
const configuredApiBase = (window.CHENGJIUKA_API_BASE || localTestApiBase).replace(/\/$/, "");
const isGithubPages = window.location.hostname.endsWith("github.io");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function apiUrl(path) {
  return configuredApiBase ? `${configuredApiBase}${path}` : path;
}

function hasBackend() {
  return Boolean(configuredApiBase || !isGithubPages);
}

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("chengjiukaReviewUser") || "null");
  } catch {
    return null;
  }
}

function applyLoggedInName() {
  const user = readStoredUser();
  const name = String(user?.name || "").trim();
  if (!name || user?.role === "admin") return;
  applicantNameInput.value = name;
  applicantNameInput.readOnly = true;
  applicantNameInput.setAttribute("aria-readonly", "true");
}

function progressClass(status) {
  if (status === "已完成") return "completed";
  if (status === "评审中") return "reviewing";
  return "pending";
}

function normalizeFinalStatus(status) {
  if (status === "驳回" || status === "需补充" || status === "需补资料") return "不通过";
  return status || "";
}

function renderRecords(records) {
  if (!records.length) {
    progressResults.innerHTML = '<p class="empty-files">未查询到匹配的申请记录，请核对姓名和秘钥。</p>';
    return;
  }

  progressResults.innerHTML = records.map((item) => {
    const progress = item.progressStatus || "待评审";
    const finalStatus = normalizeFinalStatus(item.reviewStatus);
    const finalBlock = item.resultPublished
      ? `
        <div class="progress-final-result">
          <p><strong>最终结果：</strong>${escapeHtml(finalStatus)}</p>
          <p><strong>最终评审意见：</strong>${escapeHtml(item.reviewComment || "暂无最终评审意见")}</p>
        </div>
      `
      : "";

    return `
      <article class="result-card">
        <div class="result-card-head">
          <strong>${escapeHtml(item.cardType || "")}</strong>
          <span class="progress-status ${progressClass(progress)}">${escapeHtml(progress)}</span>
        </div>
        <div class="result-grid">
          <div><span>申报日期</span>${escapeHtml(item.applicationDate || "未填写")}</div>
          <div><span>评审日期</span>${escapeHtml(item.resultPublished ? item.reviewDate || "未填写" : "暂未完成")}</div>
          <div><span>成就卡分值</span>${escapeHtml(item.resultPublished && item.score ? `${item.score}分` : "暂未确定")}</div>
        </div>
        ${finalBlock}
      </article>
    `;
  }).join("");
}

progressForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!hasBackend()) {
    progressMessage.textContent = "当前页面未配置后端地址。";
    progressMessage.className = "message error";
    return;
  }

  const button = progressForm.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(progressForm).entries());
  button.disabled = true;
  button.textContent = "查询中...";
  progressMessage.textContent = "";
  progressMessage.className = "message";
  progressResults.innerHTML = "";

  try {
    const response = await fetch(apiUrl("/api/results/query"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "查询失败");
    renderRecords(result.records || []);
  } catch (error) {
    progressMessage.textContent = error.message || "查询失败";
    progressMessage.className = "message error";
  } finally {
    button.disabled = false;
    button.textContent = "查询进度";
  }
});

applyLoggedInName();
