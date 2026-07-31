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
  badgeMetric: "total", // "total" or "work"
  notifyTargetMet: true,
  notifiedTargetMetDate: "",
  autoRefreshSession: true,
  cachedJibbleToken: null,
  tokenExpiry: null,
  personId: "",
  autoPersonId: "",
  jibbleAppVersion: "2.81.3",
  cachedHolidays: [],
  cachedHolidaysTime: 0
};

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

/**
 * Get single key from storage
 */
export async function getStorageItem(key, defaultValue = null) {
  const settings = await getSettings();
  return settings[key] !== undefined ? settings[key] : defaultValue;
}

/**
 * Save single key to storage
 */
export async function setStorageItem(key, value) {
  return saveSettings({ [key]: value });
}
