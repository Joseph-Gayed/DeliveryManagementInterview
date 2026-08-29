import { cleanText, normalizeQuestion, generatedId, showToast } from "./utils.js";
import { state, saveSources, saveStarterVersion, clearReadingPosition } from "./state.js";
import { STARTER_BASE_PATH, STARTER_FILES, STARTER_BUNDLE_VERSION, STORAGE, PAGE_SIZE } from "./config.js";
import { renderAll, setConfigCollapsed, els } from "./ui.js";

export function parseJsonPayload(jsonText, fileName) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Invalid JSON.");
  }

  let records = null;
  if (Array.isArray(parsed)) records = parsed;
  else if (parsed?.questions && Array.isArray(parsed.questions)) records = parsed.questions;
  else if (parsed?.data && Array.isArray(parsed.data)) records = parsed.data;
  else if (parsed?.DB && Array.isArray(parsed.DB)) records = parsed.DB;
  else throw new Error("Expected an array, { questions: [] }, { data: [] }, or { DB: [] }.");

  if (!records.length) throw new Error("JSON file is empty.");

  const items = records.map(record => {
    if (Array.isArray(record)) {
      const [id, sectionIndex, question, answer, hint] = record;
      if (!question || !cleanText(question)) return null;
      return {
        id: id !== undefined && id !== null ? cleanText(id) : undefined,
        q: cleanText(question),
        sectionTitle: typeof sectionIndex === "number" ? "Section " + (sectionIndex + 1) : "General",
        hint: hint ? cleanText(hint) : "",
        answers: answer ? [{ text: cleanText(answer) }] : []
      };
    }

    const question = record.q || record.question || record.title || record.Question || "";
    if (!question || !cleanText(question)) return null;
    const hint = record.hint || record.Hint || "";
    let answers = [];

    if (Array.isArray(record.answers)) {
      answers = record.answers.map(answer => {
        if (typeof answer === "string") return { text: cleanText(answer) };
        return { text: cleanText(answer.text || answer.answer || answer.a || answer.content || answer.Answer || "") };
      }).filter(a => a.text);
    } else {
      const answer = record.a || record.answer || record.content || record.Answer || "";
      if (cleanText(answer)) answers = [{ text: cleanText(answer) }];
    }

    return {
      id: record.id !== undefined && record.id !== null ? cleanText(record.id) : undefined,
      q: cleanText(question),
      sectionTitle: cleanText(record.sectionTitle || record.section || record.topic || "General"),
      hint: cleanText(hint),
      answers
    };
  }).filter(Boolean);

  if (!items.length) throw new Error("No valid question objects found.");
  return items;
}

export function loadSourcesFromStorage() {
  const rawSources = localStorage.getItem(STORAGE.sources);
  if (rawSources === null) return false;
  try {
    const parsed = JSON.parse(rawSources);
    state.sources = Array.isArray(parsed) ? parsed : [];
  } catch {
    state.sources = [];
  }
  return true;
}

export function rebuildDatabase() {
  state.DB = [];
  state.questionKeyToIndex = new Map();
  state.sectionsList = [];
  let autoIdCounter = 0;

  // PASS 1: Build Unique Questions
  state.sources.forEach(source => {
    if (!source?.data || !Array.isArray(source.data)) return;
    source.data.forEach(questionItem => {
      const key = normalizeQuestion(questionItem.q);
      if (!key) return;
      const specifiedId = questionItem.id !== undefined && questionItem.id !== null && cleanText(questionItem.id) ? cleanText(questionItem.id) : null;
      if (!state.questionKeyToIndex.has(key)) {
        const id = specifiedId || generatedId(autoIdCounter++);
        state.DB.push({
          key,
          id,
          q: cleanText(questionItem.q),
          sectionTitle: cleanText(questionItem.sectionTitle || "General"),
          hints: [],
          answers: [],
          generatedId: !specifiedId
        });
        state.questionKeyToIndex.set(key, state.DB.length - 1);
      } else {
        const existing = state.DB[state.questionKeyToIndex.get(key)];
        if (existing.generatedId && specifiedId) {
          existing.id = specifiedId;
          existing.generatedId = false;
        }
        if ((!existing.sectionTitle || existing.sectionTitle === "General") && questionItem.sectionTitle) {
          existing.sectionTitle = cleanText(questionItem.sectionTitle);
        }
      }
    });
  });

  // PASS 2: Collect Hints and Answers across all sources
  state.sources.forEach(source => {
    if (!source?.data || !Array.isArray(source.data)) return;
    source.data.forEach(questionItem => {
      const key = normalizeQuestion(questionItem.q);
      if (!key || !state.questionKeyToIndex.has(key)) return;
      const dbQuestion = state.DB[state.questionKeyToIndex.get(key)];

      const hintText = cleanText(questionItem.hint || "");
      if (hintText && !dbQuestion.hints.some(h => h.text === hintText)) {
        dbQuestion.hints.push({ source: source.name, text: hintText });
      }

      let answerList = [];
      if (Array.isArray(questionItem.answers)) {
        answerList = questionItem.answers.map(a => typeof a === "string" ? { text: cleanText(a) } : { text: cleanText(a.text || a.answer || a.a || a.content || a.Answer || "") }).filter(a => a.text);
      }

      answerList.forEach(answer => {
        const cleanA = cleanText(answer.text);
        if (!cleanA) return;
        if (!dbQuestion.answers.some(existing => existing.source === source.name && existing.text === cleanA)) {
          dbQuestion.answers.push({ source: source.name, text: cleanA });
        }
      });
    });
  });

  state.sectionsList = [...new Set(state.DB.map(q => q.sectionTitle || "General"))].sort((a, b) => a.localeCompare(b));
  if (state.activeSection !== "all" && !state.sectionsList.includes(state.activeSection)) {
    state.activeSection = "all";
  }
  state.visibleCount = PAGE_SIZE;
  state.openSet.clear();
}

