# AQCMS User Guide & Testing Handbook

**Academic Quality & Compliance Management System — School of Computing, APIIT**

This guide assumes you have never seen AQCMS before. It explains what the system is, what every feature does, and gives you a click-by-click script to test each one — role by role. Every script uses the demo data already loaded into the live system, so you can follow along exactly.

---

## 1. What is AQCMS?

Before AQCMS, the School of Computing tracked its academic quality evidence — assessment briefs, verification forms, marking schemes, moderation reports — in a deeply nested shared drive, with a manually updated spreadsheet ("Subject File Tracker") recording who had approved what. Deadlines lived only inside a procedure manual. Nobody had a live view of what was overdue or waiting on whom.

AQCMS replaces all of that with a single web platform where:

- Every staff member logs in and sees **only what belongs to their role** — their own tasks, their own approvals, their own modules.
- Documents move through **approval chains** (e.g. Lecturer → Internal Verifier → Module Leader → Level Coordinator → Head of School) automatically, with each hand-off notified instantly.
- Deadlines from the procedure manual become **real tasks with due dates**, reminders, and automatic escalation to the Head of School when ignored.
- Every upload, approval, and return is recorded in a **tamper-proof audit trail** (nobody can edit or delete history), supporting ISO 21001:2018 compliance.
- The Head of School sees the **entire school's status on one dashboard** instead of opening folders.

## 2. Getting started

| | |
|---|---|
| **Web address** | https://aqcms-soc.appwrite.network |
| **Works on** | Any modern browser — desktop, tablet, or phone |
| **Password (all demo accounts)** | `Apiit@123` |

### Demo accounts

| Email | Person | Role |
|---|---|---|
| `hod@apiit.lk` | Dr. Chaman Wijesiriwardana | Head of School (HOD) |
| `superadmin@apiit.lk` | Sanjay Perera | Super Admin (system administrator) |
| `lecturer@apiit.lk` | Tharindu Weerasinghe | Lecturer |
| `moduleleader@apiit.lk` | Ruwan Fernando | Module Leader |
| `levelcoord@apiit.lk` | Kumari Jayasuriya | Level Coordinator (Levels 4 & 5) |
| `verifier@apiit.lk` | Aisha Farook | Internal Verifier |
| `moderator@apiit.lk` | Shanika Rathnayake | Moderator |
| `acadadmin@apiit.lk` | Dilini Gunawardena | Academic Administrator |

> **Tip for testing two roles at once:** open one account in a normal browser window and the second in an incognito/private window. Two normal windows share one login.

## 3. Ten concepts in plain language

1. **Role** — what you're allowed to see and do. One person can hold several roles (e.g. a Lecturer who is also the Module Leader of one module).
2. **Workflow / Submission** — a piece of evidence (e.g. an exam paper) travelling through an approval chain. At any moment it is "waiting on" exactly one role.
3. **Workflow template** — the definition of a chain (which roles approve, in what order). The Super Admin can create or change these without touching code.
4. **Return for revision** — an approver sends a submission back to its author with a mandatory comment explaining what to fix. The author resubmits and it re-enters the chain at the same stage.
5. **Task** — a to-do with a due date. Tasks are generated automatically from **deadline rules** ("subject file due 9 weeks before semester start") or assigned manually.
6. **Escalation** — if a task stays overdue for 3 days, the Head of School is alerted automatically.
7. **Subject file** — the digital checklist of required documents for a subject (Module Descriptor, IVF, assessments, marking scheme, mark grid…). Each slot tracks its own status and keeps every uploaded version.
8. **Restricted slot** — exam-paper slots whose files only reviewers and the uploader can open. Other staff cannot download them even with a direct link.
9. **Case** — a confidential record (student mentoring, exceptional circumstances, academic conduct). Visible only to whoever logged it and the HOD.
10. **Audit trail** — the permanent history of every action. Append-only: it can be read and exported, never edited.

## 4. What everyone sees (any role)

After logging in you land on **your dashboard**. Regardless of role you always have:

