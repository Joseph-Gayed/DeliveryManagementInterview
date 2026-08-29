import { cleanText, showToast } from "./utils.js";
import {
  state,
  saveReadingPositionNow,
  scheduleReadingPositionSave,
  prepareReadingPositionForRestore,
  restoreReadingPosition
} from "./state.js";
import { APP_VERSION, STORAGE, PAGE_SIZE } from "./config.js";
import {
  parseJsonPayload,
  loadSourcesFromStorage,
  rebuildDatabase,
  setSourcesAfterImport,
  loadStarterForFirstTime,
  refreshStarterBundle,
  clearAllSources,
  restoreDefaultState
} from "./db.js";
import {
  els,
  setConfigCollapsed,
  initializeConfigState,
  renderAll,
  renderQuestions,
  openDrawer,
  closeDrawer
} from "./ui.js";
import {
  driveState,
  driveEnter,
  driveExit,
  drivePlayPauseToggle,
  driveGoPrev,
  driveGoNext,
  driveRepeatCurrent,
  driveStopSpeaking,
  driveShowSectionPicker
} from "./driving-mode.js";
import { checkForUpdates, updateAppNow } from "./updater.js";

function handleImportedFiles(fileList) {
  const files = [...fileList].filter(f => f?.name?.toLowerCase().endsWith(".json"));
  if (!files.length) {
    showToast("Please select valid .json files.", "error");
    return;
  }

  const readers = files.map(file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve({ name: file.name, text: event.target.result });
    reader.onerror = reject;
    reader.readAsText(file);
  }));

  Promise.all(readers).then(results => {
    const importedSources = [];
    results.forEach(({ name, text }) => {
      try {
        const parsedItems = parseJsonPayload(text, name);
        importedSources.push({ name, kind: "user", data: parsedItems });
      } catch (error) {
        showToast(`${name}: ${error.message}`, "error");
      }
    });

    if (!importedSources.length) return;
    setSourcesAfterImport(importedSources, els.mergeMode.checked);
    showToast(`Loaded ${importedSources.length} file(s) • ${state.DB.length} unique questions`);
  }).catch(() => {
    showToast("Could not read the selected JSON file(s).", "error");
  });
}

