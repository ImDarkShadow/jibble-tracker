const extApi = typeof browser !== 'undefined' ? browser : chrome;

// Sync Jibble token and personId (prsid) from Jibble localStorage
async function syncTokenFromPage() {
  try {
    const oidcKey = Object.keys(localStorage)
      .find(k => k.startsWith("oidc.user:https://identity.prod.jibble.io"));

    if (!oidcKey) return;

    const oidcData = JSON.parse(localStorage.getItem(oidcKey));
    if (!oidcData) return;

    const now = Math.floor(Date.now() / 1000);
    const token = oidcData.access_token || oidcData.id_token;
    const profile = oidcData.profile || {};
    const prsid = profile.prsid || profile.personId || profile.person_id || profile.sub || null;

    const updateObj = {};
    if (token) {
      updateObj.cachedJibbleToken = token;
      updateObj.tokenExpiry = oidcData.expires_at || null;
      updateObj.notifiedTokenExpired = false;
    }

    if (prsid) {
      updateObj.autoPersonId = prsid;
      const existing = await extApi.storage.local.get(["personId"]);
      if (!existing || !existing.personId) {
        updateObj.personId = prsid;
      }
    }

    if (Object.keys(updateObj).length > 0) {
      await extApi.storage.local.set(updateObj);
    }

    if (oidcData.expires_at && oidcData.expires_at < now) {
      console.warn("Jibble token expired. Waiting for page refresh...");
    }
  } catch (e) {
    console.error("Token sync error:", e);
  }
}

// 1. Initial sync immediately on injection
syncTokenFromPage();

// 2. Instant sync when Jibble SPA writes/refreshes token in localStorage
window.addEventListener("storage", (e) => {
  if (!e.key || e.key.startsWith("oidc.user:https://identity.prod.jibble.io")) {
    syncTokenFromPage();
  }
});

// 3. Instant sync on tab visibility change or focus
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    syncTokenFromPage();
  }
});
window.addEventListener("focus", syncTokenFromPage);

// 4. Polling every 10 seconds (reduced from 2 minutes)
setInterval(() => {
  syncTokenFromPage();
}, 10 * 1000);