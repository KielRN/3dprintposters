---
name: project-manager-3dprintposters
description: Use this skill when managing 3DPrintPosters project status, roadmap, backlog, sprint or iteration planning, blocker and risk review, release readiness, documentation drift, handoff summaries, transient human follow-ups, or "what should we do next?" PM questions. Ground every output in current repository artifacts and separate known facts from assumptions.
metadata:
  short-description: PM status and planning for 3DPrintPosters
---

# 3DPrintPosters Project Manager

Use this skill to act as a project manager for the 3DPrintPosters repository. Produce clear planning, status, risk, handoff, and human-follow-up outputs from the repo's current state.

## Source Of Truth

Start with the most relevant of these files, depending on the request:

- `AGENTS.md`: operating rules, architecture constraints, verification commands, current flow.
- `PROJECT_STATE.md`: compact current implementation state, active direction, and risks.
- `DECISIONS.md`: durable product and architecture decisions.
- `CHECKLIST.md`: archived source-of-truth pointer.
- `CHANGELOG.md`: completed changes and chronology.
- `README.md`: user-facing setup and project overview.
- `docs/PRINT_FILE_GENERATION_WORKFLOW.md`: print-file flow and service contract.
- `research/FIGURINE_PROVIDER_RESEARCH.md`: current 2026-05-23 customer-acquisition pivot, PrintU UX reference, Meshy provider research, and next validation steps.
- `research/HEIGHTMAP_AND_3D_WORKFLOW_RESEARCH.md`: heightmap experiment status and decisions.
- `.tmp/pm-plans/`: optional ignored scratch space for detailed PM plans and implementation notes. Use it only for active temporary planning, not as durable source of truth.
- `.tmp/human-tasks/`: optional ignored scratch space for short-lived human handoffs. Do not treat it as durable source of truth and do not recreate tracked `human-tasks/`.
- `docs/archive/human-tasks-archived-2026-06-11/`: historical archive of the former tracked human task folder and PrintU reference assets.
- `elliot_quick_dev_Startup.md`: local ignored startup and experiment runbook for Elliot's manual testing flow. Reference it in temporary `.tmp` handoffs when useful, but do not expose secrets or assume it is tracked.
- `package.json`, `apps/*/package.json`, and `services/print-file-generator/pyproject.toml`: runnable checks and toolchain signals.
- `scripts/meshy/run-standard-figurine-experiment.mjs`: active Meshy figurine experiment runner and output contract.
- `.env.example`, `apps/*/.env.example`, `apps/web/.env.local.example`, config readers, provider adapters, Firebase callable functions, API routes, and service clients: available variables, APIs, contracts, and integration surfaces.
- `git status --short` and recent commits when the user asks for current state, handoff, or release readiness.

Secret-bearing configuration is in scope; secret values are not. Agents may inspect variable names, config schemas, provider routes, API clients, callable functions, API routes, and documented integration contracts. When local `.env` files matter, report only variable names, presence/absence, environment placement, or recommended secret-management actions. Never print, copy, summarize, or move secret values.

## Core Workflow

1. Clarify the PM output type from the user's wording: status, roadmap, backlog, next steps, sprint plan, risk review, release readiness, handoff, or human follow-up.
2. Use Graphify before broad file reads when `graphify-out/graph.json` exists and the request is about project status, roadmap, architecture, docs drift, ownership boundaries, workflow location, dependencies, or "what should we do next?":
   - Start with `graphify query "<task-specific question>"`.
   - Use the result to choose the smallest set of files or sections to inspect.
   - If Graphify returns a narrow or unhelpful traversal, say so briefly and continue with targeted `rg`.
   - Do not run graph refresh commands unless the user asks, the graph is missing/stale for the task, or architecture changed materially.
3. Read only the source artifacts needed for that output. Prefer `rg` and targeted file reads over opening all of `PROJECT_STATE.md`, `DECISIONS.md`, `CHANGELOG.md`, or broad docs.
4. Separate facts from assumptions:
   - Facts come from repo files, git state, test output, or user-provided context.
   - Assumptions are labeled and should be minimal.
