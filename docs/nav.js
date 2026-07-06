const pageNavItems = [
  { key: "applicationPage", label: "\u7533\u8bf7\u9875\u9762", href: "./index.html", public: true },
  { key: "reviewPage", label: "\u8bc4\u5ba1\u9875\u9762", href: "./admin.html#reviewPanel" },
  { key: "permissionManagement", label: "\u6743\u9650\u7ba1\u7406", href: "./admin.html#permissionPanel", adminOnly: true },
  { key: "resultSummary", label: "\u7ed3\u679c\u6c47\u603b", href: "./summary.html" },
  { key: "infoConfig", label: "\u4fe1\u606f\u914d\u7f6e", href: "./admin.html#cardConfigPanel", adminOnly: true },
  { key: "fileMaintenance", label: "\u6587\u4ef6\u7ef4\u62a4", href: "./files.html", adminOnly: true },
  { key: "backupCenter", label: "\u5907\u4efd\u4e2d\u5fc3", href: "./backup.html", adminOnly: true },
  { key: "coinManagement", label: "\u6210\u5c31\u5e01\u7ba1\u7406", href: "./coins.html", adminOnly: true },
  { key: "coinIntro", label: "\u6210\u5c31\u5e01\u4ecb\u7ecd", href: "./coin-intro.html", public: true },
  { key: "passed", label: "\u6210\u5c31\u5361\u699c\u5355", href: "./passed.html", public: true, secondary: true }
];

const legacyPageKeyMapForNav = {
  reviewDesk: "reviewPage",
  summary: "resultSummary",
  cardConfig: "infoConfig"
};
const navTokenKey = "chengjiukaReviewToken";
const navUserKey = "chengjiukaReviewUser";
const navApiBase = (window.CHENGJIUKA_API_BASE || "").replace(/\/$/, "");

function navApiUrl(path) {
  return navApiBase ? `${navApiBase}${path}` : path;
}

function readNavUser() {
  try {
    return JSON.parse(localStorage.getItem(navUserKey) || "null");
  } catch {
    return null;
  }
}

function normalizedNavAccess(user) {
  if (!user) return [];
  if (user.role === "admin" || user.name === "\u5b59\u7acb\u67f1") {
    return [
      "applicationPage",
      "passed",
      "reviewPage",
      "permissionManagement",
      "resultSummary",
      "infoConfig",
      "fileMaintenance",
      "backupCenter",
      "coinManagement",
      "coinIntro"
    ];
  }
  const access = Array.isArray(user.pageAccess) ? user.pageAccess : [];
  return [...new Set(access.map((key) => legacyPageKeyMapForNav[key] || key))];
}

function isNavAdmin(user) {
  return user && (user.role === "admin" || user.name === "\u5b59\u7acb\u67f1");
}

function isCurrentNavItem(href) {
  const current = window.location.pathname.split("/").pop() || "index.html";
  const [target, hash = ""] = href.replace("./", "").split("#");
  if (current !== target) return false;
  if (!hash) return true;
  const currentHash = window.location.hash.replace("#", "");
  return currentHash === hash || (current === "admin.html" && hash === "reviewPanel" && !currentHash);
}

function renderPageNav() {
  const nav = document.querySelector("[data-page-nav]");
  if (!nav) return;

  const user = readNavUser();
  const access = new Set(normalizedNavAccess(user));
  const items = pageNavItems.filter((item) => {
    if (item.key === "passed") return true;
    if (item.public) return true;
    if (item.adminOnly) return isNavAdmin(user);
    return access.has(item.key);
  });

  nav.innerHTML = items
    .map((item) => {
      const classNames = ["admin-link", "secondary-link"];
      if (isCurrentNavItem(item.href)) classNames.push("active-link");
      return `<a class="${classNames.join(" ")}" href="${item.href}">${item.label}</a>`;
    })
    .join("");
}

renderPageNav();

async function refreshNavUser() {
  const token = localStorage.getItem(navTokenKey);
  if (!token) return;

  try {
    const response = await fetch(navApiUrl("/api/auth/me"), {
      headers: { "x-review-token": token }
    });
    const result = await response.json();
    if (!response.ok || !result.user) {
      localStorage.removeItem(navTokenKey);
      localStorage.removeItem(navUserKey);
      renderPageNav();
      return;
    }
    localStorage.setItem(navUserKey, JSON.stringify(result.user));
  } catch {
    return;
  }

  renderPageNav();
}

refreshNavUser();
