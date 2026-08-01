const passedTableBody = document.querySelector("#passedTableBody");
const passedMessage = document.querySelector("#passedMessage");
const passedCount = document.querySelector("#passedCount");
const passedKeyword = document.querySelector("#passedKeyword");
const passedDepartmentFilter = document.querySelector("#passedDepartmentFilter");
const passedCardFilter = document.querySelector("#passedCardFilter");
const passedValidityFilter = document.querySelector("#passedValidityFilter");
const passedEmploymentFilter = document.querySelector("#passedEmploymentFilter");
const passedCardCountMin = document.querySelector("#passedCardCountMin");
const passedScoreMin = document.querySelector("#passedScoreMin");
const passedScoreRankTop = document.querySelector("#passedScoreRankTop");
const passedApplyBtn = document.querySelector("#passedApplyBtn");
const passedResetBtn = document.querySelector("#passedResetBtn");
const passedExportBtn = document.querySelector("#passedExportBtn");
const activeCardChart = document.querySelector("#activeCardChart");
const departmentCardChart = document.querySelector("#departmentCardChart");
const applicantTopChart = document.querySelector("#applicantTopChart");
const activeCardTotal = document.querySelector("#activeCardTotal");
const departmentCardTotal = document.querySelector("#departmentCardTotal");
const applicantSummaryBody = document.querySelector("#applicantSummaryBody");
const applicantSummaryCount = document.querySelector("#applicantSummaryCount");
const applicantPrevPage = document.querySelector("#applicantPrevPage");
const applicantNextPage = document.querySelector("#applicantNextPage");
const applicantPageInfo = document.querySelector("#applicantPageInfo");
const passedPrevPage = document.querySelector("#passedPrevPage");
const passedNextPage = document.querySelector("#passedNextPage");
const passedPageInfo = document.querySelector("#passedPageInfo");
const localTestApiBase = "http://localhost:3000";
const configuredApiBase = (window.CHENGJIUKA_API_BASE || localTestApiBase).replace(/\/$/, "");
const pageSize = 10;

let passedRecords = [];
let filteredPassedRecords = [];
let filteredApplicantRows = [];
let passedPage = 1;
let applicantPage = 1;
let activePassedFilters = {
  keyword: "",
  department: "",
  cardType: "",
  validity: "",
  employmentStatus: "",
  cardCountMin: "",
  scoreMin: "",
  scoreRankTop: ""
};

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

function readPassedFilters() {
  return {
    keyword: passedKeyword.value.trim().toLowerCase(),
    department: passedDepartmentFilter.value,
    cardType: passedCardFilter.value,
    validity: passedValidityFilter.value,
    employmentStatus: passedEmploymentFilter.value,
    cardCountMin: passedCardCountMin.value.trim(),
    scoreMin: passedScoreMin.value.trim(),
    scoreRankTop: passedScoreRankTop.value.trim()
  };
}

function matchesBaseFilters(item) {
  const { keyword, department, cardType, validity, employmentStatus } = activePassedFilters;
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
    (!validity || item.validity === validity) &&
    (!employmentStatus || item.employmentStatus === employmentStatus)
  );
}

function numericScore(item) {
  const score = Number(item.score);
  return Number.isFinite(score) ? score : 0;
}

function buildApplicantStats(records) {
  return records.reduce((stats, item) => {
    const applicantName = String(item.applicantName || "").trim();
    if (!applicantName) return stats;
    const current = stats.get(applicantName) || { count: 0, score: 0, employmentStatus: "" };
    current.count += 1;
    current.score += numericScore(item);
    if (!current.employmentStatus) current.employmentStatus = item.employmentStatus || "已离职";
    stats.set(applicantName, current);
    return stats;
  }, new Map());
}

function buildApplicantSummary(records) {
  return [...buildApplicantStats(records).entries()]
    .map(([applicantName, stats]) => ({ applicantName, ...stats }))
    .sort(
      (a, b) =>
        b.score - a.score || b.count - a.count || a.applicantName.localeCompare(b.applicantName, "zh-CN")
    );
}

function pageSlice(records, requestedPage) {
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (page - 1) * pageSize;
  return { page, totalPages, start, records: records.slice(start, start + pageSize) };
}

function updatePagination(previousButton, nextButton, pageInfo, page, totalPages, totalRecords) {
  previousButton.disabled = page <= 1 || totalRecords === 0;
  nextButton.disabled = page >= totalPages || totalRecords === 0;
  pageInfo.textContent = `第 ${page} / ${totalPages} 页`;
}

function applyApplicantAggregateFilters(records) {
  const cardCountText = activePassedFilters.cardCountMin;
  const scoreText = activePassedFilters.scoreMin;
  const hasCardCountFilter = cardCountText !== "";
  const hasScoreFilter = scoreText !== "";

  if (!hasCardCountFilter && !hasScoreFilter) return records;

  const minCardCount = Number(cardCountText);
  const minScore = Number(scoreText);
  const applicantStats = buildApplicantStats(records);

  return records.filter((item) => {
    const applicantName = String(item.applicantName || "").trim();
    const stats = applicantStats.get(applicantName) || { count: 0, score: 0 };
    const cardCountOk = !hasCardCountFilter || (Number.isFinite(minCardCount) && stats.count > minCardCount);
    const scoreOk = !hasScoreFilter || (Number.isFinite(minScore) && stats.score > minScore);
    return cardCountOk && scoreOk;
  });
}