- A stat row: *Open Tasks · Awaiting My Approval · My Submissions · Returned to Me · Unread Notifications* — each card is clickable.
- **My Deadlines** — your next due tasks with colour-coded urgency (red = overdue).
- **My Tasks** (sidebar) — full task list: overdue / upcoming / completed. Tick the circle to complete a task.
- **Notifications** (sidebar + bell icon) — everything that needs your attention. The bell updates **live** — no refresh needed — and a toast pops up in the corner when something new arrives.
- **Subject Files** (sidebar) — browse document checklists (what you can *do* there depends on role).

**Quick test:** log in as any account → confirm the dashboard greets you by name with your role under it → click each stat card and confirm it navigates correctly.

---

## 5. Role-by-role walkthroughs

### 5.1 Lecturer (`lecturer@apiit.lk`)

*The evidence producer. Uploads assessments and documents, tracks approvals, fixes returned items.*

**Dashboard tour** — you should see: an overdue red task ("Submit End of Module Report"), an item under **Needs Your Attention** (a Lesson Sequence Sheet returned for revision), and several submissions in various stages.

**Test 1 — Submit evidence into a workflow**
1. Sidebar → **New Submission**.
2. Template: *Assessment Preparation & Verification*. Notice the chain preview: *You submit → Internal Verification → Module Leader → Level Coordinator → HOD*.
3. Subject: any COM2521 subject. Title: "My test submission". Attach any small file. **Submit for Approval**.
4. You land on the submission's page: a stage timeline on the right shows stage 1 highlighted ("Waiting on Internal Verifier"). The Internal Verifier is notified instantly (in-app + email).

**Test 2 — Fix a returned submission**
1. Dashboard → **Needs Your Attention** → open *"Lesson Sequence Sheet — Weeks 1–12"*.
2. Read the reviewer's comment in **History** ("Weeks 9–10 do not match the module descriptor…").
3. In the amber panel, optionally attach a revised file, describe your change, and click **Resubmit for Approval**. Status returns to *In Progress* and the Module Leader is re-notified.

**Test 3 — Work a subject file checklist**
1. Sidebar → **Subject Files** → open *Cloud Infrastructure & Design — Assessment* (COM2521).
2. You'll see a progress bar and six document slots in different states. Find **Marking Scheme — Returned for Revision** and read the reviewer's note.
3. Click **Upload New Version** and attach any file. The slot becomes *Submitted* and its version number increases. Click **History** to see every previous version, downloadable.
4. Note the **Assessment — Examination** slot marked *Restricted* — files there are only visible to reviewers and the uploader.

**Test 4 — Log a confidential case**
1. Sidebar → **Support & Cases** → choose a tab (Mentoring / Exceptional Circumstances / Academic Conduct) → **Log** button.
2. Fill in a student reference and details, save. Open it, add a note, change status. Only you and the HOD can ever see this case.

**Test 5 — Complete a task** — Sidebar → **My Tasks** → tick "Prepare re-sit examination paper". It moves to Completed (tick again to reopen).

**Also check:** **Appraisals** shows your own appraisal record (read-only — recorded by the HOD; no one else, not even the Super Admin, can see it).

---

### 5.2 Internal Verifier (`verifier@apiit.lk`)

*Checks assessments against learning outcomes before they go up the chain (the IVF stage).*

**Test 1 — Approve a verification**
1. Dashboard → **Waiting on You** (or sidebar → **Approvals Queue**): *"In-course Assessment Brief v1"* is at your stage — plus anything the Lecturer submitted in test 5.1.
2. Open it. View/download the evidence files. In the teal action panel add a comment ("IVF completed") and click **Approve Stage**. Watch the timeline tick to the Module Leader stage.

**Test 2 — Return with mandatory comment**
1. Open another item at your stage → **Return for Revision**.
2. Try clicking **Return Submission** with an empty comment — the button stays disabled. A comment is compulsory (this is an SRS requirement, WF-03). Write one and return it; the Lecturer is notified with your comment.

**Test 3 — Review a subject-file slot** — Subject Files → COM2521 Assessment → on a *Submitted* slot use **Start Review** / **Approve** / **Return**.

---

### 5.3 Module Leader (`moduleleader@apiit.lk`)

*Owns modules; first main approver; can also assign tasks.*

**Dashboard tour** — **My Modules** cards show each offering you lead (module code, semester, lecturers), plus your approval queue.

