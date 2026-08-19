# Work Order Desk — Agentic AI Conversion Specification

**Version:** 1.0
**Status:** Implementation contract
**Base:** SPEC.md v1.2 (Work Order Desk)

## 1. Overview

### 1.1 Purpose

Converts the existing MERN Work Order Desk into an agentic AI application: AI agents become first-class participants that can draft, triage, and update work orders by calling the application's own business logic as tools, under human supervision and hard technical guardrails. Two surfaces are in scope, delivered as sequential milestones:

- **M1 — Copilot (interactive, human-in-the-loop):** an AI assistant embedded in the SPA that answers questions and drafts/updates work orders on the authenticated user's behalf. Every state-changing action is staged for explicit user approval before execution.
- **M2 — Autonomous triage agent (headless, policy-governed):** a background worker that watches newly created work orders and applies configurable, bounded triage (summary + priority suggestion, optionally auto-applied), with a full audit trail and a kill switch.

The AI surface is additive: no existing endpoint, DTO, or security control is broken; every existing SPEC.md §5 requirement keeps its test.

### 1.2 Goals

- Server-side agent runtime reusing the existing layered architecture; no browser-side LLM access.
- A tool registry where every tool declares a zod input schema, a permission policy, a read/write class, and an approval requirement; mode-scoped tool allowlists enforced in code, post-model.
- Human-in-the-loop copilot for all state-changing actions; read-only actions run inline.
- A policy-driven autonomous triage agent with suggest/auto-apply modes, per-run/per-day budgets, and a global kill switch checked between steps.
- Full audit trail: every agent action attributable to a user, a run, and a tool call; pre-image + version linkage so "shown vs executed" is reconstructible.
- Prompt-injection resistance provided by structural controls (post-model tool gate, target-id pinning, zod-validated args, JSON-encoded SSE); prompt delimiters are a documented residual-risk mitigation, not a control.
- Provider-agnostic LLM adapter (OpenAI-compatible wire protocol), server-side secrets only.
- AI_ENABLED=false by default: a fresh checkout without AI config boots normally.

### 1.3 Non-Goals (v1)

- Vector/RAG retrieval or embeddings.
- Multi-agent orchestration or agent memory beyond the session.
- Autonomous agents beyond triage: no auto-assignment, auto-close, auto-delete, or role changes in v1.
- Voice, browser-side agents, fine-tuned models, local model serving.
- Runtime mutability of AI_BASE_URL/AI_API_KEY (env-only).
- Auto-approval of copilot writes (HITL is mandatory in M1).
- Long-term chat search UI beyond recent session history.

## 2. Key Decisions

| Decision | Options considered | Choice | Why |
|---|---|---|---|
| Agent execution location | Browser vs server-side | Server-side (backend/src/agent + worker) | httpOnly cookies; keys stay server-side; authz not bypassable from the browser |
| How agents call business logic | HTTP loopback vs direct service calls | Direct service calls with constructed Actor | Reuses existing authz; no loopback complexity |
| Agent framework | LangChain/LlamaIndex vs hand-rolled | Hand-rolled thin runtime | Repo philosophy is minimal deps; tool schemas already in shared zod |
| System principal | Fake role vs capability token | Capability token (Actor.kind:'system', capability:'triage'); services reject it in general paths | Role is a closed union; a fake role silently grants admin powers |
| Auto-apply write path | Reuse workOrderService.update vs dedicated method | Dedicated workOrderService.triagePatch | Existing update is owner/admin-gated; reuse is unimplementable or too broad |
| LLM provider | Anthropic vs OpenAI vs agnostic | OpenAI-compatible adapter + env config | One adapter covers most vendors; no SDK dep |
| Copilot transport | WebSocket vs SSE | SSE over POST (fetch ReadableStream) | Works with cookie auth + same-origin proxy |
| Autonomous trigger | Change streams vs outbox + polling | Outbox + polling worker | Compose Mongo is standalone; outbox is durable and testable |
| version in tool args | LLM supplies vs runtime injects | Runtime injects from the run's latest read; derived schemas (id + field picks) | LLM-supplied version burns steps on 409 loops; schema refine breaks single-field updates |
| Approval storage | Separate collection vs on tool call | Embedded in AgentToolCall.approval | One state machine; no cross-collection sync |
| Triage "agent" | Multi-step agent vs single-pass classifier | Single-pass, policy-gated; autonomy in the outbox trigger + policy enforcement | A one-call JSON extraction is not an agent; honest naming |
| Triage scope | Summary + priority + status | Summary + priority + flag only | New WOs are always pending; a model setting done is the hallucination case |
| Spend accounting | Sum-on-read vs atomic ledger | AgentSpend ledger with $inc; per-call max_tokens; per-agent + global caps | Read-then-write races; unbounded single call; System Actor unbounded |
| LLM endpoint validation | None vs SSRF hardening | https-only, private-range reject, redirect:'error' | Key exfiltration via malicious provider URL |
| Worker placement | In-API timer vs separate process | Separate worker.ts process | No latency contention; independent restart/kill |
| Phasing | One giant release vs milestones | M1 (copilot) then M2 (autonomous) within this spec | Two surfaces share only the runtime |

