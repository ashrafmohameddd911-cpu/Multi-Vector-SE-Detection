# SpiderNET — AI Coding Handoff

> This file is the onboarding document for AI coding assistants (Claude Code, Cursor, Cline, Aider, Continue, etc.). Read this first, then `MIGRATION.md`, then start coding.

## What this project is

**SpiderNET** is a Next.js 16 + React 19 dashboard for detecting social-engineering attacks across **email, SMS, and phone-call vectors**. It's a graduation project. The stack is:

- **Next.js 16** (App Router, Turbopack dev server) + **React 19** + **TypeScript 5.7**
- **Tailwind v4** + **shadcn/ui** (Radix primitives)
- **MySQL 8** (source of truth for events + scoring) via `mysql2/promise`
- **Neo4j 5** (graph projection for the threat map and campaign graph) via `neo4j-driver`
- **Cytoscape.js** + `cytoscape-fcose` + `cytoscape-cxtmenu` for graph visualisation
- **Recharts** for charts, **lucide-react** for icons

The dashboard has five pages: `/` (live dashboard), `/alerts` (alert queue), `/investigation?group=<id>` (single-group investigation with "why this alert" rationale), `/graph` (full-page campaign graph), and form pages under `/messages` for ingesting test events.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # fill in MySQL + Neo4j creds
npm run dev                        # http://localhost:3000
# click "Sync Neo4j" once to seed the graph from MySQL
```

MySQL, Neo4j, and Node LTS (22.x) must be running locally. Default DB name is `se_detection`. Neo4j default bolt URI is `neo4j://127.0.0.1:7687`.

## Architecture in one page

```
              ┌────────────────────────────────────────────────────┐
              │                     Next.js app                    │
              │                                                    │
  /emails  ──►│  POST /api/emails ─┐                               │
  /sms     ──►│  POST /api/sms    ─┼──► POST /api/process-message  │
  /calls   ──►│  POST /api/calls  ─┘         │                     │
              │                              ▼                     │
              │          lib/messages.ts  ingestAndProcessMessage   │
              │                              │                     │
              │          lib/detection-pipeline.ts (S1..S4, C(G))   │
              │                              │                     │
              └──────────────────────────────┼─────────────────────┘
                                             │
                           MySQL transaction │
                                             ▼
     ┌───────────────┐   ┌─────────────────────┐   ┌──────────────┐   ┌─────────────┐
     │   messages    │──►│  correlation_groups │──►│  rules_hits  │   │   alerts    │
     │ (raw events)  │   │ (grouped by entity) │   │ (per group)  │   │ (raised)    │
     └───────────────┘   └─────────────────────┘   └──────────────┘   └─────────────┘
                                     │
                                     │  fire-and-forget syncOneMessage()
                                     ▼
                                 ┌───────────────────────────────────┐
                                 │         Neo4j projection          │
                                 │  :Attacker :Victim :Message       │
                                 │  :CorrelationGroup :Alert :Rule   │
                                 │  :Campaign (MERGE-based)          │
                                 └───────────────────────────────────┘
                                     │
                                     │  /api/neo4j/graph (poll 5s)
                                     ▼
                              Cytoscape on dashboard + /graph page
```

MySQL is the source of truth. Neo4j is a read projection — `/api/neo4j/sync` rebuilds it idempotently from MySQL at any time. If Neo4j is unavailable, MySQL writes still succeed; the next `syncAll()` heals drift.

## Detection pipeline (the scoring model)

Each incoming message is scored by four layers in `lib/detection-pipeline.ts`. Scores are 0–100.

- **S1 — Urgency & Authority** (weight 0.2). Regex match on urgency words (`urgent`, `immediately`, `act now`...), authority claims (`ceo`, `it department`...), financial asks (`gift card`, `wire transfer`...).
- **S2 — Domain & Authentication** (weight 0.3). Domain-age simulation, SPF / DKIM / DMARC failures, suspicious sender patterns. **Currently uses `Math.random()` for the auth checks** — placeholder; wire in real checks + `known_bad_senders` lookup when ready.
- **S3 — Content Analysis** (weight 0.3). Phishing patterns (`verify identity`, `confirm password`...), brand impersonation (bank, amazon, paypal, apple...), suspicious URLs.
- **S4 — Behavioural** (weight 0.2). Vector-based risk (sms > call > email), time-pressure tactics.

