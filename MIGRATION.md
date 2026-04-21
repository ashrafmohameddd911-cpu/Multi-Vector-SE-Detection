# SpiderNET — migration & Neo4j integration notes

## 1. Supabase → MySQL (phase 1)

- Replaced `@supabase/supabase-js` with `mysql2`.
- Connection pool in `lib/mysql.ts` (reads `DATABASE_URL` or `MYSQL_*` env vars, cached on `globalThis` so Next.js hot-reloads don't leak connections).
- Ingest/scoring helper in `lib/messages.ts`.
- `/api/process-message` now runs the full pipeline inside one MySQL transaction:
  1. Insert into `messages` (status=pending).
  2. Score with `lib/detection-pipeline.ts`.
  3. Upsert a row in `correlation_groups` (grouped by `entity_key`, 24h window).
  4. Insert matched rules into `rules_hits`.
  5. Insert an `alerts` row (skipped for `DISMISSED` severity).
  6. Flip the message to status=processed.
- `/api/emails`, `/api/sms`, `/api/calls` now just raw-insert into the unified `messages` table and return `{ id }`. The three forms call `/api/process-message` only (no more double-insert).
- `/api/alerts` joins `alerts` + `correlation_groups` + `messages` + `rules_hits` and returns a shape compatible with the client `Alert` type.
- `hooks/use-live-alerts.ts` is a polling client (5s interval, pauses while tab hidden, aborts in-flight fetches on unmount).
- Deleted `lib/supabase.ts`, `lib/db-init.ts`, `scripts/01-create-messages-tables.sql`.

## 2. Neo4j projection (phase 2)

MySQL stays the source of truth for events & scoring. Neo4j mirrors the current state as a graph projection so the Live Threat Map and Campaign Graph can do fast traversals.

### Graph model

Labels:

- `:Attacker { id, kind, value, first_seen, last_seen, threat_score?, hit_count?, is_known_bad? }`
- `:Victim { id, kind }`
- `:Message { id, vector, sender, sender_domain, recipient, subject, content, received_at, status }`
- `:CorrelationGroup { id, entity_key, s1_score, s2_score, s3_score, s4_score, c_score, severity, campaign_type, vector_types, created_at, updated_at }`
- `:Alert { id, severity, c_score, status, campaign_type, victims, created_at }`
- `:Rule { name }`
- `:Campaign { type }`

Relationships:

- `(:Attacker)-[:SENT]->(:Message)`
- `(:Message)-[:RECEIVED]->(:Victim)`
- `(:Message)-[:PART_OF]->(:CorrelationGroup)`
- `(:CorrelationGroup)-[:TRIGGERED]->(:Alert)`
- `(:CorrelationGroup)-[:FIRED_RULE { score, vector_types, created_at }]->(:Rule)`
- `(:CorrelationGroup)-[:BELONGS_TO]->(:Campaign)`

Attacker `id` derivation:
- `email` → `sender_domain`
- `sms` / `call` → raw `sender`

### Code

| File | Purpose |
|---|---|
| `lib/neo4j.ts` | Singleton `Driver`, `readTx`, `writeTx`, `writeTxBatch`, record serialisation (handles `Node`, `Relationship`, `Integer`). |
| `lib/neo4j-sync.ts` | `syncAll()` full MERGE-based projection; `syncOneMessage({messageId, groupId, alertId})` incremental update. |
| `app/api/neo4j/sync/route.ts` | `POST` runs `syncAll()` and returns `SyncStats`. `GET` is an alias for convenience. |
| `app/api/neo4j/graph/route.ts` | `GET` returns `{ nodes, edges, stats }` for Cytoscape — supports `?labels=…&limit=…&since=…`. |
| `app/api/neo4j/node/[id]/route.ts` | `GET` returns a single node + its immediate neighbours (for detail panels). |
| `app/api/feed/live/route.ts` | `GET` returns the Live Alert Feed: every message joined to its group + rules + alert. |
| `app/api/investigation/[groupId]/route.ts` | `GET` returns full investigation payload incl. an auto-generated `rationale` array. |

The process-message route calls `syncOneMessage()` fire-and-forget after its MySQL transaction commits, so new events flow into Neo4j within seconds. If Neo4j is unavailable, MySQL writes still succeed — the error is logged and the next `POST /api/neo4j/sync` heals the projection.

### Running the sync

Option A — click "Sync Neo4j" on the dashboard or Campaign Graph page.

Option B — from the shell:

```bash
curl -X POST http://localhost:3000/api/neo4j/sync
```

`syncAll()` is idempotent (everything is `MERGE`-based and it creates its indexes with `IF NOT EXISTS`).

## 3. UI changes

- Spider-hood logo on the sidebar and dashboard header (`public/spidernet-logo.svg` — replace with your real asset when you have it).
- Egypt map → `components/dashboard/threat-graph.tsx` (Cytoscape + fcose, polls `/api/neo4j/graph` every 5s, label-level filter chips, node detail popover, "Sync Neo4j" button).
- `AlertTicker` → `components/dashboard/live-feed.tsx` backed by `/api/feed/live` — every message with its S1–S4 scores, C(G), severity, campaign type, rules fired, and any raised alert. Vector filter chips.
- Alert Queue: added a "Rules" column and expanded row colspan.
- Group Investigation (`/investigation?group=<id>`): completely rebuilt on real MySQL data. Top card is the auto-generated **"Why this alert?"** rationale (C(G) threshold, individual S-layer thresholds, multi-vector detection, rule-count burst, message-count burst). Below: score breakdown, rules fired with scores, message timeline, and full message detail cards.
- Campaign Graph (`/graph`): full-page Cytoscape (fcose layout + cxtmenu right-click menu). Context menu commands: Details · Expand neighbours · Show only this type · Hide this node · Isolate. Side panel shows the full property map and a clickable neighbour list.

## 4. Running it

```bash
npm install
cp .env.local.example .env.local   # fill in real secrets
npm run dev
# open http://localhost:3000
# click "Sync Neo4j" once to seed the graph from the current MySQL state
```

## 5. Environment variables

| Var | Required | Default |
|---|---|---|
| `DATABASE_URL` | either this or the MYSQL_* block | — |
| `MYSQL_HOST` | | `localhost` |
| `MYSQL_PORT` | | `3306` |
| `MYSQL_USER` | | `root` |
| `MYSQL_PASSWORD` | | empty |
| `MYSQL_DATABASE` | | `se_detection` |
| `NEO4J_URI` | ✅ | `neo4j://127.0.0.1:7687` |
| `NEO4J_USER` | ✅ | `neo4j` |
| `NEO4J_PASS` (or `NEO4J_PASSWORD`) | ✅ | — |
| `NEO4J_DATABASE` | | `neo4j` |

## 6. Known follow-ups

- `correlation_groups.entity_key` is derived from the sender domain (email) or sender value (sms/call). If you need different grouping semantics (e.g. by recipient), adjust `entityKeyFor()` in `lib/messages.ts`.
- The S2 score still uses randomness for SPF/DKIM/DMARC/domain-age simulation in `lib/detection-pipeline.ts`. Wire in `known_bad_senders` lookups and real auth checks when you're ready.
- `message_features` is declared in the schema but not yet written to — drop it in when you have real feature extraction.
- `actors` / `campaigns` tables are referenced by `correlation_groups.actor_id` / `campaign_id` but are not written here; those columns stay `NULL` until you decide how to resolve them.
- `syncAll()` caps at 5k messages / 5k groups / 5k alerts / 10k rule-hits / 5k known-bad-senders per call. Bump those limits in `lib/neo4j-sync.ts` if you need a bigger projection — or move to an event-driven model where only `syncOneMessage()` runs.
- The Neo4j graph endpoint returns up to 5000 nodes and `nodes × 6` edges per request. Cytoscape handles ~2-3k comfortably before UI lag — raise `limit` cautiously.
