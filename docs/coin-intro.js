const titleEl = document.querySelector("#coinIntroTitle");
const contentEl = document.querySelector("#coinIntroContent");
const metaEl = document.querySelector("#coinIntroMeta");
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

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function renderIntro(intro = {}) {
  titleEl.textContent = intro.title || "成就币介绍";
  const lines = String(intro.content || "暂无成就币介绍内容。")
    .split(/\n{2,}|\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  contentEl.innerHTML = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");

  const updatedAt = formatDate(intro.updatedAt);
  const updatedBy = intro.updatedBy ? ` / ${intro.updatedBy}` : "";
  metaEl.textContent = updatedAt ? `最近更新：${updatedAt}${updatedBy}` : "";
}

async function loadIntro() {
  if (!hasBackend()) {
    renderIntro();
    return;
  }

  try {
    const response = await fetch(apiUrl("/api/coin-intro"));
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "加载失败");
    renderIntro(result);
  } catch (error) {
    contentEl.innerHTML = `<p class="message error">${escapeHtml(error.message || "加载失败")}</p>`;
  }
}

loadIntro();
