import { STORAGE, PAGE_SIZE } from "./config.js";
import { els } from "./ui.js";

export const state = {
  sources: [],
  DB: [],
  sectionsList: [],
  questionKeyToIndex: new Map(),

  activeSection: "all",
  searchTerm: "",
  statusFilterValue: "all",
  visibleCount: PAGE_SIZE,
  openSet: new Set(),

  pendingRemoteVersion: null,
  restoringReadingPosition: false,
  readingSaveTimer: null,

  masteredSet: new Set(JSON.parse(localStorage.getItem(STORAGE.mastered) || "[]")),
  bookmarkedSet: new Set(JSON.parse(localStorage.getItem(STORAGE.bookmarked) || "[]")),
  removedStarterFiles: new Set(JSON.parse(localStorage.getItem(STORAGE.removedStarterFiles) || "[]"))
};

export function saveProgress() {
  localStorage.setItem(STORAGE.mastered, JSON.stringify([...state.masteredSet]));
  localStorage.setItem(STORAGE.bookmarked, JSON.stringify([...state.bookmarkedSet]));
}

export function saveRemovedStarterFiles() {
  localStorage.setItem(STORAGE.removedStarterFiles, JSON.stringify([...state.removedStarterFiles]));
}

export function saveSources() {
  localStorage.setItem(STORAGE.sources, JSON.stringify(state.sources));
  saveRemovedStarterFiles();
}

export function saveStarterVersion(version) {
  localStorage.setItem(STORAGE.starterVersion, version);
}

export function loadReadingPosition() {
  try {
    const raw = localStorage.getItem(STORAGE.readingPosition);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.questionKey ? parsed : null;
  } catch {
    return null;
  }
}

export function saveReadingPositionNow() {
  if (state.restoringReadingPosition) return;
  if (state.searchTerm || state.statusFilterValue !== "all" || state.activeSection !== "all") return;

  const cards = [...els.questionsContainer.querySelectorAll("article[data-question-key]")];
  if (!cards.length) return;

  const referenceY = window.innerWidth < 640 ? 75 : 85;
  let currentCard = cards[0];
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (rect.bottom > referenceY) {
      currentCard = card;
      break;
    }
  }

  const rect = currentCard.getBoundingClientRect();
  const questionKey = currentCard.dataset.questionKey;
  if (!questionKey) return;

  localStorage.setItem(STORAGE.readingPosition, JSON.stringify({ questionKey, offset: rect.top, savedAt: Date.now() }));
}

export function scheduleReadingPositionSave() {
  if (state.restoringReadingPosition) return;
  clearTimeout(state.readingSaveTimer);
  state.readingSaveTimer = setTimeout(saveReadingPositionNow, 180);
}

export function prepareReadingPositionForRestore() {
  const saved = loadReadingPosition();
  if (!saved?.questionKey) return null;
  const index = state.DB.findIndex(q => q.key === saved.questionKey);
  if (index < 0) return null;

  if (index >= state.visibleCount) {
    state.visibleCount = Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE;
  }
  return saved;
}

export async function restoreReadingPosition(saved) {
  if (!saved?.questionKey) return;
  state.restoringReadingPosition = true;

  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const cards = [...els.questionsContainer.querySelectorAll("article[data-question-key]")];
  const target = cards.find(card => card.dataset.questionKey === saved.questionKey);

  if (!target) {
    state.restoringReadingPosition = false;
    return;
  }

  target.scrollIntoView({ block: "start", behavior: "auto" });
  const desiredOffset = Number.isFinite(Number(saved.offset)) ? Number(saved.offset) : 80;
  const currentTop = target.getBoundingClientRect().top;
  window.scrollBy(0, currentTop - desiredOffset);

  setTimeout(() => {
    state.restoringReadingPosition = false;
  }, 400);
}

export function clearReadingPosition() {
  localStorage.removeItem(STORAGE.readingPosition);
}