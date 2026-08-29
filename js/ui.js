import { cleanText, esc, highlight } from "./utils.js";
import { state, saveProgress } from "./state.js";
import { STORAGE, PAGE_SIZE, answerBorderColors } from "./config.js";
import { getFilteredQuestions, removeSource } from "./db.js";

const $ = id => document.getElementById(id);

export const els = {
  drawerOverlay: $("drawerOverlay"),
  drawer: $("drawer"),
  drawerBtn: $("drawerBtn"),
  closeDrawer: $("closeDrawer"),
  themeToggle: $("themeToggle"),
  updateBanner: $("updateBanner"),
  updateBannerText: $("updateBannerText"),
  updateNowBtn: $("updateNowBtn"),
  dismissUpdateBtn: $("dismissUpdateBtn"),
  configToggleBtn: $("configToggleBtn"),
  configPanel: $("configPanel"),
  configToggleLabel: $("configToggleLabel"),
  configToggleIcon: $("configToggleIcon"),
  sourceCountBadge: $("sourceCountBadge"),
  loadJsonBtn: $("loadJsonBtn"),
  jsonFileInput: $("jsonFileInput"),
  mergeMode: $("mergeMode"),
  exportJsonBtn: $("exportJsonBtn"),
  refreshStarterBtn: $("refreshStarterBtn"),
  clearAllBtn: $("clearAllBtn"),
  restoreDefaultBtn: $("restoreDefaultBtn"),
  sourcesSection: $("sourcesSection"),
  sourcesList: $("sourcesList"),
  sourcesCount: $("sourcesCount"),
  metricTotal: $("metricTotal"),
  metricMastered: $("metricMastered"),
  metricMasteredTotal: $("metricMasteredTotal"),
  metricBookmarked: $("metricBookmarked"),
  metricPercent: $("metricPercent"),
  globalProgressBar: $("globalProgressBar"),
  searchInput: $("searchInput"),
  statusFilter: $("statusFilter"),
  sectionsSidebar: $("sectionsSidebar"),
  questionsContainer: $("questionsContainer"),
  emptyState: $("emptyState"),
  toTop: $("toTop"),
  toast: $("toast"),
  drivingModeBtn: $("drivingModeBtn"),
  drivingOverlay: $("drivingOverlay"),
  driveExitBtn: $("driveExitBtn"),
  drivePickSection: $("drivePickSection"),
  driveProgressFill: $("driveProgressFill"),
  driveSectionLabel: $("driveSectionLabel"),
  drivePositionLabel: $("drivePositionLabel"),
  driveBody: $("driveBody"),
  driveStateLabel: $("driveStateLabel"),
  driveQuestionId: $("driveQuestionId"),
  driveMainText: $("driveMainText"),
  driveAnswerArea: $("driveAnswerArea"),
  driveCountdownWrap: $("driveCountdownWrap"),
  driveCountdownCircle: $("driveCountdownCircle"),
  driveCountdownNum: $("driveCountdownNum"),
  driveAutoLabel: $("driveAutoLabel"),
  drivePrev: $("drivePrev"),
  driveRepeat: $("driveRepeat"),
  drivePlayPause: $("drivePlayPause"),
  drivePlayIcon: $("drivePlayIcon"),
  driveStop: $("driveStop"),
  driveNext: $("driveNext"),
  driveSectionPicker: $("driveSectionPicker"),
  driveSectionListBox: $("driveSectionListBox")
};

export function setConfigCollapsed(collapsed) {
  els.configPanel.classList.toggle("hidden", collapsed);
  els.configToggleBtn.setAttribute("aria-expanded", String(!collapsed));
  els.configToggleLabel.textContent = collapsed ? "Expand" : "Collapse";
  els.configToggleIcon.classList.toggle("rotate-180", !collapsed);
  localStorage.setItem(STORAGE.configCollapsed, collapsed ? "1" : "0");
}

export function initializeConfigState() {
  const saved = localStorage.getItem(STORAGE.configCollapsed);
  const collapsed = saved === null ? true : saved === "1";
  setConfigCollapsed(collapsed);
}

