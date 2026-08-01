import { getSettings, saveSettings } from './js/storage.js';
import { fetchMonthlyTimesheets, fetchPersonHolidays } from './js/api.js';
import { calculateMonthSummary } from './js/calculator.js';
import { initTheme } from './js/theme.js';

const extApi = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();


  const monthSelect = document.getElementById('popup-month-select');
  const refreshBtn = document.getElementById('refresh-btn');
  const expandBtn = document.getElementById('expand-btn');
  const noticeEl = document.getElementById('popup-notice');
  const syncStatusEl = document.getElementById('sync-status');

  // Open Dashboard options page
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      if (extApi && extApi.runtime && extApi.runtime.openOptionsPage) {
        extApi.runtime.openOptionsPage();
      } else {
        window.open('fullpage.html');
      }
    });
  }

  // Load initial settings & selected month
  const settings = await getSettings();
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const selectedMonth = settings.selectedMonth || currentMonthStr;

  if (monthSelect) {
    monthSelect.value = selectedMonth;
    monthSelect.addEventListener('change', async (e) => {
      const newMonth = e.target.value;
      await saveSettings({ selectedMonth: newMonth });
      loadAndRenderPopup(newMonth);
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const activeMonth = monthSelect ? monthSelect.value : currentMonthStr;
      loadAndRenderPopup(activeMonth, true);
    });
  }

  // Initial load
  loadAndRenderPopup(selectedMonth);

  /**
   * Fetch timesheets and render the 6 summary cards
   */
  async function loadAndRenderPopup(yearMonthStr, forceRefresh = false) {
    showNotice(null);
    setSyncState('loading', 'Updating...');

    const settings = await getSettings();
    const [timesheetRes, holidaysRes] = await Promise.all([
      fetchMonthlyTimesheets(yearMonthStr, settings.personId, settings.jibbleAppVersion),
      fetchPersonHolidays(settings.personId, settings.jibbleAppVersion)
    ]);

    const nowSecs = Math.floor(Date.now() / 1000);
    const tokenExpired = !settings.cachedJibbleToken || (settings.tokenExpiry && settings.tokenExpiry <= nowSecs);

    if (tokenExpired || !timesheetRes.success) {
      setSyncState('error', 'Auth Expired');
      showNotice('Jibble session expired. Please open web.jibble.io to log in and re-sync.', 'error');
    } else {
      setSyncState('success', 'Synced');
    }

    const apiHolidays = holidaysRes.success ? (holidaysRes.holidays || []) : [];
    const fullConfig = {
      ...settings,
      apiHolidays
    };

    // Calculate all metrics using central engine
    const summary = calculateMonthSummary(yearMonthStr, timesheetRes.daily || [], fullConfig);
    renderCards(summary);

    // Notify background script to update icon badge & check target/expiry notifications
    if (extApi && extApi.runtime && extApi.runtime.sendMessage) {
      extApi.runtime.sendMessage({
        type: "UPDATE_BADGE_AND_NOTIFY",
        payload: {
          todayMetrics: summary.todayMetrics,
          settings,
          tokenExpired
        }
      }, () => {
        const _ = extApi.runtime.lastError;
      });
    }
  }

  function setSyncState(state, label) {
    if (!syncStatusEl) return;
    syncStatusEl.textContent = label;
    syncStatusEl.className = `status-badge ${state}`;
  }

  function showNotice(message, type = 'info') {
    if (!noticeEl) return;
    if (!message) {
      noticeEl.classList.add('hidden');
      noticeEl.textContent = '';
    } else {
      noticeEl.classList.remove('hidden');
      noticeEl.className = `popup-notice ${type}`;
      noticeEl.textContent = message;
    }
  }

  function renderCards(summary) {
    const today = summary.todayMetrics;

    // 1. Monthly Work
    updateCard('month-work', {
      actual: summary.formattedMonthActualWork,
      req: summary.formattedMonthRequiredWork,
      diff: summary.formattedMonthWorkDiff,
      status: summary.monthWorkStatus
    });

    // 2. Monthly Break
    updateCard('month-break', {
      actual: summary.formattedMonthActualBreak,
      req: summary.formattedMonthAllowedBreak,
      diff: summary.formattedMonthBreakDiff,
      status: summary.monthBreakStatus
    });

    // 3. Monthly Total
    updateCard('month-total', {
      actual: summary.formattedMonthActualTotal,
      req: summary.formattedMonthRequiredTotal,
      diff: summary.formattedMonthTotalDiff,
      status: summary.monthTotalStatus
    });

    // 4. Today Work
    updateCard('today-work', {
      actual: today.formattedActualWork,
      req: today.formattedRequiredWork,
      diff: today.formattedWorkDiff,
      status: today.workStatus
    });

    // 5. Today Break
    updateCard('today-break', {
      actual: today.formattedActualBreak,
      req: today.formattedAllowedBreak,
      diff: today.formattedBreakDiff,
      status: today.breakStatus
    });

    // 6. Today Total
    updateCard('today-total', {
      actual: today.formattedActualTotal,
      req: today.formattedRequiredTotal,
      diff: today.formattedTotalDiff,
      status: today.totalStatus
    });
  }

  function updateCard(cardKey, data) {
    const cardEl = document.getElementById(`card-${cardKey}`);
    const actualEl = document.getElementById(`val-${cardKey}-actual`);
    const reqEl = document.getElementById(`val-${cardKey}-req`);
    const diffEl = document.getElementById(`val-${cardKey}-diff`);
    const indEl = document.getElementById(`ind-${cardKey}`);

    if (actualEl) actualEl.textContent = data.actual;
    if (reqEl) reqEl.textContent = data.req;

    if (diffEl) {
      diffEl.textContent = data.diff;
      diffEl.className = `m-val diff ${data.status}`;
    }

    if (indEl) {
      indEl.textContent = data.status === 'green' ? 'OK' : 'Lag';
      indEl.className = `status-indicator ${data.status}`;
    }

    if (cardEl) {
      cardEl.dataset.status = data.status;
    }
  }

  function renderEmptyCards() {
    ['month-work', 'month-break', 'month-total', 'today-work', 'today-break', 'today-total'].forEach(key => {
      updateCard(key, { actual: '--', req: '--', diff: '--', status: 'red' });
    });
  }
});
