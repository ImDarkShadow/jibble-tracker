/**
 * Centralized Calculation Engine for Jibble Work Tracker Extension
 * Handles all time parsing, calendar logic, day-type classification,
 * target vs actual time metrics, differences, and statuses.
 */

/**
 * Parse ISO 8601 duration string (e.g., "PT8H10M38S", "PT45M", "P1DT2H") into total seconds
 */
export function parseISOduration(durationStr) {
  if (!durationStr) return { hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };
  if (typeof durationStr === 'number') {
    const hours = Math.floor(durationStr / 3600);
    const minutes = Math.floor((durationStr % 3600) / 60);
    const seconds = Math.round(durationStr % 60);
    return { hours, minutes, seconds, totalSeconds: durationStr };
  }

  const regex = /P(?:([0-9]+)D)?T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9.]+)S)?/;
  const matches = durationStr.match(regex);
  if (!matches) return { hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };

  const days = parseInt(matches[1]) || 0;
  const hours = parseInt(matches[2]) || 0;
  const minutes = parseInt(matches[3]) || 0;
  const seconds = parseFloat(matches[4]) || 0;

  const totalSeconds = Math.round(days * 86400 + hours * 3600 + minutes * 60 + seconds);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const finalHours = Math.floor(totalMinutes / 60);
  const finalMinutes = totalMinutes % 60;
  const finalSeconds = totalSeconds % 60;

  return {
    hours: finalHours,
    minutes: finalMinutes,
    seconds: finalSeconds,
    totalSeconds
  };
}

/**
 * Format total seconds into human-readable duration (e.g. "154h 30m", "-5h 30m", "+2h 15m", "45m")
 */
export function formatDuration(totalSeconds, options = {}) {
  const { showSign = false, zeroAsEmpty = false } = options;
  if (totalSeconds === 0 && zeroAsEmpty) return "0m";

  const isNegative = totalSeconds < 0;
  const absSecs = Math.abs(totalSeconds);

  const hours = Math.floor(absSecs / 3600);
  const minutes = Math.floor((absSecs % 3600) / 60);

  let sign = "";
  if (isNegative) {
    sign = "-";
  } else if (showSign && totalSeconds > 0) {
    sign = "+";
  }

  if (hours === 0 && minutes === 0) {
    return "0m";
  }

  if (hours === 0) {
    return `${sign}${minutes}m`;
  }

  if (minutes === 0) {
    return `${sign}${hours}h`;
  }

  return `${sign}${hours}h ${minutes}m`;
}

/**
 * Format total seconds into a compact 4-character string suitable for extension icon badges
 * (e.g. "8.8h", "12.5", "45m", "154h")
 */
export function formatBadgeText(totalSeconds) {
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

  return `${hours}h`;
}

/**
 * Get total days in a month (1-indexed month, handles leap years)
 */
export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Get short name of day of week (e.g. "Mon", "Tue", "Wed")
 */
export function getDayName(dateStr) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const d = new Date(dateStr + "T00:00:00");
  return days[d.getDay()];
}

/**
 * Get Nth Saturday of the month for a date (1st, 2nd, 3rd, 4th, or 5th Saturday)
 */
export function getNthSaturdayNumber(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  if (d.getDay() !== 6) return 0;
  const dayOfMonth = d.getDate();
  return Math.ceil(dayOfMonth / 7);
}

/**
 * Evaluate Saturday status based on Saturday config & reference date
 */
export function isSaturdayWorking(dateStr, saturdayConfig, altSatReferenceDate) {
  const d = new Date(dateStr + "T00:00:00");
  if (d.getDay() !== 6) return false;

  const nthSat = getNthSaturdayNumber(dateStr);

  switch (saturdayConfig) {
    case "every_working":
      return true;

    case "every_off":
      return false;

    case "alt_1_3_work":
      return nthSat === 1 || nthSat === 3;

    case "alt_2_4_work":
      return nthSat === 2 || nthSat === 4;

    case "alt_1_3_off":
      return !(nthSat === 1 || nthSat === 3);

    case "alt_2_4_off":
      return !(nthSat === 2 || nthSat === 4);

    case "ref_date":
      if (!altSatReferenceDate) return false;
      const current = new Date(dateStr + "T00:00:00");
      const ref = new Date(altSatReferenceDate + "T00:00:00");
      const diffTime = current.getTime() - ref.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays % 14 === 0;

    default:
      return false;
  }
}

/**
 * Resolve Day Type and required hours for a given date
 */
