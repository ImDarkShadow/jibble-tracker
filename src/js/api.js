/**
 * API Communication Layer for Jibble Time Tracking
 */

import { getSettings, saveSettings } from './storage.js';

const extApi = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);

/**
 * Retrieve cached Bearer Token or try to extract live token & personId from open web.jibble.io tabs
 */
export async function getJibbleToken() {
  if (!extApi) return null;

  return new Promise(async (resolve) => {
    try {
      // 1. Check storage first
      extApi.storage.local.get(["cachedJibbleToken"], async (result) => {
        if (result && result.cachedJibbleToken) {
          return resolve(result.cachedJibbleToken);
        }

        // 2. Fallback: Query active web.jibble.io tab
        if (extApi.tabs && extApi.scripting) {
          try {
            const tabs = await extApi.tabs.query({ url: "https://web.jibble.io/*" });
            if (tabs && tabs.length > 0) {
              const injectionResults = await extApi.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: () => {
                  try {
                    const oidcKey = Object.keys(localStorage).find((k) =>
                      k.startsWith("oidc.user:https://identity.prod.jibble.io")
                    );
                    if (!oidcKey) return null;
                    const data = JSON.parse(localStorage.getItem(oidcKey));
                    if (!data) return null;
                    const profile = data.profile || {};
                    const prsid = profile.prsid || profile.personId || profile.person_id || profile.sub || null;
                    return {
                      token: data ? (data.access_token || data.id_token) : null,
                      personId: prsid
                    };
                  } catch (e) {
                    return null;
                  }
                }
              });

              if (injectionResults && injectionResults[0] && injectionResults[0].result) {
                const { token, personId } = injectionResults[0].result;
                const updateObj = { cachedJibbleToken: token };
                if (personId) updateObj.autoPersonId = personId;
                extApi.storage.local.set(updateObj);
                return resolve(token);
              }
            }
          } catch (e) {
            console.warn("Failed to extract token from active tab:", e);
          }
        }

        // 3. Fallback: Trigger silent background session refresh if enabled
        const settings = await getSettings();
        if (settings.autoRefreshSession !== false && extApi.runtime && extApi.runtime.sendMessage) {
          extApi.runtime.sendMessage({ type: "SILENT_REFRESH_SESSION" }, () => {
            const _ = extApi.runtime.lastError;
          });
        }

        resolve(null);
      });
    } catch (err) {
      console.error("Token retrieval error:", err);
      resolve(null);
    }
  });
}

/**
 * Fetch monthly timesheets from Jibble API with offline response caching
 */
export async function fetchMonthlyTimesheets(yearMonthStr, personId = null, appVersion = null, forceRefresh = false) {
  const settings = await getSettings();
  const activePersonId = personId || settings.personId || settings.autoPersonId || "";
  const cacheKey = `timesheets_cache_${activePersonId}_${yearMonthStr}`;

  // Serve cached timesheet instantly if available and not forced
  if (!forceRefresh && settings[cacheKey] && settings[cacheKey].daily) {
    // Background fetch fresh data asynchronously if cache is older than 5 minutes
    const cacheAge = Date.now() - (settings[cacheKey].time || 0);
    if (cacheAge > 5 * 60 * 1000) {
      fetchAndCacheFreshTimesheets(yearMonthStr, activePersonId, appVersion, cacheKey).catch(() => {});
    }
    return {
      success: true,
      daily: settings[cacheKey].daily,
      cached: true,
      cachedTime: settings[cacheKey].time || null
    };
  }

  return await fetchAndCacheFreshTimesheets(yearMonthStr, activePersonId, appVersion, cacheKey);
}

