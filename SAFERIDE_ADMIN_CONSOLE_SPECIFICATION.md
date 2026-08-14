# SAFERIDE ADMIN CONSOLE — SPECIFICATION

## Companion to `SAFERIDE_BOT_DEV_SPECIFICATION.md`

**Version:** 1.0 (draft) | **Prepared by:** Veritas Interactive Limited
**Stack:** Node.js 18+ | Express.js (existing backend, extended) | MongoDB 6.0+ | React (admin frontend) | Meta WhatsApp Cloud API (existing bot, unchanged)

---

# 0. WHY THIS DOCUMENT EXISTS

The dev specification builds the passenger-facing bot and the officer alert path, and deliberately does **not** build a police case-management dashboard — that responsibility sits with PoliceConnect Uganda, correctly. But that decision leaves a real gap: nobody owns the data that makes SafeRide's dispatch engine trustworthy in the first place — checkpoint locations, duty officer rosters, route polylines — and nobody has a queue for the abuse cases the dev spec's detection logic flags but never resolves.

This document specs the **Veritas operator console** that fills that gap: an internal admin tool for Veritas staff (and a narrow supervisory slice for UPF, if wanted later) to manage the operational data SafeRide depends on, review flagged reports, and see whether the dispatch pipeline is actually working. It is explicitly **not** a police case-management system and does not duplicate PoliceConnect.

---

# 1. SCOPE

## In scope
- Roster and checkpoint management (the most urgent module — dispatch accuracy depends on this data being current)
- Route/corridor management
- Report review and abuse moderation queue
- Live operations map (pilot-phase visibility)
- Vehicle / repeat-offender registry view
- Analytics and reporting
- Notification template management
- Audit log viewer
- Admin user and role management

## Out of scope
- Police case management (stays in PoliceConnect)
- Any UI the general public touches (WhatsApp bot remains the only citizen-facing surface)
- Payments (SafeRide has none)
- Driver-facing anything (v1 has no driver app, per the dev spec)

## Who uses it
- **Veritas ops/support staff** — full access, day-to-day data maintenance, report moderation
- **Veritas engineering** — full access plus template/settings management
- **UPF liaison (optional, phase 2)** — read-only or roster-only access scoped to their own stations, if UPF wants visibility without full PoliceConnect integration yet

---

# 2. TECH STACK & ARCHITECTURE

Keep this on the same stack as the bot to avoid a second team/skillset:

- **Backend:** extend the existing Express.js app with an `/admin/api/*` namespace, guarded by a separate auth layer from the WhatsApp webhook routes. Do not bolt admin routes onto the public webhook surface.
- **Frontend:** a separate React SPA (Vite + React Router + a component library — e.g. Mantine or shadcn/ui — rather than building UI primitives from scratch) served independently from the bot process. Keeps a WhatsApp webhook outage and an admin-panel outage from being the same incident.
- **Auth:** session-based or JWT admin auth, **completely separate from passenger sessions** (which live in Redis with a 15-min TTL and are keyed by WhatsApp phone — admin auth should not share that store or that trust model). Recommend email/password + TOTP 2FA at minimum, given this touches reporter-adjacent data.
- **Database:** same MongoDB instance, new collections (section 6) plus additive fields on existing collections. No new database technology needed — this is CRUD-and-dashboards work, not a second geospatial engine.
- **Map rendering:** Mapbox GL JS or Leaflet + OpenStreetMap tiles for the route editor and live ops map — Leaflet/OSM is the cheaper default given this is a cost-sensitive GovTech build; upgrade to Mapbox only if the free OSM tile styling becomes a real limitation.