function exportCurrentBank() {
  const exportData = state.DB.map(q => ({
    id: q.id,
    q: q.q,
    sectionTitle: q.sectionTitle,
    hint: q.hints?.[0]?.text || "",
    hints: (q.hints || []).map(h => ({ source: h.source, text: h.text })),
    answers: q.answers.map(a => ({ source: a.source, text: cleanText(a.text) }))
  }));

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sdm-question-bank-export.json";
  link.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${exportData.length} unique questions.`);
}

async function initializeApp() {
  if (localStorage.getItem(STORAGE.theme) === "light") {
    document.documentElement.classList.remove("dark");
  }
  initializeConfigState();

  const completedAppUpdate = sessionStorage.getItem("sdm_app_update_completed");
  if (completedAppUpdate) {
    sessionStorage.removeItem("sdm_app_update_completed");
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("v");
    cleanUrl.searchParams.delete("reload");
    cleanUrl.searchParams.delete("update");
    window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
    setTimeout(() => {
      showToast(`App updated to ${APP_VERSION}. Your progress was preserved.`);
    }, 700);
  }

  const storedStateExists = loadSourcesFromStorage();

  if (storedStateExists) {
    rebuildDatabase();
    const savedPosition = prepareReadingPositionForRestore();
    renderAll();
    if (savedPosition) await restoreReadingPosition(savedPosition);
    await checkForUpdates();
    return;
  }

  const starterLoaded = await loadStarterForFirstTime();
  renderAll();

  if (starterLoaded) {
    showToast("Starter bundle loaded.");
  } else if (location.protocol === "file:") {
    els.emptyState.classList.remove("hidden");
    els.emptyState.innerHTML = `<i class="fa-regular fa-folder-open mb-4 text-4xl opacity-60"></i>
      <h2 class="mb-1 font-semibold">Starter files cannot load from file://</h2>
      <p class="text-sm">Open this app through GitHub Pages, Live Server, or a local HTTP server.</p>`;
  } else {
    els.emptyState.classList.remove("hidden");
    els.emptyState.innerHTML = `<i class="fa-solid fa-triangle-exclamation mb-4 text-4xl text-amber-500"></i>
      <h2 class="mb-1 font-semibold">Starter files could not be loaded</h2>
      <p class="text-sm">Check that starter JSON files exist beside index.html and match STARTER_FILES.</p>`;
  }

  await checkForUpdates();
}

/* ==========================================================
   EVENT ATTACHMENTS
   ========================================================== */

els.configToggleBtn.addEventListener("click", () => {
  const isCollapsed = els.configPanel.classList.contains("hidden");
  setConfigCollapsed(!isCollapsed);
});

els.loadJsonBtn.addEventListener("click", () => { els.jsonFileInput.click(); });
els.jsonFileInput.addEventListener("change", e => {
  handleImportedFiles(e.target.files);
  e.target.value = "";
});

els.exportJsonBtn.addEventListener("click", exportCurrentBank);
els.refreshStarterBtn.addEventListener("click", () => {
  saveReadingPositionNow();
  refreshStarterBundle();
});

els.clearAllBtn.addEventListener("click", clearAllSources);
els.restoreDefaultBtn.addEventListener("click", restoreDefaultState);

els.searchInput.addEventListener("input", e => {
  state.searchTerm = e.target.value;
  state.visibleCount = PAGE_SIZE;
  renderQuestions();
});

els.statusFilter.addEventListener("change", e => {
  state.statusFilterValue = e.target.value;
  state.visibleCount = PAGE_SIZE;
  renderQuestions();
});

els.themeToggle.addEventListener("click", () => {
  document.documentElement.classList.toggle("dark");
  localStorage.setItem(STORAGE.theme, document.documentElement.classList.contains("dark") ? "dark" : "light");
});

els.updateNowBtn.addEventListener("click", updateAppNow);
els.dismissUpdateBtn.addEventListener("click", () => {
  const updateKey = els.updateBanner.dataset.updateKey;
  if (updateKey) localStorage.setItem(STORAGE.dismissedUpdateVersion, updateKey);
  els.updateBanner.classList.add("hidden");
});

els.drawerBtn.addEventListener("click", openDrawer);
els.closeDrawer.addEventListener("click", closeDrawer);
els.drawerOverlay.addEventListener("click", closeDrawer);

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (driveState.driveActive) { driveExit(); return; }
    closeDrawer();
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth >= 1024) closeDrawer();
});

window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("drop", e => {
  e.preventDefault();
  if (e.dataTransfer.files?.length) handleImportedFiles(e.dataTransfer.files);
});

window.addEventListener("scroll", () => {
  if (window.scrollY > 500) {
    els.toTop.classList.remove("hidden");
    els.toTop.classList.add("flex");
  } else {
    els.toTop.classList.add("hidden");
    els.toTop.classList.remove("flex");
  }
  scheduleReadingPositionSave();
}, { passive: true });

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveReadingPositionNow();
});

window.addEventListener("pagehide", () => saveReadingPositionNow());

els.toTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(saveReadingPositionNow, 700);
});

/* ==========================================================
   DRIVING MODE EVENTS
   ========================================================== */

/* ==========================================================
   DRIVING MODE EVENTS
   ========================================================== */

els.drivingModeBtn.addEventListener("click", driveEnter);
els.driveExitBtn.addEventListener("click", driveExit);
els.drivePlayPause.addEventListener("click", drivePlayPauseToggle);
els.drivePrev.addEventListener("click", driveGoPrev);
els.driveNext.addEventListener("click", driveGoNext);
els.driveRepeat.addEventListener("click", driveRepeatCurrent);
els.driveStop.addEventListener("click", driveStopSpeaking);
els.drivePickSection.addEventListener("click", driveShowSectionPicker);

els.driveSectionPicker?.addEventListener("click", e => {
  if (e.target === els.driveSectionPicker) {
    els.driveSectionPicker.style.display = "none";
  }
});



// Start the Application
initializeApp();