export function getDayType(dateStr, config) {
  const d = new Date(dateStr + "T00:00:00");
  const dayOfWeek = d.getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
  const dayName = getDayName(dateStr);

  // 1. Check if date is in manual or api holidays list
  const allHolidays = [
    ...(config.manualHolidays || []),
    ...(config.apiHolidays || [])
  ];

  const holiday = allHolidays.find(h => {
    const hDate = h.date ? h.date.slice(0, 10) : "";
    return hDate === dateStr;
  });

  if (holiday) {
    return {
      type: "Holiday",
      isWorking: false,
      requiredWorkSecs: 0,
      allowedBreakSecs: 0,
      holidayName: holiday.name || holiday.title || "Holiday"
    };
  }

  // 2. Sunday (Always Weekend)
  if (dayOfWeek === 0) {
    return {
      type: "Weekend",
      isWorking: false,
      requiredWorkSecs: 0,
      allowedBreakSecs: 0
    };
  }

  // 3. Saturday
  if (dayOfWeek === 6) {
    const isWorking = isSaturdayWorking(dateStr, config.saturdayConfig, config.altSatReferenceDate);
    const isAltConfig = ["alt_1_3_work", "alt_2_4_work", "alt_1_3_off", "alt_2_4_off", "ref_date"].includes(config.saturdayConfig);
    const dayTypeLabel = isAltConfig ? "Alternate Saturday" : (isWorking ? "Working Day" : "Weekend");

    if (!isWorking) {
      return {
        type: dayTypeLabel,
        isWorking: false,
        requiredWorkSecs: 0,
        allowedBreakSecs: 0
      };
    }

    // Working Saturday - check if half day
    if (config.halfDayEnabled) {
      return {
        type: "Half Day",
        isWorking: true,
        requiredWorkSecs: (config.halfDayWorkHours || 4) * 3600,
        allowedBreakSecs: (config.halfDayBreakHours || 0.5) * 3600
      };
    }

    return {
      type: dayTypeLabel,
      isWorking: true,
      requiredWorkSecs: (config.targetWorkHours || 8) * 3600,
      allowedBreakSecs: (config.targetBreakHours || 1) * 3600
    };
  }

  // 4. Weekday (Mon - Fri)
  const workingWeekdays = config.workingWeekdays || ["Mon", "Tue", "Wed", "Thu", "Fri"];
  if (workingWeekdays.includes(dayName)) {
    return {
      type: "Working Day",
      isWorking: true,
      requiredWorkSecs: (config.targetWorkHours || 8) * 3600,
      allowedBreakSecs: (config.targetBreakHours || 1) * 3600
    };
  } else {
    return {
      type: "Weekend",
      isWorking: false,
      requiredWorkSecs: 0,
      allowedBreakSecs: 0
    };
  }
}

/**
 * Compute metrics for a single calendar day
 */
export function calculateDayMetrics(dateStr, jibbleRecord, config) {
  const dayName = getDayName(dateStr);
  const dayTypeInfo = getDayType(dateStr, config);

  const actualWorkSecs = jibbleRecord ? parseISOduration(jibbleRecord.trackedHours?.worked).totalSeconds : 0;
  const actualBreakSecs = jibbleRecord ? parseISOduration(jibbleRecord.trackedHours?.totalBreakTime).totalSeconds : 0;

  const requiredWorkSecs = dayTypeInfo.requiredWorkSecs;
  const allowedBreakSecs = dayTypeInfo.allowedBreakSecs;

  const workDiffSecs = actualWorkSecs - requiredWorkSecs;
  const breakDiffSecs = actualBreakSecs - allowedBreakSecs;

  const requiredTotalSecs = requiredWorkSecs + allowedBreakSecs;
  const actualTotalSecs = actualWorkSecs + actualBreakSecs;
  const totalDiffSecs = actualTotalSecs - requiredTotalSecs;

  const workStatus = actualWorkSecs >= requiredWorkSecs ? "green" : "red";
  const breakStatus = actualBreakSecs <= allowedBreakSecs ? "green" : "red";
  const totalStatus = actualTotalSecs >= requiredTotalSecs ? "green" : "red";

  return {
    date: dateStr,
    dayName,
    dayType: dayTypeInfo.type,
    isWorking: dayTypeInfo.isWorking,
    holidayName: dayTypeInfo.holidayName || null,

    // Work
    requiredWorkSecs,
    actualWorkSecs,
    workDiffSecs,
    workStatus,
    formattedRequiredWork: formatDuration(requiredWorkSecs),
    formattedActualWork: formatDuration(actualWorkSecs),
    formattedWorkDiff: formatDuration(workDiffSecs, { showSign: true }),

    // Break
    allowedBreakSecs,
    actualBreakSecs,
    breakDiffSecs,
    breakStatus,
    formattedAllowedBreak: formatDuration(allowedBreakSecs),
    formattedActualBreak: formatDuration(actualBreakSecs),
    formattedBreakDiff: formatDuration(breakDiffSecs, { showSign: true }),

    // Total
    requiredTotalSecs,
    actualTotalSecs,
    totalDiffSecs,
    totalStatus,
    formattedRequiredTotal: formatDuration(requiredTotalSecs),
    formattedActualTotal: formatDuration(actualTotalSecs),
    formattedTotalDiff: formatDuration(totalDiffSecs, { showSign: true }),

    rawRecord: jibbleRecord || null
  };
}

