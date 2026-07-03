let authToken = localStorage.getItem("chengjiukaReviewToken") || "";
let currentUser = null;
let coinRecords = [];
let coinBalances = [];
let rosterEmployees = [];
let lastAutoDepartment = "";

const loginPanel = document.querySelector("#loginPanel");
const coinApp = document.querySelector("#coinApp");
const loginForm = document.querySelector("#loginForm");
const loginName = document.querySelector("#loginName");
const loginSecret = document.querySelector("#loginSecret");
const loginMessage = document.querySelector("#loginMessage");
const coinSummary = document.querySelector("#coinSummary");
const coinForm = document.querySelector("#coinForm");
const coinType = document.querySelector("#coinType");
const applicantName = document.querySelector("#applicantName");
const department = document.querySelector("#department");
const recordDate = document.querySelector("#recordDate");
const cardType = document.querySelector("#cardType");
const score = document.querySelector("#score");
const leaveDays = document.querySelector("#leaveDays");
const rewardName = document.querySelector("#rewardName");
const coinAmount = document.querySelector("#coinAmount");
const note = document.querySelector("#note");
const amountPreview = document.querySelector("#amountPreview");
const coinFormMessage = document.querySelector("#coinFormMessage");
const typeFilter = document.querySelector("#typeFilter");
const searchInput = document.querySelector("#searchInput");
const resetFilterBtn = document.querySelector("#resetFilterBtn");
const coinRecordBody = document.querySelector("#coinRecordBody");
const coinBalanceBody = document.querySelector("#coinBalanceBody");
const recordMessage = document.querySelector("#recordMessage");
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

function isAdminUser(user = currentUser) {
  return user && (user.role === "admin" || user.name === "孙立柱");
}

function setMessage(element, text, type) {
  element.textContent = text;
  element.className = `message ${type || ""}`;
}

function normalizeName(value) {
  return String(value || "").trim();
}

function localDateValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function numberText(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, "");
}

function coinText(value) {
  const number = Number(value || 0);
  const sign = number > 0 ? "+" : "";
  return `${sign}${numberText(number)}`;
}

function showLogin() {
  currentUser = null;
  authToken = "";
  localStorage.removeItem("chengjiukaReviewToken");
  localStorage.removeItem("chengjiukaReviewUser");
  loginPanel.hidden = false;
  coinApp.hidden = true;
  if (typeof renderPageNav === "function") renderPageNav();
}

function showCoinApp(user) {
  currentUser = user;
  loginPanel.hidden = true;
  coinApp.hidden = false;
  if (typeof renderPageNav === "function") renderPageNav();
}

function cardScore(cardName) {
  const detail = (window.CHENGJIUKA_CARD_DETAILS || {})[cardName] || {};
  return Number(detail.score || 0);
}

function initCardOptions() {
  const details = window.CHENGJIUKA_CARD_DETAILS || {};
  const options = Object.entries(details)
    .filter(([, detail]) => detail && detail.isOpen !== false && detail.definition)
    .map(([name]) => name);

  cardType.innerHTML =
    '<option value="">请选择成就卡</option>' + options.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
}

async function loadRosterEmployees() {
  try {
    const response = await fetch(apiUrl("/api/roster"));
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "花名册加载失败");
    rosterEmployees = Array.isArray(result.employees) ? result.employees : [];
  } catch {
    rosterEmployees = [];
  }
}

function autofillDepartmentByName() {
  const name = normalizeName(applicantName.value);
  const currentDepartment = department.value.trim();
  if (!name) {
    if (currentDepartment && currentDepartment === lastAutoDepartment) department.value = "";
    lastAutoDepartment = "";
    return;
  }
  const employee = rosterEmployees.find((item) => normalizeName(item.name) === name);
  if (!employee || !employee.department) {
    if (currentDepartment && currentDepartment === lastAutoDepartment) department.value = "";
    lastAutoDepartment = "";
    return;
  }

  if (currentDepartment && currentDepartment !== lastAutoDepartment) return;

  department.value = employee.department;
  lastAutoDepartment = employee.department;
}

function markDepartmentManualEdit() {
  if (department.value.trim() !== lastAutoDepartment) {
    lastAutoDepartment = "";
  }
}