Combined score: `C(G) = 0.2·S1 + 0.3·S2 + 0.3·S3 + 0.2·S4`.

Severity buckets: `CRITICAL` ≥ 80, `HIGH` ≥ 60, `MEDIUM` ≥ 40, `LOW` ≥ 20, else `DISMISSED` (no alert raised).

## Database schema (MySQL)

Five tables, referenced from `lib/messages.ts`:

- `messages` — raw events. Columns: `id, vector_type, sender, sender_domain, recipient, subject, raw_content, received_at, status`.
- `correlation_groups` — one row per entity (sender domain for email, sender value for sms/call) within a 24h window. JSON columns: `message_ids`, `vector_types`. Score columns: `s1_score, s2_score, s3_score, s4_score, c_score`. Plus `severity`, `campaign_type`, `entity_key`, `actor_id` (nullable), `campaign_id` (nullable).
- `rules_hits` — one row per rule fired per group. Columns: `group_id, rule_name, rule_score, vector_types (JSON), created_at`.
- `alerts` — one row per group that crossed the severity threshold (not `DISMISSED`). Columns: `id, group_id, status, created_at, victims (JSON)`.
- `known_bad_senders` — lookup list. Columns: `id, kind, value, threat_score, hit_count, first_seen, last_seen, is_known_bad`.

`entity_key` derivation lives in `entityKeyFor()` in `lib/messages.ts`. Email → `sender_domain`; sms/call → raw `sender`. Change there if grouping semantics need to change.

## Neo4j graph model (projection)

Labels:

- `:Attacker { id, kind, value, first_seen, last_seen, threat_score?, hit_count?, is_known_bad? }`
- `:Victim { id, kind }`
- `:Message { id, vector, sender, sender_domain, recipient, subject, content, received_at, status }`
- `:CorrelationGroup { id, entity_key, s1..s4_score, c_score, severity, campaign_type, vector_types, created_at, updated_at }`
- `:Alert { id, severity, c_score, status, campaign_type, victims, created_at }`
- `:Rule { name }`
- `:Campaign { type }`

Relationships: `(:Attacker)-[:SENT]->(:Message)-[:RECEIVED]->(:Victim)`, `(:Message)-[:PART_OF]->(:CorrelationGroup)`, `(:CorrelationGroup)-[:TRIGGERED]->(:Alert)`, `(:CorrelationGroup)-[:FIRED_RULE {score, vector_types, created_at}]->(:Rule)`, `(:CorrelationGroup)-[:BELONGS_TO]->(:Campaign)`.

## File inventory

### API routes (`app/api/**`)

| Route | Purpose |
|---|---|
| `emails/route.ts`, `sms/route.ts`, `calls/route.ts` | Raw-insert into `messages` table, return `{ id }`. Then call `/api/process-message`. |
| `process-message/route.ts` | Full pipeline in one MySQL transaction: insert → score → upsert group → insert rules → insert alert → flip status. Fire-and-forget `syncOneMessage()` after commit. |
| `alerts/route.ts` | Joined read of `alerts + correlation_groups + messages + rules_hits`, shaped for the client `Alert` type. |
| `feed/live/route.ts` | Messages + their group + rules + alert. Two-pass JS join (fetch messages, fetch groups, match `message_ids` in JS). Supports `vector`, `limit`, `since` query params. |
| `investigation/[groupId]/route.ts` | Full investigation payload with auto-generated `rationale[]` explaining why the alert fired. |
| `neo4j/sync/route.ts` | `POST` (and `GET` alias) runs `syncAll()` and returns `SyncStats`. |
| `neo4j/graph/route.ts` | `GET` returns `{ nodes, edges, stats }` for Cytoscape. Supports `labels`, `limit`, `since`. |
| `neo4j/node/[id]/route.ts` | `GET` returns one node + immediate neighbours. |

### Libraries (`lib/**`)

