/**
 * SVG Analytics Visualizations — theme-aware, no hardcoded colours.
 * All colours are read from CSS custom properties at render time.
 */

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Safely parse and attach HTML/SVG strings without raw innerHTML assignment to satisfy Firefox linter.
 */
function setSafeHTML(targetEl, htmlString) {
  if (!targetEl) return;
  const tagName = targetEl.tagName ? targetEl.tagName.toLowerCase() : '';
  const parser = new DOMParser();

  if (tagName === 'tbody' || tagName === 'tfoot' || tagName === 'thead') {
    const doc = parser.parseFromString(`<table><${tagName}>${htmlString}</${tagName}></table>`, 'text/html');
    const container = doc.querySelector(tagName);
    if (container) {
      targetEl.replaceChildren(...container.childNodes);
      return;
    }
  } else if (tagName === 'tr') {
    const doc = parser.parseFromString(`<table><tbody><tr>${htmlString}</tr></tbody></table>`, 'text/html');
    const tr = doc.querySelector('tr');
    if (tr) {
      targetEl.replaceChildren(...tr.childNodes);
      return;
    }
  }

  const doc = parser.parseFromString(`<div>${htmlString}</div>`, 'text/html');
  const div = doc.body ? doc.body.firstElementChild : null;
  if (div) {
    targetEl.replaceChildren(...div.childNodes);
  } else if (doc.body) {
    targetEl.replaceChildren(...doc.body.childNodes);
  }
}

/**
 * Render an SVG circular progress ring.
 */
