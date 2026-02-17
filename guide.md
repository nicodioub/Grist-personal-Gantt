1) Grist data model (tables + columns)
Table 1 — Projects

Use this if you want multiple Gantt views by project.

Columns

ProjectId (Text) — unique id (ex: PRJ-001)

ProjectName (Text)

Owner (Reference → People) (optional)

Start (Date) (optional)

End (Date) (optional)

Status (Choice) (optional: Planned / Active / Done)

Table 2 — Tasks (this is the main one)

This is what the Gantt displays.

Columns

TaskId (Text) — unique id (ex: T-001) (required for dependencies)

Project (Reference → Projects) (optional but recommended)

TaskName (Text) required

Start (Date or DateTime) required

End (Date or DateTime) required

Progress (Numeric 0–100) (optional)

ParentTask (Reference → Tasks) (optional, for grouping)

Assignee (Reference → People) (optional)

Color (Text) (optional, ex #3b82f6)

Milestone (Toggle/Bool) (optional: if true, render as 1-day task)

Hidden (Toggle/Bool) (optional)

Minimum required to display: TaskId, TaskName, Start, End

Table 3 — Dependencies

If you want “A depends on B”.

Columns

FromTask (Reference → Tasks) required (the task that depends on something)

ToTask (Reference → Tasks) required (the prerequisite task)

This is easier than writing a comma-separated text list.

Table 4 — People (optional)

Columns

Name (Text)

Email (Text) (optional)

2) How the widget will connect to Grist

You will add a Custom Widget view in Grist that loads a URL like:

https://YOURNAME.github.io/grist-gantt/

The widget will:

Read records from Tasks (current table or a specific table name)

Optionally read Dependencies

Render a Gantt chart

Support filtering by project (if Project exists)

React live when data changes

3) GitHub repo structure (for GitHub Pages)

Create a repo (example name): grist-gantt

Files

grist-gantt/
  index.html
  widget.js
  styles.css
  README.md

  What this supports out of the box

Live reading from your Tasks view

Optional dependencies if a Dependencies table exists

Project filter dropdown

Day/Week/Month view mode

Optional per-task color

Optional “milestone” boolean

Click a bar to see details

5) Publish on GitHub Pages

Push these files to GitHub repo grist-gantt

GitHub → Settings → Pages

Source: Deploy from a branch

Branch: main / folder /root

Your widget URL becomes:

https://YOURNAME.github.io/grist-gantt/

6) Add as a Grist Custom Widget

In Grist:

Open your doc

Go to the Tasks table

Add New → New Custom Widget

Paste the GitHub Pages URL

Grant “read table” access

Now the widget will render your Gantt using the Tasks records.

7) Practical notes (so you don’t get stuck)

Date columns: use Grist Date (or DateTime). The widget converts to YYYY-MM-DD.

Dependencies: easiest is the Dependencies table with references (clean + reliable).

Multiple projects: just fill Project in tasks and use the dropdown.

Grouping/ParentTask: you can add later (Frappe Gantt doesn’t do full collapsible hierarchies natively, but we can simulate grouping).