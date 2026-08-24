/**
 * Storage utility for Jibble Work Tracker Extension
 * Wraps browser.storage.local / chrome.storage.local with async/await
 */

const extApi = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);

export const DEFAULT_SETTINGS = {
  targetWorkHours: 8,
  targetBreakHours: 1,
  workingWeekdays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  saturdayConfig: "every_off", // 'every_working', 'every_off', 'alt_1_3_work', 'alt_2_4_work', 'alt_1_3_off', 'alt_2_4_off', 'ref_date'
  altSatReferenceDate: "",
  halfDayEnabled: false,
  halfDayWorkHours: 4,
  halfDayBreakHours: 0.5,
  manualHolidays: [],
  selectedMonth: new Date().toISOString().slice(0, 7), // "YYYY-MM"
  periodMode: "month", // "month" or "bi_weekly"
  monthCalcMode: "full", // "full" (entire month) or "mtd" (month-to-date / elapsed)
  badgeMetric: "total", // "total" or "work"
  notifyMetric: "work", // "work" (Work Time Only) or "total" (Total Time: Work + Break)
  notifyTargetMet: true,
  notifiedTargetMetDate: "",
  autoRefreshSession: true,
  cachedJibbleToken: null,
  tokenExpiry: null,
  personId: "",
  autoPersonId: "",
  jibbleAppVersion: "2.82.1",
  cachedHolidays: [],
  cachedHolidaysTime: 0,
  lastDataFetchTime: 0
};

/**
 * Compare two semver-like version strings (e.g. "2.81.3" vs "2.82.1")
 * Returns true if v1 is older than v2
 */
export function isVersionOlder(v1, v2) {
  if (!v1) return true;
  if (!v2) return false;
  const p1 = String(v1).split('.').map(n => parseInt(n, 10) || 0);
  const p2 = String(v2).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a < b) return true;
    if (a > b) return false;
  }
  return false;
}

/**
 * Get all stored settings merged with defaults
 */
export async function getSettings() {
  if (!extApi || !extApi.storage || !extApi.storage.local) {
    console.warn("Extension storage API not available, using local defaults.");
    return { ...DEFAULT_SETTINGS };
  }

  return new Promise((resolve) => {
    extApi.storage.local.get(null, (items) => {
      const settings = { ...DEFAULT_SETTINGS, ...items };
      // Ensure numeric types
      settings.targetWorkHours = parseFloat(settings.targetWorkHours) || 8;
      settings.targetBreakHours = parseFloat(settings.targetBreakHours) || 1;
      settings.halfDayWorkHours = parseFloat(settings.halfDayWorkHours) || 4;
      settings.halfDayBreakHours = parseFloat(settings.halfDayBreakHours) || 0.5;
      if (!Array.isArray(settings.manualHolidays)) {
        settings.manualHolidays = [];
      }
      // If personId is empty but autoPersonId exists, use autoPersonId
      if (!settings.personId && settings.autoPersonId) {
        settings.personId = settings.autoPersonId;
      }
      // Auto-upgrade stored jibbleAppVersion if code defaults to a newer version
      if (!items || !items.jibbleAppVersion || isVersionOlder(items.jibbleAppVersion, DEFAULT_SETTINGS.jibbleAppVersion)) {
        settings.jibbleAppVersion = DEFAULT_SETTINGS.jibbleAppVersion;
        extApi.storage.local.set({ jibbleAppVersion: DEFAULT_SETTINGS.jibbleAppVersion });
      }
      resolve(settings);
    });
  });
}

/**
 * Save settings object to storage
 */
export async function saveSettings(newSettings) {
  if (!extApi || !extApi.storage || !extApi.storage.local) {
    return false;
  }

  return new Promise((resolve) => {
    extApi.storage.local.set(newSettings, () => {
      resolve(true);
    });
  });
}
