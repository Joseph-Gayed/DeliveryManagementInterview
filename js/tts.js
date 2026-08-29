import { cleanText } from "./utils.js";
import { driveState } from "./driving-mode.js";

let voiceMale = null;
let voiceFemale = null;
let voicesLoaded = false;

/**
 * Slow human pacing for driving focus.
 * Male  = questions
 * Female = answers
 */
export const ttsController = {
  sessionId: 0,
  questionRate: 0.72, // slow male
  answerRate: 0.74,   // slow female
  questionPitch: 1.0,
  answerPitch: 1.05
};

export function loadVoices() {
  const all = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  if (!all.length) return;
  voicesLoaded = true;

  const enUS = all.filter(v => /en[-_]US/i.test(v.lang));
  const enAny = all.filter(v => /^en/i.test(v.lang));
  const pool = enUS.length ? enUS : (enAny.length ? enAny : all);

  const blocked = /zira|espeak|robot/i;

  const femalePreferred = [
    "Microsoft Ava Online",
    "Microsoft Jenny Online",
    "Microsoft Aria Online",
    "Microsoft Emma Online",
    "Samantha (Enhanced)",
    "Samantha (Premium)",
    "Ava (Enhanced)",
    "Ava (Premium)",
    "Allison (Enhanced)",
    "Google US English",
    "Samantha",
    "Ava",
    "Allison",
    "Victoria",
    "Karen",
    "Susan"
  ];

  const malePreferred = [
    "Microsoft Guy Online",
    "Microsoft Christopher Online",
    "Microsoft Eric Online",
    "Alex (Enhanced)",
    "Alex (Premium)",
    "Daniel (Enhanced)",
    "Tom (Enhanced)",
    "Alex",
    "Daniel",
    "Tom",
    "Fred",
    "David"
  ];

  const pick = (preferred) => {
    for (const name of preferred) {
      const found = pool.find(v =>
        v.name.toLowerCase().includes(name.toLowerCase()) &&
        !blocked.test(v.name)
      );
      if (found) return found;
    }
    return null;
  };

  voiceFemale = pick(femalePreferred) ||
    pool.find(v => /female|samantha|ava|jenny|aria|karen|susan|victoria/i.test(v.name) && !blocked.test(v.name)) ||
    pool[0];

  voiceMale = pick(malePreferred) ||
    pool.find(v => /male|guy|alex|daniel|tom|david|christopher|eric/i.test(v.name) && !blocked.test(v.name)) ||
    pool[pool.length > 1 ? 1 : 0];

  if (voiceMale === voiceFemale) {
    const alt = pool.find(v => v !== voiceMale && !blocked.test(v.name));
    if (alt) voiceFemale = alt;
  }

  console.log(
    "Drive voices ready:\n  Q (male):",
    voiceMale?.name,
    "\n  A (female):",
    voiceFemale?.name
  );
}

if (typeof speechSynthesis !== "undefined") {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

export function prepareSpeechText(raw) {
  let t = cleanText(raw);
  t = t.replace(/\bSDM\b/g, "S D M");
  t = t.replace(/\bAPI\b/g, "A P I");
  t = t.replace(/\bREST\b/g, "rest");
  t = t.replace(/\bJSON\b/g, "jason");
  t = t.replace(/\bSQL\b/g, "sequel");
  t = t.replace(/\bUI\b/g, "U I");
  t = t.replace(/\bURL\b/g, "U R L");
  t = t.replace(/\be\.g\.,?\s*/gi, "for example, ");
  t = t.replace(/\bi\.e\.,?\s*/gi, "that is, ");
  t = t.replace(/\bvs\.?\s*/gi, "versus ");
  t = t.replace(/\betc\./gi, "etcetera");
  t = t.replace(/^[•\-\*]\s+/gm, "");
  t = t.replace(/^\d+[\.\)]\s+/gm, "");
  t = t.replace(/[\(\)\[\]\{\}]/g, ", ");
  t = t.replace(/\s*;\s*/g, ". ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

export function interruptibleWait(ms, sessionAtStart) {
  return new Promise(resolve => {
    const start = Date.now();
    const tick = () => {
      if (ttsController.sessionId !== sessionAtStart) return resolve();
      if (!driveState.driveActive || driveState.drivePaused) return resolve();
      if (Date.now() - start >= ms) return resolve();
      setTimeout(tick, 50);
    };
    tick();
  });
}

function speakOneSentence(sentence, useFemale, targetSession) {
  return new Promise(resolve => {
    if (!("speechSynthesis" in window)) return resolve();
    if (ttsController.sessionId !== targetSession) return resolve();
    if (!sentence.trim()) return resolve();

    const u = new SpeechSynthesisUtterance(sentence);
    u.lang = "en-US";
    u.rate = useFemale ? ttsController.answerRate : ttsController.questionRate;
    u.pitch = useFemale ? ttsController.answerPitch : ttsController.questionPitch;
    u.volume = 1;

    if (useFemale && voiceFemale) u.voice = voiceFemale;
    else if (!useFemale && voiceMale) u.voice = voiceMale;

    u.onend = () => resolve();
    u.onerror = () => resolve();

    try {
      speechSynthesis.speak(u);
    } catch {
      resolve();
    }
  });
}

/** useFemale=false → male question voice; true → female answer voice */
export async function speakText(text, useFemale = false) {
  if (!("speechSynthesis" in window)) return;
  if (!voicesLoaded) loadVoices();

  const currentSession = ttsController.sessionId;
  const prepared = prepareSpeechText(text);
  if (!prepared) return;

  const sentences = prepared
    .split(/(?<=[.?!])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);

  for (let i = 0; i < sentences.length; i++) {
    if (ttsController.sessionId !== currentSession) return;
    if (!driveState.driveActive || driveState.drivePaused) return;

    await speakOneSentence(sentences[i], useFemale, currentSession);

    // Longer pause between sentences = more human / easier while driving
    if (i < sentences.length - 1) {
      await interruptibleWait(280, currentSession);
    }
  }
}

export function hardStop() {
  ttsController.sessionId++;
  if ("speechSynthesis" in window) {
    try { speechSynthesis.cancel(); } catch {}
  }
}

export const stopSpeaking = hardStop;

export function getVoiceInfo() {
  return {
    male: voiceMale?.name || "Default male",
    female: voiceFemale?.name || "Default female",
    ready: voicesLoaded
  };
}