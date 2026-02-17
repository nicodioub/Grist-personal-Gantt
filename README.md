# 📊 Grist Gantt Chart Widget

A beautiful, interactive Gantt chart custom widget for [Grist](https://www.getgrist.com/), deployable via **GitHub Pages** with zero build step needed.

![Preview](https://img.shields.io/badge/Grist-Custom%20Widget-6c63ff?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-22d3a3?style=flat-square)

---

## ✨ Features

### 🎨 Visual Excellence
- 🌙 **Modern dark theme** — polished UI with smooth animations
- 🎨 **Smart color-coding** — by status, category, or custom hex colors
- 📊 **Progress bars** — visual % completion overlay on each bar
- 📌 **Today line** — bright indicator with auto-scroll functionality
- 🎯 **Weekend highlighting** — subtle background for weekends
- ✨ **Task list panel** — synchronized scrolling with color dots

### 📊 Advanced Features
- 🔗 **Task dependencies** — reads from separate Dependencies table
- 🗓️ **Four zoom levels** — Day, Week, Month, Quarter views
- 🔍 **Project filtering** — dropdown to filter by project
- 🖱️ **Rich tooltips** — shows all task details including dependencies
- 👆 **Row selection** — click to highlight tasks across views
- 📊 **Auto legend** — displays status/category colors

### 🛠️ Technical
- 🔧 **Column mapping** — flexible, rename-proof via Grist API
- 🔄 **Live sync** — instant updates when Grist data changes
- 📱 **Responsive** — adapts to different screen sizes
- ⚡ **Zero dependencies** — pure JavaScript, no build step

---

## 🗃️ Grist Table Structure

### Main Tasks Table

Create a table (e.g., **`Tasks`** or **`Projects`**) with these columns:

| Column ID | Column Label | Type | Required | Notes |
|---|---|---|---|---|
| `TaskId` | Task ID | Text | ⬜ | Unique identifier (for dependencies) |
| `TaskName` | Task Name | Text | ✅ | Name of the task/milestone |
| `Start` | Start Date | Date | ✅ | Task start date |
| `End` | End Date | Date | ✅ | Task end date |
| `Progress` | Progress | Numeric | ⬜ | 0–100 (percentage complete) |
| `Project` | Project | Text/Ref | ⬜ | Project name or reference |
| `Assignee` | Assignee | Text | ⬜ | Person responsible |
| `Status` | Status | Choice | ⬜ | e.g. Not Started, In Progress, Completed |
| `Category` | Category | Text | ⬜ | Group/phase label |
| `Color` | Color | Text | ⬜ | Hex color override e.g. `#ff6584` |
| `Milestone` | Milestone | Toggle | ⬜ | True for milestones (1-day markers) |
| `Hidden` | Hidden | Toggle | ⬜ | True to hide from chart |

### Dependencies Table (Optional)

Create a separate **`Dependencies`** table for task relationships:

| Column ID | Column Label | Type | Required | Notes |
|---|---|---|---|---|
| `FromTask` | From Task | Reference | ✅ | Links to Tasks.TaskId (predecessor) |
| `ToTask` | To Task | Reference | ✅ | Links to Tasks.TaskId (successor) |

The reference columns should point to your Tasks table.

### Status Choices (for Choice column)
```
Not Started
In Progress
Completed
On Hold
Cancelled
Blocked
```

Each status has a predefined color:
- **Not Started**: Dark Gray `#4a4f7a`
- **In Progress**: Purple `#6c63ff`
- **Completed**: Green `#22d3a3`
- **On Hold**: Orange `#ff9f43`
- **Cancelled**: Red `#ff6b6b`
- **Blocked**: Pink `#ff6584`

---

## 🚀 Deploy to GitHub Pages (5 minutes)

### Step 1 — Fork / create the repo

1. Go to [github.com/new](https://github.com/new)
2. Name it `grist-gantt` (or anything)
3. Upload the contents of this folder (or push from git)

### Step 2 — Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Under **Source**, select `main` branch, folder `/ (root)`
3. Click **Save**
4. Your widget URL will be:
   ```
   https://<your-username>.github.io/<repo-name>/
   ```
   e.g. `https://johnsmith.github.io/grist-gantt/`

> Pages usually go live within 1–2 minutes. Check the **Actions** tab for build status.

---

## 🔌 Add the Widget to Grist

### Step 1 — Add a Custom Widget to your page

1. In your Grist document, click **Add New → Add Widget to Page**
2. Select widget type: **Custom**
3. Select your **data table** (e.g. `Projects`)
4. Click **Add to Page**

### Step 2 — Configure the widget URL

1. In the widget panel → **Custom** tab in the Creator Panel (right side)
2. Set the URL to your GitHub Pages URL:
   ```
   https://<your-username>.github.io/grist-gantt/
   ```
3. Set **Access Level** to `Read table`

### Step 3 — Map your columns

In the Creator Panel → **Custom** → **Column Mapping**, map:

| Widget expects | Map to your column |
|---|---|
| Task Name | Your task name column |
| Start Date | Your start date column |
| End Date | Your end date column |
| Assignee | *(optional)* your assignee column |
| Status | *(optional)* your status column |
| Progress (%) | *(optional)* your progress column |
| Category | *(optional)* your category column |
| Bar Color | *(optional)* a hex color column |

The widget will show a blue banner at the top until all **required** columns (Task Name, Start Date, End Date) are mapped.

---

## 🛠️ Local Development

No build step needed! Just open `index.html` in a browser.

For live Grist integration during development, use a local Grist instance or the Grist sandbox:

```bash
# Serve locally with Python
python3 -m http.server 8080

# Then in Grist, set your widget URL to:
# http://localhost:8080/
```

---

## 📁 File Structure

```
grist-gantt/
├── index.html        ← The entire widget (self-contained)
└── README.md         ← This file
```

---

## 🎨 Customizing Colors

The widget auto-assigns colors based on the `Status` field:

| Status | Color |
|---|---|
| Not Started | `#4a4f7a` (dark blue-gray) |
| In Progress | `#6c63ff` (purple) |
| Completed | `#22d3a3` (green) |
| On Hold | `#ff9f43` (orange) |
| Cancelled | `#ff6b6b` (red) |
| Blocked | `#ff6584` (pink-red) |

To override a bar's color, add a **Bar Color** column with a hex value like `#3498db`.

---

## 📝 License

MIT — free to use, modify, and deploy.
