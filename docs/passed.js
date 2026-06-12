const activePassedList = document.querySelector("#activePassedList");
const expiredPassedList = document.querySelector("#expiredPassedList");
const passedMessage = document.querySelector("#passedMessage");
const localTestApiBase = "http://localhost:3000";
const configuredApiBase = (window.CHENGJIUKA_API_BASE || localTestApiBase).replace(/\/$/, "");

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

function apiUrl(path) {
  return configuredApiBase ? `${configuredApiBase}${path}` : path;
}

function setPassedMessage(text, type) {
  passedMessage.textContent = text;
  passedMessage.className = `message ${type || ""}`;
}

function renderPassedList(records) {
  if (!records.length) {
    return '<p class="empty-files">暂无记录。</p>';
  }

  return `
    <div class="public-passed-grid">
      ${records
        .map(
          (item) => `
            <article class="public-passed-card">
              <div class="public-passed-card-head">
                <strong>${escapeHtml(item.applicantName)}</strong>
                <span>${escapeHtml(item.cardType)}</span>
              </div>
              <div class="public-passed-meta">
                <div><span>所属部门</span>${escapeHtml(item.department || "")}</div>
                <div><span>分值</span>${escapeHtml(item.score ? `${item.score}分` : "")}</div>
                <div><span>申报日期</span>${escapeHtml(item.applicationDate || "")}</div>
                <div><span>评审日期</span>${escapeHtml(item.reviewDate || "")}</div>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

async function loadPassedRecords() {
  setPassedMessage("加载中...", "");
  try {
    const response = await fetch(apiUrl("/api/public/passed"));
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "加载失败");
    activePassedList.innerHTML = renderPassedList(result.active || []);
    expiredPassedList.innerHTML = renderPassedList(result.expired || []);
    setPassedMessage("已更新", "success");
  } catch (error) {
    activePassedList.innerHTML = '<p class="empty-files">加载失败。</p>';
    expiredPassedList.innerHTML = '<p class="empty-files">暂无记录。</p>';
    setPassedMessage(error.message, "error");
  }
}

loadPassedRecords();
