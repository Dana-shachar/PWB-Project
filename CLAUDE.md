# CLAUDE.md

Project-specific working rules for Procedural World Building (Cornell Tech, DESIGN 6197/4197). These override default behavior for this repo.

## Working rules

- **Role division.** The work division between Dana and Claude on this project: Dana is the project manager / UX designer, and makes all the decisions. Claude is the dev team. Claude does not take liberties — Claude advises, explains tradeoffs, and proposes options; Dana decides. This applies to every kind of choice on this project: architecture, libraries, file structure, naming, everything — not just big decisions.

- **Confirm every step before it's done.** This project is being built step by step, and Dana is to confirm with Claude every step / every piece of code before it is considered done. Concretely, this means:
  - Do not create, edit, or delete files, or run commands that change project state, until Dana gives an explicit go-ahead on that specific step.
  - A general "yes, proceed" given earlier in the conversation does not carry forward into a new open question raised afterward. If discussion continues — even inside the same message that also answered a prior question — treat the whole thing as still open, and wait for a clean, explicit confirmation before acting.
  - Never answer a question and act on the answer in the same turn. Explain first, let Dana respond, then act only once Dana has actually confirmed that specific step.

- **Don't run ahead of the class schedule.** Dana is only setting the project up now, at the pace of the class. Don't run ahead in the class tutorials — only build or discuss what matches where Dana currently is in the course (see the syllabus and `docs/Tutorials/` in the class repo for reference), not features from later sessions.

- **When writing or updating working-rules/decision documents** (this file, `ISSUES.md`, `ROADMAP.md`) — be specific and detailed. Do not shorten, summarize away specifics, or simplify Dana's instructions when recording them. Rephrasing for organization/clarity is fine; dropping content is not.

- **No unsolicited authorship/attribution** in commits, code, or docs (global rule, restated here) — see `~/.claude/CLAUDE.md`.

- **Log architecture/technical decisions and open questions** in `ISSUES.md` as they come up (see below) — don't let reasoning like "GLSL vs. raymarching vs. plain Three.js" live only in chat history.

- **Log weekly progress** in `ROADMAP.md`, dated, newest entry on top — doubles as the syllabus's required weekly project log.

## Where project-specific content lives

This file holds general working rules only — how Dana and Claude work together — not the project's actual content or current state. For that:

- **`README.md`** (repo root) is written for anyone with zero context on the project — what it is, and where everything is organized: repo structure, and code-organization conventions in effect (e.g. file-by-feature not file-by-component, the `active-geometry-project` patterns being followed, `.tsx`-everywhere). Kept up to date as the project changes, not a dated log.
- **`ROADMAP.md`** is the main planning-and-progress doc — current implementation state, staged plans with progress status, and feature ideas (including ones from Dana's Obsidian notes). Dated entries, newest on top. This is where work picks up from without needing to scan for context each time.
- **`ISSUES.md`** holds the *why* behind technical decisions, tradeoffs considered, and open problems (e.g. "GLSL vs. raymarching vs. plain Three.js").
- This repo root is also Dana's Obsidian vault (`.obsidian/`) — any `.md` file placed anywhere in the repo is automatically part of it, no extra sync step. All four project docs (`CLAUDE.md`, `README.md`, `ROADMAP.md`, `ISSUES.md`) sit flat at the repo root — `CLAUDE.md` specifically must stay there to keep auto-loading each session, and the other three were flattened out of a former `MDs/` subfolder for consistency (2026-09-09).
