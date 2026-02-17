/* ═══════════════════════════════════════════════════════════
   GRIST GANTT CHART - Enhanced Modular Version
   Features: Dependencies, Multiple Zoom Levels, Progress Bars,
   Today Line, Weekend Highlighting, Status Coloring
   ═══════════════════════════════════════════════════════════ */

/* global grist */

// ── DOM ELEMENTS ──
const statusEl = document.getElementById("status");
const configBanner = document.getElementById("config-banner");
const configMsg = document.getElementById("config-msg");
const projectFilterEl = document.getElementById("projectFilter");
const taskListEl = document.getElementById("task-list");
const chartScrollEl = document.getElementById("chart-scroll");
const ganttGridEl = document.getElementById("gantt-grid");
const monthLabelsEl = document.getElementById("month-labels");
const dayLabelsEl = document.getElementById("day-labels");
const emptyStateEl = document.getElementById("empty-state");
const legendEl = document.getElementById("legend");
const tooltipEl = document.getElementById("tooltip");
const dependencyArrowsEl = document.getElementById("dependency-arrows");
const modalAddTask = document.getElementById("modal-add-task");
const btnAddTask = document.getElementById("btn-add-task");
const btnCloseModal = document.getElementById("btn-close-modal");
const btnCancelTask = document.getElementById("btn-cancel-task");
const formAddTask = document.getElementById("form-add-task");

// ── TASK DETAILS PANEL ──
const taskDetailsPanel = document.getElementById("task-details-panel");
const btnCloseDetails = document.getElementById("btn-close-details");
const taskDetailsForm = document.getElementById("task-details-form");
const btnDeleteTask = document.getElementById("btn-delete-task");
let currentEditingTask = null;

// ── ZOOM BUTTONS ──
const btnDay = document.getElementById("btn-day");
const btnWeek = document.getElementById("btn-week");
const btnMonth = document.getElementById("btn-month");
const btnTrim = document.getElementById("btn-trim");
const btnYearly = document.getElementById("btn-yearly");
const btnToday = document.getElementById("btn-today");
const btnStatusFilter = document.getElementById("btn-status-filter");
const statusFilterContent = document.getElementById("status-filter-content");
const statusCheckboxesEl = document.getElementById("status-checkboxes");

// ── STATE ──
let records = [];
let dependencies = [];
let columnMap = null;
let currentZoom = 'Month'; // Day, Week, Month, Trim, Yearly
let selectedId = null;
let chartStart = null;
let chartEnd = null;
let selectedStatuses = new Set(); // Empty set means show all

// ── CONFIG ──
const STATUS_COLORS = {
  'Not Started': '#4a4f7a',
  'In Progress': '#6c63ff',
  'Completed': '#22d3a3',
  'On Hold': '#ff9f43',
  'Cancelled': '#ff6b6b',
  'Blocked': '#ff6584',
};

const DEFAULT_COLORS = [
  '#6c63ff', '#ff6584', '#22d3a3', '#ff9f43', '#54a0ff',
  '#5f27cd', '#00d2d3', '#ff9ff3', '#feca57', '#48dbfb',
];

const DAY_PX = { Day: 40, Week: 32, Month: 16, Trim: 6, Yearly: 4 };

const DEFAULT_MAP = {
  taskId: "TaskId",
  taskName: "TaskName",
  start: "Start",
  end: "End",
  progress: "Progress",
  project: "Project",
  assignee: "Assignee",
  status: "Status",
  category: "Category",
  color: "Color",
  milestone: "Milestone",
  hidden: "Hidden",
};

const DEP_MAP = {
  fromTask: "FromTask",
  toTask: "ToTask",
};

// ── COLOR HELPERS ──
const categoryColorMap = {};
let colorIdx = 0;