/**
 * Compute full monthly summary for selected month
 */
export function calculateMonthSummary(yearMonthStr, jibbleDailyRecords = [], config = {}) {
  const [yearStr, monthStr] = yearMonthStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const totalDaysInMonth = getDaysInMonth(year, month);

  // Map Jibble daily records by date "YYYY-MM-DD"
  const recordsMap = {};
  (jibbleDailyRecords || []).forEach(record => {
    if (record && record.date) {
      recordsMap[record.date] = record;
    }
  });

  const dailyList = [];
  let monthRequiredWorkSecs = 0;
  let monthActualWorkSecs = 0;
  let monthAllowedBreakSecs = 0;
  let monthActualBreakSecs = 0;
  let monthRequiredTotalSecs = 0;
  let monthActualTotalSecs = 0;

  const todayStr = new Date().toISOString().slice(0, 10);
  let todayMetrics = null;

  for (let d = 1; d <= totalDaysInMonth; d++) {
    const dayPadding = String(d).padStart(2, "0");
    const dateStr = `${yearStr}-${monthStr}-${dayPadding}`;

    const jibbleRecord = recordsMap[dateStr] || null;
    const metrics = calculateDayMetrics(dateStr, jibbleRecord, config);

    dailyList.push(metrics);

    monthRequiredWorkSecs += metrics.requiredWorkSecs;
    monthActualWorkSecs += metrics.actualWorkSecs;
    monthAllowedBreakSecs += metrics.allowedBreakSecs;
    monthActualBreakSecs += metrics.actualBreakSecs;
    monthRequiredTotalSecs += metrics.requiredTotalSecs;
    monthActualTotalSecs += metrics.actualTotalSecs;

    if (dateStr === todayStr) {
      todayMetrics = metrics;
    }
  }

  if (!todayMetrics) {
    const jibbleTodayRecord = recordsMap[todayStr] || null;
    todayMetrics = calculateDayMetrics(todayStr, jibbleTodayRecord, config);
  }

  const monthWorkDiffSecs = monthActualWorkSecs - monthRequiredWorkSecs;
  const monthBreakDiffSecs = monthActualBreakSecs - monthAllowedBreakSecs;
  const monthTotalDiffSecs = monthActualTotalSecs - monthRequiredTotalSecs;

  const monthWorkStatus = monthActualWorkSecs >= monthRequiredWorkSecs ? "green" : "red";
  const monthBreakStatus = monthActualBreakSecs <= monthAllowedBreakSecs ? "green" : "red";
  const monthTotalStatus = monthActualTotalSecs >= monthRequiredTotalSecs ? "green" : "red";

  return {
    yearMonth: yearMonthStr,
    totalDays: totalDaysInMonth,
    dailyList,

    // Monthly Totals
    monthRequiredWorkSecs,
    monthActualWorkSecs,
    monthWorkDiffSecs,
    monthWorkStatus,
    formattedMonthRequiredWork: formatDuration(monthRequiredWorkSecs),
    formattedMonthActualWork: formatDuration(monthActualWorkSecs),
    formattedMonthWorkDiff: formatDuration(monthWorkDiffSecs, { showSign: true }),

    monthAllowedBreakSecs,
    monthActualBreakSecs,
    monthBreakDiffSecs,
    monthBreakStatus,
    formattedMonthAllowedBreak: formatDuration(monthAllowedBreakSecs),
    formattedMonthActualBreak: formatDuration(monthActualBreakSecs),
    formattedMonthBreakDiff: formatDuration(monthBreakDiffSecs, { showSign: true }),

    monthRequiredTotalSecs,
    monthActualTotalSecs,
    monthTotalDiffSecs,
    monthTotalStatus,
    formattedMonthRequiredTotal: formatDuration(monthRequiredTotalSecs),
    formattedMonthActualTotal: formatDuration(monthActualTotalSecs),
    formattedMonthTotalDiff: formatDuration(monthTotalDiffSecs, { showSign: true }),

    todayMetrics
  };
}
