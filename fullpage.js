import { getSettings, saveSettings } from './js/storage.js';
import { fetchMonthlyTimesheets, fetchPersonHolidays } from './js/api.js';
import { calculateMonthSummary, getDaysInMonth, getDayName, isSaturdayWorking } from './js/calculator.js';
import { renderProgressRing, renderDailyBarChart } from './js/charts.js';
import { initTheme, applyTheme, getSavedTheme } from './js/theme.js';

function setSafeHTML(targetEl, htmlString) {
  if (!targetEl) return;
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  targetEl.replaceChildren(...doc.body.childNodes);
}

document.addEventListener('DOMContentLoaded', async () => {
  // ── Theme ──────────────────────────────────────────
  initTheme();

  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    const val = btn.dataset.themeVal;
    if (val === getSavedTheme()) btn.classList.add('active');
    else btn.classList.remove('active');

    btn.addEventListener('click', () => {
      applyTheme(val);
      document.querySelectorAll('.theme-toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.themeVal === val);
      });
    });
  });

  // DOM Element References
  const monthSelect = document.getElementById('dash-month-select');
  const refreshBtn = document.getElementById('dash-refresh-btn');
  const exportCsvBtn = document.getElementById('export-csv-btn');

  // Config Controls
  const workHoursInput = document.getElementById('cfg-work-hours');
  const breakHoursInput = document.getElementById('cfg-break-hours');
  const saveWorkConfigBtn = document.getElementById('save-work-config-btn');
  const dashNoticeBanner = document.getElementById('dash-notice-banner');

  const satModeSelect = document.getElementById('cfg-sat-mode');
  const refDateGroup = document.getElementById('ref-date-group');
  const refDateInput = document.getElementById('cfg-ref-date');
  const halfDayEnableCb = document.getElementById('cfg-half-day-enable');
  const halfDayControls = document.getElementById('half-day-controls');
  const satWorkHoursInput = document.getElementById('cfg-sat-work-hours');
  const satBreakHoursInput = document.getElementById('cfg-sat-break-hours');
  const saveSatConfigBtn = document.getElementById('save-sat-config-btn');

  // API & Preferences Controls
  const personIdInput = document.getElementById('cfg-person-id');
  const appVersionInput = document.getElementById('cfg-app-version');
  const periodModeSelect = document.getElementById('cfg-period-mode');
  const badgeMetricSelect = document.getElementById('cfg-badge-metric');
  const notifyTargetMetCb = document.getElementById('cfg-notify-target-met');
  const autoRefreshSessionCb = document.getElementById('cfg-auto-refresh-session');
  const saveApiConfigBtn = document.getElementById('save-api-config-btn');
  const printReportBtn = document.getElementById('print-report-btn');

  // Tables
  const holidayTbody = document.getElementById('holiday-tbody');
  const timeLogTbody = document.getElementById('time-log-tbody');
  const timeLogTfoot = document.getElementById('time-log-tfoot');

  // Modal Controls
  const holidayModal = document.getElementById('holiday-modal');
  const openAddHolidayBtn = document.getElementById('open-add-holiday-modal');
  const closeHolidayModalBtn = document.getElementById('close-holiday-modal');
  const cancelHolidayModalBtn = document.getElementById('cancel-holiday-modal-btn');
  const saveHolidayModalBtn = document.getElementById('save-holiday-modal-btn');
  const modalHolidayIdInput = document.getElementById('modal-holiday-id');
  const modalHolidayDateInput = document.getElementById('modal-holiday-date');
  const modalHolidayNameInput = document.getElementById('modal-holiday-name');

  // Global State
  let currentSummary = null;
  let currentSettings = null;
  let currentApiHolidays = [];
  let _chartResizeObserver = null;

  // Initialize Dashboard
  await initDashboard();

  async function initDashboard() {
    currentSettings = await getSettings();

    // Set form control values from storage
    const currentMonthStr = new Date().toISOString().slice(0, 7);
    monthSelect.value = currentSettings.selectedMonth || currentMonthStr;

    workHoursInput.value = currentSettings.targetWorkHours;
    breakHoursInput.value = currentSettings.targetBreakHours;

    // Weekday checkboxes
    const weekdays = currentSettings.workingWeekdays || ["Mon", "Tue", "Wed", "Thu", "Fri"];
    document.querySelectorAll('input[name="weekday"]').forEach(cb => {
      cb.checked = weekdays.includes(cb.value);
    });

    // Saturday configs
    satModeSelect.value = currentSettings.saturdayConfig || "every_off";
    toggleRefDateVisibility(satModeSelect.value);

    refDateInput.value = currentSettings.altSatReferenceDate || "";
    halfDayEnableCb.checked = !!currentSettings.halfDayEnabled;
    toggleHalfDayVisibility(halfDayEnableCb.checked);

    satWorkHoursInput.value = currentSettings.halfDayWorkHours || 4;
    satBreakHoursInput.value = currentSettings.halfDayBreakHours || 0.5;

    // API & Preference Configs
    if (personIdInput) {
      personIdInput.value = currentSettings.personId || currentSettings.autoPersonId || "";
    }
    if (appVersionInput) {
      appVersionInput.value = currentSettings.jibbleAppVersion || "2.81.3";
    }
    if (periodModeSelect) {
      periodModeSelect.value = currentSettings.periodMode || "month";
    }
    if (badgeMetricSelect) {
      badgeMetricSelect.value = currentSettings.badgeMetric || "total";
    }
    if (notifyTargetMetCb) {
      notifyTargetMetCb.checked = currentSettings.notifyTargetMet !== false;
    }
    if (autoRefreshSessionCb) {
      autoRefreshSessionCb.checked = currentSettings.autoRefreshSession !== false;
    }

    // Attach Event Listeners
    setupEventListeners();

    // Load and Render Data
    await refreshDashboardData();
  }

  function setupEventListeners() {
    monthSelect.addEventListener('change', async (e) => {
      const selectedMonth = e.target.value;
      await saveSettings({ selectedMonth });
      await refreshDashboardData();
    });

    refreshBtn.addEventListener('click', () => refreshDashboardData(true));
    exportCsvBtn.addEventListener('click', exportToCSV);
    if (printReportBtn) {
      printReportBtn.addEventListener('click', () => window.print());
    }

    satModeSelect.addEventListener('change', (e) => {
      toggleRefDateVisibility(e.target.value);
    });

    halfDayEnableCb.addEventListener('change', (e) => {
      toggleHalfDayVisibility(e.target.checked);
    });

    saveWorkConfigBtn.addEventListener('click', saveWorkConfigurations);
    saveSatConfigBtn.addEventListener('click', saveSaturdayConfigurations);
    if (saveApiConfigBtn) {
      saveApiConfigBtn.addEventListener('click', saveApiConfigurations);
    }

    // Modal listeners
    openAddHolidayBtn.addEventListener('click', () => openHolidayModal());
    closeHolidayModalBtn.addEventListener('click', closeHolidayModal);
    cancelHolidayModalBtn.addEventListener('click', closeHolidayModal);
    saveHolidayModalBtn.addEventListener('click', handleSaveHoliday);
  }

  function toggleRefDateVisibility(mode) {
    if (mode === 'ref_date') {
      refDateGroup.style.display = 'block';
    } else {
      refDateGroup.style.display = 'none';
    }
  }

  function toggleHalfDayVisibility(enabled) {
    if (enabled) {
      halfDayControls.style.display = 'flex';
    } else {
      halfDayControls.style.display = 'none';
    }
  }

  async function saveWorkConfigurations() {
    const workHours = parseFloat(workHoursInput.value) || 8;
    const breakHours = parseFloat(breakHoursInput.value) || 1;

    const selectedWeekdays = [];
    document.querySelectorAll('input[name="weekday"]:checked').forEach(cb => {
      selectedWeekdays.push(cb.value);
    });

    await saveSettings({
      targetWorkHours: workHours,
      targetBreakHours: breakHours,
      workingWeekdays: selectedWeekdays
    });

    showToast("Work configurations saved successfully!", "success");
    await refreshDashboardData();
  }

  async function saveSaturdayConfigurations() {
    const saturdayConfig = satModeSelect.value;
    const altSatReferenceDate = refDateInput.value;
    const halfDayEnabled = halfDayEnableCb.checked;
    const halfDayWorkHours = parseFloat(satWorkHoursInput.value) || 4;
    const halfDayBreakHours = parseFloat(satBreakHoursInput.value) || 0.5;

    await saveSettings({
      saturdayConfig,
      altSatReferenceDate,
      halfDayEnabled,
      halfDayWorkHours,
      halfDayBreakHours
    });

    showToast("Saturday schedule updated successfully!", "success");
    await refreshDashboardData();
  }

  async function saveApiConfigurations() {
    const personId = personIdInput.value.trim();
    const jibbleAppVersion = appVersionInput.value.trim() || "2.81.3";
    const periodMode = periodModeSelect ? periodModeSelect.value : "month";
    const badgeMetric = badgeMetricSelect ? badgeMetricSelect.value : "total";
    const notifyTargetMet = notifyTargetMetCb ? notifyTargetMetCb.checked : true;
    const autoRefreshSession = autoRefreshSessionCb ? autoRefreshSessionCb.checked : true;

    await saveSettings({
      personId,
      jibbleAppVersion,
      periodMode,
      badgeMetric,
      notifyTargetMet,
      autoRefreshSession
    });

    showToast("Preferences & API settings saved!", "success");
    await refreshDashboardData();
  }

  /**
   * Main Load & Render Data Loop
   */
  async function refreshDashboardData() {
    currentSettings = await getSettings();
    const yearMonth = monthSelect.value;

    const nowSecs = Math.floor(Date.now() / 1000);
    const tokenExpired = !currentSettings.cachedJibbleToken || (currentSettings.tokenExpiry && currentSettings.tokenExpiry <= nowSecs);

    if (tokenExpired) {
      showDashNotice("Jibble session expired. Please open web.jibble.io to log in and re-sync your session.");
    } else {
      showDashNotice(null);
    }

    // Fetch live timesheets & company holidays from Jibble API
    const [timesheetRes, holidaysRes] = await Promise.all([
      fetchMonthlyTimesheets(yearMonth, currentSettings.personId, currentSettings.jibbleAppVersion),
      fetchPersonHolidays(currentSettings.personId, currentSettings.jibbleAppVersion)
    ]);

    if (!timesheetRes.success) {
      showToast(timesheetRes.error || "Failed to fetch timesheet records.", "error");
      if (!tokenExpired) {
        showDashNotice(timesheetRes.error || "Failed to communicate with Jibble API.");
      }
    }

    currentApiHolidays = holidaysRes.success ? (holidaysRes.holidays || []) : [];

    const fullConfig = {
      ...currentSettings,
      apiHolidays: currentApiHolidays
    };

    currentSummary = calculateMonthSummary(yearMonth, timesheetRes.daily || [], fullConfig);

    renderKPIs(currentSummary);
    renderCharts(currentSummary);
    renderHolidaysTable(yearMonth);
    renderDailyLogTable(currentSummary);

    // Notify background script to update badge & check notifications
    if (extApi && extApi.runtime && extApi.runtime.sendMessage) {
      extApi.runtime.sendMessage({
        type: "UPDATE_BADGE_AND_NOTIFY",
        payload: {
          todayMetrics: currentSummary.todayMetrics,
          settings: currentSettings,
          tokenExpired
        }
      });
    }
  }

  function showDashNotice(message) {
    if (!dashNoticeBanner) return;
    if (!message) {
      dashNoticeBanner.classList.add('hidden');
      dashNoticeBanner.replaceChildren();
    } else {
      dashNoticeBanner.classList.remove('hidden');
      setSafeHTML(dashNoticeBanner, `
        <span>⚠️ ${message}</span>
        <button class="btn-sm btn-edit" id="open-jibble-tab-btn" style="margin:0; width:auto; white-space:nowrap;">Open Jibble</button>
      `);
      const btn = document.getElementById('open-jibble-tab-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          window.open('https://web.jibble.io', '_blank');
        });
      }
    }
  }

  /**
   * Render Top KPI Cards
   */
  function renderKPIs(summary) {
    // 1. Completion Percentage — based on Total (Work + Break)
    const targetTotalSecs = summary.monthRequiredTotalSecs;
    const actualTotalSecs = summary.monthActualTotalSecs;
    const completionPercent = targetTotalSecs > 0 ? (actualTotalSecs / targetTotalSecs) * 100 : 100;

    const ringContainer = document.getElementById('kpi-ring-container');
    renderProgressRing(
      ringContainer,
      completionPercent,
      summary.monthTotalStatus,
      "of target",
      `${summary.formattedMonthActualTotal} / ${summary.formattedMonthRequiredTotal}`
    );

    // 2. Work Target Balance
    document.getElementById('kpi-work-actual').textContent = summary.formattedMonthActualWork;
    document.getElementById('kpi-work-req').textContent = summary.formattedMonthRequiredWork;

    const workTag = document.getElementById('kpi-work-diff-tag');
    workTag.textContent = summary.formattedMonthWorkDiff;
    workTag.className = `kpi-tag ${summary.monthWorkStatus}`;

    // 3. Break Time Usage
    document.getElementById('kpi-break-actual').textContent = summary.formattedMonthActualBreak;
    document.getElementById('kpi-break-req').textContent = summary.formattedMonthAllowedBreak;

    const breakTag = document.getElementById('kpi-break-diff-tag');
    breakTag.textContent = summary.formattedMonthBreakDiff;
    breakTag.className = `kpi-tag ${summary.monthBreakStatus}`;

    // 4. Net Total Status
    document.getElementById('kpi-total-actual').textContent = summary.formattedMonthActualTotal;
    document.getElementById('kpi-total-req').textContent = summary.formattedMonthRequiredTotal;

    const totalTag = document.getElementById('kpi-total-diff-tag');
    totalTag.textContent = summary.formattedMonthTotalDiff;
    totalTag.className = `kpi-tag ${summary.monthTotalStatus}`;
  }

  /**
   * Render Visual Analytics Chart
   * Deferred to rAF so the container's clientWidth is available after layout.
   * A ResizeObserver keeps the chart full-width if the window is resized.
   */
  function renderCharts(summary) {
    const chartContainer = document.getElementById('daily-chart-container');
    if (!chartContainer) return;

    // Disconnect any previous observer before attaching a new one
    if (_chartResizeObserver) {
      _chartResizeObserver.disconnect();
      _chartResizeObserver = null;
    }

    const doRender = () => renderDailyBarChart(chartContainer, summary.dailyList);

    // rAF ensures the DOM has been painted and clientWidth is non-zero
    requestAnimationFrame(() => {
      doRender();

      // Re-render whenever the chart box changes width (e.g. sidebar open/close)
      _chartResizeObserver = new ResizeObserver(() => doRender());
      _chartResizeObserver.observe(chartContainer);
    });
  }

  /**
   * Render Off Days & Holidays Management Table
   */
  function renderHolidaysTable(yearMonth) {
    holidayTbody.innerHTML = "";

    const manualHolidays = currentSettings.manualHolidays || [];
    const monthManual = manualHolidays
      .filter(h => h.date && h.date.slice(0, 7) === yearMonth)
      .map(h => ({ ...h, badgeClass: 'manual', badgeText: 'Custom', isEditable: true }));

    const apiHolidays = currentApiHolidays || [];
    const monthApi = apiHolidays
      .filter(h => h.date && h.date.slice(0, 7) === yearMonth)
      .map(h => ({ ...h, badgeClass: 'holiday', badgeText: 'Company Holiday', isEditable: false }));

    const autoOffDays = generateAutoOffDays(yearMonth, currentSettings)
      .map(h => ({ ...h, badgeClass: 'auto', badgeText: 'Auto Weekend', isEditable: false }));

    // Merge and deduplicate by date
    const mapByDate = new Map();
    [...monthManual, ...monthApi, ...autoOffDays].forEach(item => {
      if (!mapByDate.has(item.date) || item.isEditable) {
        mapByDate.set(item.date, item);
      }
    });

    const combinedList = Array.from(mapByDate.values());
    combinedList.sort((a, b) => a.date.localeCompare(b.date));

    if (combinedList.length === 0) {
      setSafeHTML(holidayTbody, `
        <tr>
          <td colspan="5" class="empty-cell">No holidays or off-days scheduled for this month.</td>
        </tr>
      `);
      return;
    }

    combinedList.forEach(item => {
      const tr = document.createElement('tr');

      setSafeHTML(tr, `
        <td><strong>${item.date}</strong></td>
        <td>${getDayName(item.date)}</td>
        <td>${item.name}</td>
        <td><span class="badge ${item.badgeClass}">${item.badgeText}</span></td>
        <td>
          ${item.isEditable ? `
            <button class="btn-sm btn-edit" data-id="${item.id}">Edit</button>
            <button class="btn-sm btn-delete" data-id="${item.id}">Delete</button>
          ` : `<span class="text-muted">Managed by ${item.badgeText}</span>`}
        </td>
      `);

      holidayTbody.appendChild(tr);
    });

    // Attach edit/delete listeners
    holidayTbody.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.dataset.id;
        const holiday = manualHolidays.find(h => h.id === id);
        if (holiday) openHolidayModal(holiday);
      });
    });

    holidayTbody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        const updated = manualHolidays.filter(h => h.id !== id);
        await saveSettings({ manualHolidays: updated });
        showToast("Holiday deleted.", "info");
        await refreshDashboardData();
      });
    });
  }

  function generateAutoOffDays(yearMonth, config) {
    const [yearStr, monthStr] = yearMonth.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const daysInMonth = getDaysInMonth(year, month);
    const result = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dayPadding = String(d).padStart(2, "0");
      const dateStr = `${yearStr}-${monthStr}-${dayPadding}`;
      const dateObj = new Date(dateStr + "T00:00:00");
      const dayOfWeek = dateObj.getDay();

      if (dayOfWeek === 0) {
        result.push({
          date: dateStr,
          name: "Sunday Weekend",
          isAuto: true
        });
      } else if (dayOfWeek === 6) {
        const isWorking = isSaturdayWorking(dateStr, config.saturdayConfig, config.altSatReferenceDate);
        if (!isWorking) {
          result.push({
            date: dateStr,
            name: "Saturday Off",
            isAuto: true
          });
        }
      }
    }
    return result;
  }

  /**
   * Render Daily Log Table & Totals Row
   */
  function renderDailyLogTable(summary) {
    timeLogTbody.replaceChildren();

    summary.dailyList.forEach(day => {
      const tr = document.createElement('tr');
      if (!day.isWorking) {
        tr.className = "row-off-day";
      }

      setSafeHTML(tr, `
        <td><strong>${day.date}</strong></td>
        <td>${day.dayName}</td>
        <td><span class="day-type-pill ${day.dayType.toLowerCase().replace(/\s+/g, '-')}">${day.dayType}</span></td>

        <td>${day.formattedRequiredWork}</td>
        <td class="${day.workStatus}">${day.formattedActualWork}</td>
        <td class="diff ${day.workStatus}">${day.formattedWorkDiff}</td>

        <td>${day.formattedAllowedBreak}</td>
        <td class="${day.breakStatus}">${day.formattedActualBreak}</td>
        <td class="diff ${day.breakStatus}">${day.formattedBreakDiff}</td>

        <td>${day.formattedRequiredTotal}</td>
        <td class="${day.totalStatus}">${day.formattedActualTotal}</td>
        <td class="diff ${day.totalStatus}">${day.formattedTotalDiff}</td>
      `);

      timeLogTbody.appendChild(tr);
    });

    // Render Totals Row in tfoot
    setSafeHTML(timeLogTfoot, `
      <tr class="totals-row">
        <td colspan="3"><strong>TOTALS (${summary.totalDays} Days)</strong></td>
        <td><strong>${summary.formattedMonthRequiredWork}</strong></td>
        <td class="${summary.monthWorkStatus}"><strong>${summary.formattedMonthActualWork}</strong></td>
        <td class="diff ${summary.monthWorkStatus}"><strong>${summary.formattedMonthWorkDiff}</strong></td>

        <td><strong>${summary.formattedMonthAllowedBreak}</strong></td>
        <td class="${summary.monthBreakStatus}"><strong>${summary.formattedMonthActualBreak}</strong></td>
        <td class="diff ${summary.monthBreakStatus}"><strong>${summary.formattedMonthBreakDiff}</strong></td>

        <td><strong>${summary.formattedMonthRequiredTotal}</strong></td>
        <td class="${summary.monthTotalStatus}"><strong>${summary.formattedMonthActualTotal}</strong></td>
        <td class="diff ${summary.monthTotalStatus}"><strong>${summary.formattedMonthTotalDiff}</strong></td>
      </tr>
    `);
  }

  /**
   * CSV Export Implementation
   */
  function exportToCSV() {
    if (!currentSummary || !currentSummary.dailyList) {
      showToast("No data available to export.", "error");
      return;
    }

    const headers = [
      "Date",
      "Day",
      "Day Type",
      "Required Work",
      "Actual Work",
      "Work Difference",
      "Allowed Break",
      "Actual Break",
      "Break Difference",
      "Required Total",
      "Actual Total",
      "Total Difference"
    ];

    const rows = [];
    rows.push(headers.join(","));

    currentSummary.dailyList.forEach(day => {
      const row = [
        `"${day.date}"`,
        `"${day.dayName}"`,
        `"${day.dayType}"`,
        `"${day.formattedRequiredWork}"`,
        `"${day.formattedActualWork}"`,
        `"${day.formattedWorkDiff}"`,
        `"${day.formattedAllowedBreak}"`,
        `"${day.formattedActualBreak}"`,
        `"${day.formattedBreakDiff}"`,
        `"${day.formattedRequiredTotal}"`,
        `"${day.formattedActualTotal}"`,
        `"${day.formattedTotalDiff}"`
      ];
      rows.push(row.join(","));
    });

    // Add Totals Row
    const totalsRow = [
      `"TOTALS"`,
      `"Month"`,
      `"Summary"`,
      `"${currentSummary.formattedMonthRequiredWork}"`,
      `"${currentSummary.formattedMonthActualWork}"`,
      `"${currentSummary.formattedMonthWorkDiff}"`,
      `"${currentSummary.formattedMonthAllowedBreak}"`,
      `"${currentSummary.formattedMonthActualBreak}"`,
      `"${currentSummary.formattedMonthBreakDiff}"`,
      `"${currentSummary.formattedMonthRequiredTotal}"`,
      `"${currentSummary.formattedMonthActualTotal}"`,
      `"${currentSummary.formattedMonthTotalDiff}"`
    ];
    rows.push(totalsRow.join(","));

    const csvContent = "data:text/csv;charset=utf-8," + rows.join("\n");
    const encodedUri = encodeURI(csvContent);

    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Jibble_Timesheet_${currentSummary.yearMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Exported Jibble_Timesheet_${currentSummary.yearMonth}.csv`, "success");
  }

  /**
   * Modal Handlers
   */
  function openHolidayModal(holiday = null) {
    if (holiday) {
      document.getElementById('modal-title').textContent = "Edit Custom Holiday";
      modalHolidayIdInput.value = holiday.id;
      modalHolidayDateInput.value = holiday.date;
      modalHolidayNameInput.value = holiday.name;
    } else {
      document.getElementById('modal-title').textContent = "Add Custom Holiday";
      modalHolidayIdInput.value = "";
      modalHolidayDateInput.value = "";
      modalHolidayNameInput.value = "";
    }
    holidayModal.classList.remove('hidden');
  }

  function closeHolidayModal() {
    holidayModal.classList.add('hidden');
  }

  async function handleSaveHoliday() {
    const id = modalHolidayIdInput.value || "hol_" + Date.now();
    const date = modalHolidayDateInput.value;
    const name = modalHolidayNameInput.value.trim();

    if (!date || !name) {
      showToast("Please provide a valid date and holiday name.", "error");
      return;
    }

    const manualHolidays = currentSettings.manualHolidays || [];
    const existingIndex = manualHolidays.findIndex(h => h.id === id);

    if (existingIndex >= 0) {
      manualHolidays[existingIndex] = { id, date, name };
    } else {
      manualHolidays.push({ id, date, name });
    }

    await saveSettings({ manualHolidays });
    closeHolidayModal();
    showToast("Holiday saved successfully!", "success");
    await refreshDashboardData();
  }

  /**
   * Toast Notification Helper
   */
  function showToast(message, type = "info") {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => container.removeChild(toast), 300);
    }, 3000);
  }
});