function resetCoinFormState() {
  lastAutoDepartment = "";
  recordDate.value = localDateValue();
  updateTypeFields();
}

function updateTypeFields() {
  const type = coinType.value;
  document.querySelectorAll(".coin-card-field").forEach((item) => {
    item.hidden = type !== "card_issue";
  });
  document.querySelectorAll(".coin-leave-field").forEach((item) => {
    item.hidden = type !== "leave_exchange";
  });
  document.querySelectorAll(".coin-reward-field").forEach((item) => {
    item.hidden = type !== "reward_redeem";
  });
  updateAmountPreview();
}

function calculateAmount() {
  if (coinType.value === "card_issue") {
    return Number(score.value || cardScore(cardType.value) || 0);
  }
  if (coinType.value === "leave_exchange") {
    return Number(leaveDays.value || 0) * 20;
  }
  if (coinType.value === "reward_redeem") {
    return -Number(coinAmount.value || 0);
  }
  return 0;
}

function updateAmountPreview() {
  amountPreview.textContent = `本次变动：${coinText(calculateAmount())} 币`;
}

function renderSummary(totals = {}) {
  const cards = [
    ["当前总余额", totals.balance || 0],
    ["成就卡发放", totals.cardIssue || 0],
    ["年假兑换", totals.leaveExchange || 0],
    ["奖励兑换", totals.rewardRedeem || 0],
    ["涉及人员", totals.people || 0],
    ["流水记录", totals.records || 0]
  ];

  coinSummary.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="summary-card">
          <strong>${escapeHtml(numberText(value))}</strong>
          <span>${escapeHtml(label)}</span>
        </article>
      `
    )
    .join("");
}

function filteredRecords() {
  const type = typeFilter.value;
  const keyword = searchInput.value.trim().toLowerCase();

  return coinRecords.filter((record) => {
    const matchesType = !type || record.type === type;
    const haystack = [
      record.applicantName,
      record.department,
      record.typeLabel,
      record.cardType,
      record.rewardName,
      record.recordDate,
      record.note,
      record.createdBy
    ]
      .join(" ")
      .toLowerCase();
    return matchesType && (!keyword || haystack.includes(keyword));
  });
}

function renderRecords() {
  const records = filteredRecords();
  if (!records.length) {
    coinRecordBody.innerHTML = '<tr><td colspan="11">暂无符合条件的成就币流水。</td></tr>';
    return;
  }

  coinRecordBody.innerHTML = records
    .map((record, index) => {
      const itemName = record.type === "reward_redeem" ? record.rewardName : record.cardType;
      const basis =
        record.type === "card_issue" ? `${record.score || ""} 分` : record.type === "leave_exchange" ? `${record.leaveDays || ""} 天` : "";
      return `
        <tr>
          <td data-label="序号">${index + 1}</td>
          <td data-label="姓名">${escapeHtml(record.applicantName)}</td>
          <td data-label="部门">${escapeHtml(record.department || "")}</td>
          <td data-label="类型">${escapeHtml(record.typeLabel)}</td>
          <td data-label="项目 / 奖励">${escapeHtml(itemName || "")}</td>
          <td data-label="分值 / 天数">${escapeHtml(basis)}</td>
          <td data-label="成就币"><strong class="${record.amount < 0 ? "coin-negative" : "coin-positive"}">${escapeHtml(coinText(record.amount))}</strong></td>
          <td data-label="日期">${escapeHtml(record.recordDate || "")}</td>
          <td data-label="备注" class="summary-application-content">${escapeHtml(record.note || "")}</td>
          <td data-label="登记人">${escapeHtml(record.createdBy || "")}</td>
          <td data-label="操作">
            <button type="button" class="danger-button delete-coin-record-btn" data-id="${escapeHtml(record.id)}">删除</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderBalances() {
  if (!coinBalances.length) {
    coinBalanceBody.innerHTML = '<tr><td colspan="7">暂无余额数据。</td></tr>';
    return;
  }

  coinBalanceBody.innerHTML = coinBalances
    .map(
      (item) => `
        <tr>
          <td data-label="姓名">${escapeHtml(item.applicantName)}</td>
          <td data-label="部门">${escapeHtml(item.department || "")}</td>
          <td data-label="当前余额"><strong>${escapeHtml(numberText(item.balance))}</strong></td>
          <td data-label="成就卡发放">${escapeHtml(numberText(item.cardIssue))}</td>
          <td data-label="年假兑换">${escapeHtml(numberText(item.leaveExchange))}</td>
          <td data-label="奖励兑换">${escapeHtml(numberText(item.rewardRedeem))}</td>
          <td data-label="记录数">${escapeHtml(item.recordCount)}</td>
        </tr>
      `
    )
    .join("");
}

async function loadCoins() {
  const response = await fetch(apiUrl("/api/coins"), {
    headers: authHeaders()
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "成就币记录加载失败");
  coinRecords = Array.isArray(result.records) ? result.records : [];
  coinBalances = Array.isArray(result.balances) ? result.balances : [];
  renderSummary(result.totals || {});
  renderRecords();
  renderBalances();
}

async function restoreSession() {
  recordDate.value = localDateValue();
  initCardOptions();
  updateTypeFields();
  if (!authToken || !hasBackend()) return;

  try {
    const response = await fetch(apiUrl("/api/auth/me"), {
      headers: authHeaders()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "登录已过期");
    if (!isAdminUser(result.user)) {
      setMessage(loginMessage, "当前账号没有成就币管理权限。", "error");
      showLogin();
      return;
    }
    localStorage.setItem("chengjiukaReviewUser", JSON.stringify(result.user));
    showCoinApp(result.user);
    await loadRosterEmployees();
    await loadCoins();
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

  setMessage(loginMessage, "", "");
  try {
    const response = await fetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: loginName.value.trim(),
        secret: loginSecret.value.trim()
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "登录失败");
    if (!isAdminUser(result.user)) throw new Error("当前账号没有成就币管理权限。");
    authToken = result.token;
    localStorage.setItem("chengjiukaReviewToken", authToken);
    localStorage.setItem("chengjiukaReviewUser", JSON.stringify(result.user));
    loginSecret.value = "";
    showCoinApp(result.user);
    await loadRosterEmployees();
    await loadCoins();
  } catch (error) {
    setMessage(loginMessage, error.message, "error");
  }
});

coinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = coinForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setMessage(coinFormMessage, "", "");

  try {
    const response = await fetch(apiUrl("/api/coins"), {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        type: coinType.value,
        applicantName: applicantName.value.trim(),
        department: department.value.trim(),
        recordDate: recordDate.value,
        cardType: cardType.value,
        score: score.value,
        leaveDays: leaveDays.value,
        rewardName: rewardName.value.trim(),
        coinAmount: coinAmount.value,
        note: note.value.trim()
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "成就币记录保存失败");
    setMessage(coinFormMessage, result.message || "成就币记录已保存。", "success");
    coinForm.reset();
    resetCoinFormState();
    await loadCoins();
  } catch (error) {
    setMessage(coinFormMessage, error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

coinRecordBody.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-coin-record-btn");
  if (!button) return;
  const id = button.dataset.id;
  if (!id || !confirm("确认删除这条成就币记录？")) return;

  button.disabled = true;
  setMessage(recordMessage, "", "");
  try {
    const response = await fetch(apiUrl(`/api/coins/${encodeURIComponent(id)}`), {
      method: "DELETE",
      headers: authHeaders()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "删除失败");
    setMessage(recordMessage, result.message || "成就币记录已删除。", "success");
    await loadCoins();
  } catch (error) {
    setMessage(recordMessage, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

cardType.addEventListener("change", () => {
  const configuredScore = cardScore(cardType.value);
  if (configuredScore) score.value = configuredScore;
  updateAmountPreview();
});
applicantName.addEventListener("input", autofillDepartmentByName);
applicantName.addEventListener("blur", autofillDepartmentByName);
department.addEventListener("input", markDepartmentManualEdit);
coinType.addEventListener("change", updateTypeFields);
[score, leaveDays, coinAmount].forEach((input) => input.addEventListener("input", updateAmountPreview));
[typeFilter, searchInput].forEach((input) => input.addEventListener("input", renderRecords));
resetFilterBtn.addEventListener("click", () => {
  typeFilter.value = "";
  searchInput.value = "";
  renderRecords();
});

restoreSession();