| File | Purpose |
|---|---|
| `mysql.ts` | Connection pool (`query`, `execute`, `withTransaction`). Reads `DATABASE_URL` or `MYSQL_*` env vars. Cached on `globalThis` to survive Next.js hot reloads. |
| `messages.ts` | `ingestAndProcessMessage()` — the ingest helper called by `/api/process-message`. `entityKeyFor()` derives the correlation key. |
| `detection-pipeline.ts` | Pure S1–S4 scoring functions and `processMessage()` entry point. No DB access. |
| `neo4j.ts` | Singleton `Driver`, `readTx`, `writeTx`, `writeTxBatch`, record serialisation (handles `Node`, `Relationship`, `Integer`). |
| `neo4j-sync.ts` | `syncAll()` full projection; `syncOneMessage({messageId, groupId, alertId})` incremental. All idempotent (MERGE-based, `CREATE INDEX IF NOT EXISTS`). |
| `mock-data.ts` | Type definitions (`Vector`, `Severity`, `Alert`, `Message`) and legacy demo data. Kept for type exports. |
| `utils.ts` | `cn()` — Tailwind class merger. |

### Components (`components/dashboard/**`)

- `sidebar.tsx` — fixed left nav with the Spider-hood logo tile.
- `main-content.tsx` — page content wrapper that responds to sidebar open/closed state.
- `kpi-cards.tsx` — three top-row cards (Active Campaigns, Alerts Today, Recall). Reads from `useLiveAlerts()`.
- `threat-graph.tsx` — Cytoscape panel on the dashboard (red attackers, green victims, fcose layout, polls `/api/neo4j/graph` every 5s, label filter chips, "Sync Neo4j" button, node detail popover).
- `live-feed.tsx` — expandable message rows with S1–S4 scores, rules, alert info. Vector filter chips.
- `alert-ticker.tsx` — legacy, replaced by `live-feed.tsx` but kept in tree.
- `egypt-map.tsx` — legacy, replaced by `threat-graph.tsx` but kept in tree.
- `mini-charts.tsx` — the three bottom-row charts (attacks per hour, vector distribution, top brands).
- `score-display.tsx`, `severity-badge.tsx`, `vector-icon.tsx` — small shared UI atoms.
- `email-form.tsx`, `sms-form.tsx`, `call-form.tsx` — ingest forms, post to `/api/process-message` only.

### Hooks (`hooks/**`)

- `use-live-alerts.ts` — polls `/api/alerts` every 5s, pauses while tab hidden, aborts in-flight fetches on unmount.
- `use-live-feed.ts` — polls `/api/feed/live`. Takes `{ vector, limit, pollMs, enabled }`.
- `use-live-graph.ts` — polls `/api/neo4j/graph`. Takes label filter + limit.
- `use-mobile.ts`, `use-toast.ts` — shadcn/ui helpers.

### Pages (`app/**`)

- `layout.tsx` — root layout. Includes an **inline `<script>` in `<head>`** that strips browser-extension attributes (Bitwarden's `bis_skin_checked`, Grammarly's `data-gr-*`, LastPass's `data-lt-*`, ColorZilla's `cz-shortcut-listen`) before React hydrates, to silence extension-induced hydration warnings. The observer self-disconnects after 10s.
- `page.tsx` — live dashboard (header with logo, KPICards, ThreatGraph, LiveFeed, MiniCharts).
- `alerts/page.tsx` — alert queue table with Rules column (violet badge).
- `investigation/page.tsx` — reads `?group=<id>`, fetches `/api/investigation/:id`, renders rationale card + score breakdown + rules + message timeline.
- `graph/page.tsx` — full-page Cytoscape canvas with `cxtmenu` right-click menu (Details, Expand neighbours, Show only this type, Hide this node, Isolate) and side panel.
- `metrics/`, `rules/`, `inspector/` — secondary pages.

## Environment variables

| Var | Required | Default |
|---|---|---|
| `DATABASE_URL` | either this or the `MYSQL_*` block | — |
| `MYSQL_HOST` | | `localhost` |
| `MYSQL_PORT` | | `3306` |
| `MYSQL_USER` | | `root` |
| `MYSQL_PASSWORD` | | empty |
| `MYSQL_DATABASE` | | `se_detection` |
| `NEO4J_URI` | ✅ | `neo4j://127.0.0.1:7687` |
| `NEO4J_USER` | ✅ | `neo4j` |
| `NEO4J_PASS` (or `NEO4J_PASSWORD`) | ✅ | — |
| `NEO4J_DATABASE` | | `neo4j` |