export function renderMetrics() {
  const total = state.DB.length;
  const validKeys = new Set(state.DB.map(i => i.key));

  let mastered = 0;
  state.masteredSet.forEach(k => { if (validKeys.has(k)) mastered++; });

  let bookmarked = 0;
  state.bookmarkedSet.forEach(k => { if (validKeys.has(k)) bookmarked++; });

  const percent = total ? Math.round((mastered / total) * 100) : 0;

  els.metricTotal.textContent = total;
  els.metricMastered.textContent = mastered;
  els.metricMasteredTotal.textContent = "/" + total;
  els.metricBookmarked.textContent = bookmarked;
  els.metricPercent.textContent = percent + "%";
  els.globalProgressBar.style.width = percent + "%";
}

export function renderSources() {
  if (!state.sources.length) {
    els.sourceCountBadge.classList.add("hidden");
    els.sourcesSection.classList.add("hidden");
    els.clearAllBtn.classList.add("hidden");
    return;
  }

  els.sourceCountBadge.textContent = `${state.sources.length} source${state.sources.length === 1 ? "" : "s"}`;
  els.sourceCountBadge.classList.remove("hidden");
  els.sourcesSection.classList.remove("hidden");
  els.clearAllBtn.classList.remove("hidden");
  els.sourcesCount.textContent = `${state.sources.length} source${state.sources.length === 1 ? "" : "s"}`;

  els.sourcesList.innerHTML = state.sources.map((source, index) => {
    const count = Array.isArray(source.data) ? source.data.length : 0;
    const typeClass = source.kind === "starter"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
      : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
    return `
      <div class="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <i class="fa-regular fa-file-lines text-xs text-slate-400"></i>
            <p class="truncate text-sm font-medium">${esc(source.name)}</p>
            <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeClass}">${esc(source.kind || "user")}</span>
          </div>
          <p class="mt-1 text-xs text-slate-500">${count} question${count === 1 ? "" : "s"}</p>
        </div>
        <button data-remove-source-index="${index}" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50 active:scale-90 dark:hover:bg-red-950/40" aria-label="Remove source" title="Remove source">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>`;
  }).join("");

  els.sourcesList.querySelectorAll("[data-remove-source-index]").forEach(button => {
    button.addEventListener("click", () => {
      const idx = Number(button.dataset.removeSourceIndex);
      const source = state.sources[idx];
      if (source) removeSource(source.name);
    });
  });
}

export function renderSidebar() {
  if (!state.DB.length) {
    els.sectionsSidebar.innerHTML = `<div class="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">No sections available</div>`;
    return;
  }

  const groups = {};
  state.DB.forEach(question => {
    const s = question.sectionTitle || "General";
    if (!groups[s]) groups[s] = { count: 0, mastered: 0 };
    groups[s].count++;
    if (state.masteredSet.has(question.key)) groups[s].mastered++;
  });

  const sectionNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  let html = `<button data-section="all" class="section-btn min-h-[44px] w-full rounded-xl px-3 py-2 text-left text-sm transition active:scale-[.98] ${state.activeSection === "all" ? "bg-brand-600 font-semibold text-white shadow" : "border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}">
    <div class="flex items-center justify-between gap-2"><span>All Sections</span><span class="text-[11px] ${state.activeSection === "all" ? "text-white/80" : "text-slate-400"}">${state.DB.length}</span></div></button>`;

  sectionNames.forEach(name => {
    const active = state.activeSection === name;
    html += `<button data-section="${esc(name)}" class="section-btn min-h-[44px] w-full rounded-xl px-3 py-2 text-left text-sm transition active:scale-[.98] ${active ? "bg-brand-600 font-semibold text-white shadow" : "border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}">
      <div class="flex items-center justify-between gap-2"><span class="truncate">${esc(name)}</span><span class="shrink-0 text-[11px] ${active ? "text-white/80" : "text-slate-400"}">${groups[name].mastered}/${groups[name].count}</span></div></button>`;
  });

  els.sectionsSidebar.innerHTML = html;
  els.sectionsSidebar.querySelectorAll(".section-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.activeSection = btn.dataset.section;
      state.visibleCount = PAGE_SIZE;
      renderSidebar();
      renderQuestions();
      if (window.innerWidth < 1024) closeDrawer();
    });
  });
}

