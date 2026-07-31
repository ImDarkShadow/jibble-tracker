const extApi = typeof browser !== 'undefined' ? browser : chrome;

// Listen for messages from content script or popup/dashboard
extApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FETCH_TIMESHEETS") {
    fetch(message.url, {
      headers: {
        "Authorization": `Bearer ${message.token}`,
        "Accept": "application/json",
        "X-Jibble-App-Language": "en-US",
        "X-Jibble-App-Version": message.appVersion || "2.81.3"
      }
    })
    .then(response => response.json())
    .then(data => {
      sendResponse(data);
    })
    .catch(error => {
      console.error("Background fetch error:", error);
      sendResponse({ error: error.message });
    });

    return true; // keeps message channel open for async response
  }

  if (message.type === "UPDATE_BADGE_AND_NOTIFY") {
    handleBadgeAndNotification(message.payload);
  }

  if (message.type === "SILENT_REFRESH_SESSION") {
    attemptSilentSessionRefresh();
  }
});

let isRefreshingSession = false;

/**
 * Perform a silent background session refresh by leveraging Jibble's active web session cookie
 */
async function attemptSilentSessionRefresh() {
  if (isRefreshingSession) return;
  isRefreshingSession = true;

  try {
    // 1. Check if a jibble tab is already open
    if (extApi.tabs) {
      const tabs = await extApi.tabs.query({ url: "https://web.jibble.io/*" });
      if (tabs && tabs.length > 0) {
        if (extApi.scripting) {
          await extApi.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
              try {
                const oidcKey = Object.keys(localStorage).find(k => k.startsWith("oidc.user:https://identity.prod.jibble.io"));
                if (oidcKey) {
                  const data = JSON.parse(localStorage.getItem(oidcKey));
                  const token = data.access_token || data.id_token;
                  if (token && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ cachedJibbleToken: token });
                  }
                }
              } catch (e) {}
            }
          });
        }
        isRefreshingSession = false;
        return;
      }

      // 2. Open temporary non-active background tab to web.jibble.io to trigger OIDC auto-login & token sync
      const tab = await extApi.tabs.create({
        url: "https://web.jibble.io",
        active: false
      });

      // Wait 4 seconds for content.js to extract & store fresh token, then close tab
      setTimeout(async () => {
        try {
          if (tab && tab.id) {
            await extApi.tabs.remove(tab.id);
          }
        } catch (e) {}
        isRefreshingSession = false;
      }, 4500);
    } else {
      isRefreshingSession = false;
    }
  } catch (e) {
    console.warn("Silent session refresh warning:", e);
    isRefreshingSession = false;
  }
}

/**
 * Format total seconds into a compact 4-character string suitable for extension icon badges
 * (e.g. "8.8h", "12.5", "45m", "154h")
 */
function formatBadgeText(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return "0m";

  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours < 1) {
    return `${minutes}m`;
  }

  if (hours < 10) {
    const decimal = (totalSeconds / 3600).toFixed(1);
    return `${decimal}h`; // e.g. "8.8h" (4 chars max)
  }

  if (hours < 100) {
    const decimal = (totalSeconds / 3600).toFixed(1);
    return `${decimal}`; // e.g. "12.5" (4 chars max)
  }

  return `${hours}h`; // e.g. "154h" (4 chars max)
}

/**
 * Handle Toolbar Badge Update & Browser Notifications
 */
async function handleBadgeAndNotification(payload) {
  if (!payload) return;

  const { todayMetrics, settings, tokenExpired } = payload;
  const autoRefreshSession = (settings && settings.autoRefreshSession) !== false;
  const badgeMetric = (settings && settings.badgeMetric) || "total";
  const notifyTargetMet = (settings && settings.notifyTargetMet) !== false;
  const notifiedDate = (settings && settings.notifiedTargetMetDate) || "";
  const notifiedExpired = (settings && settings.notifiedTokenExpired) || false;
  const todayStr = (todayMetrics && todayMetrics.date) || new Date().toISOString().slice(0, 10);

  // 1. If session is expired and autoRefreshSession is enabled, attempt silent refresh
  if (tokenExpired && autoRefreshSession) {
    attemptSilentSessionRefresh();
  }

  // 2. Session Expiry Notification
  if (tokenExpired) {
    if (!notifiedExpired) {
      if (extApi.notifications && extApi.notifications.create) {
        extApi.notifications.create(`session_expired_${Date.now()}`, {
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "Jibble Session Expired 🔒",
          message: "Your Jibble login session has expired. Please open web.jibble.io to re-sync your session.",
          priority: 2
        });

        if (extApi.storage && extApi.storage.local) {
          extApi.storage.local.set({ notifiedTokenExpired: true });
        }
      }
    }
  } else if (settings && settings.cachedJibbleToken) {
    // Reset expired flag when valid token exists
    if (notifiedExpired && extApi.storage && extApi.storage.local) {
      extApi.storage.local.set({ notifiedTokenExpired: false });
    }
  }

  if (!todayMetrics) return;

  // 3. Update Toolbar Badge
  const actionApi = extApi.action || extApi.browserAction;
  if (actionApi && actionApi.setBadgeText) {
    let badgeText = "";
    if (tokenExpired) {
      badgeText = "EXP";
      actionApi.setBadgeBackgroundColor({ color: "#ef4444" });
    } else {
      const secs = badgeMetric === "work" ? (todayMetrics.actualWorkSecs || 0) : (todayMetrics.actualTotalSecs || 0);
      badgeText = formatBadgeText(secs);
      actionApi.setBadgeBackgroundColor({
        color: todayMetrics.workStatus === "green" ? "#22c55e" : "#3b82f6"
      });
    }

    actionApi.setBadgeText({ text: badgeText });
  }

  // 4. Daily Target Met Notification
  if (!tokenExpired && notifyTargetMet && todayMetrics.actualWorkSecs >= todayMetrics.requiredWorkSecs && todayMetrics.requiredWorkSecs > 0) {
    if (notifiedDate !== todayStr) {
      if (extApi.notifications && extApi.notifications.create) {
        extApi.notifications.create(`target_met_${todayStr}`, {
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "Jibble Target Reached! 🎉",
          message: `Great job! You reached your required work target (${todayMetrics.formattedRequiredWork}) for today.`,
          priority: 2
        });

        if (extApi.storage && extApi.storage.local) {
          extApi.storage.local.set({ notifiedTargetMetDate: todayStr });
        }
      }
    }
  }
}
