import { isNewerVersion, compareVersions, showToast, sleep } from "./utils.js";
import { state, saveReadingPositionNow } from "./state.js";
import { APP_VERSION, STARTER_BUNDLE_VERSION, VERSION_FILE, STORAGE } from "./config.js";
import { refreshStarterBundle } from "./db.js";
import { els } from "./ui.js";

export async function checkForUpdates() {
  if (location.protocol === "file:") return;
  try {
    const response = await fetch(`${VERSION_FILE}?check=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const remoteVersion = await response.json();
    const remoteAppVersion = String(remoteVersion.appVersion || "").trim();
    const remoteStarterVersion = String(remoteVersion.starterBundleVersion || "").trim();
    const installedStarterVersion = localStorage.getItem(STORAGE.starterVersion) || STARTER_BUNDLE_VERSION;

    const appUpdateAvailable = isNewerVersion(remoteAppVersion, APP_VERSION);
    const starterUpdateAvailable = isNewerVersion(remoteStarterVersion, installedStarterVersion);

    if (!appUpdateAvailable && !starterUpdateAvailable) {
      state.pendingRemoteVersion = null;
      els.updateBanner.classList.add("hidden");
      return;
    }

    const updateKey = `${remoteAppVersion}|${remoteStarterVersion}`;
    const dismissedKey = localStorage.getItem(STORAGE.dismissedUpdateVersion);
    if (dismissedKey === updateKey) return;

    state.pendingRemoteVersion = {
      appVersion: remoteAppVersion,
      starterBundleVersion: remoteStarterVersion,
      appUpdateAvailable,
      starterUpdateAvailable,
      updateKey
    };

    const messages = [];
    if (appUpdateAvailable) messages.push(`App ${remoteAppVersion} is available with updated features.`);
    if (starterUpdateAvailable) messages.push(`Starter content ${remoteStarterVersion} is available.`);
    if (remoteVersion.message) messages.push(remoteVersion.message);

    els.updateBannerText.textContent = messages.join(" ");
    els.updateBanner.dataset.updateKey = updateKey;
    els.updateBanner.classList.remove("hidden");
  } catch (error) {
    console.warn("Unable to check updates:", error);
  }
}

async function getDeployedAppVersion() {
  try {
    const url = new URL("./index.html", window.location.href);
    url.searchParams.set("deploymentCheck", `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.querySelector('meta[name="app-version"]')?.content?.trim() || "";
  } catch (error) {
    console.warn("Could not determine deployed app version:", error);
    return "";
  }
}

async function waitForAppDeployment(targetVersion, { attempts = 20, delayMs = 3000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const deployedVersion = await getDeployedAppVersion();
    if (deployedVersion && compareVersions(deployedVersion, targetVersion) >= 0) {
      return { ready: true, deployedVersion };
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  return { ready: false, deployedVersion: "" };
}

export async function updateAppNow() {
  if (!state.pendingRemoteVersion) {
    els.updateBanner.classList.add("hidden");
    return;
  }

  saveReadingPositionNow();
  const { appVersion: targetAppVersion, starterBundleVersion: targetStarterVersion, appUpdateAvailable, starterUpdateAvailable, updateKey } = state.pendingRemoteVersion;
  const originalHtml = els.updateNowBtn.innerHTML;
  els.updateNowBtn.disabled = true;

  if (appUpdateAvailable) {
    els.updateNowBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i>Waiting for deployment...`;
    showToast("Waiting for GitHub Pages to serve the new app version...");
    const result = await waitForAppDeployment(targetAppVersion, { attempts: 20, delayMs: 3000 });

    if (!result.ready) {
      els.updateNowBtn.disabled = false;
      els.updateNowBtn.innerHTML = originalHtml;
      showToast("GitHub Pages is still serving the old index.html. Please try Update now again shortly.", "error");
      return;
    }

    sessionStorage.setItem("sdm_app_update_completed", result.deployedVersion);
    if (targetStarterVersion) sessionStorage.setItem("sdm_target_starter_version", targetStarterVersion);
    localStorage.removeItem(STORAGE.dismissedUpdateVersion);

    const newUrl = new URL("./index.html", window.location.href);
    newUrl.searchParams.set("v", result.deployedVersion);
    newUrl.searchParams.set("reload", Date.now());
    window.location.replace(newUrl.toString());
    return;
  }

  if (starterUpdateAvailable) {
    els.updateNowBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i>Updating content...`;
    const ok = await refreshStarterBundle({ targetVersion: targetStarterVersion || STARTER_BUNDLE_VERSION });
    els.updateNowBtn.disabled = false;
    els.updateNowBtn.innerHTML = originalHtml;
    if (ok) {
      localStorage.setItem(STORAGE.dismissedUpdateVersion, updateKey);
      els.updateBanner.classList.add("hidden");
      state.pendingRemoteVersion = null;
      showToast("Starter content updated. Your progress was preserved.");
    }
    return;
  }

  els.updateNowBtn.disabled = false;
  els.updateNowBtn.innerHTML = originalHtml;
  els.updateBanner.classList.add("hidden");
}