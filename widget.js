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
const modalAddTask = document.getElementById("modal-add-task");
const btnAddTask = document.getElementById("btn-add-task");
const btnCloseModal = document.getElementById("btn-close-modal");
const btnCancelTask = document.getElementById("btn-cancel-task");
const formAddTask = document.getElementById("form-add-task");

// ── ZOOM BUTTONS ──
const btnDay = document.getElementById("btn-day");
const btnWeek = document.getElementById("btn-week");
const btnMonth = document.getElementById("btn-month");
const btnTrim = document.getElementById("btn-trim");
const btnYearly = document.getElementById("btn-yearly");
const btnToday = document.getElementById("btn-today");

// ── STATE ──
let records = [];
let dependencies = [];
let columnMap = null;
let currentZoom = 'Month'; // Day, Week, Month, Trim, Yearly
let selectedId = null;
let chartStart = null;
let chartEnd = null;

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
}

function highlightSelected() {
  document.querySelectorAll('.grid-row, .task-row').forEach(el => {
    el.classList.toggle('selected', el.dataset.id == selectedId);
  });
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

  // Filter by project
  const filtered = filterTasksByProject(valid);

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
    if (isWeekend || isToday || i % gridStep === 0) {
      const col = document.createElement('div');
      col.className = 'grid-col' + (isWeekend ? ' weekend' : '') + (isToday ? ' today-col' : '');
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
  filtered.forEach((rec, idx) => {
    const color = getBarColor(rec, idx);
    const row = document.createElement('div');
    row.className = 'task-row' + (rec.id === selectedId ? ' selected' : '');
    row.dataset.id = rec.id;
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
  monthLabelsEl.style.transform = `translateX(${ -x }px)`;
  dayLabelsEl.style.transform = `translateX(${ -x }px)`;
});

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
