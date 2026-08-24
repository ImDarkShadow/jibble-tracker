import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDayType,
  isSaturdayWorking,
  calculateDayMetrics,
  calculateMonthSummary,
  formatDuration,
  parseISOduration
} from '../src/js/calculator.js';
import { isVersionOlder } from '../src/js/storage.js';

describe('Calculator Engine Tests', () => {

  describe('Saturday Logic Tests', () => {
    const alt13WorkConfig = {
      saturdayConfig: 'alt_1_3_work',
      targetWorkHours: 8,
      targetBreakHours: 1
    };

    it('identifies 1st Saturday as Alternate Saturday (working)', () => {
      // 2026-08-01 is a Saturday (1st Saturday)
      const dayType = getDayType('2026-08-01', alt13WorkConfig);
      assert.strictEqual(dayType.isWorking, true);
      assert.strictEqual(dayType.type, 'Alternate Saturday');
      assert.strictEqual(dayType.requiredWorkSecs, 8 * 3600);
    });

    it('identifies 2nd Saturday as Weekend (off day)', () => {
      // 2026-08-08 is a Saturday (2nd Saturday)
      const dayType = getDayType('2026-08-08', alt13WorkConfig);
      assert.strictEqual(dayType.isWorking, false);
      assert.strictEqual(dayType.type, 'Weekend');
      assert.strictEqual(dayType.requiredWorkSecs, 0);
      assert.strictEqual(dayType.allowedBreakSecs, 0);
    });

    it('identifies 3rd Saturday as Alternate Saturday (working)', () => {
      // 2026-08-15 is a Saturday (3rd Saturday)
      const dayType = getDayType('2026-08-15', alt13WorkConfig);
      assert.strictEqual(dayType.isWorking, true);
      assert.strictEqual(dayType.type, 'Alternate Saturday');
    });

    it('identifies 4th Saturday as Weekend (off day)', () => {
      // 2026-08-22 is a Saturday (4th Saturday)
      const dayType = getDayType('2026-08-22', alt13WorkConfig);
      assert.strictEqual(dayType.isWorking, false);
      assert.strictEqual(dayType.type, 'Weekend');
    });

    it('supports half-day Saturday when working', () => {
      const halfDayConfig = {
        ...alt13WorkConfig,
        halfDayEnabled: true,
        halfDayWorkHours: 4,
        halfDayBreakHours: 0.5
      };
      const dayType = getDayType('2026-08-01', halfDayConfig);
      assert.strictEqual(dayType.isWorking, true);
      assert.strictEqual(dayType.type, 'Half Day');
      assert.strictEqual(dayType.requiredWorkSecs, 4 * 3600);
      assert.strictEqual(dayType.allowedBreakSecs, 1800);
    });
  });

  describe('Break in Hand Sign (+) Tests', () => {
    const config = {
      targetWorkHours: 8,
      targetBreakHours: 1,
      workingWeekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    };

    it('shows positive sign (+) when actual break is less than allowed (break in hand)', () => {
      // Monday with 20m break taken out of 1h (60m) allowed -> 40m remaining in hand
      const record = {
        date: '2026-08-24',
        trackedHours: {
          worked: 'PT8H',
          totalBreakTime: 'PT20M'
        }
      };
      const metrics = calculateDayMetrics('2026-08-24', record, config);
      assert.strictEqual(metrics.allowedBreakSecs, 3600);
      assert.strictEqual(metrics.actualBreakSecs, 1200);
      assert.strictEqual(metrics.breakDiffSecs, 2400); // 40m
      assert.strictEqual(metrics.formattedBreakDiff, '+40m');
      assert.strictEqual(metrics.breakStatus, 'green');
    });

    it('shows negative sign (-) when actual break exceeds allowed allowance', () => {
      // Monday with 1h 20m break taken out of 1h allowed -> -20m overbreak
      const record = {
        date: '2026-08-24',
        trackedHours: {
          worked: 'PT8H',
          totalBreakTime: 'PT1H20M'
        }
      };
      const metrics = calculateDayMetrics('2026-08-24', record, config);
      assert.strictEqual(metrics.breakDiffSecs, -1200); // -20m
      assert.strictEqual(metrics.formattedBreakDiff, '-20m');
      assert.strictEqual(metrics.breakStatus, 'red');
    });

    it('shows 0m when actual break exactly equals allowed allowance', () => {
      const record = {
        date: '2026-08-24',
        trackedHours: {
          worked: 'PT8H',
          totalBreakTime: 'PT1H'
        }
      };
      const metrics = calculateDayMetrics('2026-08-24', record, config);
      assert.strictEqual(metrics.breakDiffSecs, 0);
      assert.strictEqual(metrics.formattedBreakDiff, '0m');
      assert.strictEqual(metrics.breakStatus, 'green');
    });
  });

  describe('Live Elapsed Time Tracking Tests', () => {
    const config = {
      targetWorkHours: 8,
      targetBreakHours: 1,
      workingWeekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    };

    it('adds live elapsed seconds from system time to today actual work time', () => {
      const record = {
        date: '2026-08-24',
        trackedHours: {
          worked: 'PT5H',
          totalBreakTime: 'PT30M'
        }
      };
      // Add 15 minutes (900 seconds) of live elapsed time
      const metrics = calculateDayMetrics('2026-08-24', record, config, 900);
      assert.strictEqual(metrics.actualWorkSecs, 5 * 3600 + 900);
      assert.strictEqual(metrics.formattedActualWork, '5h 15m');
      assert.strictEqual(metrics.actualTotalSecs, 5 * 3600 + 900 + 1800);
      assert.strictEqual(metrics.formattedActualTotal, '5h 45m');
    });
  });

  describe('ISO Duration Parser Tests', () => {
    it('parses standard ISO 8601 durations correctly', () => {
      assert.strictEqual(parseISOduration('PT8H30M15S').totalSeconds, 8 * 3600 + 30 * 60 + 15);
      assert.strictEqual(parseISOduration('PT45M').totalSeconds, 45 * 60);
      assert.strictEqual(parseISOduration('P1DT2H').totalSeconds, 86400 + 2 * 3600);
      assert.strictEqual(parseISOduration(null).totalSeconds, 0);
    });
  });

  describe('Month Navigation Helper Tests', () => {
    function adjustMonth(yearMonthStr, delta) {
      let [year, month] = yearMonthStr.split('-').map(Number);
      month += delta;
      while (month < 1) {
        month += 12;
        year -= 1;
      }
      while (month > 12) {
        month -= 12;
        year += 1;
      }
      return `${year}-${String(month).padStart(2, '0')}`;
    }

    it('decrements exactly 1 month backwards', () => {
      assert.strictEqual(adjustMonth('2026-08', -1), '2026-07');
      assert.strictEqual(adjustMonth('2026-02', -1), '2026-01');
    });

    it('increments exactly 1 month forwards', () => {
      assert.strictEqual(adjustMonth('2026-08', 1), '2026-09');
      assert.strictEqual(adjustMonth('2026-11', 1), '2026-12');
    });

    it('handles year boundary rollover seamlessly', () => {
      assert.strictEqual(adjustMonth('2026-01', -1), '2025-12');
      assert.strictEqual(adjustMonth('2026-12', 1), '2027-01');
    });
  });

  describe('Notification Target Trigger Tests', () => {
    function evaluateTargetMet(todayMetrics, notifyMetric) {
      if (notifyMetric === "total") {
        return todayMetrics.actualTotalSecs >= todayMetrics.requiredTotalSecs && todayMetrics.requiredTotalSecs > 0;
      }
      return todayMetrics.actualWorkSecs >= todayMetrics.requiredWorkSecs && todayMetrics.requiredWorkSecs > 0;
    }

    it('evaluates Work Time Only target correctly', () => {
      const todayMetrics = {
        requiredWorkSecs: 8 * 3600,
        actualWorkSecs: 8 * 3600,
        requiredTotalSecs: 9 * 3600,
        actualTotalSecs: 8.5 * 3600 // 8h work + 30m break < 9h total
      };

      // When notifyMetric is "work", target is reached!
      assert.strictEqual(evaluateTargetMet(todayMetrics, 'work'), true);
      // When notifyMetric is "total", target is NOT reached yet (8.5h < 9h)
      assert.strictEqual(evaluateTargetMet(todayMetrics, 'total'), false);
    });

    it('evaluates Total Time (Work + Break) target correctly', () => {
      const todayMetrics = {
        requiredWorkSecs: 8 * 3600,
        actualWorkSecs: 7.5 * 3600, // 7.5h work < 8h work
        requiredTotalSecs: 9 * 3600,
        actualTotalSecs: 9 * 3600   // 7.5h work + 1.5h break = 9h total
      };

      // When notifyMetric is "work", work target not met yet
      assert.strictEqual(evaluateTargetMet(todayMetrics, 'work'), false);
      // When notifyMetric is "total", total target is met
      assert.strictEqual(evaluateTargetMet(todayMetrics, 'total'), true);
    });
  });

  describe('Version Auto-Upgrade Helper Tests', () => {
    it('identifies older minor versions (2.81.3 vs 2.82.1)', () => {
      assert.strictEqual(isVersionOlder('2.81.3', '2.82.1'), true);
    });

    it('identifies older patch versions (2.82.0 vs 2.82.1)', () => {
      assert.strictEqual(isVersionOlder('2.82.0', '2.82.1'), true);
    });

    it('preserves same or newer versions (2.82.1 / 2.83.0 vs 2.82.1)', () => {
      assert.strictEqual(isVersionOlder('2.82.1', '2.82.1'), false);
      assert.strictEqual(isVersionOlder('2.83.0', '2.82.1'), false);
    });

    it('handles missing or empty versions', () => {
      assert.strictEqual(isVersionOlder('', '2.82.1'), true);
      assert.strictEqual(isVersionOlder(null, '2.82.1'), true);
    });
  });
});