function getBarColor(rec, idx) {
  const color = getMappedValue(rec, DEFAULT_MAP.color);
  if (color && /^#/.test(color)) return color;
  const status = getMappedValue(rec, DEFAULT_MAP.status);
  const category = getMappedValue(rec, DEFAULT_MAP.category);
  const key = status || category || String(idx);
  if (STATUS_COLORS[key]) return STATUS_COLORS[key];
  if (!categoryColorMap[key]) {
    categoryColorMap[key] = DEFAULT_COLORS[colorIdx++ % DEFAULT_COLORS.length];
  }
  return categoryColorMap[key];
}

function getStatusStyle(status) {
  const c = STATUS_COLORS[status] || '#4a4f7a';
  return `background:${c}22;color:${c};`;
}

// ── DATE HELPERS ──
function parseDate(v) {
  if (!v) return null;
  // Grist timestamps can be seconds since epoch or Date objects
  if (typeof v === 'number') return new Date(v * 1000);
  return v instanceof Date ? v : new Date(v);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

function fmt(d) {
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtShort(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── DATA HELPERS ──
function getMappedValue(record, widgetFieldName) {
  // Get the actual column name from the mapping
  const actualColName = columnMap && columnMap[widgetFieldName];
  if (!actualColName) return record[widgetFieldName]; // fallback to direct access
  return record[actualColName];
}

function extractProjectValue(v) {
  if (!v) return "";
  if (typeof v === "object") return v.ProjectName || v.Name || String(v.id || "");
  return String(v);
}

function safeNumber(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ── DEPENDENCIES ──
function buildDependenciesMap(depsRows) {
  const map = new Map();
  for (const r of depsRows) {
    const from = r[DEP_MAP.fromTask];
    const to = r[DEP_MAP.toTask];
    const fromId = (from && typeof from === "object") ? (from[DEFAULT_MAP.taskId] || from.id || from) : from;
    const toId = (to && typeof to === "object") ? (to[DEFAULT_MAP.taskId] || to.id || to) : to;
    if (!fromId || !toId) continue;

    const list = map.get(String(fromId)) || [];
    list.push(String(toId));
    map.set(String(fromId), list);
  }
  return map;
}

function getTaskDependencies(taskId) {
  if (!taskId) return [];
  const deps = [];
  for (const r of dependencies) {
    const to = r[DEP_MAP.toTask];
    const toId = (to && typeof to === "object") ? (getMappedValue(to, DEFAULT_MAP.taskId) || to.id || to) : to;
    if (String(toId) === String(taskId)) {
      const from = r[DEP_MAP.fromTask];
      const fromId = (from && typeof from === "object") ? (getMappedValue(from, DEFAULT_MAP.taskId) || from.id || from) : from;
      const fromTask = records.find(r => String(getMappedValue(r, DEFAULT_MAP.taskId)) === String(fromId));
      if (fromTask) {
        deps.push(getMappedValue(fromTask, DEFAULT_MAP.taskName) || fromId);
      }
    }
  }
  return deps;
}

// ── PROJECT FILTER ──
function buildProjectOptions(taskRows) {
  const set = new Set();
  for (const r of taskRows) {
    const pv = extractProjectValue(getMappedValue(r, DEFAULT_MAP.project));
    if (pv) set.add(pv);
  }
  const values = Array.from(set).sort((a, b) => a.localeCompare(b));
  const current = projectFilterEl.value;

  projectFilterEl.innerHTML = `<option value="">All Projects</option>` +
    values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");

  if (values.includes(current)) projectFilterEl.value = current;
}

function filterTasksByProject(taskRows) {
  const selected = projectFilterEl.value;
  if (!selected) return taskRows;
  return taskRows.filter(r => extractProjectValue(getMappedValue(r, DEFAULT_MAP.project)) === selected);
}

// ── STATUS FILTER ──
function buildStatusCheckboxes(taskRows) {
  const statusSet = new Set();
  for (const r of taskRows) {
    const status = getMappedValue(r, DEFAULT_MAP.status);
    if (status) statusSet.add(String(status));
  }
  
  const statuses = Array.from(statusSet).sort((a, b) => a.localeCompare(b));
  
  if (statuses.length === 0) {
    statusCheckboxesEl.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 12px;">No statuses found</div>';
    return;
  }
  
  statusCheckboxesEl.innerHTML = '';
  
  statuses.forEach(status => {
    const item = document.createElement('div');
    item.className = 'status-checkbox-item';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `status-${status.replace(/\s+/g, '-')}`;
    checkbox.value = status;
    checkbox.checked = selectedStatuses.size === 0 || selectedStatuses.has(status);
    
    checkbox.addEventListener('change', () => {
      if (selectedStatuses.size === 0) {
        // If "show all" mode, unchecking one means "show all except this one"
        statuses.forEach(s => {
          if (s !== status) selectedStatuses.add(s);
        });
      } else {
        if (checkbox.checked) {
          selectedStatuses.add(status);
          // If all statuses are now selected, clear the set to go back to "show all" mode
          if (selectedStatuses.size === statuses.length) {
            selectedStatuses.clear();
          }
        } else {
          selectedStatuses.delete(status);
        }
      }
      render();
    });
    
    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = status;
    
    item.appendChild(checkbox);
    item.appendChild(label);
    statusCheckboxesEl.appendChild(item);
  });
}

function filterTasksByStatus(taskRows) {
  // If no statuses selected (or all selected), show all
  if (selectedStatuses.size === 0) return taskRows;
  
  return taskRows.filter(r => {
    const status = getMappedValue(r, DEFAULT_MAP.status);
    return status && selectedStatuses.has(String(status));
  });
}

// ── ZOOM CONTROLS ──
function setZoom(z) {
  currentZoom = z;
  [btnDay, btnWeek, btnMonth, btnTrim, btnYearly].forEach(b => b.classList.remove('btn-active'));
  const btn = z === 'Day' ? btnDay : z === 'Week' ? btnWeek : z === 'Month' ? btnMonth : z === 'Trim' ? btnTrim : btnYearly;
  btn.classList.add('btn-active');
  render();
}

function scrollToToday() {
  if (!chartStart) return;
  const offset = daysBetween(chartStart, new Date()) * DAY_PX[currentZoom] - 300;
  chartScrollEl.scrollLeft = Math.max(0, offset);
}

// ── SELECTION ──
function selectRecord(id) {
  selectedId = id;
  highlightSelected();
  
  // Open task details panel
  const task = records.find(r => r.id === id);
  if (task) {
    openTaskDetails(task);
    // Delay centering to allow panel transition to complete (300ms transition + 50ms buffer)
    setTimeout(() => centerViewOnTask(task), 350);
  }
}

function highlightSelected() {
  document.querySelectorAll('.grid-row, .task-row').forEach(el => {
    el.classList.toggle('selected', el.dataset.id == selectedId);
  });
}

function centerViewOnTask(task) {
  if (!chartStart || !chartScrollEl) return;
  
  // Find task index in filtered/visible tasks
  const visibleTasks = Array.from(document.querySelectorAll('.grid-row'));
  const taskRow = visibleTasks.find(row => row.dataset.id == task.id);
  if (!taskRow) return;
  
  // Get task position from row style
  const rowTop = parseInt(taskRow.style.top) || 0;
  
  // Calculate horizontal position (center of task bar)
  const startDate = parseDate(getMappedValue(task, DEFAULT_MAP.start));
  const endDate = parseDate(getMappedValue(task, DEFAULT_MAP.end));
  if (!startDate || !endDate) return;
  
  const startOffset = daysBetween(chartStart, startDate);
  const duration = Math.max(1, daysBetween(startDate, endDate) + 1);
  const dayW = DAY_PX[currentZoom];
  
  const barLeft = startOffset * dayW;
  const barWidth = duration * dayW;
  const barCenter = barLeft + (barWidth / 2);
  
  // Account for details panel width if it's visible
  const detailsPanelWidth = (taskDetailsPanel && !taskDetailsPanel.classList.contains('hidden')) ? 350 : 0;
  const availableWidth = chartScrollEl.clientWidth - detailsPanelWidth;
  
  // Center the view on the task, ensuring the full bar is visible
  // Position the bar start visible with some margin, prioritizing showing the beginning
  const scrollLeft = barLeft - 10; // Show bar start with 100px left margin
  const scrollTop = rowTop - (chartScrollEl.clientHeight / 2) + 22; // 22 = half row height
  
  // Smooth scroll to position (chart area)
  chartScrollEl.scrollTo({
    left: Math.max(0, scrollLeft),
    top: Math.max(0, scrollTop),
    behavior: 'smooth'
  });
  
  // Also scroll task list to center on selected task
  if (taskListEl) {
    const taskListScrollTop = rowTop - (taskListEl.clientHeight / 2) + 22;
    taskListEl.scrollTo({
      top: Math.max(0, taskListScrollTop),
      behavior: 'smooth'
    });
  }
}

// ── TOOLTIP ──
function showTooltip(e, rec, color) {
  const ttTitle = document.getElementById('tt-title');
  const ttStart = document.getElementById('tt-start');
  const ttEnd = document.getElementById('tt-end');
  const ttProjectRow = document.getElementById('tt-project-row');
  const ttProject = document.getElementById('tt-project');
  const ttAssigneeRow = document.getElementById('tt-assignee-row');
  const ttAssignee = document.getElementById('tt-assignee');
  const ttStatusRow = document.getElementById('tt-status-row');
  const ttStatus = document.getElementById('tt-status');
  const ttProgressRow = document.getElementById('tt-progress-row');
  const ttProgress = document.getElementById('tt-progress');
  const ttDepsRow = document.getElementById('tt-deps-row');
  const ttDeps = document.getElementById('tt-deps');

  ttTitle.textContent = getMappedValue(rec, DEFAULT_MAP.taskName) || '—';
  ttTitle.style.color = color;
  ttStart.textContent = fmt(parseDate(getMappedValue(rec, DEFAULT_MAP.start)));
  ttEnd.textContent = fmt(parseDate(getMappedValue(rec, DEFAULT_MAP.end)));

  const project = extractProjectValue(getMappedValue(rec, DEFAULT_MAP.project));
  if (project) {
    ttProjectRow.style.display = '';
    ttProject.textContent = project;
  } else {
    ttProjectRow.style.display = 'none';
  }

  const assignee = getMappedValue(rec, DEFAULT_MAP.assignee);
  if (assignee) {
    ttAssigneeRow.style.display = '';
    ttAssignee.textContent = assignee;
  } else {
    ttAssigneeRow.style.display = 'none';
  }

  const status = getMappedValue(rec, DEFAULT_MAP.status);
  if (status) {
    ttStatusRow.style.display = '';
    ttStatus.textContent = status;
  } else {
    ttStatusRow.style.display = 'none';
  }

  const progress = getMappedValue(rec, DEFAULT_MAP.progress);
  if (progress != null) {
    ttProgressRow.style.display = '';
    ttProgress.textContent = Math.round(progress) + '%';
  } else {
    ttProgressRow.style.display = 'none';
  }

  const deps = getTaskDependencies(getMappedValue(rec, DEFAULT_MAP.taskId));
  if (deps.length > 0) {
    ttDepsRow.style.display = '';
    ttDeps.textContent = deps.join(', ');
  } else {
    ttDepsRow.style.display = 'none';
  }

  tooltipEl.classList.add('visible');
  moveTooltip(e);
}

function moveTooltip(e) {
  const pad = 12;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  if (x + 220 > window.innerWidth) x = e.clientX - 220 - pad;
  if (y + 200 > window.innerHeight) y = e.clientY - 200 - pad;
  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top = y + 'px';
}

function hideTooltip() {
  tooltipEl.classList.remove('visible');
}

// ── RENDER MAIN ──
function render() {
  const valid = records.filter(r => {
    if (getMappedValue(r, DEFAULT_MAP.hidden) === true) return false;
    return parseDate(getMappedValue(r, DEFAULT_MAP.start)) && parseDate(getMappedValue(r, DEFAULT_MAP.end));
  });

  if (valid.length === 0) {
    emptyStateEl.classList.add('visible');
    ganttGridEl.innerHTML = '';
    taskListEl.innerHTML = '';
    monthLabelsEl.innerHTML = '';
    dayLabelsEl.innerHTML = '';
    legendEl.innerHTML = '';
    statusEl.textContent = 'No tasks';
    return;
  }
  emptyStateEl.classList.remove('visible');

  // Build project filter
  buildProjectOptions(valid);
  
  // Build status filter
  buildStatusCheckboxes(valid);

  // Filter by project
  let filtered = filterTasksByProject(valid);
  
  // Filter by status
  filtered = filterTasksByStatus(filtered);

  if (filtered.length === 0) {
    emptyStateEl.classList.add('visible');
    ganttGridEl.innerHTML = '';
    taskListEl.innerHTML = '';
    monthLabelsEl.innerHTML = '';
    dayLabelsEl.innerHTML = '';
    legendEl.innerHTML = '';
    statusEl.textContent = 'No tasks in selected project';
    return;
  }

  // Compute chart range
  const starts = filtered.map(r => parseDate(getMappedValue(r, DEFAULT_MAP.start)));
  const ends = filtered.map(r => parseDate(getMappedValue(r, DEFAULT_MAP.end)));
  
  // Adaptive padding based on zoom level
  const paddingBefore = currentZoom === 'Yearly' ? -60 : currentZoom === 'Trim' ? -30 : -7;
  const paddingAfter = currentZoom === 'Yearly' ? 60 : currentZoom === 'Trim' ? 30 : 14;
  
  chartStart = addDays(new Date(Math.min(...starts)), paddingBefore);
  chartEnd = addDays(new Date(Math.max(...ends)), paddingAfter);
  chartStart.setHours(0, 0, 0, 0);
  chartEnd.setHours(0, 0, 0, 0);

  const totalDays = daysBetween(chartStart, chartEnd);
  const dayW = DAY_PX[currentZoom];
  const totalW = totalDays * dayW;

  renderTimeline(totalW, totalDays, dayW);
  renderGrid(filtered, totalW, totalDays, dayW);
  renderTaskList(filtered);
  renderDependencyArrows(filtered, dayW);
  renderLegend(filtered);

  statusEl.textContent = `${filtered.length} task(s)`;
  requestAnimationFrame(scrollToToday);
}

// ── RENDER TIMELINE ──
function renderTimeline(totalW, totalDays, dayW) {
  monthLabelsEl.style.width = totalW + 'px';
  dayLabelsEl.style.width = totalW + 'px';
  monthLabelsEl.innerHTML = '';
  dayLabelsEl.innerHTML = '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let cur = new Date(chartStart);
  let prevMonth = -1;

  for (let i = 0; i <= totalDays; i++) {
    const x = i * dayW;

    // Month labels
    if (cur.getMonth() !== prevMonth) {
      const ml = document.createElement('div');
      ml.className = 'month-label';
      ml.style.left = x + 'px';
      ml.textContent = cur.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      monthLabelsEl.appendChild(ml);
      prevMonth = cur.getMonth();
    }

    // Day labels
    const step = currentZoom === 'Day' ? 1 : currentZoom === 'Week' ? 1 : currentZoom === 'Month' ? 7 : currentZoom === 'Trim' ? 14 : 30;
    if (i % step === 0) {
      const dl = document.createElement('div');
      dl.className = 'day-label' + (cur.getTime() === today.getTime() ? ' today' : '');
      dl.style.left = x + 'px';
      dl.textContent = cur.getDate();
      dayLabelsEl.appendChild(dl);
    }

    cur = addDays(cur, 1);
  }
}

// ── RENDER GRID ──
function renderGrid(filtered, totalW, totalDays, dayW) {
  ganttGridEl.style.width = totalW + 'px';
  ganttGridEl.style.height = (filtered.length * 44) + 'px';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset = daysBetween(chartStart, today);

  // Build grid columns
  const colFrag = document.createDocumentFragment();
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(chartStart, i);
    const dow = d.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isToday = i === todayOffset;

    const gridStep = currentZoom === 'Day' ? 1 : currentZoom === 'Week' ? 1 : currentZoom === 'Month' ? 7 : currentZoom === 'Trim' ? 14 : 30;
    const shouldRender = currentZoom === 'Day' || isWeekend || isToday || i % gridStep === 0;
    
    if (shouldRender) {
      const col = document.createElement('div');
      let classes = 'grid-col';
      
      // In Day view, alternate column backgrounds
      if (currentZoom === 'Day' && !isToday && !isWeekend && i % 2 === 0) {
        classes += ' alt-day';
      }
      
      if (isWeekend) classes += ' weekend';
      if (isToday) classes += ' today-col';
      
      col.className = classes;
      col.style.left = i * dayW + 'px';
      col.style.width = dayW + 'px';
      colFrag.appendChild(col);
    }
  }

  // Today line
  if (todayOffset >= 0 && todayOffset <= totalDays) {
    const tl = document.createElement('div');
    tl.className = 'today-line';
    tl.style.left = (todayOffset * dayW + dayW / 2) + 'px';
    colFrag.appendChild(tl);
  }

  ganttGridEl.innerHTML = '';
  ganttGridEl.appendChild(colFrag);

  // Build rows with bars
  const rowFrag = document.createDocumentFragment();
  filtered.forEach((rec, idx) => {
    const start = parseDate(getMappedValue(rec, DEFAULT_MAP.start));
    const end = parseDate(getMappedValue(rec, DEFAULT_MAP.end));
    const row = document.createElement('div');
    row.className = 'grid-row' + (rec.id === selectedId ? ' selected' : '');
    row.dataset.id = rec.id;
    row.style.top = (idx * 44) + 'px';
    row.addEventListener('click', () => selectRecord(rec.id));

    // Bar
    const startOff = daysBetween(chartStart, start);
    const dur = Math.max(1, daysBetween(start, end) + 1);
    const barLeft = startOff * dayW;
    const barWidth = dur * dayW;

    const color = getBarColor(rec, idx);
    const bar = document.createElement('div');
    bar.className = 'gantt-bar';
    bar.style.left = barLeft + 'px';
    bar.style.width = barWidth + 'px';
    bar.style.background = color;
    bar.style.boxShadow = `0 2px 8px ${color}55`;

    // Progress overlay
    const progress = getMappedValue(rec, DEFAULT_MAP.progress);
    if (progress != null) {
      const pct = Math.min(100, Math.max(0, Number(progress)));
      const prog = document.createElement('div');
      prog.className = 'gantt-bar-progress';
      prog.style.width = pct + '%';
      bar.appendChild(prog);
    }

    // Label
    if (barWidth > 40) {
      const lbl = document.createElement('span');
      lbl.className = 'bar-label';
      lbl.textContent = getMappedValue(rec, DEFAULT_MAP.taskName) || '—';
      bar.appendChild(lbl);
    }

    // Events
    bar.addEventListener('mouseenter', (e) => showTooltip(e, rec, color));
    bar.addEventListener('mousemove', (e) => moveTooltip(e));
    bar.addEventListener('mouseleave', hideTooltip);
    bar.addEventListener('click', (e) => { e.stopPropagation(); selectRecord(rec.id); });

    row.appendChild(bar);
    rowFrag.appendChild(row);
  });

  ganttGridEl.appendChild(rowFrag);
}

// ── RENDER TASK LIST ──
function renderTaskList(filtered) {
  taskListEl.innerHTML = '';
  taskListEl.style.height = (filtered.length * 44) + 'px';
  taskListEl.style.position = 'relative';
  
  filtered.forEach((rec, idx) => {
    const color = getBarColor(rec, idx);
    const row = document.createElement('div');
    row.className = 'task-row' + (rec.id === selectedId ? ' selected' : '');
    row.dataset.id = rec.id;
    row.style.top = (idx * 44) + 'px';
    row.addEventListener('click', () => selectRecord(rec.id));

    const dot = document.createElement('div');
    dot.className = 'task-color-dot';
    dot.style.background = color;

    const name = document.createElement('div');
    name.className = 'task-name';
    name.textContent = getMappedValue(rec, DEFAULT_MAP.taskName) || '—';

    row.appendChild(dot);
    row.appendChild(name);

    const status = getMappedValue(rec, DEFAULT_MAP.status);
    if (status) {
      const badge = document.createElement('span');
      badge.className = 'task-status';
      badge.style.cssText = getStatusStyle(status);
      badge.textContent = status;
      row.appendChild(badge);
    }

    taskListEl.appendChild(row);
  });
}

// ── RENDER LEGEND ──
function renderLegend(filtered) {
  const seen = {};
  const items = [];
  filtered.forEach((rec, idx) => {
    const key = getMappedValue(rec, DEFAULT_MAP.status) || getMappedValue(rec, DEFAULT_MAP.category) || 'Task';
    const color = getBarColor(rec, idx);
    if (!seen[key]) {
      seen[key] = true;
      items.push({ key, color });
    }
  });
  legendEl.innerHTML = items.slice(0, 8).map(it =>
    `<div class="legend-item">
      <div class="legend-dot" style="background:${it.color}"></div>
      ${escapeHtml(it.key)}
    </div>`
  ).join('');
}

// ── RENDER DEPENDENCY ARROWS ──
function renderDependencyArrows(filtered, dayW) {
  if (!dependencyArrowsEl) return;
  
  // Clear existing arrows
  dependencyArrowsEl.innerHTML = '';
  
  // Set SVG dimensions
  const totalW = dependencyArrowsEl.parentElement.offsetWidth;
  const totalH = dependencyArrowsEl.parentElement.offsetHeight;
  dependencyArrowsEl.setAttribute('width', totalW);
  dependencyArrowsEl.setAttribute('height', totalH);
  dependencyArrowsEl.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
  
  // Create arrow marker definition
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'arrowhead');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  marker.setAttribute('markerUnits', 'strokeWidth');
  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('points', '0 0, 10 3, 0 6');
  
  // Get dependency color from CSS variable
  const depColor = getComputedStyle(document.documentElement).getPropertyValue('--dependency-color').trim() || '#7b82b0';
  polygon.setAttribute('fill', depColor);
  marker.appendChild(polygon);
  defs.appendChild(marker);
  dependencyArrowsEl.appendChild(defs);
  
  // Build a map of task ID to position info
  const taskPositions = new Map();
  filtered.forEach((rec, idx) => {
    const taskId = String(getMappedValue(rec, DEFAULT_MAP.taskId) || rec.id);
    const start = parseDate(getMappedValue(rec, DEFAULT_MAP.start));
    const end = parseDate(getMappedValue(rec, DEFAULT_MAP.end));
    const startOff = daysBetween(chartStart, start);
    const dur = Math.max(1, daysBetween(start, end) + 1);
    const barLeft = startOff * dayW;
    const barRight = barLeft + (dur * dayW);
    const barY = idx * 44 + 22; // Center of the row
    
    taskPositions.set(taskId, {
      left: barLeft,
      right: barRight,
      y: barY,
      idx: idx
    });
  });
  
  // Draw arrows for each dependency
  for (const dep of dependencies) {
    const from = dep[DEP_MAP.fromTask];
    const to = dep[DEP_MAP.toTask];
    const fromId = String((from && typeof from === "object") ? (from[DEFAULT_MAP.taskId] || from.id || from) : from);
    const toId = String((to && typeof to === "object") ? (to[DEFAULT_MAP.taskId] || to.id || to) : to);
    
    const fromPos = taskPositions.get(fromId);
    const toPos = taskPositions.get(toId);
    
    if (!fromPos || !toPos) continue;
    
    // Start from the end of the "from" task
    const x1 = fromPos.right;
    const y1 = fromPos.y;
    
    // End at the start of the "to" task
    const x2 = toPos.left;
    const y2 = toPos.y;
    
    // Create a path with curves for better visual
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    
    // Calculate control points for bezier curve
    const midX = (x1 + x2) / 2;
    const curvature = Math.min(Math.abs(x2 - x1) / 4, 50);
    
    let pathData;
    if (y1 === y2) {
      // Same row: simple line with slight curve
      pathData = `M ${x1} ${y1} C ${x1 + curvature} ${y1}, ${x2 - curvature} ${y2}, ${x2} ${y2}`;
    } else if (x2 > x1) {
      // Normal case: from left to right
      pathData = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
    } else {
      // Backward dependency: add extra spacing
      const offset = 30;
      pathData = `M ${x1} ${y1} L ${x1 + offset} ${y1} L ${x1 + offset} ${y2} L ${x2} ${y2}`;
    }
    
    path.setAttribute('d', pathData);
    path.setAttribute('stroke', depColor);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-dasharray', '5,5');
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', 'url(#arrowhead)');
    path.setAttribute('opacity', '0.6');
    
    dependencyArrowsEl.appendChild(path);
  }
}

// ── GRIST INTEGRATION ──
function checkConfig() {
  if (!columnMap || (!columnMap[DEFAULT_MAP.taskName] || !columnMap[DEFAULT_MAP.start] || !columnMap[DEFAULT_MAP.end])) {
    configBanner.classList.add('visible');
    configMsg.textContent = '⚙️ Map columns in Grist: TaskName, Start, End are required';
  } else {
    configBanner.classList.remove('visible');
  }
}

async function loadData() {
  statusEl.textContent = 'Connecting to Grist…';

  grist.ready({
    requiredAccess: 'full',
    columns: [
      { name: DEFAULT_MAP.taskName, title: 'Task Name', type: 'Text', optional: false },
      { name: DEFAULT_MAP.start, title: 'Start Date', type: 'Date', optional: false },
      { name: DEFAULT_MAP.end, title: 'End Date', type: 'Date', optional: false },
      { name: DEFAULT_MAP.taskId, title: 'Task ID', type: 'Any', optional: true },
      { name: DEFAULT_MAP.progress, title: 'Progress (%)', type: 'Numeric', optional: true },
      { name: DEFAULT_MAP.project, title: 'Project', type: 'Any', optional: true },
      { name: DEFAULT_MAP.assignee, title: 'Assignee', type: 'Any', optional: true },
      { name: DEFAULT_MAP.status, title: 'Status', type: 'Any', optional: true },
      { name: DEFAULT_MAP.category, title: 'Category', type: 'Any', optional: true },
      { name: DEFAULT_MAP.color, title: 'Color', type: 'Any', optional: true },
      { name: DEFAULT_MAP.milestone, title: 'Milestone', type: 'Bool', optional: true },
      { name: DEFAULT_MAP.hidden, title: 'Hidden', type: 'Bool', optional: true },
    ]
  });

  grist.onRecords((data, mapping) => {
    columnMap = mapping || null;
    records = data || [];
    checkConfig();
    fetchDependenciesAndRender();
  });

  grist.onRecord((record) => {
    if (record && record.id) {
      selectedId = record.id;
      highlightSelected();
    }
  });
}

function fetchDependenciesAndRender() {
  grist.docApi.fetchTable("Dependencies")
    .then(data => {
      dependencies = columnsToRows(data);
      render();
    })
    .catch(() => {
      dependencies = [];
      render();
    });
}

function columnsToRows(tableData) {
  const cols = Object.keys(tableData || {});
  if (!cols.length) return [];
  const n = tableData[cols[0]].length;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const r = {};
    for (const c of cols) r[c] = tableData[c][i];
    rows.push(r);
  }
  return rows;
}

// ── EVENT LISTENERS ──
btnDay.addEventListener('click', () => setZoom('Day'));
btnWeek.addEventListener('click', () => setZoom('Week'));
btnMonth.addEventListener('click', () => setZoom('Month'));
btnTrim.addEventListener('click', () => setZoom('Trim'));
btnYearly.addEventListener('click', () => setZoom('Yearly'));
btnToday.addEventListener('click', scrollToToday);
projectFilterEl.addEventListener('change', render);

// Status filter dropdown toggle
if (btnStatusFilter && statusFilterContent) {
  btnStatusFilter.addEventListener('click', (e) => {
    e.stopPropagation();
    statusFilterContent.classList.toggle('visible');
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!statusFilterContent.contains(e.target) && e.target !== btnStatusFilter) {
      statusFilterContent.classList.remove('visible');
    }
  });
  
  // Prevent dropdown from closing when clicking inside
  statusFilterContent.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

// Task details panel events
if (btnCloseDetails) {
  btnCloseDetails.addEventListener('click', closeTaskDetails);
}

if (taskDetailsForm) {
  taskDetailsForm.addEventListener('submit', saveTaskDetails);
  
  // Priority button selection
  document.querySelectorAll('.priority-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  
  // Progress slider sync
  const progressSlider = document.getElementById('detail-progress-slider');
  const progressValue = document.getElementById('detail-progress-value');
  
  if (progressSlider && progressValue) {
    progressSlider.addEventListener('input', () => {
      progressValue.value = progressSlider.value;
    });
    
    progressValue.addEventListener('input', () => {
      progressSlider.value = progressValue.value;
    });
  }
}

if (btnDeleteTask) {
  btnDeleteTask.addEventListener('click', (e) => {
    e.preventDefault();
    deleteTask();
  });
}

// Synchronized scrolling
chartScrollEl.addEventListener('scroll', () => {
  taskListEl.scrollTop = chartScrollEl.scrollTop;
});
taskListEl.addEventListener('scroll', () => {
  chartScrollEl.scrollTop = taskListEl.scrollTop;
});

// Horizontal sync: move timeline labels as the chart scrolls
chartScrollEl.addEventListener('scroll', () => {
  const x = chartScrollEl.scrollLeft || 0;
  // translate the timeline label containers so they appear to scroll horizontally
  if (monthLabelsEl) monthLabelsEl.style.transform = `translateX(${ -x }px)`;
  if (dayLabelsEl) dayLabelsEl.style.transform = `translateX(${ -x }px)`;
});

// ── TASK DETAILS PANEL ──
function openTaskDetails(task) {
  if (!taskDetailsPanel) return;
  
  currentEditingTask = task;
  taskDetailsPanel.classList.remove('hidden');
  
  // Populate form fields
  document.getElementById('detail-task-name').value = getMappedValue(task, DEFAULT_MAP.taskName) || '';
  
  const startDate = parseDate(getMappedValue(task, DEFAULT_MAP.start));
  const endDate = parseDate(getMappedValue(task, DEFAULT_MAP.end));
  document.getElementById('detail-start-date').valueAsDate = startDate;
  document.getElementById('detail-end-date').valueAsDate = endDate;
  
  document.getElementById('detail-project').value = extractProjectValue(getMappedValue(task, DEFAULT_MAP.project)) || '';
  document.getElementById('detail-assignee').value = getMappedValue(task, DEFAULT_MAP.assignee) || '';
  document.getElementById('detail-status').value = getMappedValue(task, DEFAULT_MAP.status) || '';
  
  const progress = safeNumber(getMappedValue(task, DEFAULT_MAP.progress), 0);
  document.getElementById('detail-progress-slider').value = progress;
  document.getElementById('detail-progress-value').value = progress;
  
  // Set priority buttons
  const priority = getMappedValue(task, 'Priority') || getMappedValue(task, 'Priorité') || '';
  document.querySelectorAll('.priority-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.priority === priority);
  });
  
  // Show dependencies
  const deps = getTaskDependencies(getMappedValue(task, DEFAULT_MAP.taskId));
  const depsEl = document.getElementById('detail-dependencies');
  if (deps.length > 0) {
    depsEl.innerHTML = deps.map(d => `<span class="dependency-tag">${escapeHtml(d)}</span>`).join('');
  } else {
    depsEl.innerHTML = '<span style="color: var(--text-muted);">Aucune dépendance</span>';
  }
  
  // Tags and description (if available)
  document.getElementById('detail-tags').value = getMappedValue(task, 'Tags') || '';
  document.getElementById('detail-description').value = getMappedValue(task, 'Description') || '';
}

function closeTaskDetails() {
  if (taskDetailsPanel) {
    taskDetailsPanel.classList.add('hidden');
  }
  currentEditingTask = null;
}

async function saveTaskDetails(e) {
  if (e) e.preventDefault();
  if (!currentEditingTask) return;
  
  const startDate = document.getElementById('detail-start-date').value;
  const endDate = document.getElementById('detail-end-date').value;
  const project = document.getElementById('detail-project').value;
  const assignee = document.getElementById('detail-assignee').value;
  const status = document.getElementById('detail-status').value;
  const progress = parseFloat(document.getElementById('detail-progress-value').value);
  const tags = document.getElementById('detail-tags').value;
  const description = document.getElementById('detail-description').value;
  
  // Get selected priority
  const activePriorityBtn = document.querySelector('.priority-btn.active');
  const priority = activePriorityBtn ? activePriorityBtn.dataset.priority : '';
  
  // Build update data
  const updates = {};
  
  if (startDate) {
    const col = (columnMap && columnMap[DEFAULT_MAP.start]) || DEFAULT_MAP.start;
    updates[col] = new Date(startDate).getTime() / 1000;
  }
  
  if (endDate) {
    const col = (columnMap && columnMap[DEFAULT_MAP.end]) || DEFAULT_MAP.end;
    updates[col] = new Date(endDate).getTime() / 1000;
  }
  
  if (project !== undefined) {
    const col = (columnMap && columnMap[DEFAULT_MAP.project]) || DEFAULT_MAP.project;
    updates[col] = project;
  }
  
  if (assignee !== undefined) {
    const col = (columnMap && columnMap[DEFAULT_MAP.assignee]) || DEFAULT_MAP.assignee;
    updates[col] = assignee;
  }
  
  if (status) {
    const col = (columnMap && columnMap[DEFAULT_MAP.status]) || DEFAULT_MAP.status;
    updates[col] = status;
  }
  
  if (!isNaN(progress)) {
    const col = (columnMap && columnMap[DEFAULT_MAP.progress]) || DEFAULT_MAP.progress;
    updates[col] = progress;
  }
  
  if (priority) {
    updates['Priority'] = priority;
  }
  
  if (tags !== undefined) {
    updates['Tags'] = tags;
  }
  
  if (description !== undefined) {
    updates['Description'] = description;
  }
  
  try {
    await grist.docApi.applyUserActions([
      ['UpdateRecord', await getTableId(), currentEditingTask.id, updates]
    ]);
    
    statusEl.textContent = '✅ Tâche mise à jour!';
    setTimeout(() => {
      statusEl.textContent = `${records.length} task(s)`;
    }, 2000);
    
    closeTaskDetails();
  } catch (error) {
    console.error('Error updating task:', error);
    alert('Échec de la mise à jour: ' + error.message);
  }
}

async function deleteTask() {
  if (!currentEditingTask) return;
  
  if (!confirm('Voulez-vous vraiment supprimer cette tâche ?')) {
    return;
  }
  
  try {
    await grist.docApi.applyUserActions([
      ['RemoveRecord', await getTableId(), currentEditingTask.id]
    ]);
    
    statusEl.textContent = '🗑️ Tâche supprimée';
    setTimeout(() => {
      statusEl.textContent = `${records.length - 1} task(s)`;
    }, 2000);
    
    closeTaskDetails();
  } catch (error) {
    console.error('Error deleting task:', error);
    alert('Échec de la suppression: ' + error.message);
  }
}

async function getTableId() {
  try {
    const table = await grist.getTable();
    return table ? (table.tableId || table) : null;
  } catch (e) {
    return null;
  }
}

// Task details panel event listener
if (btnCloseDetails) {
  btnCloseDetails.addEventListener('click', closeTaskDetails);
}

if (taskDetailsForm) {
  taskDetailsForm.addEventListener('submit', saveTaskDetails);
  
  // Priority button selection
  document.querySelectorAll('.priority-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  
  // Progress slider sync
  const progressSlider = document.getElementById('detail-progress-slider');
  const progressValue = document.getElementById('detail-progress-value');
  
  if (progressSlider && progressValue) {
    progressSlider.addEventListener('input', () => {
      progressValue.value = progressSlider.value;
    });
    
    progressValue.addEventListener('input', () => {
      progressSlider.value = progressValue.value;
    });
  }
}

if (btnDeleteTask) {
  btnDeleteTask.addEventListener('click', (e) => {
    e.preventDefault();
    deleteTask();
  });
}

// ── THEME TOGGLE ──
const btnTheme = document.getElementById('btn-theme');
function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    btnTheme.textContent = '☀️';
  } else {
    document.documentElement.removeAttribute('data-theme');
    btnTheme.textContent = '🌙';
  }
  try { localStorage.setItem('gantt-theme', theme); } catch(e){}
}

function toggleTheme() {
  const current = localStorage.getItem('gantt-theme') || 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
}

if (btnTheme) {
  btnTheme.addEventListener('click', toggleTheme);
  // initialize from storage
  const stored = (function(){ try{ return localStorage.getItem('gantt-theme') }catch(e){return null} })();
  applyTheme(stored === 'light' ? 'light' : 'dark');
}

// ── ADD TASK MODAL ──
function openAddTaskModal() {
  // Set default dates (today + 7 days)
  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(today.getDate() + 7);
  
  document.getElementById('input-start-date').valueAsDate = today;
  document.getElementById('input-end-date').valueAsDate = nextWeek;
  
  modalAddTask.classList.add('visible');
}

function closeAddTaskModal() {
  modalAddTask.classList.remove('visible');
  formAddTask.reset();
}

// Modal event listeners
if (btnAddTask) {
  btnAddTask.addEventListener('click', openAddTaskModal);
}

if (btnCloseModal) {
  btnCloseModal.addEventListener('click', closeAddTaskModal);
}

if (btnCancelTask) {
  btnCancelTask.addEventListener('click', closeAddTaskModal);
}

// Close modal when clicking outside
modalAddTask.addEventListener('click', (e) => {
  if (e.target === modalAddTask) {
    closeAddTaskModal();
  }
});

// Form submission
if (formAddTask) {
  formAddTask.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const taskName = document.getElementById('input-task-name').value.trim();
    const startDate = document.getElementById('input-start-date').value;
    const endDate = document.getElementById('input-end-date').value;
    const project = document.getElementById('input-project').value.trim();
    const assignee = document.getElementById('input-assignee').value.trim();
    const status = document.getElementById('input-status').value;
    const progress = document.getElementById('input-progress').value;
    
    if (!taskName || !startDate || !endDate) {
      alert('Please fill in all required fields');
      return;
    }
    
    // Convert dates to timestamp (seconds since epoch)
    const startTimestamp = new Date(startDate).getTime() / 1000;
    const endTimestamp = new Date(endDate).getTime() / 1000;
    
    // Build record data using mapped column names
    const recordData = {};
    
    // Required fields
    if (columnMap && columnMap[DEFAULT_MAP.taskName]) {
      recordData[columnMap[DEFAULT_MAP.taskName]] = taskName;
    } else {
      recordData[DEFAULT_MAP.taskName] = taskName;
    }
    
    if (columnMap && columnMap[DEFAULT_MAP.start]) {
      recordData[columnMap[DEFAULT_MAP.start]] = startTimestamp;
    } else {
      recordData[DEFAULT_MAP.start] = startTimestamp;
    }
    
    if (columnMap && columnMap[DEFAULT_MAP.end]) {
      recordData[columnMap[DEFAULT_MAP.end]] = endTimestamp;
    } else {
      recordData[DEFAULT_MAP.end] = endTimestamp;
    }
    
    // Optional fields
    if (project) {
      const projectCol = (columnMap && columnMap[DEFAULT_MAP.project]) || DEFAULT_MAP.project;
      recordData[projectCol] = project;
    }
    
    if (assignee) {
      const assigneeCol = (columnMap && columnMap[DEFAULT_MAP.assignee]) || DEFAULT_MAP.assignee;
      recordData[assigneeCol] = assignee;
    }
    
    if (status) {
      const statusCol = (columnMap && columnMap[DEFAULT_MAP.status]) || DEFAULT_MAP.status;
      recordData[statusCol] = status;
    }
    
    if (progress) {
      const progressCol = (columnMap && columnMap[DEFAULT_MAP.progress]) || DEFAULT_MAP.progress;
      recordData[progressCol] = parseFloat(progress);
    }
    
    try {
      // Disable form during submission
      const submitBtn = formAddTask.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Adding...';
      
      // Use Grist API to add record
      await grist.docApi.applyUserActions([
        ['AddRecord', grist.selectedTable.tableId, null, recordData]
      ]);
      
      closeAddTaskModal();
      statusEl.textContent = 'Task added successfully!';
      setTimeout(() => {
        statusEl.textContent = `${records.length} task(s)`;
      }, 2000);
    } catch (error) {
      console.error('Error adding task:', error);
      alert('Failed to add task: ' + error.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add Task';
    }
  });
}

// ── INIT ──
loadData();