```
Admin Browser (React SPA)
     │
     ▼
/admin/api/*  (Express, JWT-auth middleware, RBAC middleware)
     │
     ├── RosterController        ──►  checkpoints, stations
     ├── RouteController         ──►  routes
     ├── ReportModerationController ──► reports, vehicles
     ├── AnalyticsController     ──►  reports, audit_logs (read-only aggregations)
     ├── TemplateController      ──►  message_templates (new)
     ├── AuditController         ──►  audit_logs (read-only)
     └── UserController          ──►  admin_users, admin_roles (new)
     │
     ▼
MongoDB (shared with bot backend — same collections where applicable)
```

**Architectural rule:** the admin backend reads and writes the *same* `checkpoints`, `routes`, `stations`, `reports`, and `vehicles` collections the bot's dispatch engine reads from. There is no sync job and no separate admin database — a change saved in the roster module is live for the next dispatch immediately. This is the entire point of building this: today that data is edited by hand in Mongo with no validation and no history.

---

# 3. ROLES & PERMISSIONS

| Role | Roster/Checkpoints | Routes | Reports/Moderation | Vehicles | Analytics | Templates | Audit Log | User Mgmt |
|---|---|---|---|---|---|---|---|---|
| **Super Admin** (Veritas eng) | Full | Full | Full | Full | Full | Full | Full | Full |
| **Ops Admin** (Veritas ops) | Full | Full | Full | Full | Full | Read | Read | None |
| **Moderator** (Veritas support) | Read | Read | Full | Read | Read | None | None | None |
| **UPF Liaison** (phase 2, scoped) | Read (own stations only) | Read | None — never sees reporter-adjacent data | None | Read (own stations only) | None | None | None |

**Hard rule carried over from the bot's own design:** no role, including Super Admin, gets a UI affordance that displays `reporterPhoneRaw` next to a case outside of the one legitimate flow (resending a status update to the reporter). The privacy structure the bot enforces at the schema level must not get quietly reversed by an admin table that joins the two fields for convenience. If a UI screen needs to display "reporter contact," it calls a dedicated masked-lookup endpoint (section 7) rather than reading the raw field into a general-purpose report view.

---

# 4. INFORMATION ARCHITECTURE — SIDE NAVIGATION

```
🏠 Dashboard
🚦 Checkpoints & Roster
🛣️  Routes & Corridors
📋 Reports
   ├─ All Reports
   ├─ Moderation Queue
   └─ Repeat Offenders (Vehicles)
🗺️  Live Operations Map
📊 Analytics & Reports
💬 Message Templates
🧾 Audit Log
👤 Users & Roles
⚙️  Settings
```

Moderator role sees only: Dashboard, Reports (all three sub-items), Live Operations Map. Ops Admin sees everything except Users & Roles. Only Super Admin sees Users & Roles and Settings.

---

# 5. MODULE SPECIFICATIONS

Each module below covers: purpose, the data table(s) it manages, the actions available on that table, and the business logic/edge cases the UI or backend must enforce.

## 5.1 Dashboard (home screen)

**Purpose:** answer "is the system working right now" in one screen, for both daily ops and stakeholder demos.

**Contents (stat tiles + small charts, not raw tables):**
- Reports today / this week, with trend vs. prior period
- Dispatch success rate (% of reports that resolved to a checkpoint vs. fell back to a station)
- Average time-to-officer-acknowledgment (reports where `officerAction` was set, minus `dispatch.dispatchedAt`)
- Open moderation queue count (flagged reports awaiting review) — badge this in the nav too
- Active checkpoints vs. total checkpoints (data-freshness signal — a checkpoint with no `onDuty` officers reads as "orphaned" here)
- Emergency-triage count (999/help keyword hits) — tracked separately since these never touch the report pipeline and are otherwise invisible
- Small map widget showing today's report locations (links through to the full Live Operations Map)

**Logic:** dashboard queries are all read-only aggregations against `reports`, `checkpoints`, and `audit_logs` — no writes originate here. Cache aggregation results for 60 seconds (Redis or in-memory) rather than hitting MongoDB on every dashboard load; these are ops-check queries, not real-time trading data.

## 5.2 Checkpoints & Roster