function applyTotalScoreRankFilter(records) {
  const rankText = activePassedFilters.scoreRankTop;
  if (rankText === "") return records;

  const rankLimit = Math.trunc(Number(rankText));
  if (!Number.isFinite(rankLimit) || rankLimit < 1) return [];

  const rankedApplicants = [...buildApplicantStats(records).entries()]
    .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0], "zh-CN"))
    .slice(0, rankLimit)
    .map(([applicantName]) => applicantName);
  const rankByApplicant = new Map(rankedApplicants.map((applicantName, index) => [applicantName, index]));

  return records
    .filter((item) => rankByApplicant.has(String(item.applicantName || "").trim()))
    .sort((a, b) => {
      const aName = String(a.applicantName || "").trim();
      const bName = String(b.applicantName || "").trim();
      return (
        rankByApplicant.get(aName) - rankByApplicant.get(bName) ||
        String(b.reviewDate || "").localeCompare(String(a.reviewDate || ""))
      );
    });
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
  const paged = pageSlice(records, passedPage);
  passedPage = paged.page;
  updatePagination(passedPrevPage, passedNextPage, passedPageInfo, passedPage, paged.totalPages, records.length);

  if (!records.length) {
    passedTableBody.innerHTML = '<tr><td colspan="9">暂无记录。</td></tr>';
    return;
  }

  passedTableBody.innerHTML = paged.records
    .map(
      (item, index) => `
        <tr>
          <td data-label="序号">${paged.start + index + 1}</td>
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

function renderApplicantSummary(records) {
  filteredApplicantRows = buildApplicantSummary(records);
  applicantSummaryCount.textContent = `${filteredApplicantRows.length} 人`;
  const paged = pageSlice(filteredApplicantRows, applicantPage);
  applicantPage = paged.page;
  updatePagination(
    applicantPrevPage,
    applicantNextPage,
    applicantPageInfo,
    applicantPage,
    paged.totalPages,
    filteredApplicantRows.length
  );

  if (!filteredApplicantRows.length) {
    applicantSummaryBody.innerHTML = '<tr><td colspan="4">暂无记录。</td></tr>';
    return;
  }

  applicantSummaryBody.innerHTML = paged.records
    .map(
      (item) => `
        <tr>
          <td data-label="申报人">${escapeHtml(item.applicantName)}</td>
          <td data-label="人员状态">
            <span class="employment-badge ${item.employmentStatus === "在职" ? "active" : "inactive"}">
              ${escapeHtml(item.employmentStatus)}
            </span>
          </td>
          <td data-label="总成就卡数量">${item.count}</td>
          <td data-label="总分值">${item.score}分</td>
        </tr>
      `
    )
    .join("");
}

function renderPassedRecords(resetPages = false) {
  if (resetPages) {
    passedPage = 1;
    applicantPage = 1;
  }
  const baseFiltered = passedRecords.filter(matchesBaseFilters);
  const aggregateFiltered = applyApplicantAggregateFilters(baseFiltered);
  const filtered = applyTotalScoreRankFilter(aggregateFiltered);
  filteredPassedRecords = filtered;
  passedCount.textContent = `${filtered.length} 条`;
  passedExportBtn.disabled = filtered.length === 0;
  renderCharts(filtered);
  renderApplicantSummary(filtered);
  renderPassedTable(filtered);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function responseFilename(response) {
  const disposition = response.headers.get("Content-Disposition") || "";
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (!utf8Match) return "成就卡榜单筛选结果.xlsx";

  try {
    return decodeURIComponent(utf8Match[1]);
  } catch {
    return "成就卡榜单筛选结果.xlsx";
  }
}

async function exportFilteredRecords() {
  if (!filteredPassedRecords.length) {
    setPassedMessage("当前筛选结果为空，无法导出。", "error");
    return;
  }

  const originalText = passedExportBtn.textContent;
  passedExportBtn.disabled = true;
  passedExportBtn.textContent = "导出中...";
  setPassedMessage("正在生成 Excel...", "");

  try {
    const response = await fetch(apiUrl("/api/public/passed/export"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: filteredPassedRecords })
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.message || "导出失败");
    }

    downloadBlob(await response.blob(), responseFilename(response));
    setPassedMessage(`已导出 ${filteredPassedRecords.length} 条筛选结果`, "success");
  } catch (error) {
    setPassedMessage(error.message || "导出失败", "error");
  } finally {
    passedExportBtn.textContent = originalText;
    passedExportBtn.disabled = filteredPassedRecords.length === 0;
  }
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
    activePassedFilters = readPassedFilters();
    renderPassedRecords(true);
    setPassedMessage("已更新", "success");
  } catch (error) {
    passedTableBody.innerHTML = '<tr><td colspan="9">加载失败。</td></tr>';
    setPassedMessage(error.message, "error");
  }
}

passedApplyBtn.addEventListener("click", () => {
  activePassedFilters = readPassedFilters();
  renderPassedRecords(true);
});

passedResetBtn.addEventListener("click", () => {
  passedKeyword.value = "";
  passedDepartmentFilter.value = "";
  passedCardFilter.value = "";
  passedValidityFilter.value = "";
  passedEmploymentFilter.value = "";
  passedCardCountMin.value = "";
  passedScoreMin.value = "";
  passedScoreRankTop.value = "";
  activePassedFilters = readPassedFilters();
  renderPassedRecords(true);
});

passedExportBtn.addEventListener("click", exportFilteredRecords);
passedPrevPage.addEventListener("click", () => {
  if (passedPage <= 1) return;
  passedPage -= 1;
  renderPassedTable(filteredPassedRecords);
});
passedNextPage.addEventListener("click", () => {
  passedPage += 1;
  renderPassedTable(filteredPassedRecords);
});
applicantPrevPage.addEventListener("click", () => {
  if (applicantPage <= 1) return;
  applicantPage -= 1;
  renderApplicantSummary(filteredPassedRecords);
});
applicantNextPage.addEventListener("click", () => {
  applicantPage += 1;
  renderApplicantSummary(filteredPassedRecords);
});

loadPassedRecords();