## Code conventions (match these when editing)

- **TypeScript strict on**. `paths`: `@/*` maps to project root.
- **App Router only** — no `pages/` directory. Route handlers export `GET`, `POST`, etc.
- **Server files use `NextResponse.json()`**. Don't return raw `Response` objects.
- **MySQL queries**: use the `query<T>()` helper in `lib/mysql.ts`. For multi-statement transactions use `withTransaction()`. **Never interpolate user input into SQL** — use `?` placeholders. **Exception**: integer `LIMIT` / `OFFSET` values can be inlined as clamped ints because `mysql2` has a known prepared-statement quirk with `LIMIT ?`.
- **JSON columns**: always pass through `parseJsonArray()` / `parseJsonObject()` helpers — a column can come back as either a JS array/object or a stringified JSON depending on driver mode.
- **Neo4j writes**: always `MERGE`, never `CREATE`, and set indexes with `CREATE INDEX IF NOT EXISTS`. Keep `syncAll()` idempotent.
- **Error handling on API routes**: wrap in `try/catch` and log `{ message, code, sqlState, errno, stack }` so dev-server logs surface the actual DB error. Return `NextResponse.json({ error: ... }, { status: 500 })`.
- **Client polling**: use `AbortController` + `visibilitychange` pause. Copy the pattern from `hooks/use-live-feed.ts` rather than rolling a new one.
- **Hydration**: client components that read `window`, `Date.now()`, `Math.random()`, or locale-sensitive formatters must guard with `useEffect` or `useState` + `useEffect` to avoid SSR/CSR mismatches. The `layout.tsx` script handles extension-induced mismatches — don't spam `suppressHydrationWarning` everywhere.
- **Styling**: Tailwind v4 utility classes only. Use `cn()` from `lib/utils.ts` for conditional classes. Colour tokens to match: background `#0F172A`, card `#1E293B`, borders `slate-700`, accents `red-500` (critical/attacker), `green-400` (victim/success), `orange-400` (high), `yellow-400` (medium), `blue-400` (low/info), `violet-400` (rules).
- **Never commit `.env.local`** — it's gitignored. Only edit `.env.local.example`.

## Known follow-ups (pick any of these to work on next)

1. **Real S2 checks.** Replace the `Math.random()` SPF / DKIM / DMARC / domain-age simulations in `calculateS2Score()` with real lookups (use a WHOIS library + header parsing for auth results) and wire in the `known_bad_senders` table.
2. **`message_features` table.** The schema declares it but nothing writes to it — hook up feature extraction (n-grams, URL features, length stats) in the ingest pipeline.
3. **Actor + Campaign resolution.** `correlation_groups.actor_id` and `campaign_id` stay `NULL` today. Decide on clustering rules (e.g. group-of-groups by shared attacker domain within a 7-day window) and populate them.
4. **Bigger Neo4j projections.** `syncAll()` caps at 5k each of messages / groups / alerts / known-bad-senders and 10k rule-hits. Raise the caps in `lib/neo4j-sync.ts`, or move to pure event-driven (only `syncOneMessage()` runs).
5. **Cytoscape performance.** The graph endpoint caps at 5000 nodes; Cytoscape feels laggy above ~2–3k. Add server-side clustering for large graphs, or paginate by date window.
6. **Auth.** No auth at all right now. Add NextAuth (or Auth.js) with role-based access before any real deployment.
7. **Tests.** Zero tests exist. Add Vitest for `lib/detection-pipeline.ts` (pure functions, easy win), then Playwright for the dashboard flow.
8. **Real-time instead of polling.** Swap the 5s polling hooks for Server-Sent Events or websockets if the poll load becomes a concern.

## Common tasks and where to edit

