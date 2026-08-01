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

// Initial sync
syncTokenFromPage();

// Re-sync every 2 minutes
setInterval(() => {
  syncTokenFromPage();
}, 2 * 60 * 1000);

// Inject page context script if web_accessible_resources exists
try {
  const script = document.createElement("script");
  script.src = extApi.runtime.getURL("page-fetch.js");
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();
} catch (e) {
  // Ignore if script injection is not permitted on non-jibble subdomains
}

// Receive page-fetch responses
window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data?.type === "JIBBLE_TIMESHEET_RESULT") {
    extApi.runtime.sendMessage({
      type: "TIMESHEET_RESULT",
      data: event.data.data
    });
  }
});