**Test 1 — Approve at your stage** — Approvals Queue → *"Examination Paper & Marking Scheme"* → approve → it moves to the Level Coordinator.

**Test 2 — Assign a task** — My Tasks → **New Task** → title "Test task", assign to Tharindu Weerasinghe, pick a due date → the Lecturer instantly receives it (check their account: it appears under My Tasks and as a notification/email).

**Test 3 — Review subject-file slots** — same as verifier: approve or return slots on your modules.

---

### 5.4 Level Coordinator (`levelcoord@apiit.lk`)

*Quality gate across all modules in their level(s) — here, Levels 4 & 5.*

**Dashboard tour** — hero shows your level assignments as chips; **My Levels — Module Status** shows compliance cards per level.

**Test — Approve after the Module Leader** — Approvals Queue → *"Re-sit Assessment Pack"* (already passed IVF and Module Leader) → open, inspect history (you can see both earlier approvals with comments) → approve → it advances to the HOD. Your queue only ever contains items *within your levels* that have already cleared the Module Leader.

---

### 5.5 Moderator (`moderator@apiit.lk`)

*Assigned per cycle by the HOD to internally moderate marked assessments (the IMF).*

**Dashboard tour** — hero shows the moderation cycle you're assigned to (COM2521).

**Test — Complete a moderation** — Approvals Queue → *"Internal Moderation Sample — Semester 1 Scripts"* → review, add your IMF comments, **Approve Stage** (goes to HOD sign-off) or **Return** to the lecturer for corrective action. Also note the overdue IMF task on your task list — that's the deadline engine tracking you.

---

### 5.6 Head of School (`hod@apiit.lk` — Dr. Chaman Wijesiriwardana)

*School-wide oversight: sees everything, signs off finally, owns governance.*

**Dashboard tour** — the richest view: a compliance **ring** (percentage of submissions fully approved), a **Governance Snapshot** (open cases, risks, appraisal completion, escalated tasks), per-level compliance cards, **Pending Final Sign-off**, and a live **Recent Activity** feed.

**Test 1 — Final sign-off** — open *"Mark Grid & End of Module Report"* from Pending Final Sign-off → **Approve Stage** → status becomes *Approved* and the record locks (green banner). The submitting lecturer is notified of completion.

**Test 2 — Unblock a stalled approval (HOD override)** — open any submission waiting on someone else (e.g. one at the Verifier stage). You'll see a purple **HOD Override** panel: enter a reason and approve on their behalf, or return it. The override reason is written to the audit trail.

**Test 3 — Governance** — sidebar → **Governance**:
- *Risk Register* tab: two seeded risks; add one, edit severity/status.
- *Committee Meetings* tab: open the seeded Programme Committee meeting; note the open action item; tick it done.
- *Documents* tab: the Student Handbook entry; upload a file against it (version bumps).

**Test 4 — Appraisals** — sidebar → **Appraisals**: cycle completion tiles + records per staff member. Open Ruwan Fernando's draft, complete the fields, set status *Completed*, save. Log in as `moduleleader@apiit.lk` afterwards to confirm he can *read* it but not edit — and as `superadmin@apiit.lk` to confirm the Super Admin sees **nothing** at all.

**Test 5 — Reports & CSV export** — sidebar → **Reports & Audit**: four tabs (Workflow Compliance, Subject File Checklists, Tasks & Deadlines, Audit Trail). Click **Export CSV** on each — this is the direct replacement for the old tracker spreadsheet.

**Test 6 — Escalations** — the Governance Snapshot shows *Escalated Tasks*; the lecturer's End-of-Module-Report task went 3+ days overdue, so it was auto-escalated to you (you'll also have received the escalation notification/email).

**Test 7 — Deadline rules** — sidebar → Administration → **Deadline Rules**: the five seeded procedure-manual rules. You can add rules and **Generate Tasks** for a semester (see 5.8 — same feature the Super Admin has).

**Test 8 — Case oversight** — **Support & Cases** shows all three seeded cases (logged by different staff). Open one, add a note, resolve it.

---

### 5.7 Academic Administrator (`acadadmin@apiit.lk`)

*Delegated data entry: intakes, batches, offerings, subjects — but not the core taxonomy.*