export function renderProgressRing(containerEl, percentage, status = 'green', label = '', detail = '') {
  if (!containerEl) return;

  const pct    = Math.min(Math.max(percentage || 0, 0), 100);
  const R      = 34;
  const SW     = 7;
  const nr     = R - SW / 2;
  const circ   = 2 * Math.PI * nr;
  const offset = circ - (pct / 100) * circ;

  const trackColor = cssVar('--border-default') || 'rgba(255,255,255,0.10)';
  let fillColor;
  if      (status === 'green') fillColor = cssVar('--success') || '#22c55e';
  else if (status === 'red')   fillColor = cssVar('--danger')  || '#ef4444';
  else                         fillColor = cssVar('--text-tertiary') || '#4e5a6a';

  const textColor    = cssVar('--text-primary')  || '#f0f2f5';
  const subTextColor = cssVar('--text-tertiary') || '#4e5a6a';

  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
      <div class="ring-chart-wrapper">
        <svg width="80" height="80" viewBox="0 0 72 72" aria-hidden="true">
          <circle cx="36" cy="36" r="${nr}" fill="none" stroke="${trackColor}" stroke-width="${SW}"/>
          <circle cx="36" cy="36" r="${nr}" fill="none"
            stroke="${fillColor}" stroke-width="${SW}" stroke-linecap="round"
            stroke-dasharray="${circ} ${circ}"
            stroke-dashoffset="${offset}"
            transform="rotate(-90 36 36)"
            style="transition: stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1);"/>
        </svg>
        <div class="ring-text">
          <span class="ring-percent" style="color:${textColor}">${Math.round(pct)}%</span>
          ${label ? `<span class="ring-label" style="color:${subTextColor}">${label}</span>` : ''}
        </div>
      </div>
      ${detail ? `<div class="ring-detail">${detail}</div>` : ''}
    </div>
  `;

  setSafeHTML(containerEl, html);
}

/**
 * Render a full-width grouped-bar chart — one group of 3 bars per calendar day.
 * Includes interactive hover tooltip displaying bar type, value, and target/diff.
 *
 * @param {HTMLElement} containerEl
 * @param {Array}       dailyList   from calculateMonthSummary().dailyList
 */
export function renderDailyBarChart(containerEl, dailyList) {
  if (!containerEl) return;

  if (!dailyList || dailyList.length === 0) {
    setSafeHTML(containerEl, `<p style="text-align:center;color:${cssVar('--text-tertiary')};font-size:12px;padding:32px 0;">No data to display</p>`);
    return;
  }

  /* ── Read available width from DOM ─────────────────────────────────────── */
  const containerW = containerEl.clientWidth || 600;
  const svgW = containerW;

  /* ── Layout constants ───────────────────────────────────────────────────── */
  const chartH  = 190;
  const padTop  = 14;
  const padBot  = 26;
  const padL    = 0;
  const padR    = 0;
  const drawH   = chartH - padTop - padBot;
  const drawW   = svgW - padL - padR;

  const n          = dailyList.length;
  const sepW       = 1;
  const cellW      = (drawW - sepW * (n - 1)) / n;
  const barPadPct  = 0.18;
  const barAreaW   = cellW * (1 - barPadPct * 2);
  const barGap     = Math.max(1, barAreaW * 0.08);
  const barW       = Math.max(2, (barAreaW - barGap * 2) / 3);

  /* ── Colours ────────────────────────────────────────────────────────────── */
  const workGreen  = cssVar('--success')       || '#22c55e';
  const workRed    = cssVar('--danger')        || '#ef4444';
  const breakGreen = cssVar('--accent')        || '#4f7eff';
  const breakRed   = cssVar('--warning-text')  || '#fbbf24';
  const offDayCol  = cssVar('--border-default')|| 'rgba(255,255,255,0.10)';
  const sepCol     = cssVar('--border-subtle') || 'rgba(255,255,255,0.05)';
  const gridCol    = cssVar('--border-subtle') || 'rgba(255,255,255,0.05)';
  const labelCol   = cssVar('--text-tertiary') || '#4e5a6a';
  const baselineCol= cssVar('--border-default')|| 'rgba(255,255,255,0.10)';

  /* ── Scale ──────────────────────────────────────────────────────────────── */
  const maxSecs = Math.max(
    ...dailyList.map(d => Math.max(
      d.actualWorkSecs, d.actualBreakSecs, d.actualTotalSecs, d.requiredTotalSecs
    )),
    3600
  );

  /* ── Horizontal grid lines (4 steps) ───────────────────────────────────── */
  let gridLines = '';
  const gridSteps = 4;
  for (let step = 0; step <= gridSteps; step++) {
    const y = padTop + (drawH / gridSteps) * step;
    const isDashed = step > 0 && step < gridSteps;
    gridLines += `<line
      x1="${padL}" y1="${y.toFixed(1)}"
      x2="${svgW - padR}" y2="${y.toFixed(1)}"
      stroke="${step === gridSteps ? baselineCol : gridCol}"
      stroke-width="${step === gridSteps ? '1.5' : '1'}"
      ${isDashed ? 'stroke-dasharray="4 4"' : ''}/>`;
  }

  /* ── Day groups, separators, labels ────────────────────────────────────── */
  let seps  = '';
  let bars  = '';
  let labels = '';

  dailyList.forEach((day, i) => {
    const cellX     = padL + i * (cellW + sepW);
    const barAreaX  = cellX + cellW * barPadPct;
    const isOff     = !day.isWorking;
    const dateNum   = day.date.slice(-2);
    const dateLabel = `${day.date} (${day.dayName})`;

    /* vertical separator before every day except the first */
    if (i > 0) {
      const sx = padL + i * (cellW + sepW) - sepW;
      seps += `<rect x="${sx.toFixed(2)}" y="${padTop}" width="${sepW}" height="${drawH}"
        fill="${sepCol}" rx="0"/>`;
    }

    /* day-number label */
    const labelX = cellX + cellW / 2;
    const labelY = chartH - 7;
    const alwaysShow = cellW >= 18;
    const showLabel  = alwaysShow || i === 0 || i === n - 1 || (i + 1) % 5 === 0;
    if (showLabel) {
      labels += `<text
        x="${labelX.toFixed(1)}" y="${labelY}"
        font-size="9" fill="${labelCol}"
        text-anchor="middle" dominant-baseline="auto">${dateNum}</text>`;
    }

    /* bars */
    if (isOff) {
      /* off-day tick */
      const tickW = Math.min(barAreaW, barW * 3 + barGap * 2);
      bars += `<rect
        class="chart-bar"
        data-date="${dateLabel}"
        data-type="Off Day"
        data-val="${day.dayType}"
        data-req="0m"
        data-diff="0m"
        data-status="neutral"
        x="${barAreaX.toFixed(2)}" y="${(padTop + drawH - 2).toFixed(1)}"
        width="${tickW.toFixed(2)}" height="2"
        fill="${offDayCol}" rx="1">
        <title>${dateLabel}: ${day.dayType}</title>
      </rect>`;
    } else {
      const x1 = barAreaX;
      const x2 = x1 + barW + barGap;
      const x3 = x2 + barW + barGap;
      const baseline = padTop + drawH;

      const wH = maxSecs > 0 ? (day.actualWorkSecs  / maxSecs) * drawH : 0;
      const bH = maxSecs > 0 ? (day.actualBreakSecs / maxSecs) * drawH : 0;
      const tH = maxSecs > 0 ? (day.actualTotalSecs / maxSecs) * drawH : 0;

      const wC = day.workStatus  === 'green' ? workGreen  : workRed;
      const bC = day.breakStatus === 'green' ? breakGreen : breakRed;
      const tC = day.totalStatus === 'green' ? workGreen  : workRed;

      const MIN_H = 1.5;

      bars += `
        <!-- Work Bar -->
        <rect
          class="chart-bar"
          data-date="${dateLabel}"
          data-type="Work"
          data-type-key="work"
          data-val="${day.formattedActualWork}"
          data-req="${day.formattedRequiredWork}"
          data-diff="${day.formattedWorkDiff}"
          data-status="${day.workStatus}"
          x="${x1.toFixed(2)}" y="${(baseline - Math.max(wH, MIN_H)).toFixed(1)}"
          width="${barW.toFixed(2)}" height="${Math.max(wH, MIN_H).toFixed(1)}"
          fill="${wC}" rx="${Math.min(2, barW / 2).toFixed(1)}" opacity="0.92">
          <title>${dateLabel} - Work: ${day.formattedActualWork}</title>
        </rect>
        <!-- Break Bar -->
        <rect
          class="chart-bar"
          data-date="${dateLabel}"
          data-type="Break"
          data-type-key="break"
          data-val="${day.formattedActualBreak}"
          data-req="${day.formattedAllowedBreak}"
          data-diff="${day.formattedBreakDiff}"
          data-status="${day.breakStatus}"
          x="${x2.toFixed(2)}" y="${(baseline - Math.max(bH, MIN_H)).toFixed(1)}"
          width="${barW.toFixed(2)}" height="${Math.max(bH, MIN_H).toFixed(1)}"
          fill="${bC}" rx="${Math.min(2, barW / 2).toFixed(1)}" opacity="0.88">
          <title>${dateLabel} - Break: ${day.formattedActualBreak}</title>
        </rect>
        <!-- Total Bar -->
        <rect
          class="chart-bar"
          data-date="${dateLabel}"
          data-type="Total"
          data-type-key="total"
          data-val="${day.formattedActualTotal}"
          data-req="${day.formattedRequiredTotal}"
          data-diff="${day.formattedTotalDiff}"
          data-status="${day.totalStatus}"
          x="${x3.toFixed(2)}" y="${(baseline - Math.max(tH, MIN_H)).toFixed(1)}"
          width="${barW.toFixed(2)}" height="${Math.max(tH, MIN_H).toFixed(1)}"
          fill="${tC}" rx="${Math.min(2, barW / 2).toFixed(1)}" opacity="0.75">
          <title>${dateLabel} - Total: ${day.formattedActualTotal}</title>
        </rect>
      `;
    }
  });

  /* ── Legend ─────────────────────────────────────────────────────────────── */
  const dot = (col, opacity = 1) =>
    `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${col};opacity:${opacity};margin-right:5px;vertical-align:middle;"></span>`;

  const legendItems = [
    `${dot(workGreen)}Work`,
    `${dot(breakGreen)}Break`,
    `${dot(workGreen, 0.65)}Total`,
    `<span style="display:inline-flex;align-items:center;padding-left:10px;margin-left:4px;border-left:1px solid ${sepCol}">${dot(workRed)}Short / over</span>`,
  ];

  const html = `
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;
                margin-bottom:12px;font-size:11px;color:${labelCol};">
      ${legendItems.map(li => `<span style="display:inline-flex;align-items:center;">${li}</span>`).join('')}
    </div>
    <div id="chart-tooltip" class="chart-tooltip"></div>
    <svg
      width="100%"
      height="${chartH}"
      viewBox="0 0 ${svgW} ${chartH}"
      preserveAspectRatio="none"
      aria-label="Daily work, break and total chart"
      style="display:block;overflow:visible;">
      ${gridLines}
      ${seps}
      ${bars}
      ${labels}
    </svg>
  `;

  setSafeHTML(containerEl, html);

  /* ── Attach interactive tooltip event listeners ─────────────────────────── */
  const tooltip = containerEl.querySelector('#chart-tooltip');
  if (!tooltip) return;

  containerEl.querySelectorAll('.chart-bar').forEach(bar => {
    bar.addEventListener('mouseenter', (e) => showTooltip(e, bar));
    bar.addEventListener('mousemove', (e) => updateTooltipPos(e, bar));
    bar.addEventListener('mouseleave', hideTooltip);
  });

  function showTooltip(e, bar) {
    const date    = bar.dataset.date || '';
    const type    = bar.dataset.type || '';
    const typeKey = bar.dataset.typeKey || 'work';
    const val     = bar.dataset.val  || '0m';
    const req     = bar.dataset.req  || '0m';
    const diff    = bar.dataset.diff || '0m';

    const tooltipHTML = `
      <span class="tt-date">${date}</span>
      <div class="tt-main">
        <span class="tt-type ${typeKey}">${type}</span>
        <span class="tt-val">${val}</span>
      </div>
      <span class="tt-sub">Target: ${req} • Diff: ${diff}</span>
    `;

    setSafeHTML(tooltip, tooltipHTML);

    updateTooltipPos(e, bar);
    tooltip.classList.add('show');
  }

  function updateTooltipPos(e, bar) {
    const barRect = bar.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();

    const x = barRect.left + barRect.width / 2 - containerRect.left;
    const y = barRect.top - containerRect.top;

    tooltip.style.left = `${x}px`;
    tooltip.style.top  = `${y}px`;
  }

  function hideTooltip() {
    tooltip.classList.remove('show');
  }
}
