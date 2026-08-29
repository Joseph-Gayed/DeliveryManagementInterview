import { cleanText, esc, showToast } from "./utils.js";
import { state } from "./state.js";
import { STORAGE } from "./config.js";
import { els } from "./ui.js";
import {
  loadVoices,
  speakText,
  hardStop,
  interruptibleWait,
  ttsController,
  getVoiceInfo
} from "./tts.js";

const DRIVE_COUNTDOWN_SECONDS = 5;

export const driveState = {
  driveActive: false,
  driveQuestions: [],
  driveCurrentIndex: 0,
  drivePhase: "idle",
  driveAutoPlay: true, // always on for driving
  drivePaused: false,
  driveSection: "all",
  driveCountdownTimer: null,
  driveCountdownValue: 0,
  playbackToken: 0
};

function getDriveQuestionsForSection(section) {
  if (section === "all") return [...state.DB];
  return state.DB.filter(q => q.sectionTitle === section);
}

function getDriveSections() {
  return [...new Set(state.DB.map(q => q.sectionTitle || "General"))]
    .sort((a, b) => a.localeCompare(b));
}

function abortAllPlayback() {
  hardStop();
  clearDriveCountdown();
  driveState.drivePaused = false;
  driveState.playbackToken++;
}

function shortVoiceName(name) {
  return String(name || "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/Microsoft\s+/i, "")
    .replace(/Online.*$/i, "")
    .replace(/\s+-\s+English.*$/i, "")
    .replace(/\s+/g, " ")
    .trim() || "Default";
}

export function driveUpdateUI() {
  const total = driveState.driveQuestions.length;
  const current = driveState.driveCurrentIndex + 1;
  const pct = total ? Math.round((current / total) * 100) : 0;

  els.driveProgressFill.style.width = pct + "%";
  els.driveSectionLabel.textContent =
    driveState.driveSection === "all" ? "All Sections" : driveState.driveSection;
  els.drivePositionLabel.textContent = current + " / " + total;

  if (els.driveAutoLabel) {
    els.driveAutoLabel.style.display = "inline-flex";
  }

  const isPlaying =
    driveState.drivePhase === "question" ||
    driveState.drivePhase === "answer" ||
    driveState.drivePhase === "countdown";
  const showPause = isPlaying && !driveState.drivePaused;
  if (els.drivePlayIcon) {
    els.drivePlayIcon.className = showPause ? "fa-solid fa-pause" : "fa-solid fa-play";
  }

  const q = driveState.driveQuestions[driveState.driveCurrentIndex];
  if (!q) {
    els.driveMainText.textContent = "No questions available";
    els.driveAnswerArea.style.display = "none";
    els.driveQuestionId.textContent = "";
    els.driveStateLabel.textContent = "—";
    return;
  }

  els.driveQuestionId.textContent = `${q.id} • ${q.sectionTitle}`;

  if (driveState.drivePhase === "question") {
    els.driveStateLabel.textContent = driveState.drivePaused ? "PAUSED" : "QUESTION";
    els.driveStateLabel.style.background = driveState.drivePaused ? "#64748b" : "#2563eb";
    els.driveMainText.textContent = cleanText(q.q);
    els.driveAnswerArea.style.display = "none";
    els.driveCountdownWrap.style.display = "none";
  } else if (driveState.drivePhase === "answer") {
    els.driveStateLabel.textContent = driveState.drivePaused ? "PAUSED" : "ANSWER";
    els.driveStateLabel.style.background = driveState.drivePaused ? "#64748b" : "#16a34a";
    els.driveMainText.textContent = cleanText(q.q);
    const allAnswers = q.answers.map((a, i) =>
      (q.answers.length > 1 ? `[Answer ${i + 1}]\n` : "") + cleanText(a.text)
    ).join("\n\n");
    els.driveAnswerArea.textContent = allAnswers || "(No answer available)";
    els.driveAnswerArea.style.display = "block";
    els.driveCountdownWrap.style.display = "none";
  } else if (driveState.drivePhase === "countdown") {
    els.driveStateLabel.textContent = "NEXT IN...";
    els.driveStateLabel.style.background = "#d97706";
    els.driveCountdownWrap.style.display = "block";
  } else if (driveState.drivePhase === "section-complete") {
    els.driveStateLabel.textContent = "SECTION COMPLETE";
    els.driveStateLabel.style.background = "#7c3aed";
    els.driveMainText.textContent = "All questions in this section have been read.";
    els.driveAnswerArea.style.display = "none";
    els.driveCountdownWrap.style.display = "none";
  } else {
    els.driveStateLabel.textContent = "READY";
    els.driveStateLabel.style.background = "#475569";
    els.driveMainText.textContent = cleanText(q.q) || "Press play to start";
    els.driveAnswerArea.style.display = "none";
    els.driveCountdownWrap.style.display = "none";
  }
}

export function clearDriveCountdown() {
  if (driveState.driveCountdownTimer) {
    clearInterval(driveState.driveCountdownTimer);
    driveState.driveCountdownTimer = null;
  }
  if (els.driveCountdownWrap) els.driveCountdownWrap.style.display = "none";
}

export function driveStartCountdown() {
  clearDriveCountdown();
  driveState.drivePhase = "countdown";
  driveState.driveCountdownValue = DRIVE_COUNTDOWN_SECONDS;

  const circumference = 2 * Math.PI * 20;
  els.driveCountdownNum.textContent = driveState.driveCountdownValue;
  els.driveCountdownCircle.style.strokeDasharray = circumference;
  els.driveCountdownCircle.style.strokeDashoffset = "0";
  els.driveCountdownWrap.style.display = "block";
  driveUpdateUI();

  const tokenAtStart = driveState.playbackToken;

  driveState.driveCountdownTimer = setInterval(() => {
    if (driveState.playbackToken !== tokenAtStart) {
      clearDriveCountdown();
      return;
    }
    driveState.driveCountdownValue--;
    if (driveState.driveCountdownValue <= 0) {
      clearDriveCountdown();
      drivePlayQuestion(driveState.driveCurrentIndex + 1);
      return;
    }
    els.driveCountdownNum.textContent = driveState.driveCountdownValue;
    const progress = 1 - (driveState.driveCountdownValue / DRIVE_COUNTDOWN_SECONDS);
    els.driveCountdownCircle.style.strokeDashoffset = String(circumference * progress);
  }, 1000);
}

export async function drivePlayQuestion(index) {
  abortAllPlayback();
  const myToken = ++driveState.playbackToken;

  if (index < 0 || index >= driveState.driveQuestions.length) {
    driveState.drivePhase = "section-complete";
    driveUpdateUI();

    const sections = getDriveSections();
    if (driveState.driveSection !== "all") {
      const idx = sections.indexOf(driveState.driveSection);
      if (idx >= 0 && idx < sections.length - 1) {
        await interruptibleWait(2000, ttsController.sessionId);
        if (driveState.playbackToken !== myToken || !driveState.driveActive) return;
        driveSetSection(sections[idx + 1]);
        drivePlayQuestion(0);
        return;
      }
    }
    try { await speakText("All sections completed. Great work.", false); } catch {}
    return;
  }

  driveState.driveCurrentIndex = index;
  const q = driveState.driveQuestions[index];

  localStorage.setItem(STORAGE.drivingSection, driveState.driveSection);
  localStorage.setItem(STORAGE.drivingIndex, String(index));

  // 1) Question — male, slow
  driveState.drivePhase = "question";
  driveUpdateUI();
  try {
    await speakText(`Question ${index + 1}. ${cleanText(q.q)}`, false);
  } catch {}
  if (driveState.playbackToken !== myToken || !driveState.driveActive) return;

  await interruptibleWait(900, ttsController.sessionId);
  if (driveState.playbackToken !== myToken || !driveState.driveActive) return;

  // 2) Answer — female, slow
  driveState.drivePhase = "answer";
  driveUpdateUI();

  if (q.answers.length) {
    for (let i = 0; i < q.answers.length; i++) {
      if (driveState.playbackToken !== myToken || !driveState.driveActive) return;
      const prefix = q.answers.length > 1 ? `Answer ${i + 1}. ` : "";
      try {
        await speakText(prefix + cleanText(q.answers[i].text), true);
      } catch {}
      if (driveState.playbackToken !== myToken) return;
      if (i < q.answers.length - 1) {
        await interruptibleWait(600, ttsController.sessionId);
      }
    }
  } else {
    try { await speakText("No answer recorded for this question.", true); } catch {}
  }

  if (driveState.playbackToken !== myToken || !driveState.driveActive) return;

  // 3) Always auto-advance while driving
  if (index < driveState.driveQuestions.length - 1) {
    driveStartCountdown();
  } else {
    drivePlayQuestion(driveState.driveQuestions.length);
  }
}

export function driveSetSection(section) {
  abortAllPlayback();
  driveState.driveSection = section;
  driveState.driveQuestions = getDriveQuestionsForSection(section);
  driveState.driveCurrentIndex = 0;
  driveState.drivePhase = "idle";
  driveUpdateUI();
}

export function driveEnter() {
  if (!state.DB.length) {
    showToast("No questions loaded. Load questions first.", "error");
    return;
  }

  loadVoices();
  driveState.driveActive = true;
  driveState.drivePaused = false;
  driveState.driveAutoPlay = true;

  const savedSection = localStorage.getItem(STORAGE.drivingSection) || "all";
  const savedIndex = parseInt(localStorage.getItem(STORAGE.drivingIndex) || "0", 10);

  driveState.driveSection = savedSection;
  driveState.driveQuestions = getDriveQuestionsForSection(driveState.driveSection);

  if (!driveState.driveQuestions.length) {
    driveState.driveSection = "all";
    driveState.driveQuestions = getDriveQuestionsForSection("all");
  }

  driveState.driveCurrentIndex = Math.min(savedIndex, Math.max(driveState.driveQuestions.length - 1, 0));
  if (driveState.driveCurrentIndex < 0) driveState.driveCurrentIndex = 0;
  driveState.drivePhase = "idle";

  const isDark = document.documentElement.classList.contains("dark");
  els.drivingOverlay.classList.toggle("light-drive", !isDark);
  els.drivingOverlay.style.display = "flex";
  document.body.style.overflow = "hidden";

  if ("wakeLock" in navigator) {
    navigator.wakeLock.request("screen").catch(() => {});
  }

  driveUpdateUI();

  setTimeout(() => {
    const info = getVoiceInfo();
    showToast(
      `Q: ${shortVoiceName(info.male)} · A: ${shortVoiceName(info.female)} · slow pace`
    );
  }, 250);
}

export function driveExit() {
  abortAllPlayback();
  driveState.driveActive = false;
  driveState.drivePhase = "idle";
  els.drivingOverlay.style.display = "none";
  document.body.style.overflow = "";
}

export function drivePlayPauseToggle() {
  const activelySpeaking =
    (driveState.drivePhase === "question" || driveState.drivePhase === "answer") &&
    !driveState.drivePaused &&
    speechSynthesis.speaking;

  if (activelySpeaking) {
    try { speechSynthesis.pause(); } catch {}
    driveState.drivePaused = true;
    clearDriveCountdown();
    driveUpdateUI();
    return;
  }

  if (driveState.drivePaused && speechSynthesis.paused) {
    try { speechSynthesis.resume(); } catch {}
    driveState.drivePaused = false;
    driveUpdateUI();
    return;
  }

  drivePlayQuestion(driveState.driveCurrentIndex);
}

export function driveGoPrev() {
  abortAllPlayback();
  drivePlayQuestion(Math.max(0, driveState.driveCurrentIndex - 1));
}

export function driveGoNext() {
  abortAllPlayback();
  const total = driveState.driveQuestions.length;
  if (driveState.driveCurrentIndex + 1 >= total) {
    drivePlayQuestion(total);
    return;
  }
  drivePlayQuestion(driveState.driveCurrentIndex + 1);
}

export function driveRepeatCurrent() {
  abortAllPlayback();
  drivePlayQuestion(driveState.driveCurrentIndex);
}

export function driveStopSpeaking() {
  abortAllPlayback();
  driveState.drivePhase = "idle";
  driveUpdateUI();
}

export function driveShowSectionPicker() {
  abortAllPlayback();

  const sections = getDriveSections();
  let html = `
    <div style="padding:16px 16px 8px;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-weight:700;font-size:1rem;">Select Section</span>
      <button id="driveCloseSectionPicker" style="width:40px;height:40px;border-radius:10px;border:none;background:#475569;color:#fff;font-size:16px;cursor:pointer;">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>`;

  html += `<button class="driving-section-item ${driveState.driveSection === "all" ? "active-section" : ""}" data-drive-section="all">
    <span>All Sections</span><span style="font-size:0.8rem;opacity:0.6;">${state.DB.length} Q</span></button>`;

  sections.forEach(s => {
    const count = state.DB.filter(q => q.sectionTitle === s).length;
    html += `<button class="driving-section-item ${driveState.driveSection === s ? "active-section" : ""}" data-drive-section="${esc(s)}">
      <span style="flex:1;text-align:left;">${esc(s)}</span><span style="font-size:0.8rem;opacity:0.6;">${count} Q</span></button>`;
  });

  const isDark = document.documentElement.classList.contains("dark");
  els.driveSectionPicker.className = "driving-section-picker" + (isDark ? "" : " light-drive");
  els.driveSectionListBox.className = "driving-section-list" + (isDark ? "" : " light-drive");
  els.driveSectionListBox.innerHTML = html;
  els.driveSectionPicker.style.display = "flex";

  els.driveSectionListBox.querySelectorAll("[data-drive-section]").forEach(btn => {
    btn.addEventListener("click", () => {
      driveSetSection(btn.dataset.driveSection);
      els.driveSectionPicker.style.display = "none";
      drivePlayQuestion(0);
    });
  });

  document.getElementById("driveCloseSectionPicker")?.addEventListener("click", () => {
    els.driveSectionPicker.style.display = "none";
  });
}