| Task | Files to touch |
|---|---|
| Add a new detection rule | `lib/detection-pipeline.ts` (add to the right S-layer's rule list), update rule name strings |
| Change correlation grouping | `entityKeyFor()` in `lib/messages.ts` |
| Add a new graph label / edge type | `lib/neo4j-sync.ts` (add to `syncAll()` + `syncOneMessage()`), `app/api/neo4j/graph/route.ts` (add to `ALL_LABELS`), `app/graph/page.tsx` (add to filter chips + legend) |
| Add a column to the alert queue | `app/alerts/page.tsx` (add `<TableHead>` + `<TableCell>`, update `colSpan` on expanded row), and shape of `/api/alerts/route.ts` if new data is needed |
| Change severity thresholds | `lib/detection-pipeline.ts` (the `if (cgScore >= 80) severity = 'CRITICAL' ...` block) |
| Add a new ingest vector (e.g. `slack`) | Add to the `Vector` union in `lib/mock-data.ts`, add `/api/slack/route.ts`, add the form under `app/messages/`, update detection-pipeline S4 vector weights, update graph/feed vector filters |

## Known gotchas

- **`mysql2` `LIMIT ?` quirk.** Passing `LIMIT` as a prepared-statement parameter sometimes sends it as a string (`LIMIT '50'`) and MySQL rejects it. **Inline clamped integers into the SQL string instead.** See `app/api/feed/live/route.ts` for the pattern.
- **JSON columns in `mysql2`.** Depending on driver settings, `message_ids` can come back as a string or an array. Always run it through `parseJsonArray()`.
- **Neo4j `Integer`.** Numeric values from the driver are `neo4j.Integer` instances, not JS numbers. `lib/neo4j.ts` serialises them via `.toNumber()` — use that; don't `Number(v)` blindly (loses precision on big ints).
- **Cytoscape hot-reload.** Dynamic imports (`cytoscape`, `cytoscape-fcose`, `cytoscape-cxtmenu`) and `cytoscape.use(fcose)` must happen in a `useEffect`, not at module scope, or Next.js Turbopack double-registers the extension and crashes.
- **Cytoscape filter pattern.** Hide/show by setting `display: 'none'` on elements, never by removing them — removal destroys layout positions. Only run `layout.run()` when nodes/edges actually change.
- **Browser-extension hydration warnings.** The `<head>` inline script in `app/layout.tsx` strips `bis_*`, `data-gr-*`, `data-lt-*`, and `cz-shortcut-listen`. If a new extension starts causing noise, add its attribute to the `attrs` array there.

## Commands cheat sheet

```bash
npm run dev                          # dev server on :3000 (Turbopack)
npm run build && npm start           # production build
npm run lint                         # eslint

# trigger a full Neo4j sync
curl -X POST http://localhost:3000/api/neo4j/sync

# dump MySQL for backup / migration
mysqldump -u root -p --routines --triggers --single-transaction se_detection > se_detection.sql

# quick smoke test of the ingest pipeline
curl -X POST http://localhost:3000/api/emails \
  -H "Content-Type: application/json" \
  -d '{"sender":"ceo@pay-roll-co.net","recipient":"victim@acme.com","subject":"URGENT wire transfer","content":"Please send a $5000 gift card immediately."}'
```

## How to use this file with your AI tool

- **Cursor / Windsurf** — they read `CLAUDE.md` and `.cursorrules` automatically. Just open the project.
- **Cline / Roo Code** — mention "read CLAUDE.md" in your first message, or pin the file.
- **Aider** — run `aider --read CLAUDE.md --read MIGRATION.md`.
- **Continue** — add `CLAUDE.md` as a `@file` context on your first prompt.
- **OpenAI Codex / agentic tools** — they read `AGENTS.md` (which is identical to this file).
- **Any other tool** — first prompt: *"Read CLAUDE.md and MIGRATION.md, then help me continue building."*

## See also

- `MIGRATION.md` — the migration history from the original Supabase-based prototype. Useful for understanding *why* the code is shaped the way it is.
- `.env.local.example` — copy to `.env.local` and fill in secrets.
- `package.json` — dependency versions (Next 16, React 19, Tailwind 4, TS 5.7, mysql2, neo4j-driver, cytoscape + fcose + cxtmenu).
