/**
 * Microsoft Edge Neural TTS (free, no API key)
 * Same high-quality neural voices for every user (requires network).
 *
 * Male (questions):  en-US-GuyNeural
 * Female (answers):  en-US-JennyNeural
 *
 * Note: Uses the same public endpoint Edge browser uses for Read Aloud.
 * If Microsoft changes/blocks it, the app falls back to Web Speech API.
 */

const EDGE_TTS_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_TTS_WS =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";

export const EDGE_VOICES = {
  // Natural American male — questions
  male: "en-US-GuyNeural",
  // Natural American female — answers
  female: "en-US-JennyNeural"
};

/**
 * ratePercent examples:
 *   0    = normal
 *  -15   = slightly slower (good default)
 *  -25   = clearly slower / study pace
 *  -40   = very slow
 */
export async function synthesizeEdgeTTS(text, {
  voice = EDGE_VOICES.female,
  ratePercent = -20,
  pitchPercent = 0
} = {}) {
  const clean = String(text || "").trim();
  if (!clean) return null;

  // Edge TTS works best with reasonably sized chunks
  const ssml = buildSSML(clean, voice, ratePercent, pitchPercent);

  const audioData = await requestEdgeAudio(ssml);
  if (!audioData || !audioData.byteLength) return null;

  const blob = new Blob([audioData], { type: "audio/mpeg" });
  return URL.createObjectURL(blob);
}

function buildSSML(text, voice, ratePercent, pitchPercent) {
  const escaped = escapeXml(text);
  const rate = `${ratePercent}%`;
  const pitch = `${pitchPercent}%`;

  // prosody rate makes speech slower and more human/study-like
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"` +
    ` xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">` +
    `<voice name="${voice}">` +
    `<prosody rate="${rate}" pitch="${pitch}">` +
    escaped +
    `</prosody>` +
    `</voice>` +
    `</speak>`
  );
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createRequestId() {
  // 32 hex chars
  if (crypto?.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

async function requestEdgeAudio(ssml) {
  const requestId = createRequestId();
  const secMsGec = await generateSecMsGec(EDGE_TTS_TOKEN);

  const qs = new URLSearchParams({
    TrustedClientToken: EDGE_TTS_TOKEN,
    ConnectionId: requestId,
    "Sec-MS-GEC": secMsGec,
    "Sec-MS-GEC-Version": "1-130.0.2849.68"
  });

  const wsUrl = `${EDGE_TTS_WS}?${qs.toString()}`;

  return new Promise((resolve, reject) => {
    let socket;
    const chunks = [];
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      try { socket?.close(); } catch {}
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const done = () => {
      if (settled) return;
      settled = true;
      try { socket?.close(); } catch {}
      // Merge binary audio parts
      const total = chunks.reduce((n, c) => n + c.byteLength, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const part of chunks) {
        out.set(new Uint8Array(part), offset);
        offset += part.byteLength;
      }
      resolve(out.buffer);
    };

    try {
      socket = new WebSocket(wsUrl);
      socket.binaryType = "arraybuffer";
    } catch (err) {
      fail(err);
      return;
    }

    const timeout = setTimeout(() => fail(new Error("Edge TTS timeout")), 20000);

    socket.onopen = () => {
      try {
        // 1) speech config
        const configPayload = JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: false,
                  wordBoundaryEnabled: false
                },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3"
              }
            }
          }
        });

        socket.send(
          `X-Timestamp:${new Date().toISOString()}\r\n` +
          `Content-Type:application/json; charset=utf-8\r\n` +
          `Path:speech.config\r\n\r\n` +
          configPayload
        );

        // 2) SSML payload
        socket.send(
          `X-RequestId:${requestId}\r\n` +
          `Content-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${new Date().toISOString()}\r\n` +
          `Path:ssml\r\n\r\n` +
          ssml
        );
      } catch (err) {
        clearTimeout(timeout);
        fail(err);
      }
    };

    socket.onmessage = (event) => {
      if (typeof event.data === "string") {
        // Text control messages
        if (event.data.includes("Path:turn.end")) {
          clearTimeout(timeout);
          done();
        }
        return;
      }

      // Binary audio frame: header then audio bytes after two CRLFs
      try {
        const buffer = event.data;
        const view = new Uint8Array(buffer);
        const headerEnd = findHeaderEnd(view);
        if (headerEnd < 0) return;
        const audioSlice = buffer.slice(headerEnd);
        if (audioSlice.byteLength > 0) chunks.push(audioSlice);
      } catch {
        // ignore bad frame
      }
    };

    socket.onerror = () => {
      clearTimeout(timeout);
      fail(new Error("Edge TTS socket error"));
    };

    socket.onclose = () => {
      clearTimeout(timeout);
      // If closed before turn.end but we have audio, use it
      if (!settled) {
        if (chunks.length) done();
        else fail(new Error("Edge TTS closed early"));
      }
    };
  });
}

function findHeaderEnd(bytes) {
  // Look for \r\n\r\n
  for (let i = 0; i < bytes.length - 3; i++) {
    if (
      bytes[i] === 13 && bytes[i + 1] === 10 &&
      bytes[i + 2] === 13 && bytes[i + 3] === 10
    ) {
      return i + 4;
    }
  }
  return -1;
}

/**
 * Sec-MS-GEC token generation (required by newer Edge TTS endpoint)
 * Based on public edge-tts implementations.
 */
async function generateSecMsGec(trustedClientToken) {
  const ticks = Math.floor(Date.now() / 1000) + 11644473600;
  const rounded = ticks - (ticks % 300);
  const windowsTicks = rounded * 10000000;
  const str = `${windowsTicks}${trustedClientToken}`;

  const encoded = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}