## 3. Tech Stack (additions)

| Layer | Technology | Notes |
|---|---|---|
| LLM wire | OpenAI-compatible chat/completions | AI_BASE_URL / AI_API_KEY / AI_MODEL; no SDK |
| Streaming | SSE over fetch ReadableStream | JSON-encoded event payloads; zod-validated event schemas in packages/shared |
| Agent runtime | Hand-rolled in backend/src/agent | runtime.ts, tools/, provider.ts, policy.ts |
| Worker | backend/src/worker.ts | Separate process; npm run worker; compose service |
| Events | Outbox in Mongo | No change streams (standalone Mongo) |
| Lint | ESLint 9 flat config | import/no-cycle wired in (SPEC.md §4.1) |
| Tests | Vitest + Supertest (existing) | LLM provider mocked; worker.ts coverage-excluded like server.ts |

## 4. Architecture

```
Browser
  └─ CopilotPanel (fetch+SSE) ──► /api/v1/ai/* ──► Express :4000
                                                     ├─ agent/runtime ──► provider ──► OpenAI-compatible API
                                                     ├─ agent/tools ────► services (real Actor) ──► Mongo
                                                     └─ AgentSpend $inc ledger (per user/day)
Worker (separate process)
  └─ poll OutboxEvent (lease) ──► policy check ──► triage pass ──► triagePatch (System Actor, bounded) ──► Mongo
```

### 4.1 Backend layering (additive)

routes → middleware → controllers → agent/runtime → services → repositories → models, with agent/tools between runtime and services. The outbox enqueue lives in the repository layer so services never import agent; agent/tools imports services + models/mappers only. import/no-cycle is enforced.

### 4.2 Actors

| Actor | Shape | Reaches |
|---|---|---|
| Human (copilot) | Actor { id, role, kind:'human' } from DB (authenticate) | Mode-scoped tools; writes staged for approval |
| System (worker/manual trigger) | Actor { id:'system', role:'system', kind:'system', capability:'triage' } | Only the triage allowlist |
| Prohibited | Any kind:'system' cast to admin/user/viewer | — |

Services defend in depth: get/update/remove return forbidden() for kind:'system'. triagePatch is the only service entry a System Actor can reach.

Per-mode tool allowlists are enforced post-model in code:

| Mode | Tools |
|---|---|
| Copilot read (all roles) | list_my_work_orders, search_my_work_orders, get_profile |
| Copilot read (admin only) | admin_list_work_orders, admin_list_users, admin_metrics |
| Copilot write (user/admin, staged) | create_work_order, update_work_order, delete_work_order |
| Triage (System Actor only) | triage_propose → triage_apply (via triagePatch) |

Viewer scope: non-admins never get get_work_order; read tools are owner-scoped lists only.

### 4.3 Tool args — version and owner are never model-supplied