5. Keep roadmap and temporary plans separate:
   - `docs/ROADMAP.md` is the durable traffic-light status board. It should show status, priority order, and launch blockers without becoming a task dump.
   - For detailed temporary plans, create `.tmp/pm-plans/YYYY-MM-DD-short-slug/` only when the extra files materially help the work.
   - Preferred files are `plan.md`, `implementation.md`, and optional `evidence.md`.
   - Delete the temporary plan folder after implementation lands or the plan is abandoned.
   - Move durable outcomes into `CHANGELOG.md`, `DECISIONS.md`, `PROJECT_STATE.md`, relevant `docs/` or `research/` files, or the roadmap only when status or priority changes.
   - Never store secrets, personal credentials, sensitive provider URLs, or long-lived human task queues in `.tmp/pm-plans/`.
6. Preserve project constraints:
   - Web-first PWA architecture.
   - Backend orchestration in Firebase Functions.
   - Server-side print-file/model generation; provider credentials and geometry/model generation must stay out of the browser.
   - Direct Vertex/Gemini route remains the current proof-generation path until a provider-specific proof route is intentionally chosen.
   - Current priority is the 2026-05-23 PrintU-like figurine demand proof, with Meshy.ai as the first image-to-3D provider candidate.
   - Future Meshy experiments should use the standard runner `npm run meshy:experiment -- -- --experiment-slug <slug>` so experiments build on one repeatable protocol.
   - Vertex/Gemini and Meshy should generate the body only; reusable base, customer-name geometry, and body/base assembly belong in deterministic `services/print-file-generator` services.
   - Poster-relief work remains documented R&D and should not be treated as the next customer-acquisition blocker unless the user explicitly reactivates that line.
   - Reviewed product decisions should be promoted into the real workflow instead of left as opt-in experiments.
   - Default Git integration target is `main`; do not create feature branches unless explicitly requested.
   - When the user asks to commit or push from another branch, preserve the intended scope, move it onto `main` with a non-destructive Git flow, and push `origin main` unless the user names a different target.
   - Open PRs only when explicitly requested. Never expose or move secret values.
7. Review human follow-ups:
   - Summarize human-owned next actions in the PM response when the next action requires Elliot's browser session, local credentials, visual judgment, product decision, partner outreach, external account, or physical-world validation.
   - Create a temporary note under `.tmp/human-tasks/` only when it materially helps the current handoff.
   - Keep any temporary note concrete: why human, exact steps, done criteria, evidence to capture, and related files.
   - Do not put secret values, tokens, account credentials, or private personal details in temporary handoff files.
   - Do not recreate tracked `human-tasks/` files.
   - If no human action remains, explicitly say no human action was needed.
8. Produce a concise PM artifact with owners only when the user provided owners or roles. Otherwise use "Owner: TBD" or omit owners.
9. Include verification or evidence needed to call work done. Prefer existing commands from `AGENTS.md`.

## Output Patterns

For project status:

```markdown
**Project Status**
Summary: [1-3 sentences]

Current Focus:
- [Most important active area]

Completed / Stable:
- [Evidence-backed item]

In Progress:
- [Evidence-backed item]

Blockers / Risks:
- [Risk] - Impact: [H/M/L] - Next action: [action]

Next Actions:
1. [Highest leverage task] - Done when: [verification]
2. [Next task] - Done when: [verification]
```

For roadmap or sprint planning:

```markdown
**Plan**
Goal: [outcome]
Timebox: [date range or "TBD"]

Priority Order:
1. [Task] - Why now: [reason] - Done when: [check]
2. [Task] - Why now: [reason] - Done when: [check]

Dependencies:
- [Dependency or "None identified"]

Risks:
- [Risk and mitigation]
```

For temporary `.tmp/pm-plans/YYYY-MM-DD-short-slug/plan.md` files:

```markdown
# [Plan Title]

Status: active
Created: YYYY-MM-DD
Source: [request, roadmap item, or repo artifact]

## Goal

[Outcome in 1-2 sentences.]

## Scope

- In: [covered work]
- Out: [explicit non-goals]

## Decisions Needed

- [Decision and owner, if known]

## Done Criteria

- [Observable result or verification]

## Risks

- [Risk and mitigation]
```

For temporary `.tmp/pm-plans/YYYY-MM-DD-short-slug/implementation.md` files:

```markdown
# Implementation Notes

## Sequence

1. [Step]

## Verification

- [Command, browser flow, or review evidence]

## Outcome

- [What happened, or pending]
```

For handoff:

```markdown
**Handoff**
State: [brief current state]
Important Decisions:
- [decision + source]

Open Threads:
- [thread + next action]

Verification:
- [commands run or commands to run]

Human Follow-Ups:
- [temporary `.tmp/human-tasks/` path, response-only note, or "None"]

Do Not Touch:
- [secrets, ignored experiment outputs, `main` integration constraints, or fragile areas]
```

For temporary `.tmp/human-tasks/` handoff files:

```markdown
# [Task Title]

Status: open
Owner: Human
Created: YYYY-MM-DD
Source: `[repo file, local runbook, or handoff context]`

## Why Human

[Why this requires human judgment, credentials, browser testing, partner outreach, or an external decision.]

## Steps

1. [Concrete action]

## Done When

- [Observable completion criteria]

## Evidence To Capture

- [Safe evidence, without secret values]
```

## Gotchas

- Use `STL`, not `SLT`.
- JDK 21+ is installed on this machine; function-only emulator testing remains useful for the hybrid shared-Firebase flow.
- As of 2026-05-23, customer acquisition and a PrintU-like figurine flow outrank further poster-relief tuning.
- `3dprintyou.com` is the preferred domain candidate for the figurine pivot; `3dprintposters.com` remains available for the parked poster-relief line.
- Local `.env` files are ignored and may contain provider keys. It is okay to reason about required variable names and API surfaces; never quote secret values.
- `masked_depth_detail_blend` with `lithophane_baseline` detail source is the current implemented poster-relief path, but relief is parked R&D until the figurine demand proof is addressed.
- `triposr_sidecar` was evaluated on 2026-05-09 and rejected for poster relief because it reconstructs standalone 3D objects instead of image-plane depth. Do not read that as a global rejection of image-to-3D for standalone figurines.
- Meshy.ai is the first provider to evaluate for the figurine path. Its API, pricing, retention, and commercial-use terms must be verified before public checkout.
- For PM/roadmap/status work, Graphify should be the first navigation step when the existing graph is available. It is allowed to be unhelpful, but it should get a chance before large-doc reads.
- Standard Meshy experiment path: `scripts/meshy/run-standard-figurine-experiment.mjs` / `npm run meshy:experiment -- -- --experiment-slug <slug>`. It runs source photo -> Vertex/Gemini body-only concept -> Meshy multi-view -> Meshy 3D -> printability -> normalized artifacts under `.tmp/experiments/meshy/standard`.
- Historical Meshy runners are archived under `scripts/meshy/archive/2026-05-26-legacy-runners/` for reproducibility, but PM plans and next experiments should point to the standard runner unless the user explicitly asks otherwise.
- Do not imply provider-generated bases are the intended architecture. Bases, name text, and final body/base assembly are separate deterministic services under `services/print-file-generator`.
- Do not let PM outputs imply checkout is ready unless the active product path has its required artifacts: poster relief requires proof approval and print-file artifacts; figurine MVP requires proof approval, provider-generated 3D preview/assets, and human/provider validation of fulfillment readiness or an explicit preorder/manual-fulfillment decision.
- Prefer exact dates for schedule/status claims. If a date is unknown, say `TBD`.
- `.tmp/pm-plans/` is for temporary PM planning artifacts, not permanent docs. Delete or summarize those plans after implementation.
- Temporary `.tmp/human-tasks/` notes are for human-only follow-ups, especially full product-flow browser tests after AI implementation and local verification. They are not durable PM docs and are not a substitute for automated checks the agent can run locally.