**Purpose:** the single most important module — this is the data the dispatch engine's `selectDispatchTarget` reads on every report. Stale data here silently breaks the product's core promise.

**Data table — Checkpoints list view**

| Column | Source field | Notes |
|---|---|---|
| Name | `checkpoints.name` | |
| Route(s) covered | `checkpoints.routeIdsCovered` | resolved to route names |
| Directions | `checkpoints.directionsCovered` | |
| Duty officers | `checkpoints.dutyOfficers` | show count + "N on duty now" computed against `shiftHours` |
| Shift hours | `checkpoints.shiftHours` | |
| Status | `checkpoints.isActive` | toggle |
| Fallback station | `checkpoints.fallbackStationId` | resolved to station name |
| Last edited | new field, section 6 | who/when |

**Actions:**
- **Create checkpoint** — form: name, location (map pin picker, not manual lat/lng entry), route(s) covered (multi-select), directions covered, shift hours, fallback station (required — the dispatch engine's fallback path breaks silently if this is null)
- **Edit checkpoint** — same fields; every save writes a `checkpoint_change_log` entry (section 6)
- **Activate / deactivate** — soft toggle, not delete; an inactive checkpoint drops out of `selectDispatchTarget` candidates immediately. Deactivating a checkpoint with zero remaining active checkpoints on a route triggers a warning: "this route will fall back to station dispatch for all reports — confirm?"
- **Manage duty officers (sub-panel on the checkpoint record)** — add/remove officer (badge ID, name, WhatsApp number), toggle on-duty/off-duty. **This toggle is the thing that should exist instead of the manual DB edit the dev spec currently punts to.**
- **Bulk shift-end sweep** — a scheduled job (not manual) that flips `onDuty: false` for any officer past their `shiftHours.end` who hasn't been explicitly extended, so a forgotten toggle doesn't leave alerts routing to someone off duty for days. Surface an admin override to extend a shift ad hoc.
- **Delete** — hard delete disabled entirely. A checkpoint with dispatch history must never disappear from referential integrity; deactivate instead.

**Logic / validation:**
- A checkpoint cannot be created without at least one route assigned and a fallback station assigned.
- Officer WhatsApp numbers are validated against E.164 format before save (a malformed number here means a real alert silently fails to send).
- Changing `directionsCovered` on a checkpoint that already has dispatch history triggers a confirmation modal explaining the effect ("this checkpoint will no longer receive eastbound alerts").

## 5.3 Routes & Corridors

**Purpose:** manage the corridor polylines the dispatch engine's proximity search and direction-of-travel logic depend on. The dev spec flags full corridor mapping as "a real GIS task" still needing Ministry of Works or OpenStreetMap data — this module is where that data actually gets entered and maintained over time, rather than hand-typed into a seed script forever.

**Data table — Routes list view**

| Column | Source field |
|---|---|
| Name | `routes.name` |
| Aliases | `routes.aliases` |
| District | `routes.district` |
| Bidirectional? | derived: checkpoints on this route cover both directions |
| Checkpoints on route | count, resolved |
| Status | `routes.isActive` |

**Actions:**
- **Create/edit route** — map-based polyline editor (click to add vertices, or import a GeoJSON/KML file if Ministry of Works supplies one) rather than a raw coordinate-array text field. This is the highest-leverage UX improvement over the current seed-script approach.
- **Add alias** — free text, used by the bot's route-matching/search
- **Activate/deactivate** — same soft-toggle pattern as checkpoints
- **Preview on map** — render the polyline plus all linked checkpoints together, to visually sanity-check "ahead of travel" logic before it goes live (a crossed or malformed polyline is very easy to create by accident and very hard to debug from a bug report alone)

**Logic / validation:**
- Reject self-intersecting polylines on save (a quick geometry check) — these silently corrupt the `isAheadOnRoute` distance-along-line calculation.
- Warn (don't block) when a new route's polyline passes within a small radius of an *existing* route's polyline without sharing any checkpoints — likely a duplicate or a missed checkpoint link.
- Deactivating a route with active checkpoints still attached requires deactivating or reassigning those checkpoints first (guardrail against orphaned checkpoints).

## 5.4 Reports — All Reports

**Purpose:** the operational record of every report, for lookup and support use (a reporter calls in, an officer disputes an outcome, etc.) — read-heavy, not a queue.

**Data table**

| Column | Source field |
|---|---|
| Case ID | `reports.caseId` |
| Reported at | `reports.reportedAt` |
| Route / direction | `reports.routeName`, `directionOfTravel` |
| Vehicle | `reports.vehicle.plateNumber` or `.description` |
| Violation | `reports.violationType` |
| Dispatch target | `reports.dispatch.checkpointName` or station |
| Status | `reports.status` |
| Priority | `reports.dispatch.priority` |
| Corroborated? | `reports.corroboration.isCorroborated` |

Notably **absent from this table by design:** any reporter-identifying column. Filtering/search works by case ID, plate number, route, date range, and status — never by phone number, matching the bot's own privacy structure.

**Actions:**
- **View detail** — full record, map pin of report location, dispatch trace (what was evaluated, what was selected and why — surfaces the `selectDispatchTarget` decision for support/debugging)
- **Manual status override** — for the rare case where PoliceConnect's webhook and the WhatsApp button both fail; requires a reason note, writes to `audit_logs`
- **Resend reporter notification** — re-triggers `notifyReporterOfOutcome` via the masked-lookup path (never displays the raw number in the UI)
- **Export** — CSV export of a filtered view, for ad hoc analysis or handoff to Ministry of Works/UPF

## 5.5 Reports — Moderation Queue

**Purpose:** this is the workflow the dev spec's abuse-prevention table describes detection for but never resolves. Every report the detection logic flags needs a human decision, or the detection logic is just a table in a document.

**Queue composition** — reports auto-enter this queue when any of:
- `vehicle.plateConfidence === "unconfirmed"` (guided-description path used)
- GPS rejected or flagged low-accuracy (outside Uganda bounding box, caught before dispatch; or poor accuracy metadata, flagged after)
- Reporter has hit the 5-reports/24h rate limit (the report that triggered the limit, plus a flag on the account)
- `locationSource === "text-fallback"` (lower routing confidence, per the dev spec)

**Data table** — same columns as All Reports, plus a **Flag reason** column and an **Age in queue** column (surface anything sitting unreviewed past a threshold, e.g. 24h, in red).

**Actions:**
- **Dismiss flag** — report proceeds/stands as normal, no further action; logged
- **Confirm abuse** — marks the report `status: "Rejected"`, and offers a follow-on action to flag the *reporter number* for a cooldown or ban (see below)
- **Merge/link to existing case** — for likely-duplicate reports on the same incident
- **Escalate to Super Admin** — for anything a moderator isn't confident deciding alone

**Reporter-level moderation:** a lightweight `moderation_flags` sub-resource keyed by `reporterPhoneHash` (never the raw number) — records: warning count, cooldown-until timestamp, permanent-ban flag. The bot's intake flow checks this before accepting a new report (a banned/cooling-down hash gets a polite decline message, not a silent failure). This closes the loop the dev spec's rate-limit table opens but doesn't finish.

## 5.6 Vehicles (Repeat Offenders)

**Purpose:** operational view of the `vehicles` collection the dispatch engine already writes to for `flagLevel` escalation — currently invisible to anyone except through raw DB queries.

**Data table**

| Column | Notes |
|---|---|
| Plate number | |
| Report count (30-day / 90-day) | matches the dev spec's escalation windows |
| Flag level | STANDARD / HIGH |
| First / most recent report | |
| Linked case IDs | |

**Actions:**
- **View report history** for a plate (all linked cases, read-only)
- **Manual flag override** — set/clear HIGH flag manually (e.g., UPF requests a specific plate be watched, or a false-positive escalation needs correcting), with a required reason note, audit-logged
- **Export** — for handoff to UPF/PoliceConnect if they want to cross-reference against their own records

## 5.7 Live Operations Map

**Purpose:** pilot-phase and ongoing operational visibility — "what is happening right now," distinct from PoliceConnect's own dashboard, which Veritas doesn't have visibility into by default.

**Contents:** live map (auto-refresh every 15–30s, not a websocket requirement for v1) showing:
- Active/recent report pins, colored by status (Dispatched / Acknowledged / Intercepted / Escalated), clustered at zoom-out
- Checkpoint pins, colored by on-duty status
- Route polylines, toggleable per corridor
- Click-through from any pin to the full report/checkpoint detail

**Logic:** this is a read-only visualization layer over `reports` (filtered to the last 24–48h by default, adjustable) and `checkpoints` — no new write logic. The main engineering cost here is the map component itself, not backend work, since the geospatial data already exists.

## 5.8 Analytics & Reports

**Purpose:** the metrics that prove the system works — for internal ops, for Ministry of Works corridor planning (the dev spec's own phase-2 idea), and for the next sales pitch.

**Standard views:**
- Reports by route / by time-of-day / by violation type (the "hotspot heatmap" the dev spec names as phase 2 — the data for it already accumulates from day one, this module just needs to expose it)
- Dispatch outcome breakdown (Intercepted / Not seen / Escalated / no-response) as a funnel
- Checkpoint performance — acknowledgment time, intercept rate, per checkpoint
- Repeat-offender trend over time
- Corroboration rate (how often independent reports agree — a system-health signal, not just an offender signal)

**Actions:** date-range filter, export (CSV/PDF) per view, and a "shareable snapshot" export suited for a stakeholder deck (ties back to the commercial-pitch need flagged in the earlier assessment).

**Logic:** all aggregation pipelines are read-only against `reports`; nothing here should require a schema change beyond adding the indexes needed to make these aggregations fast at scale (section 6).

## 5.9 Message Templates

**Purpose:** Meta WhatsApp template messages require pre-approval and the dev spec already has at least one (`saferide_report_alert`) hardcoded in `templates.js`. As more templates accumulate (reporter status updates, moderation notices, ban notifications), managing them as code deploys doesn't scale operationally.

**Data table:** template name, category (UTILITY/etc.), body with `{{n}}` placeholders, Meta approval status, last-used timestamp.

**Actions:** view (read-only for template *content*, since edits require Meta re-approval and can't just be saved locally) — sync approval status from Meta's API, and log which backend event fires which template, mainly as a reference/debugging tool for ops staff who aren't reading source code.

## 5.10 Audit Log

**Purpose:** surface the `audit_logs` collection the dev spec's DB structure already includes but never builds a service or view for. Given this system feeds real police dispatch decisions, every admin action needs to be reconstructable later.

**Data table:** timestamp, actor (admin user), action type, target record (checkpoint/route/report/vehicle/user), before/after diff where applicable, reason note (required on sensitive actions — manual status override, flag override, ban).

**Actions:** filter by actor, action type, date range, target record. Read-only — this table is never edited, only appended to.

## 5.11 Users & Roles

**Purpose:** manage who has admin access at all — currently nonexistent; presumably direct DB access today.

**Data table:** name, email, role (section 3), station scope (for future UPF-liaison role), last login, active/suspended.

**Actions:** invite user (email-based invite flow), assign/change role, suspend/reactivate, force password reset, view login history (ties into audit log). Only Super Admin role can reach this module.

## 5.12 Settings

**Purpose:** the small number of system-wide knobs that shouldn't be hardcoded constants forever.

**Contents:** `AVG_CORRIDOR_SPEED_KMH` (currently a hardcoded constant in the dispatch engine — worth making route-tunable here eventually, station-level even later), corroboration time window (currently 20 min), repeat-offender thresholds (currently 3 reports/30 days for HIGH), rate-limit threshold (currently 5/24h), Uganda GPS bounding box coordinates.

---

# 6. DATABASE SCHEMA — NEW COLLECTIONS & CHANGES

## 6.1 New collection: `admin_users`

```javascript
{
  _id: ObjectId,
  name: "Grace Nakato",
  email: "grace@veritasinteractive.com",
  passwordHash: "...",
  role: "ops_admin",              // super_admin | ops_admin | moderator | upf_liaison
  stationScope: [],                // populated only for upf_liaison role — array of checkpointIds/stationIds
  isActive: true,
  twoFactorEnabled: true,
  lastLoginAt: ISODate,
  createdAt: ISODate,
  updatedAt: ISODate
}
db.admin_users.createIndex({ email: 1 }, { unique: true })
```

## 6.2 New collection: `checkpoint_change_log` (and equivalent `route_change_log`)

Could also be folded into a generalized `audit_logs` schema (recommended — see 6.3) rather than a separate collection per entity. Documented here separately for clarity of what fields matter:

```javascript
{
  _id: ObjectId,
  entityType: "checkpoint",
  entityId: "CKP-SEETA-001",
  action: "update",                // create | update | activate | deactivate | delete-attempted
  changedBy: ObjectId,             // -> admin_users
  before: { /* prior doc snapshot or diff */ },
  after: { /* new doc snapshot or diff */ },
  reason: null,                    // required for status overrides, flag overrides, bans
  timestamp: ISODate
}
```

## 6.3 Generalize `audit_logs` (already exists in the bot's schema, currently unused by any documented service)

Recommend collapsing 6.2 into this collection with an `entityType` discriminator, rather than maintaining N parallel `*_change_log` collections:

```javascript
db.audit_logs.createIndex({ entityType: 1, entityId: 1, timestamp: -1 })
db.audit_logs.createIndex({ changedBy: 1, timestamp: -1 })
```

## 6.4 New collection: `moderation_flags`

```javascript
{
  _id: ObjectId,
  reporterPhoneHash: "sha256(...)",   // same hash the reports collection uses — never store raw phone here either
  warningCount: 1,
  cooldownUntil: null,                // ISODate or null
  isBanned: false,
  flagHistory: [
    { reason: "rate-limit-exceeded", caseId: "SR-2026-004521", flaggedBy: "system", timestamp: ISODate }
  ],
  createdAt: ISODate,
  updatedAt: ISODate
}
db.moderation_flags.createIndex({ reporterPhoneHash: 1 }, { unique: true })
```

## 6.5 New collection: `message_templates` (metadata only — content sync from Meta, not authored here)

```javascript
{
  _id: ObjectId,
  templateName: "saferide_report_alert",
  category: "UTILITY",
  bodyPreview: "🚨 SafeRide Alert — Case {{1}} ...",
  metaApprovalStatus: "APPROVED",     // PENDING | APPROVED | REJECTED
  triggerEvent: "dispatchReport() -> notifyOfficer()",
  lastUsedAt: ISODate,
  createdAt: ISODate
}
```

## 6.6 New collection: `app_settings` (singleton-style config doc, replacing hardcoded constants)

```javascript
{
  _id: "saferide-config",
  avgCorridorSpeedKmh: 35,
  corroborationWindowMinutes: 20,
  repeatOffenderThreshold: { count: 3, windowDays: 30 },
  rateLimitPerReporter: { count: 5, windowHours: 24 },
  ugandaBoundingBox: { /* geojson polygon or lat/lng min/max */ },
  updatedBy: ObjectId,
  updatedAt: ISODate
}
```

## 6.7 Additive fields on existing collections

`checkpoints` — add:
```javascript
lastEditedBy: ObjectId,    // -> admin_users
lastEditedAt: ISODate,
shiftEndSweepEnabled: true // whether the scheduled off-duty sweep applies to this checkpoint's officers
```

`routes` — add:
```javascript
lastEditedBy: ObjectId,
lastEditedAt: ISODate,
polylineSource: "manual" // manual | osm-import | ministry-of-works-import
```

`reports` — add:
```javascript
moderationStatus: "clean", // clean | flagged | reviewed-dismissed | reviewed-confirmed
flagReasons: [],            // e.g. ["unconfirmed-plate", "rate-limit"]
```

No breaking changes to any field the dispatch engine currently reads — every addition above is additive and defaults safely (e.g., `moderationStatus: "clean"` for all historical reports on migration).

---

# 7. API ENDPOINTS (new `/admin/api` namespace)

```
# Auth
POST   /admin/api/auth/login
POST   /admin/api/auth/logout
POST   /admin/api/auth/2fa/verify

# Checkpoints & roster
GET    /admin/api/checkpoints
POST   /admin/api/checkpoints
PATCH  /admin/api/checkpoints/:id
PATCH  /admin/api/checkpoints/:id/officers/:officerId/duty-status
POST   /admin/api/checkpoints/:id/activate
POST   /admin/api/checkpoints/:id/deactivate

# Routes
GET    /admin/api/routes
POST   /admin/api/routes
PATCH  /admin/api/routes/:id
POST   /admin/api/routes/:id/activate
POST   /admin/api/routes/:id/deactivate

# Reports
GET    /admin/api/reports                      -> filtered/paginated, no reporter-identifying fields
GET    /admin/api/reports/:caseId
PATCH  /admin/api/reports/:caseId/status        -> manual override, requires reason
POST   /admin/api/reports/:caseId/resend-notification
GET    /admin/api/reports/export

# Moderation
GET    /admin/api/moderation/queue
POST   /admin/api/moderation/:caseId/dismiss
POST   /admin/api/moderation/:caseId/confirm    -> optional cascade to reporter flag
GET    /admin/api/moderation/reporter/:phoneHash
POST   /admin/api/moderation/reporter/:phoneHash/ban
POST   /admin/api/moderation/reporter/:phoneHash/cooldown

# Vehicles
GET    /admin/api/vehicles
GET    /admin/api/vehicles/:plateNumber
PATCH  /admin/api/vehicles/:plateNumber/flag-level

# Analytics
GET    /admin/api/analytics/overview
GET    /admin/api/analytics/hotspots
GET    /admin/api/analytics/checkpoint-performance

# Templates (read + Meta status sync only)
GET    /admin/api/templates
POST   /admin/api/templates/sync-status

# Audit
GET    /admin/api/audit-logs

# Users
GET    /admin/api/users
POST   /admin/api/users/invite
PATCH  /admin/api/users/:id/role
POST   /admin/api/users/:id/suspend

# Settings
GET    /admin/api/settings
PATCH  /admin/api/settings
```

Every mutating endpoint here writes an `audit_logs` entry as a side effect, not as something each controller remembers to do individually — implement it as shared middleware, or it will be inconsistently applied within a sprint or two.

---

# 8. MIGRATION PLAN

This assumes the bot backend (dev spec) is already built or in progress, and the admin console is layered on afterward — which matches the current project state (spec complete, not yet built).

## Phase 0 — Pre-migration audit
- [ ] Export current state of `checkpoints`, `routes`, `stations` from whatever seed data or manual entries exist
- [ ] Confirm no production reports reference a checkpoint/route ID that would be renamed or restructured

## Phase 1 — Additive schema migration (safe, non-breaking)
- [ ] Add new fields to `checkpoints`, `routes`, `reports` per section 6.7 — all with safe defaults, no existing reads or writes break
- [ ] Create new collections: `admin_users`, `moderation_flags`, `message_templates`, `app_settings`, and generalize `audit_logs` indexes per 6.3
- [ ] Backfill `moderationStatus: "clean"` on all existing `reports` documents
- [ ] Backfill `app_settings` singleton doc with the current hardcoded constants (`AVG_CORRIDOR_SPEED_KMH: 35`, etc.) so the dispatch engine has a config source to migrate to

## Phase 2 — Decouple hardcoded constants
- [ ] Update the dispatch engine (`selectDispatchTarget`, `checkCorroboration`, rate-limit checks) to read from `app_settings` instead of hardcoded constants, with an in-process cache (invalidate on settings save) so this isn't a DB read per report
- [ ] This is the one change that touches the *existing* dev-spec code, not just additive new code — flag it for extra test coverage

## Phase 3 — Build admin backend
- [ ] Scaffold `/admin/api` namespace, separate auth middleware from the WhatsApp webhook auth model
- [ ] Build controllers per module (section 5), wire audit-logging middleware
- [ ] Seed one `super_admin` admin_users record manually (not via the invite flow, which doesn't exist yet) to bootstrap access

## Phase 4 — Build admin frontend
- [ ] Scaffold React SPA, auth flow first
- [ ] Build Checkpoints & Roster module first — it's the highest-value module and the one currently blocking safe pilot operation
- [ ] Routes & Reports & Moderation Queue next
- [ ] Dashboard, Live Ops Map, Analytics, Templates, Audit Log, Users last — useful but not launch-blocking

## Phase 5 — Cutover
- [ ] Migrate any remaining manually-maintained checkpoint/officer data into the new module via the UI (or a one-time import script) — this retires the "manual DB update process for pilot" the dev spec currently accepts as a stopgap
- [ ] Turn on the scheduled shift-end sweep job
- [ ] Confirm pilot corridor's checkpoints and officers are fully represented before go-live

## Data risk notes
- No destructive migrations anywhere in this plan — every step is additive or a read-path change (constants → settings doc). This can be built and rolled out incrementally without a maintenance-window cutover.
- The one thing worth double-checking before Phase 2 ships: confirm the in-process settings cache invalidates correctly, since a stale `AVG_CORRIDOR_SPEED_KMH` silently skews ETA estimates rather than failing loudly.

---

# 9. BUILD PLAN / PHASING SUMMARY

| Phase | Focus | Blocking for pilot? |
|---|---|---|
| 1 | Additive schema migration | Yes — prerequisite for everything else |
| 2 | Constants → settings decoupling | No, but recommended before scaling past the pilot corridors |
| 3 | Admin backend (Checkpoints/Roster first) | Yes — pilot should not run on manual DB edits |
| 4 | Admin frontend (Checkpoints/Roster first) | Yes, same reason |
| 4b | Routes, Reports, Moderation Queue | Recommended before pilot, not strictly blocking |
| 4c | Dashboard, Live Ops Map, Analytics, Templates, Audit Log, Users | Post-pilot / phase 2 |

**Recommended sequencing relative to the bot build itself:** build the Checkpoints & Roster module in parallel with Week 3–4 of the bot's own build plan (the dispatch engine and integration weeks), not after — the pilot corridor's real checkpoint and officer data needs to already be entered through this tool by the time the bot is ready to test against it, or the team ends up hand-editing Mongo anyway just to run the first real test.

---

# 10. OPEN QUESTIONS

- Does UPF want any admin visibility at all in phase 1, or is that purely a phase-2 conversation contingent on the PoliceConnect relationship being formalized?
- Should the moderation queue's "confirm abuse → ban reporter" action require two-person sign-off, given a wrongful ban blocks someone from ever reporting a real safety issue again? Recommend yes for bans, optional for warnings/cooldowns.
- Where does `app_settings` versioning matter — if a corroboration-window change should apply only going forward vs. retroactively affect in-flight reports, that needs an explicit decision before Phase 2 ships.
- Is a UPF liaison role worth building now or genuinely deferred — building the role scaffolding (section 6.1's `stationScope` field) now costs little, but building the actual scoped views is real work best deferred until there's a confirmed UPF counterpart to build it for.
