const pageNavItems = [
  { key: "applicationPage", label: "申请页面", href: "./index.html", public: true },
  { key: "reviewPage", label: "评审页面", href: "./admin.html#reviewPanel" },
  { key: "permissionManagement", label: "权限管理", href: "./admin.html#permissionPanel", adminOnly: true },
  { key: "resultSummary", label: "结果汇总", href: "./summary.html" },
  { key: "infoConfig", label: "信息配置", href: "./admin.html#cardConfigPanel", adminOnly: true },
  { key: "fileMaintenance", label: "文件维护", href: "./files.html", adminOnly: true },
  { key: "backupCenter", label: "备份中心", href: "./backup.html", adminOnly: true },
  { key: "coinManagement", label: "成就币管理", href: "./coins.html", adminOnly: true },
  { key: "passed", label: "成就卡榜单", href: "./passed.html", public: true, secondary: true }
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
  if (user.role === "admin" || user.name === "孙立柱") {
    return [
      "applicationPage",
      "passed",
      "reviewPage",
      "permissionManagement",
      "resultSummary",
      "infoConfig",
      "fileMaintenance",
      "backupCenter",
      "coinManagement"
    ];
  }
  const access = Array.isArray(user.pageAccess) ? user.pageAccess : [];
  return [...new Set(access.map((key) => legacyPageKeyMapForNav[key] || key))];
}

function isNavAdmin(user) {
  return user && (user.role === "admin" || user.name === "孙立柱");
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
    if (!user && item.public) return true;
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
