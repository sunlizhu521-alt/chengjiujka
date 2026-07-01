const activePassedList = document.querySelector("#activePassedList");
const expiredPassedList = document.querySelector("#expiredPassedList");
const passedMessage = document.querySelector("#passedMessage");
const passedCount = document.querySelector("#passedCount");
const activePassedCount = document.querySelector("#activePassedCount");
const expiredPassedCount = document.querySelector("#expiredPassedCount");
const passedKeyword = document.querySelector("#passedKeyword");
const passedDepartmentFilter = document.querySelector("#passedDepartmentFilter");
const passedCardFilter = document.querySelector("#passedCardFilter");
const passedValidityFilter = document.querySelector("#passedValidityFilter");
const passedResetBtn = document.querySelector("#passedResetBtn");
const localTestApiBase = "http://localhost:3000";
const configuredApiBase = (window.CHENGJIUKA_API_BASE || localTestApiBase).replace(/\/$/, "");

let passedRecords = [];

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

function uniqueSorted(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "zh-CN")
  );
}

function renderSelectOptions(select, values, defaultText) {
  const currentValue = select.value;
  const options = uniqueSorted(values);
  select.innerHTML = [
    `<option value="">${escapeHtml(defaultText)}</option>`,
    ...options.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
  ].join("");
  if (currentValue && options.includes(currentValue)) {
    select.value = currentValue;
  }
}

function hydrateFilters() {
  renderSelectOptions(
    passedDepartmentFilter,
    passedRecords.map((item) => item.department),
    "全部部门"
  );
  renderSelectOptions(
    passedCardFilter,
    passedRecords.map((item) => item.cardType),
    "全部项目"
  );
}

function matchesFilters(item) {
  const keyword = passedKeyword.value.trim().toLowerCase();
  const department = passedDepartmentFilter.value;
  const cardType = passedCardFilter.value;
  const validity = passedValidityFilter.value;
  const haystack = [item.applicantName, item.department, item.cardType, item.score, item.applicationDate, item.reviewDate]
    .join(" ")
    .toLowerCase();

  return (
    (!keyword || haystack.includes(keyword)) &&
    (!department || item.department === department) &&
    (!cardType || item.cardType === cardType) &&
    (!validity || item.validity === validity)
  );
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
                <div><span>有效状态</span>${item.validity === "active" ? "有效期内" : "已过有效期"}</div>
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

function renderPassedRecords() {
  const filtered = passedRecords.filter(matchesFilters);
  const active = filtered.filter((item) => item.validity === "active");
  const expired = filtered.filter((item) => item.validity === "expired");
  const showActive = passedValidityFilter.value !== "expired";
  const showExpired = passedValidityFilter.value !== "active";

  activePassedList.closest(".public-passed-panel").hidden = !showActive;
  expiredPassedList.closest(".public-passed-panel").hidden = !showExpired;
  activePassedList.innerHTML = renderPassedList(active);
  expiredPassedList.innerHTML = renderPassedList(expired);
  passedCount.textContent = `${filtered.length} 条`;
  activePassedCount.textContent = `${active.length} 条`;
  expiredPassedCount.textContent = `${expired.length} 条`;
}

async function loadPassedRecords() {
  setPassedMessage("加载中...", "");
  try {
    const response = await fetch(apiUrl("/api/public/passed"));
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "加载失败");

    const active = (result.active || []).map((item) => ({ ...item, validity: "active" }));
    const expired = (result.expired || []).map((item) => ({ ...item, validity: "expired" }));
    passedRecords = [...active, ...expired];
    hydrateFilters();
    renderPassedRecords();
    setPassedMessage("已更新", "success");
  } catch (error) {
    activePassedList.innerHTML = '<p class="empty-files">加载失败。</p>';
    expiredPassedList.innerHTML = '<p class="empty-files">暂无记录。</p>';
    setPassedMessage(error.message, "error");
  }
}

[passedKeyword, passedDepartmentFilter, passedCardFilter, passedValidityFilter].forEach((input) => {
  input.addEventListener("input", renderPassedRecords);
});

passedResetBtn.addEventListener("click", () => {
  passedKeyword.value = "";
  passedDepartmentFilter.value = "";
  passedCardFilter.value = "";
  passedValidityFilter.value = "";
  renderPassedRecords();
});

loadPassedRecords();