Tools expose derived schemas: { id } plus picked fields; version/owner are omitted from the LLM-facing schema. The runtime injects version at dispatch from the run's most recent read; if the id was never read in this run, the tool returns a need_read_first error result (no dispatch). Target-id pinning: a write tool may only reference work-order ids that appeared in earlier tool results (per-run seen-ids set); a write to an unseen id is blocked with outcome 'blocked'.

### 4.4 Copilot loop and termination (M1)

Per step: call LLM → for each emitted tool call: parse (JSON failure → synthetic tool result, counted as a step) → zod-validate → post-model tool gate (mode allowlist, role, aiEnabled) → dispatch reads inline, stage writes → append results → repeat.

Termination rules: (1) assistant message with zero tool calls and non-empty content → done; (2) empty content with zero tool calls → done with a completion notice; (3) unknown tool name → error tool result, run may continue, 3 unknown-tool results → abort; (4) malformed args → error result, retry, 2 failures → abort; (5) parallel tool calls: reads in sequence, at most one write per step; (6) step cap reached → budget_exceeded.

Convergence guard: runtime hashes (tool, args); an already-executed call is answered from cache; an oscillation (same write rejected twice) → loop_detected → error.

### 4.5 Cancellation and run lifecycle

Run statuses: running | complete | error | budget_exceeded | expired | aborted; only running → * is legal.

| From | To | Trigger |
|---|---|---|
| running | complete | termination rules 1/2 |
| running | error | rules 3/4/6, loop_detected, provider failure |
| running | budget_exceeded | step or spend cap |
| running | aborted | SSE disconnect, logout, kill switch mid-run |
| running | expired | approval TTL elapsed (sweeper) |
| any non-terminal | error | sweeper: run lease stale |

Client cancel → server aborts the upstream LLM stream, dispatches no pending tool calls, marks pending approvals expired, persists aborted. Logout aborts in-flight runs and invalidates pending approvals. decide on a non-running run is rejected. A sweeper marks stale runs error and expires overdue approvals.

### 4.6 Approval flow (M1)

1. Agent proposes a write → runtime freezes args at staging time, captures a pre-image of the target work order ({ title, description, priority, status } + stagedVersion), emits tool_approval_required (payload: full tool-call data + server-rendered before/after diff).
2. The diff in the modal is rendered server-side from the frozen args and pre-image — never from LLM-authored summary text. summary is human-authored metadata, escaped, no markdown.
3. decide requires the requester is the run owner, the run is non-terminal, the approval is unexpired, and the tool call is still pending. Otherwise 403/404/AI_APPROVAL_EXPIRED.
4. decide is an atomic conditional update; losers get 409 AI_APPROVAL_RESOLVED; a retried decide is idempotent.
5. On approval, args are re-validated and the version is re-read at execution. If stale → approval marked stale, nothing executed, a fresh tool_approval_required emitted with refreshed args.
6. Timeout: approval expires at AI_APPROVAL_TTL_MS via lazy check on decide and the sweeper; expired run → expired.
7. Modal UX: dismiss = leave pending with a visible countdown; approve disabled after first click; expiry surfaced via a tool_approval_expired SSE event.

### 4.7 Budgets and cost control

- Per call: AI_MAX_OUTPUT_TOKENS — a single call can never exceed the daily cap.
- Per run: AI_MAX_STEPS_PER_RUN including retries and failed parses.
- Context: per-tool-result truncation (≤10 docs from list/search; ≤4,000 chars each), per-run prompt token budget, identical tool results never re-pasted.
- Spend ledger: AgentSpend { key: '<scope>:<id>:<yyyy-mm-dd>', spentUsd } updated with atomic $inc at each LLM call completion (success, retry, or failure — all bill). Scopes: user:<id>, agent:<name>, global. Caps: AI_DAILY_SPEND_USD per user, AGENT_DAILY_SPEND_USD per agent, AI_GLOBAL_DAILY_SPEND_USD global. A run may overshoot by at most one call; the next start is refused with AI_BUDGET_EXCEEDED.
- Price table: AI_PRICE_PER_1M_INPUT / AI_PRICE_PER_1M_OUTPUT env (USD defaults 0.15 / 0.60).
- Cost-aware limits: the AI limiter keys on (user + IP) and applies to stream starts; concurrent streams per user ≤ 1; POST /messages is refused with AI_APPROVAL_PENDING while the session has a non-terminal run.
- Manual admin triggers hit the same ledgers and run under the System Actor + policy.

