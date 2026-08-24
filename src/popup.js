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
  const syncTextEl = document.getElementById('sync-text');
  const lastUpdatedEl = document.getElementById('last-updated-text');
  const liveDotEl = document.getElementById('live-dot');
  const liveIndicatorTag = document.getElementById('live-indicator-tag');

  let currentRawDaily = [];
  let currentConfig = {};
  let lastFetchTimestamp = 0;
  let liveTimerInterval = null;
  let activeMonth = new Date().toISOString().slice(0, 7);

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
  activeMonth = settings.selectedMonth || activeMonth;

  if (monthSelect) {
    monthSelect.value = activeMonth;
    monthSelect.addEventListener('change', async (e) => {
      activeMonth = e.target.value;
      await saveSettings({ selectedMonth: activeMonth });
      await loadAndRenderPopup(activeMonth, false);
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      const currentMonth = monthSelect ? monthSelect.value : activeMonth;
      await loadAndRenderPopup(currentMonth, true);
    });
  }

  // Initial load
  await loadAndRenderPopup(activeMonth, false);

  // Start live tick interval (updates today's seconds and relative sync time every second)
  startLiveTimer();

  // Listen for background updates
  if (extApi && extApi.runtime && extApi.runtime.onMessage) {
    extApi.runtime.onMessage.addListener((message) => {
      if (message.type === 'TIMESHEET_DATA_REFRESHED') {
        const currentMonth = monthSelect ? monthSelect.value : activeMonth;
        if (message.payload && message.payload.yearMonth === currentMonth) {
          loadAndRenderPopup(currentMonth, false);
        }
      }
    });
  }

  /**
   * Fetch timesheets and render the summary cards
   */
  async function loadAndRenderPopup(yearMonthStr, forceRefresh = false) {
    showNotice(null);
    setSyncState('loading', 'Updating...');
    if (refreshBtn) refreshBtn.classList.add('spinning');

    const curSettings = await getSettings();
    const [timesheetRes, holidaysRes] = await Promise.all([
      fetchMonthlyTimesheets(yearMonthStr, curSettings.personId, curSettings.jibbleAppVersion, forceRefresh),
      fetchPersonHolidays(curSettings.personId, curSettings.jibbleAppVersion, forceRefresh)
    ]);

    if (refreshBtn) refreshBtn.classList.remove('spinning');

    const nowSecs = Math.floor(Date.now() / 1000);
    const tokenExpired = !curSettings.cachedJibbleToken || (curSettings.tokenExpiry && curSettings.tokenExpiry <= nowSecs);

    if (tokenExpired || !timesheetRes.success) {
      setSyncState('error', 'Auth Expired');
      showNotice('Jibble session expired. Please open web.jibble.io to log in and re-sync.', 'error');
    } else {
      setSyncState('success', 'Synced');
    }

    const apiHolidays = holidaysRes.success ? (holidaysRes.holidays || []) : [];
    currentConfig = {
      ...curSettings,
      apiHolidays
    };
    currentRawDaily = timesheetRes.daily || [];
    lastFetchTimestamp = timesheetRes.cachedTime || curSettings.lastDataFetchTime || Date.now();

    updateRelativeTimeDisplay();

    // Calculate initial metrics
    const elapsed = Math.max(0, Math.floor((Date.now() - lastFetchTimestamp) / 1000));
    const summary = calculateMonthSummary(yearMonthStr, currentRawDaily, currentConfig, elapsed);
    renderCards(summary);

    // Notify background script to update badge
    if (extApi && extApi.runtime && extApi.runtime.sendMessage) {
      extApi.runtime.sendMessage({
        type: "UPDATE_BADGE_AND_NOTIFY",
        payload: {
          todayMetrics: summary.todayMetrics,
          settings: curSettings,
          tokenExpired
        }
      }, () => {
        const _ = extApi.runtime.lastError;
      });
    }
  }

  function startLiveTimer() {
    if (liveTimerInterval) clearInterval(liveTimerInterval);
    liveTimerInterval = setInterval(() => {
      if (!currentRawDaily || currentRawDaily.length === 0) return;
      const elapsed = Math.max(0, Math.floor((Date.now() - lastFetchTimestamp) / 1000));
      const curMonth = monthSelect ? monthSelect.value : activeMonth;
      const summary = calculateMonthSummary(curMonth, currentRawDaily, currentConfig, elapsed);
      renderCards(summary);
      updateRelativeTimeDisplay();
    }, 1000);
  }

  function updateRelativeTimeDisplay() {
    if (!lastUpdatedEl) return;
    if (!lastFetchTimestamp) {
      lastUpdatedEl.textContent = 'Not synced yet';
      return;
    }

    const diffSecs = Math.floor((Date.now() - lastFetchTimestamp) / 1000);
    if (diffSecs < 5) {
      lastUpdatedEl.textContent = 'Synced just now';
    } else if (diffSecs < 60) {
      lastUpdatedEl.textContent = `Synced ${diffSecs}s ago`;
    } else {
      const mins = Math.floor(diffSecs / 60);
      lastUpdatedEl.textContent = `Synced ${mins}m ago`;
    }
  }

  function setSyncState(state, label) {
    if (!syncStatusEl) return;
    if (syncTextEl) syncTextEl.textContent = label;
    syncStatusEl.className = `status-badge ${state}`;
    if (liveDotEl) {
      liveDotEl.style.display = state === 'success' ? 'inline-block' : 'none';
    }
    if (liveIndicatorTag) {
      liveIndicatorTag.style.display = state === 'success' ? 'inline-block' : 'none';
    }
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

    // ── 1. TODAY HERO CARD ──
    const todayActualEl = document.getElementById('val-today-work-actual');
    const todayReqEl = document.getElementById('val-today-work-req');
    const todayPctEl = document.getElementById('val-today-pct');
    const todayBarEl = document.getElementById('val-today-progress-bar');
    const todayIndEl = document.getElementById('ind-today-work');
    const todayWorkDiffEl = document.getElementById('val-today-work-diff');
    const todayBreakDiffEl = document.getElementById('val-today-break-diff');
    const todayTotalActualEl = document.getElementById('val-today-total-actual');

    if (todayActualEl) todayActualEl.textContent = today.formattedActualWork;
    if (todayReqEl) todayReqEl.textContent = today.formattedRequiredWork;

    // Calculate percentage
    const todayPct = today.requiredWorkSecs > 0
      ? Math.min(100, Math.round((today.actualWorkSecs / today.requiredWorkSecs) * 100))
      : (today.actualWorkSecs > 0 ? 100 : 0);

    if (todayPctEl) todayPctEl.textContent = `${todayPct}%`;
    if (todayBarEl) {
      todayBarEl.style.width = `${todayPct}%`;
      todayBarEl.className = `progress-bar-fill ${today.workStatus === 'green' ? 'success' : 'accent'}`;
    }

    if (todayIndEl) {
      todayIndEl.textContent = today.workStatus === 'green' ? (todayPct >= 100 ? 'Target Met' : 'On Track') : 'Pending';
      todayIndEl.className = `status-indicator ${today.workStatus}`;
    }

    if (todayWorkDiffEl) {
      todayWorkDiffEl.textContent = today.formattedWorkDiff;
      todayWorkDiffEl.className = `sub-stat-val tabular diff ${today.workStatus}`;
    }
    if (todayBreakDiffEl) {
      todayBreakDiffEl.textContent = today.formattedBreakDiff;
      todayBreakDiffEl.className = `sub-stat-val tabular diff ${today.breakStatus}`;
    }
    if (todayTotalActualEl) {
      todayTotalActualEl.textContent = today.formattedActualTotal;
    }

    // ── 2. TODAY BREAK & TOTAL DETAIL CARDS ──
    const todayBreakActualEl = document.getElementById('val-today-break-actual');
    const todayBreakReqEl = document.getElementById('val-today-break-req');
    const todayBreakDiffSubEl = document.getElementById('val-today-break-diff-sub');
    const todayBreakIndEl = document.getElementById('ind-today-break');

    if (todayBreakActualEl) todayBreakActualEl.textContent = today.formattedActualBreak;
    if (todayBreakReqEl) todayBreakReqEl.textContent = today.formattedAllowedBreak;
    if (todayBreakDiffSubEl) {
      todayBreakDiffSubEl.textContent = today.formattedBreakDiff;
      todayBreakDiffSubEl.className = `m-val diff tabular ${today.breakStatus}`;
    }
    if (todayBreakIndEl) {
      todayBreakIndEl.textContent = today.breakStatus === 'green' ? 'In Hand' : 'Over';
      todayBreakIndEl.className = `status-indicator ${today.breakStatus}`;
    }

    const todayTotalSubActualEl = document.getElementById('val-today-total-sub-actual');
    const todayTotalReqEl = document.getElementById('val-today-total-req');
    const todayTotalDiffEl = document.getElementById('val-today-total-diff');
    const todayTotalIndEl = document.getElementById('ind-today-total');

    if (todayTotalSubActualEl) todayTotalSubActualEl.textContent = today.formattedActualTotal;
    if (todayTotalReqEl) todayTotalReqEl.textContent = today.formattedRequiredTotal;
    if (todayTotalDiffEl) {
      todayTotalDiffEl.textContent = today.formattedTotalDiff;
      todayTotalDiffEl.className = `m-val diff tabular ${today.totalStatus}`;
    }
    if (todayTotalIndEl) {
      todayTotalIndEl.textContent = today.totalStatus === 'green' ? 'OK' : 'Lag';
      todayTotalIndEl.className = `status-indicator ${today.totalStatus}`;
    }

    // ── 3. MONTHLY HERO CARD ──
    const monthActualEl = document.getElementById('val-month-work-actual');
    const monthReqEl = document.getElementById('val-month-work-req');
    const monthPctEl = document.getElementById('val-month-pct');
    const monthBarEl = document.getElementById('val-month-progress-bar');
    const monthIndEl = document.getElementById('ind-month-work');
    const monthWorkDiffEl = document.getElementById('val-month-work-diff');
    const monthBreakDiffEl = document.getElementById('val-month-break-diff');
    const monthTotalActualEl = document.getElementById('val-month-total-actual');

    if (monthActualEl) monthActualEl.textContent = summary.formattedMonthActualWork;
    if (monthReqEl) monthReqEl.textContent = summary.formattedMonthRequiredWork;

    const monthPct = summary.monthRequiredWorkSecs > 0
      ? Math.min(100, Math.round((summary.monthActualWorkSecs / summary.monthRequiredWorkSecs) * 100))
      : 0;

    if (monthPctEl) monthPctEl.textContent = `${monthPct}%`;
    if (monthBarEl) {
      monthBarEl.style.width = `${monthPct}%`;
      monthBarEl.className = `progress-bar-fill ${summary.monthWorkStatus === 'green' ? 'success' : 'accent'}`;
    }

    if (monthIndEl) {
      monthIndEl.textContent = summary.monthWorkStatus === 'green' ? 'On Track' : 'Behind';
      monthIndEl.className = `status-indicator ${summary.monthWorkStatus}`;
    }

    if (monthWorkDiffEl) {
      monthWorkDiffEl.textContent = summary.formattedMonthWorkDiff;
      monthWorkDiffEl.className = `sub-stat-val tabular diff ${summary.monthWorkStatus}`;
    }
    if (monthBreakDiffEl) {
      monthBreakDiffEl.textContent = summary.formattedMonthBreakDiff;
      monthBreakDiffEl.className = `sub-stat-val tabular diff ${summary.monthBreakStatus}`;
    }
    if (monthTotalActualEl) {
      monthTotalActualEl.textContent = summary.formattedMonthActualTotal;
    }

    // ── 4. MONTHLY BREAK & TOTAL DETAIL CARDS ──
    const monthBreakActualEl = document.getElementById('val-month-break-actual');
    const monthBreakReqEl = document.getElementById('val-month-break-req');
    const monthBreakDiffSubEl = document.getElementById('val-month-break-diff-sub');
    const monthBreakIndEl = document.getElementById('ind-month-break');

    if (monthBreakActualEl) monthBreakActualEl.textContent = summary.formattedMonthActualBreak;
    if (monthBreakReqEl) monthBreakReqEl.textContent = summary.formattedMonthAllowedBreak;
    if (monthBreakDiffSubEl) {
      monthBreakDiffSubEl.textContent = summary.formattedMonthBreakDiff;
      monthBreakDiffSubEl.className = `m-val diff tabular ${summary.monthBreakStatus}`;
    }
    if (monthBreakIndEl) {
      monthBreakIndEl.textContent = summary.monthBreakStatus === 'green' ? 'In Hand' : 'Over';
      monthBreakIndEl.className = `status-indicator ${summary.monthBreakStatus}`;
    }

    const monthTotalSubActualEl = document.getElementById('val-month-total-sub-actual');
    const monthTotalReqEl = document.getElementById('val-month-total-req');
    const monthTotalDiffEl = document.getElementById('val-month-total-diff');
    const monthTotalIndEl = document.getElementById('ind-month-total');

    if (monthTotalSubActualEl) monthTotalSubActualEl.textContent = summary.formattedMonthActualTotal;
    if (monthTotalReqEl) monthTotalReqEl.textContent = summary.formattedMonthRequiredTotal;
    if (monthTotalDiffEl) {
      monthTotalDiffEl.textContent = summary.formattedMonthTotalDiff;
      monthTotalDiffEl.className = `m-val diff tabular ${summary.monthTotalStatus}`;
    }
    if (monthTotalIndEl) {
      monthTotalIndEl.textContent = summary.monthTotalStatus === 'green' ? 'OK' : 'Lag';
      monthTotalIndEl.className = `status-indicator ${summary.monthTotalStatus}`;
    }
  }
});
