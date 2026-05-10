# Human Tasks

This folder tracks work that needs Elliot's action after an AI developer or PM pass is complete.

Use it for tasks that require human judgment, local credentials, browser testing, external accounts, partner outreach, product decisions, or physical-world validation. Keep normal code implementation, linting, typechecks, and automated tests with the AI developer whenever they can be run locally.

## Folder Layout

- `open/`: active human-owned tasks.
- `done/`: completed human-owned tasks that are worth keeping for history.
- `TASK_TEMPLATE.md`: copy this shape for new tasks.

Name task files with the date and a short slug:

```text
YYYY-MM-DD-short-task-name.md
```

## Agent Rules

When an AI developer finishes work and a human follow-up remains:

1. Create or update a task under `human-tasks/open/`.
2. Use `TASK_TEMPLATE.md` unless the task is tiny and the same fields are still obvious.
3. Set `Owner` to `Human` unless the user gave a specific person.
4. Include exact steps, expected evidence, and a clear `Done when`.
5. Link to relevant repo docs or local runbooks. The local `elliot_quick_dev_Startup.md` file is intentionally ignored by Git, but it is a useful reference for Elliot's local startup commands.
6. Do not record secret values, API keys, tokens, credentials, personal account details, or screenshots that expose secrets.
7. Mention the created or updated human task in the final handoff.

If there is no human follow-up, say that no human task was needed.