function renderHintBlock(question) {
  const hint = question.hints?.[0];
  if (!hint?.text) return "";
  return `<div class="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-left dark:border-slate-800 dark:bg-slate-800/50">
    <div class="mb-1 flex items-center gap-1.5 text-[10px] text-slate-400"><i class="fa-regular fa-lightbulb"></i><span class="truncate">${esc(hint.source)}</span></div>
    <p class="text-left text-xs italic leading-5 text-slate-500 dark:text-slate-400">${highlight(cleanText(hint.text), state.searchTerm)}</p></div>`;
}

function renderAnswerBlocks(question) {
  const multiple = question.answers.length > 1;
  return question.answers.map((answer, i) => `
    <div class="${i > 0 ? "mt-4 border-t border-dashed border-slate-200 pt-4 dark:border-slate-700" : ""}">
      <div class="mb-1.5 flex min-w-0 items-center gap-2 text-left">
        ${multiple ? `<span class="shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white dark:bg-white dark:text-slate-900">Answer ${i + 1}</span>` : ""}
        <span class="truncate text-[10px] text-slate-400" title="${esc(answer.source)}"><i class="fa-regular fa-file-lines mr-1"></i>${esc(answer.source)}</span>
      </div>
      <div class="answer-text whitespace-pre-wrap break-words rounded-lg border-l-4 bg-slate-50 p-4 text-left text-sm leading-7 dark:bg-slate-800/60 ${answerBorderColors[i % answerBorderColors.length]}" style="text-align:left;text-indent:0;">${highlight(cleanText(answer.text), state.searchTerm)}</div>
    </div>`).join("");
}

