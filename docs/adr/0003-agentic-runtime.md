# ADR-0003 — Agentic AI Runtime

- Status: Accepted
- Date: 2026-08-19
- Related: ADR-0001 (JWT httpOnly cookies), ADR-0002 (npm workspaces)
- Spec: AGENTIC-AI-SPEC.md

## Context

The Work Order Desk needs AI participants that can draft, triage, and update work
orders by calling the application's own business logic as tools — under human
supervision and hard technical guardrails. Two surfaces are in scope: an
interactive Copilot with human-in-the-loop approvals (M1) and a policy-governed
autonomous triage worker (M2).

Key constraints: no browser-side LLM access, no breakage of existing endpoints
or security controls, minimal new dependencies, and an AI surface that is inert
by default (`AI_ENABLED=false`) so a fresh checkout boots normally.

## Decision

Adopt a **server-side agent runtime** (`backend/src/agent`) with the following
properties:

- **Direct service calls, not HTTP loopback.** Tools call the existing services
  with a constructed `Actor`, reusing the current authorization. No loopback
  complexity, no browser-bypassable surface.
- **Hand-rolled thin runtime** (runtime loop, tool registry, policy) rather than
  LangChain/LlamaIndex, matching the repo's minimal-dependency philosophy.
- **Capability-based System Actor.** `Actor { id:'system', role:'system',
  kind:'system', capability:'triage' }` replaces the idea of a fake role: roles
  are a closed union, and a fabricated role would silently grant admin powers.
  General service paths reject `kind:'system'`; a dedicated
  `workOrderService.triagePatch` is the only write a System Actor can reach.
- **Human-in-the-loop approvals (M1).** Every state-changing Copilot action is
  staged (frozen args + server-rendered pre-image diff), approved via an atomic
  `decide`, and re-validated/re-read at execution. Rejection, expiry, and stale
  versions are all recorded.
- **Outbox + polling worker.** The repository layer enqueues `OutboxEvent`
  (durable, idempotent) after work-order creation; a separate `worker.ts`
  process claims events with a lease and applies bounded triage. No change
  streams (Compose Mongo is standalone) and no in-API timer (no latency
  contention, independent restart/kill).
- **Provider-agnostic adapter.** OpenAI-compatible chat/completions wire
  protocol via env config; no SDK dependency. `AI_BASE_URL`/`AI_API_KEY` are
  env-only and validated at boot (https, non-private host).
- **Budgets + spend ledger.** Per-call `max_tokens`, per-run step cap, and an
  atomic `AgentSpend` ledger (`$inc` per user/agent/global, daily caps) instead
  of sum-on-read accounting.
- **Structural injection controls.** Post-model tool gate, target-id pinning
  (write tools may only touch ids seen earlier in the run), zod-validated args,
  JSON-encoded SSE event payloads. Prompt delimiters are a documented
  residual-risk mitigation, not a control.
- **Version/owner are never model-supplied.** The runtime injects `version`
  from the run's latest read; the LLM-facing schemas expose only `{ id }` plus
  picked fields.

## Consequences

- **Single-instance API.** Approvals live in an in-process registry; only one
  API instance may run, and the worker must be deployed alongside it.
- **Costs are real.** Per-run step caps, per-user/per-agent/global daily spend
  caps, and a kill switch checked between steps bound runaway spend. A run may
  overshoot by at most one call.
- **Retention is bounded.** `AgentMessage`/`AgentToolCall.result` TTL 90 days;
  run/session records retained one year; admin transcript views are themselves
  audited.
- **Opt-in default.** `AI_ENABLED=false` keeps the existing app unchanged; the
  worker, copilot API, and triage runs all gate on it.
- **More moving parts in ops.** A second process (worker) with leases, retries,
  and a reconcile pass; documented in `.env.example`, README, and
  `docs/GETTING_STARTED.md`.