### 4.8 Streaming wire format (SSE)

- POST /api/v1/ai/sessions/:id/messages with Accept: text/event-stream returns text/event-stream (HTTP 200; pre-stream auth failures return the normal JSON error envelope).
- Event names are a fixed closed set: token, tool_call_start, tool_approval_required, tool_approval_expired, tool_result, message_done, error, ping.
- Every event payload is JSON-encoded (newlines/CR escaped) and zod-validated; event names never echo model text.
- Headers: Cache-Control: no-cache, X-Accel-Buffering: no; /api/v1/ai/* excluded from the global compression filter; nginx proxy_buffering off.
- Mid-stream failures use the SSE error event; pre-first-byte failures use the JSON envelope.
- The stream client's 401 handling is new code (pre-first-byte 401 → single-flight refresh → retry once).
- Retry safety: client sends Idempotency-Key on POST /messages; the server dedupes, so a refresh-then-retry cannot spawn a duplicate run.

## 5. Security & Guardrails

| ID | Requirement |
|---|---|
| SEC-1 | AI_API_KEY env-only, never in request bodies, never logged; added to pino redact list; provider logs only { baseUrl: <hostname>, model }; prompt content is never written to logs or error messages; /api/v1/ai/* bodies excluded from request logging |
| SEC-2 | AI_BASE_URL validated at boot: scheme https, host must not be private/loopback/link-local; adapter uses redirect:'error'; AI_BASE_URL/AI_API_KEY never admin-mutable at runtime |
| SEC-3 | Provider output is untrusted: strict JSON parsing, response-size cap, tool-call JSON zod-validated before dispatch |
| SEC-4 | Tool args zod-validated (strict, from packages/shared) before dispatch; invalid → error outcome, recorded |
| SEC-5 | Structural injection resistance: post-model tool gate, target-id pinning, capped tool results, JSON-encoded SSE. Prompt delimiters are a documented residual-risk mitigation, not a control |
| SEC-6 | System Actor cannot construct role admin; services reject kind:'system' in general paths; triagePatch is the only reachable write |
| SEC-7 | Copilot writes are staged and never auto-executed; rejection/expiry/stale all recorded |
| SEC-8 | aiEnabled=false gates HTTP entry points and the worker (checked at outbox emission, before context assembly, before auto-apply); opted-out owners' events skipped with no LLM call |
| SEC-9 | Autonomous surface bounded by: policy allowlist, step cap, per-agent + global spend ledgers, working hours, claim lease, concurrency cap |
| SEC-10 | Tool results never contain passwordHash, reset/session hashes, failedLoginCount, lockedUntil; enforced by a deny-list test |
| SEC-11 | Audit: AgentRun, AgentMessage, AgentToolCall (args, result, outcome, latency, stagedVersion/executedVersion, pre-image); admin transcript views are themselves audited |
| SEC-12 | Retention: AgentMessage + AgentToolCall.result TTL 90 days; run/session records retained 1 year |
| SEC-13 | Kill-switch and config changes recorded in append-only AgentConfigAudit |
| SEC-14 | Session IDOR: POST/GET on a session not owned by the actor → 404 |

## 6. M1 — Copilot Functional Requirements

| ID | Requirement |
|---|---|
| COP-1 | POST /api/v1/ai/sessions creates a session (requires aiEnabled; else 403). One active session per user, enforced atomically. If the previous session has a non-terminal run, return AI_APPROVAL_PENDING. Session belongs to actor else 404 |
| COP-2 | POST /api/v1/ai/sessions/:id/messages accepts { content } (1–4000 chars); streams SSE per §4.8. Refused with AI_APPROVAL_PENDING while a run is non-terminal |
| COP-3 | Tool registry and allowlists per §4.2/§4.3. Reads inline; writes staged (§4.6) |
| COP-4 | Derived tool arg schemas built from packages/shared; version/owner never accepted from the model (§4.3) |
| COP-5 | Viewer: read-only tools, owner-scoped lists only; any write proposal → forbidden tool result, never staged |
| COP-6 | Answers questions about the user's own work orders from tool results; no RAG |
| COP-7 | Frontend: docked CopilotPanel (Cmd+K), streaming render (Markdown, HTML-escaped), approval modal per §4.6, send disabled while a run is non-terminal |
| COP-8 | GET /api/v1/ai/sessions → recent sessions for the actor, capped 50 messages/session (storage cap; prompt budget is §4.7) |
| COP-9 | LLM failures surface as AI_UNAVAILABLE; prompt content never logged (SEC-1) |
| COP-10 | AgentRun/AgentMessage/AgentToolCall persisted for every copilot interaction; users can view their own runs |

## 7. M2 — Autonomous Triage Agent Functional Requirements

The triage agent is a single-pass, policy-gated classifier: autonomy is in the outbox trigger and policy enforcement, not in an LLM loop.

| ID | Requirement |
|---|---|
| AGT-1 | Outbox: the work-order repository emits OutboxEvent after create, with an idempotency key workOrderId:type and a unique index. A reconcile pass re-emits un-triaged work orders with no event |
| AGT-2 | Worker polls every AGENT_POLL_INTERVAL_MS; claims events atomically with a lease; crash-recovery requeue; concurrency ≤2, batch ≤1, backpressure |
| AGT-3 | Policy (singleton AgentConfig): mode suggest|auto-apply (default suggest); allowedFields: ['priority']; dailyActionCap counts LLM passes, not applied writes |
| AGT-4 | For each event: skip if owner.aiEnabled === false (no LLM call); else a bounded LLM pass outputs JSON validated by zod: { summary, suggestedPriority, flagForDispatcher }. No status field |
| AGT-5 | Transient failure: retry with exponential backoff, AGENT_MAX_ATTEMPTS, attempts counted against budgets; permanent failure → failed + surfaced in admin UI |
| AGT-6 | suggest mode: writes a TriageSuggestion; flagged work orders appear in the dispatcher's attention list (derived query over TriageSuggestion) |
| AGT-7 | auto-apply mode: applies suggestedPriority via workOrderService.triagePatch with a fresh version read; 409 → re-read, retry once, then log + drop. Never deletes, never changes owner/status/title/description |
| AGT-8 | Admin API: view/edit policy, list runs, view run detail, manual trigger, kill switch. All changes append to AgentConfigAudit |
| AGT-9 | Kill switch: POST /admin/agents/disable sets enabled:false; AI_ENABLED=false at boot is the hard kill; enabled re-read between steps |

## 8. API Contract (additions)

### 8.1 Error catalog

Extend the shared ErrorCode union and status map:

| HTTP | Code | When |
|---|---|---|
| 503 | AI_UNAVAILABLE | Provider unreachable / timeout / response cap |
| 429 | AI_BUDGET_EXCEEDED | Daily spend or concurrency cap hit |
| 409 | AI_APPROVAL_PENDING | New message / new session while a run is non-terminal |
| 409 | AI_APPROVAL_RESOLVED | decide on an already-decided approval |
| 409 | AI_APPROVAL_STALE | Stale version at execution → re-stage |
| 410 | AI_APPROVAL_EXPIRED | decide after TTL |
| 409 | AI_MESSAGE_DUPLICATE | Idempotency-key replay |
| 400 | AI_INJECTION_BLOCKED | Write to an unseen id / allowlist violation |

### 8.2 New endpoints

```
M1
POST   /api/v1/ai/sessions                      → 201 CopilotSession
GET    /api/v1/ai/sessions                      → 200 CopilotSession[]
POST   /api/v1/ai/sessions/:id/messages         → SSE stream
POST   /api/v1/ai/tool-calls/:id/decide         { approve: boolean } → 200 AgentToolCall

M2
GET    /api/v1/admin/agents/triage              → 200 AgentConfig
PATCH  /api/v1/admin/agents/triage/config       → 200 AgentConfig
POST   /api/v1/admin/agents/triage/run          → 200 { outcome }
GET    /api/v1/admin/agents/runs                → 200 OffsetPage<AgentRun>
GET    /api/v1/admin/agents/runs/:id            → 200 AgentRun + messages + toolCalls
POST   /api/v1/admin/agents/disable             → 200 { enabled: false }
```

All M2 endpoints admin-only. PATCH /admin/agents/triage/config mutates only policy fields — never AI_BASE_URL/AI_API_KEY.

### 8.3 DTOs

```ts
type CopilotSession = { id; userId; status: 'active'|'archived'|'expired'; createdAt; updatedAt };
type AgentRun = { id; mode: 'copilot'|'autonomous'; actorId; agentName?; status; model; inputTokens; outputTokens; startedAt; finishedAt; errorCode? };
type AgentToolCall = { id; runId; tool; args; outcome; result?; latencyMs; createdAt; stagedVersion?; executedVersion?; preImage?; approval? };
type TriageSuggestion = { id; workOrderId; runId; summary; suggestedPriority; flagForDispatcher; applied; createdAt };
```

## 9. Data Model (additions)

```
CopilotSession  { userId, status, createdAt }            index { userId, status }
AgentRun        { sessionId?, userId?, mode, agentName?, status, model, inputTokens, outputTokens,
                  startedAt, finishedAt?, errorCode?, leaseUntil? }
AgentMessage    { runId, role, content, toolCallId?, name?, createdAt, expiresAt (90d TTL) }
AgentToolCall   { runId, tool, args, result, outcome, latencyMs, stagedVersion?, executedVersion?,
                  preImage?, approval?, createdAt, expiresAt (90d TTL) }
OutboxEvent     { type, payloadRef, status: 'pending'|'processing'|'done'|'failed',
                  claimedAt?, leasedUntil?, attempts, createdAt }     unique { type, payloadRef }
TriageSuggestion{ workOrderId, runId, summary, suggestedPriority, flagForDispatcher, applied, createdAt }
AgentConfig     { name:'triage', enabled, mode, allowedFields, dailyActionCap, flagThreshold, workingHours, updatedBy, updatedAt }  singleton
AgentConfigAudit{ agentName, actorId, action, before, after, createdAt }   append-only
AgentSpend      { key, spentUsd }                        unique { key }
```

User model: aiEnabled (default true) — reflected in UserAdmin + a strict { aiEnabled } write schema.
WorkOrder: no aiSummary, no dispatcherAttention — both replaced by the TriageSuggestion derived query.

## 10. Frontend

- features/copilot/: CopilotPanel (docked drawer, Cmd+K), useCopilotStream (fetch + ReadableStream SSE parser, idempotency key, pre-first-byte 401 refresh), ApprovalModal (server-rendered diff; dismiss = leave pending; approve disabled after click), queries.ts.
- features/admin/: AgentSettingsPage (triage policy + kill switch), AgentRunsPage (run list + detail, admin-view audit).
- components/Markdown.tsx — minimal renderer, HTML-escaped, no raw HTML.
- Routes: /app/copilot, /app/admin/agents, /app/admin/agents/runs.

## 11. Environment (additions)

All validated at boot with zod; AI_BASE_URL additionally passes the SSRF check (SEC-2).

| Key | Required | Notes |
|---|---|---|
| AI_ENABLED | no | default false (opt-in) |
| AI_BASE_URL | if AI_ENABLED | https, non-private host |
| AI_API_KEY | if AI_ENABLED | server-side only |
| AI_MODEL | no | default gpt-4o-mini |
| AI_MAX_STEPS_PER_RUN | no | default 8 |
| AI_MAX_OUTPUT_TOKENS | no | default 2048 |
| AI_MAX_CONTEXT_TOKENS | no | default 16384 |
| AI_PRICE_PER_1M_INPUT / AI_PRICE_PER_1M_OUTPUT | no | default 0.15 / 0.60 |
| AI_DAILY_SPEND_USD / AGENT_DAILY_SPEND_USD / AI_GLOBAL_DAILY_SPEND_USD | no | defaults 1.00 / 1.00 / 5.00 |
| AI_APPROVAL_TTL_MS | no | default 600000 |
| AI_SSE_KEEPALIVE_MS | no | default 15000 |
| AI_RATE_LIMIT_MAX | no | default 20 |
| AGENT_POLL_INTERVAL_MS / AGENT_LEASE_MS / AGENT_SWEEP_INTERVAL_MS | no | defaults 5000 / 15000 / 30000 |
| AGENT_MAX_ATTEMPTS | no | default 3 |
| AGENT_RECONCILE_AFTER_MS | no | default 60000 |
| AGENT_TRIAGE_MODE | no | default suggest |
| AGENT_WORKING_HOURS | no | default * |
| AGENT_CONCURRENCY | no | default 2 |

## 12. Testing

Backend integration (Vitest + Supertest, provider mocked): runtime termination/convergence/budgets/cancellation; authz matrix (viewer cannot stage writes, non-admin cannot reach admin tools, unseen-id writes blocked, kind:'system' rejected, triagePatch is the only System Actor write); approval (atomic decide race, decide authz, frozen-args re-validation, stale version, expiry); version injection; adversarial injection eval set; drift guards (snapshotted system prompt + tool registry); worker (atomic claim, crash-recovery requeue, attempt cap + backoff + DLQ, kill switch between steps, aiEnabled skip, manual-trigger identity); budgets (per-call token cap, ledger $inc, retry billing); SSE (JSON-encoded payloads, keepalive, envelope-vs-error split, idempotency-key dedupe). Frontend: SSE parser, approval modal approve/reject/expiry, admin settings gating.

## 13. CI/CD & Operations

- .github/workflows/ci.yml runs the existing 5 steps plus the agent suites; worker kill-switch verified via a unit-level loop test with a tiny poll interval.
- docker-compose.yml + docker-compose.prod.yml gain a worker service. Root package.json gains worker scripts.
- nginx: proxy_buffering off for /api/v1/ai.
- .env.example, README.md, and docs/GETTING_STARTED.md document the new env keys, the worker, and AI_ENABLED=false default.

## 14. Definition of Done

M1: §6 implemented; copilot/authz/approval/injection/SSE tests green with existing thresholds; docker compose up --build → copilot streams and approval flow works end to end; AI_ENABLED=false boots unchanged.
M2: §7 implemented; worker + budget + outbox tests green; kill switch stops the worker within one poll interval (unit-tested); a seeded work order produces a TriageSuggestion; an opted-out owner's work order never reaches the provider; no secrets committed; AI_API_KEY never leaves the backend.

## 15. Risks

| Risk | Sev | Mitigation |
|---|---|---|
| Injection steers tool calls | major | Post-model tool gate, target-id pinning, capped context, adversarial eval set |
| Agent exceeds authority | critical | Capability-based System Actor; services reject it; per-mode allowlists; authz matrix tests |
| Cost runaway | major | Per-call token cap, atomic spend ledger, per-agent/global caps, kill switch between steps |
| Approval confusion/flood | major | Server-side diff from frozen args, atomic decide, expiry, stale re-stage |
| Worker crash strands events | major | Outbox lease + requeue + reconcile + DLQ |
| SSRF / key exfiltration | major | https/private-range URL check, redirect:'error', key never logged |
| Transcript PII creep | major | 90-day TTL, deny-list, audited admin views, prompts never logged |
| SSE stalls behind proxies | major | Compression excluded, buffering headers, nginx config, keepalive |
| Duplicate runs/stream retries | minor | Idempotency keys, session concurrency rule, run sweeper |
| Model/tool drift breaks runs | minor | Prompt/tool-registry snapshot tests; tagged real-provider evals |

## 16. Glossary

- Capability token — the System Actor's only credential: kind:'system' + capability:'triage'.
- Pre-image — work-order state captured at approval-staging time; powers the server-side diff.
- Seen-ids set — per-run record of ids returned by earlier tool results; writes to unseen ids are blocked.
- Agent run — one execution of the runtime loop (copilot turn) or triage pass (autonomous).
- Outbox — durable event log consumed by the worker; claim/lease/retry with DLQ.