export function renderQuestions() {
  const filtered = getFilteredQuestions();
  const shown = filtered.slice(0, state.visibleCount);
  const remaining = filtered.length - shown.length;

  if (!state.DB.length) {
    els.questionsContainer.innerHTML = "";
    els.emptyState.classList.remove("hidden");
    return;
  }

  els.emptyState.classList.add("hidden");

  let html = `<div class="sticky top-[57px] z-20 -mt-1 mb-2 flex items-center justify-between gap-2 bg-slate-50/95 py-2 backdrop-blur dark:bg-slate-950/95 sm:top-[65px]">
    <p class="text-xs text-slate-500 sm:text-sm">Showing <b>${shown.length}</b> of <b>${filtered.length}</b> unique question${filtered.length === 1 ? "" : "s"}</p>
    <div class="flex gap-1.5">
      <button id="expandAll" class="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 text-xs transition active:scale-95 dark:border-slate-800 dark:bg-slate-900">Expand</button>
      <button id="collapseAll" class="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 text-xs transition active:scale-95 dark:border-slate-800 dark:bg-slate-900">Collapse</button>
    </div></div>`;

  if (!filtered.length) {
    html += `<div class="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900">No questions match your current search or filter.</div>`;
  } else {
    html += shown.map(q => {
      const isMastered = state.masteredSet.has(q.key);
      const isBookmarked = state.bookmarkedSet.has(q.key);
      const multi = q.answers.length > 1;

      return `
        <article data-question-key="${esc(q.key)}" class="overflow-hidden rounded-xl border bg-white text-left shadow-sm transition dark:bg-slate-900 ${isMastered ? "border-emerald-300 dark:border-emerald-700" : "border-slate-200 dark:border-slate-800"}">
          <div class="p-4 sm:p-5">
            <div class="flex items-start justify-between gap-2">
              <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                <span class="shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white dark:bg-white dark:text-slate-900">${esc(q.id)}</span>
                ${multi ? `<span class="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300"><i class="fa-solid fa-layer-group mr-1"></i>${q.answers.length} answers</span>` : ""}
                <span class="truncate text-[11px] text-slate-500">${esc(q.sectionTitle)}</span>
              </div>
              <div class="flex shrink-0 gap-1.5">
                <button data-action="bookmark" data-question-key="${esc(q.key)}" aria-label="Bookmark question" class="flex h-10 w-10 -m-1 items-center justify-center rounded-xl transition active:scale-90 ${isBookmarked ? "text-amber-500" : "text-slate-300 hover:text-amber-400 dark:text-slate-600"}">
                  <i class="fa-${isBookmarked ? "solid" : "regular"} fa-star"></i>
                </button>
                <button data-action="mastered" data-question-key="${esc(q.key)}" aria-label="Mark as mastered" class="flex h-10 w-10 -m-1 items-center justify-center rounded-xl transition active:scale-90 ${isMastered ? "text-emerald-500" : "text-slate-300 hover:text-emerald-400 dark:text-slate-600"}">
                  <i class="fa-solid fa-circle-check"></i>
                </button>
              </div>
            </div>
            <h3 class="mt-3 text-[15px] font-semibold leading-snug sm:text-base">${highlight(cleanText(q.q), state.searchTerm)}</h3>
            ${renderHintBlock(q)}
            <details data-question-id="${esc(q.id)}" class="group mt-3" ${state.openSet.has(q.id) ? "open" : ""}>
              <summary class="flex min-h-[40px] cursor-pointer list-none items-center gap-2 select-none text-sm font-semibold text-brand-600 dark:text-blue-400">
                <i class="fa-solid fa-chevron-down text-[10px] transition-transform group-open:rotate-180"></i>
                <span class="group-open:hidden">Show ${multi ? q.answers.length + " answers" : "answer"}</span>
                <span class="hidden group-open:inline">Hide answer${multi ? "s" : ""}</span>
              </summary>
              <div class="mt-2">${renderAnswerBlocks(q)}</div>
            </details>
          </div>
        </article>`;
    }).join("");

    if (remaining > 0) {
      html += `<button id="loadMoreBtn" class="min-h-[48px] w-full rounded-xl bg-brand-600 text-sm font-semibold text-white transition hover:bg-brand-500 active:scale-[.99]">Load ${Math.min(PAGE_SIZE, remaining)} more <span class="opacity-80">(${remaining} left)</span></button>`;
    }
  }

  els.questionsContainer.innerHTML = html;

  els.questionsContainer.querySelectorAll("details[data-question-id]").forEach(details => {
    details.addEventListener("toggle", () => {
      const id = details.dataset.questionId;
      if (details.open) state.openSet.add(id);
      else state.openSet.delete(id);
    });
  });

  els.questionsContainer.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", () => {
      const key = button.dataset.questionKey;
      const action = button.dataset.action;
      if (action === "bookmark") {
        if (state.bookmarkedSet.has(key)) state.bookmarkedSet.delete(key);
        else state.bookmarkedSet.add(key);
      }
      if (action === "mastered") {
        if (state.masteredSet.has(key)) state.masteredSet.delete(key);
        else state.masteredSet.add(key);
      }
      saveProgress();
      renderMetrics();
      renderSidebar();
      renderQuestions();
    });
  });

  $("loadMoreBtn")?.addEventListener("click", () => {
    state.visibleCount += PAGE_SIZE;
    renderQuestions();
  });

  $("expandAll")?.addEventListener("click", () => {
    els.questionsContainer.querySelectorAll("details[data-question-id]").forEach(details => {
      details.open = true;
      state.openSet.add(details.dataset.questionId);
    });
  });

  $("collapseAll")?.addEventListener("click", () => {
    els.questionsContainer.querySelectorAll("details[data-question-id]").forEach(details => {
      details.open = false;
      state.openSet.delete(details.dataset.questionId);
    });
  });
}

export function renderAll() {
  renderSources();
  renderMetrics();
  renderSidebar();
  renderQuestions();
}

export function openDrawer() {
  els.drawer.classList.remove("-translate-x-full");
  els.drawerOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

export function closeDrawer() {
  els.drawer.classList.add("-translate-x-full");
  els.drawerOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}