export function setSourcesAfterImport(importedSources, merge) {
  if (merge) {
    importedSources.forEach(newSource => {
      const existingIndex = state.sources.findIndex(s => s.name === newSource.name);
      if (existingIndex >= 0) state.sources[existingIndex] = newSource;
      else state.sources.push(newSource);
    });
  } else {
    state.sources = importedSources;
  }
  rebuildDatabase();
  saveSources();
  renderAll();
}

export async function fetchStarterSources(version = STARTER_BUNDLE_VERSION) {
  if (location.protocol === "file:") {
    showToast("Starter loading requires GitHub Pages or a local web server.", "error");
    return [];
  }
  const loaded = [];
  for (const fileName of STARTER_FILES) {
    if (state.removedStarterFiles.has(fileName)) continue;
    const url = `${STARTER_BASE_PATH}${fileName}?starterVersion=${encodeURIComponent(version)}&t=${Date.now()}`;
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const text = await response.text();
      const items = parseJsonPayload(text, fileName);
      loaded.push({ name: fileName, kind: "starter", data: items });
    } catch (error) {
      console.error("Failed to load starter source:", fileName, error);
    }
  }
  return loaded;
}

export async function loadStarterForFirstTime(version = STARTER_BUNDLE_VERSION) {
  const starterSources = await fetchStarterSources(version);
  if (!starterSources.length) return false;
  state.sources = starterSources;
  rebuildDatabase();
  saveSources();
  saveStarterVersion(version);
  return true;
}

export async function refreshStarterBundle({ silent = false, targetVersion = STARTER_BUNDLE_VERSION } = {}) {
  const fetchedSources = await fetchStarterSources(targetVersion);
  if (!fetchedSources.length) {
    if (!silent) showToast("Starter content could not be refreshed.", "error");
    return false;
  }
  const userSources = state.sources.filter(s => s.kind !== "starter");
  state.sources = [...fetchedSources, ...userSources];
  rebuildDatabase();
  saveSources();
  saveStarterVersion(targetVersion);
  renderAll();
  if (!silent) showToast("Starter content refreshed. Progress was preserved.");
  return true;
}

export function removeSource(sourceName) {
  const source = state.sources.find(s => s.name === sourceName);
  if (!source || !confirm(`Remove "${sourceName}" from this device?`)) return;
  if (source.kind === "starter") state.removedStarterFiles.add(sourceName);
  state.sources = state.sources.filter(s => s.name !== sourceName);
  rebuildDatabase();
  saveSources();
  renderAll();
  showToast(`Removed ${sourceName}`);
}

export function clearAllSources() {
  if (!state.sources.length || !confirm("Clear all sources? Mastered and saved progress will remain.")) return;
  STARTER_FILES.forEach(fileName => state.removedStarterFiles.add(fileName));
  state.sources = [];
  state.DB = [];
  state.sectionsList = [];
  state.questionKeyToIndex.clear();
  state.openSet.clear();
  saveSources();
  renderAll();
  showToast("All sources cleared. Progress was kept.");
}

export async function restoreDefaultState() {
  const proceed = confirm("Restore default state?\n\nThis will remove all imported files, restore starter files, clear progress, and reset the app.");
  if (!proceed) return;

  localStorage.removeItem(STORAGE.sources);
  localStorage.removeItem(STORAGE.removedStarterFiles);
  localStorage.removeItem(STORAGE.mastered);
  localStorage.removeItem(STORAGE.bookmarked);
  localStorage.removeItem(STORAGE.starterVersion);
  localStorage.removeItem(STORAGE.dismissedUpdateVersion);
  localStorage.removeItem(STORAGE.configCollapsed);
  clearReadingPosition();

  state.sources = [];
  state.DB = [];
  state.sectionsList = [];
  state.questionKeyToIndex.clear();
  state.masteredSet = new Set();
  state.bookmarkedSet = new Set();
  state.removedStarterFiles = new Set();
  state.activeSection = "all";
  state.searchTerm = "";
  state.statusFilterValue = "all";
  state.visibleCount = PAGE_SIZE;
  state.openSet.clear();

  els.searchInput.value = "";
  els.statusFilter.value = "all";
  els.mergeMode.checked = true;

  setConfigCollapsed(true);
  const starterLoaded = await loadStarterForFirstTime();
  renderAll();
  window.scrollTo(0, 0);

  if (starterLoaded) showToast("Default state restored.");
  else showToast("Default reset completed, but starter files could not be loaded.", "error");
}

export function getFilteredQuestions() {
  const term = state.searchTerm.toLowerCase();
  return state.DB.filter(question => {
    if (state.activeSection !== "all" && question.sectionTitle !== state.activeSection) return false;
    if (state.statusFilterValue === "bookmarked" && !state.bookmarkedSet.has(question.key)) return false;
    if (state.statusFilterValue === "mastered" && !state.masteredSet.has(question.key)) return false;
    if (state.statusFilterValue === "unmastered" && state.masteredSet.has(question.key)) return false;
    if (state.statusFilterValue === "multi" && question.answers.length < 2) return false;

    if (term) {
      const answerText = question.answers.map(a => a.text).join(" ");
      const hintText = question.hints.map(h => h.text).join(" ");
      const searchBlob = `${question.id} ${question.q} ${question.sectionTitle} ${hintText} ${answerText}`.toLowerCase();
      if (!searchBlob.includes(term)) return false;
    }
    return true;
  });
}