const passedTableBody = document.querySelector("#passedTableBody");
const passedMessage = document.querySelector("#passedMessage");
const passedCount = document.querySelector("#passedCount");
const passedKeyword = document.querySelector("#passedKeyword");
const passedDepartmentFilter = document.querySelector("#passedDepartmentFilter");
const passedCardFilter = document.querySelector("#passedCardFilter");
const passedValidityFilter = document.querySelector("#passedValidityFilter");
const passedResetBtn = document.querySelector("#passedResetBtn");
const activeCardChart = document.querySelector("#activeCardChart");
const departmentCardChart = document.querySelector("#departmentCardChart");
const applicantTopChart = document.querySelector("#applicantTopChart");
const activeCardTotal = document.querySelector("#activeCardTotal");
const departmentCardTotal = document.querySelector("#departmentCardTotal");
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

function validityText(value) {
  return value === "active" ? "有效期内" : "已过有效期";
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
  const haystack = [
    item.applicantName,
    item.department,
    item.cardType,
    item.score,
    item.applicationDate,
    item.reviewDate,
    item.employmentStatus,
    validityText(item.validity)
  ]
    .join(" ")
    .toLowerCase();

  return (
    (!keyword || haystack.includes(keyword)) &&
    (!department || item.department === department) &&
    (!cardType || item.cardType === cardType) &&
    (!validity || item.validity === validity)
  );
}

function countBy(records, field) {
  return records.reduce((counts, item) => {
    const key = String(item[field] || "未填写").trim() || "未填写";
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
}

function topEntries(counts, limit = Infinity) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .slice(0, limit);
}

function renderBarChart(container, entries) {
  if (!entries.length) {
    container.innerHTML = '<p class="empty-files">暂无数据。</p>';
    return;
  }

  const maxValue = Math.max(...entries.map(([, value]) => value), 1);
  container.innerHTML = entries
    .map(([label, value]) => {
      const width = Math.max(5, Math.round((value / maxValue) * 100));
      return `
        <div class="bar-row">
          <span class="bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
          <div class="bar-track">
            <span class="bar-fill" style="width:${width}%"></span>
          </div>
          <strong>${value}</strong>
        </div>
      `;
    })
    .join("");
}

function renderCharts(records) {
  const activeRecords = records.filter((item) => item.validity === "active");
  activeCardTotal.textContent = activeRecords.length;
  departmentCardTotal.textContent = records.length;
  renderBarChart(activeCardChart, topEntries(countBy(activeRecords, "cardType")));
  renderBarChart(departmentCardChart, topEntries(countBy(records, "department")));
  renderBarChart(applicantTopChart, topEntries(countBy(records, "applicantName"), 15));
}

function renderPassedTable(records) {
  if (!records.length) {
    passedTableBody.innerHTML = '<tr><td colspan="9">暂无记录。</td></tr>';
    return;
  }

  passedTableBody.innerHTML = records
    .map(
      (item, index) => `
        <tr>
          <td data-label="序号">${index + 1}</td>
          <td data-label="申报人姓名">${escapeHtml(item.applicantName || "")}</td>
          <td data-label="人员状态">
            <span class="employment-badge ${item.employmentStatus === "在职" ? "active" : "inactive"}">
              ${escapeHtml(item.employmentStatus || "已离职")}
            </span>
          </td>
          <td data-label="所属部门">${escapeHtml(item.department || "")}</td>
          <td data-label="成就卡项目">${escapeHtml(item.cardType || "")}</td>
          <td data-label="分值">${escapeHtml(item.score ? `${item.score}分` : "")}</td>
          <td data-label="有效状态">${escapeHtml(validityText(item.validity))}</td>
          <td data-label="申报日期">${escapeHtml(item.applicationDate || "")}</td>
          <td data-label="评审日期">${escapeHtml(item.reviewDate || "")}</td>
        </tr>
      `
    )
    .join("");
}

function renderPassedRecords() {
  const filtered = passedRecords.filter(matchesFilters);
  passedCount.textContent = `${filtered.length} 条`;
  renderCharts(filtered);
  renderPassedTable(filtered);
}

async function loadPassedRecords() {
  setPassedMessage("加载中...", "");
  try {
    const response = await fetch(apiUrl("/api/public/passed"));
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "加载失败");

    const active = (result.active || []).map((item) => ({ ...item, validity: item.validity || "active" }));
    const expired = (result.expired || []).map((item) => ({ ...item, validity: item.validity || "expired" }));
    passedRecords = [...active, ...expired];
    hydrateFilters();
    renderPassedRecords();
    setPassedMessage("已更新", "success");
  } catch (error) {
    passedTableBody.innerHTML = '<tr><td colspan="9">加载失败。</td></tr>';
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