**Test 1 — Allowed areas** — sidebar → Academic Structure → **Intakes / Batches** → **Add** one (e.g. batch code TEST-2027, any programme/year/semester) → it saves. Same for **Module Offerings** and **Subjects**.

**Test 2 — The delegation boundary** — open **Academic Years** or **Programmes**: there is no Add/Edit button for you — those are Super-Admin-only. This boundary is enforced by the server, not just hidden in the interface.

---

### 5.8 Super Admin (`superadmin@apiit.lk`)

*Runs the system itself: accounts, roles, structure, workflow templates, deadline rules. Deliberately excluded from academic content (cases, appraisals).*

**Test 1 — Create a staff account**
1. Sidebar → **Users & Roles** → **Create Account**. Name "Test User", email `testuser@apiit.lk`, temporary password `Testing@123`, tick a role → create.
2. Log in as that user in an incognito window: you are **forced to change the password** before doing anything else (first-login policy). Change it and land on the dashboard.

**Test 2 — Scoped role assignments** — Users & Roles → any user → **Assignments** → add e.g. *Moderator, scope: Module COM2612, with start/end dates* → this is what drives cycle-scoped access. Revoke it afterwards.

**Test 3 — Other account operations** — on a user row: **Roles** (change roles), **Reset PW** (they must change it at next login), **Deactivate** (they can no longer log in; their history is preserved — try logging in as them to confirm). Also try **Import CSV** with a file like:
```
name,email,password,roles
Jane Silva,jane@apiit.lk,Welcome@123,lecturer
```

**Test 4 — Workflow templates** — sidebar → **Workflow Templates** → **New Template** → add stages in any order (reorder with ↑↓), save, then confirm it appears as an option under New Submission. Edits never affect submissions already in flight (they carry a snapshot of the chain).

**Test 5 — Deadline rules → real tasks** — Administration → **Deadline Rules** → **Generate Tasks** → pick *Semester 1 — 2026/27* → tasks are created for every relevant person (per offering for lecturers/module leaders, per assignment for other roles). Run it twice — the second run creates nothing (duplicates are skipped). Check **My Tasks → All tasks** to see the school-wide result.

**Test 6 — What the Super Admin CANNOT do** — open **Support & Cases**? Not in the menu. **Appraisals** shows nothing. This is by design (SRS APR-03): account power does not equal content access.

---

## 6. Cross-cutting tests

**Realtime (no refresh needed)**
1. Window A (normal): log in as `moduleleader@apiit.lk`, stay on the dashboard.
2. Window B (incognito): log in as `lecturer@apiit.lk`, submit a *Lesson Sequence Sheet Approval*.
3. Watch Window A: within a couple of seconds the bell count increases and a toast slides in — without touching anything.

**Email notifications**
Every notification also becomes a branded email (APIIT logo, teal design, signed by Dr. Chaman Wijesiriwardana, Head of Computing). In demo mode all emails are delivered to the configured demo inbox with an orange note showing the *intended* recipient — proving per-person routing while the sending domain is unverified.

**Mobile** — open the site on a phone: the sidebar becomes a slide-in drawer (☰), dashboards stack into single columns, tables scroll sideways within their cards, and approvals work with a thumb.

**Security spot-checks** (each should fail politely or show nothing):
- As Lecturer, try the URL `/admin/users` → "Access denied".
- As Moderator, open Subject Files → the restricted exam slot's file: no access.
- As Super Admin, look for cases/appraisals → invisible.
- As anyone, try to edit an already-approved submission → no action buttons; the record is locked.

## 7. Troubleshooting

| Symptom | Explanation |
|---|---|
| "Access denied" page | Your role doesn't include that area — expected behaviour, not an error. |
| No items in Approvals Queue | Nothing is currently at *your* stage. Submit something as a Lecturer first. |
| Two accounts keep swapping | Use an incognito window for the second login — same-browser windows share a session. |
| Forced to change password | First login (or after an admin reset). Set a new password (min 8 characters) and continue. |
| Emails all arrive in one inbox | Demo mode. Verifying a sending domain with the email provider enables per-person delivery. |

---

*AQCMS v1.0 · School of Computing, APIIT · aligned with the APIITEMS Procedure Manual (ISO 21001:2018)*