async function fetchAndCacheFreshTimesheets(yearMonthStr, personId, appVersion, cacheKey) {
  const token = await getJibbleToken();
  if (!token) {
    return {
      success: false,
      error: "Authentication token missing. Please open and log in to web.jibble.io."
    };
  }

  const settings = await getSettings();
  const activePersonId = personId || settings.personId || settings.autoPersonId || "";
  const activeAppVersion = appVersion || settings.jibbleAppVersion || "2.82.1";

  if (!activePersonId) {
    return {
      success: false,
      error: "Person ID not detected. Please log in to web.jibble.io to automatically sync your profile."
    };
  }

  const queryDate = `${yearMonthStr}-01`;
  const url = `https://time-attendance.prod.jibble.io/v1/Timesheets?%24count=true&%24expand=person&%24orderby=person%2FfullName%20asc&%24skip=0&%24top=31&date=${queryDate}&period=Month&personIds=${activePersonId}`;

  try {
    let responseData = null;

    if (extApi && extApi.runtime && extApi.runtime.sendMessage) {
      responseData = await new Promise((resolve) => {
        extApi.runtime.sendMessage(
          { type: "FETCH_TIMESHEETS", url, token, appVersion: activeAppVersion },
          (res) => {
            if (extApi.runtime.lastError) {
              console.warn("Background fetch warning:", extApi.runtime.lastError.message);
              resolve(null);
            } else {
              resolve(res);
            }
          }
        );
      });
    }

    if (!responseData || responseData.error) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "X-Jibble-App-Language": "en-US",
          "X-Jibble-App-Version": activeAppVersion
        }
      });
      responseData = await res.json();
    }

    const daily = (responseData && responseData.value && responseData.value[0] && responseData.value[0].daily) ? responseData.value[0].daily : [];
    const nowTime = Date.now();

    // Cache response in storage
    await saveSettings({
      [cacheKey]: {
        daily,
        time: nowTime
      },
      lastDataFetchTime: nowTime
    });

    // Notify any active views (popup or fullpage dashboard)
    if (extApi && extApi.runtime && extApi.runtime.sendMessage) {
      extApi.runtime.sendMessage({
        type: "TIMESHEET_DATA_REFRESHED",
        payload: { yearMonth: yearMonthStr, daily, time: nowTime }
      }, () => {
        const _ = extApi.runtime.lastError;
      });
    }

    return {
      success: true,
      daily,
      cachedTime: nowTime,
      raw: responseData
    };
  } catch (error) {
    console.error("Jibble API Fetch Error:", error);
    return {
      success: false,
      error: error.message || "Failed to communicate with Jibble API."
    };
  }
}

/**
 * Fetch official holidays for person from Jibble API
 * Caches holidays for 24 hours since company holidays change rarely
 */
export async function fetchPersonHolidays(personId = null, appVersion = null, forceRefresh = false) {
  const settings = await getSettings();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Use cached holidays if valid and less than 24h old
  if (!forceRefresh && settings.cachedHolidays && settings.cachedHolidays.length > 0 && (Date.now() - (settings.cachedHolidaysTime || 0)) < ONE_DAY_MS) {
    return {
      success: true,
      holidays: settings.cachedHolidays,
      cached: true
    };
  }

  const token = await getJibbleToken();
  if (!token) {
    return {
      success: true,
      holidays: settings.cachedHolidays || []
    };
  }

  const activePersonId = personId || settings.personId || settings.autoPersonId || "";
  if (!activePersonId) return { success: true, holidays: settings.cachedHolidays || [] };
  const activeAppVersion = appVersion || settings.jibbleAppVersion || "2.82.1";
  const url = `https://workspace.prod.jibble.io/v1/PersonHolidays(personId=${activePersonId})`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "X-Jibble-App-Language": "en-US",
        "X-Jibble-App-Version": activeAppVersion
      }
    });

    const data = await res.json();
    const rawList = data.value || (Array.isArray(data) ? data : []);

    const holidays = rawList.map(h => ({
      id: h.id || `api_hol_${h.date}`,
      date: h.date ? h.date.slice(0, 10) : "",
      name: h.name || h.title || "Company Holiday",
      isShortDay: !!h.isShortDay,
      source: "api"
    })).filter(h => !!h.date);

    // Save to 24-hour cache
    await saveSettings({
      cachedHolidays: holidays,
      cachedHolidaysTime: Date.now()
    });

    return {
      success: true,
      holidays
    };
  } catch (error) {
    console.error("Fetch Person Holidays Error:", error);
    return {
      success: true,
      holidays: settings.cachedHolidays || []
    };
  }
}
