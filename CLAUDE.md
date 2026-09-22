# CLAUDE.md

Project-specific working rules for Procedural World Building (Cornell Tech, DESIGN 6197/4197). These override default behavior for this repo.

## Working rules

- **Role division.** The work division between Dana and Claude on this project: Dana is the project manager / UX designer, and makes all the decisions. Claude is the dev team. Claude does not take liberties — Claude advises, explains tradeoffs, and proposes options; Dana decides. This applies to every kind of choice on this project: architecture, libraries, file structure, naming, everything — not just big decisions.

- **Confirm every step before it's done, following `ROADMAP.md`'s steps in order.** This project is being built step by step, according to the plan in `ROADMAP.md` — not by drifting into whatever adjacent work seems natural in the moment. Concretely, this means (Dana, 2026-09-15, after Claude worked ahead on noise modifiers instead of finishing the still-incomplete 2D-mapping step that precedes them in the roadmap's own ordering):
  - Work through `ROADMAP.md`'s plan one step at a time, in the order it lays out. Do not start a later step (or drift sideways into related-but-different work) while an earlier step in the sequence is still incomplete, even if the later step seems like a natural continuation of what was just being discussed.
  - For each step, **before touching any code**, present a plan that explains both **what** you're going to do and **how** you're going to do it (the concrete approach/files/mechanism) — not just a one-line description of the goal.
  - Do not create, edit, or delete files, or run commands that change project state, until Dana gives an explicit go-ahead on that specific step's plan. You cannot move on to implementing until that permission is given.
  - Once a step's implementation is presented as complete, Dana tests it herself. Do not start the next step until Dana has approved the completed one.
  - A general "yes, proceed" given earlier in the conversation does not carry forward into a new open question raised afterward. If discussion continues — even inside the same message that also answered a prior question — treat the whole thing as still open, and wait for a clean, explicit confirmation before acting.
  - Never answer a question and act on the answer in the same turn. Explain first, let Dana respond, then act only once Dana has actually confirmed that specific step.
  - **The full step cycle (Dana, 2026-09-15, stated verbatim as "the correct workflow"): plan → get approval → code → test → md update → commit/push.** Present the plan and get explicit approval before writing any code; implement; Dana tests it; only then update `ROADMAP.md`/`ISSUES.md` to reflect what was actually built and any known limitations/deferred fixes surfaced along the way — docs get updated *after* the code and Dana's test, not before or during planning; then commit/push. Don't skip steps or reorder them (e.g. don't write ISSUES.md entries for known limitations while still just discussing/planning a feature — log them once the code exists).

- **Don't run ahead of the class schedule.** Dana is only setting the project up now, at the pace of the class. Don't run ahead in the class tutorials — only build or discuss what matches where Dana currently is in the course (see the syllabus and `docs/Tutorials/` in the class repo for reference), not features from later sessions.

- **When writing or updating working-rules/decision documents** (this file, `ISSUES.md`, `ROADMAP.md`) — be specific and detailed. Do not shorten, summarize away specifics, or simplify Dana's instructions when recording them. Rephrasing for organization/clarity is fine; dropping content is not.

- **No unsolicited authorship/attribution** in commits, code, or docs (global rule, restated here) — see `~/.claude/CLAUDE.md`.

- **Verify reference code/algorithms before adding them, don't just reproduce from memory.** When adding a "well-established reference implementation" (a noise function, a standard algorithm, etc.) — first search for and fetch the actual current canonical source, diff what's about to be added against it, and fix any discrepancy before committing to it. `npm run build` does not catch GLSL errors (shader source is an opaque string to TypeScript via the `?raw` import) — a build passing is not evidence the shader code is correct. This caught a real bug on 2026-09-14 (a wrong constant in a hand-reproduced 3D Perlin noise function). Credit the verified source in `README.md`'s References section.

- **Log architecture/technical decisions and open questions** in `ISSUES.md` as they come up (see below) — don't let reasoning like "GLSL vs. raymarching vs. plain Three.js" live only in chat history.

- **Keep `ROADMAP.md` organized by product stage and feature, not chronologically** (Dana, 2026-09-22 — the file had drifted into a dated/chronological log, which is `WEEKLY-PUSHES.md`'s job, not this file's). Structure: numbered stages (`## Stage 01 — ...`), each holding one or more features, each feature following the fixed template **Done:** / **To do:** / **Bugs:** — the Bugs field stays a short pointer only, full technical detail belongs in `ISSUES.md`, cross-referenced by date. Update it after a step is coded and tested (per the workflow above), editing the relevant feature's Done/To do/Bugs in place rather than appending a new dated note.
- Separately, log the syllabus's graded **Weekly Push** report in `WEEKLY-PUSHES.md` each week (due start of Wednesday class) — its own file, a dated/append-only chronological log for a different audience (the instructor grading it) with a fixed required structure (what was attempted/completed, how AI-assisted tools were used, what worked/didn't/comes next).

## Where project-specific content lives

This file holds general working rules only — how Dana and Claude work together — not the project's actual content or current state. For that:

- **`README.md`** (repo root) is written for anyone with zero context on the project — what it is, and where everything is organized: repo structure, and code-organization conventions in effect (e.g. file-by-feature not file-by-component, the `active-geometry-project` patterns being followed, `.tsx`-everywhere). Kept up to date as the project changes, not a dated log.
- **`ROADMAP.md`** is the main planning-and-progress doc — organized by product stage and feature (not dated/chronological, that's `WEEKLY-PUSHES.md`), each feature following a fixed Done:/To do:/Bugs: template, current status only. Also holds feature ideas not yet turned into a tracked stage (including ones from Dana's Obsidian notes). This is where work picks up from without needing to scan for context each time.
- **`WEEKLY-PUSHES.md`** holds the syllabus's graded Weekly Push reports — a separate append-only log from `ROADMAP.md` despite the format similarity, because its audience (the instructor) and required structure (fixed 3-part format) are different from `ROADMAP.md`'s internal-continuity purpose. Write these for that audience — no internal/meta commentary about the file's own purpose.
- **`ISSUES.md`** holds the *why* behind technical decisions, tradeoffs considered, and open problems (e.g. "GLSL vs. raymarching vs. plain Three.js").
- This repo root is also Dana's Obsidian vault (`.obsidian/`) — any `.md` file placed anywhere in the repo is automatically part of it, no extra sync step. All project docs (`CLAUDE.md`, `README.md`, `ROADMAP.md`, `ISSUES.md`, `WEEKLY-PUSHES.md`) sit flat at the repo root — `CLAUDE.md` specifically must stay there to keep auto-loading each session; `README.md`/`ROADMAP.md`/`ISSUES.md` were flattened out of a former `MDs/` subfolder for consistency (2026-09-09).
