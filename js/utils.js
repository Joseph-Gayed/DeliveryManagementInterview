import { els } from "./ui.js";

export function cleanText(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/\t/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

export function highlight(text, term) {
  if (!term) return esc(text);
  const safeText = esc(text);
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return safeText.replace(new RegExp("(" + escapedTerm + ")", "ig"), "<mark>$1</mark>");
  } catch {
    return safeText;
  }
}

export function normalizeQuestion(question) {
  let value = cleanText(question).toLowerCase();
  value = value.replace(/^(question\s*)?(q\s*)?\d+[\s.\-):]+/i, "");
  value = value.replace(/[''""'"`]/g, "");
  value = value.replace(/[^\p{L}\p{N}\s]/gu, " ");
  value = value.replace(/\s+/g, " ").trim();
  return value;
}

export function generatedId(index) {
  return "Q" + String(index + 1).padStart(3, "0");
}

export function parseVersion(version) {
  const value = String(version || "").trim();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:\.(\d+))?$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    revision: Number(match[4] || 0)
  };
}

export function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true });
  for (const field of ["year", "month", "day", "revision"]) {
    if (va[field] > vb[field]) return 1;
    if (va[field] < vb[field]) return -1;
  }
  return 0;
}

export function isNewerVersion(remoteVersion, localVersion) {
  return compareVersions(remoteVersion, localVersion) > 0;
}

export function showToast(message, type = "info") {
  els.toast.textContent = message;
  els.toast.className =
    "fixed bottom-4 left-4 right-4 z-[90] rounded-xl px-4 py-3 text-sm font-medium shadow-lg sm:left-auto sm:right-4 sm:max-w-sm " +
    (type === "error" ? "bg-red-600 text-white" : "bg-slate-900 text-white dark:bg-white dark:text-slate-900");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.classList.add("hidden");
  }, 3500);
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}