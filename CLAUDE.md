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

- **Research and work according to known, established architectures — never guess, never invent.** (Dana, 2026-10-13, after the cube-sphere pole/seam artifact took several rounds of hand-derived UV math and bespoke proposed fixes to diagnose, when the conventional answers were documented and findable the whole time — Dana had to ask for the research explicitly, twice: *"i want you to follow these architectures. and for future work - you should always do that research in advance, never guess on what you're doing or what you think should happen. there are known established methods for this. we're not inventing the wheel."* and *"research and work according to known architectures. always research new additions you're unsure of how to add."*) Concretely:
  - **Do the research up front, before writing the plan** — not after an approach fails. Any time you're adding something you're unsure how to build, or choosing a data format/rendering technique/architecture, search for how it is conventionally solved first, and present that research *as part of* the plan Dana approves.
  - **Do not reason it out from first principles and present the result as the answer.** If a known method exists, follow it. Hand-derivation is for verifying/adapting a known method, not for inventing a replacement for one.
  - **Cite the real sources** in the proposal, and record them in `ISSUES.md`/`ROADMAP.md` (and `README.md`'s References section) per the existing convention — so the reasoning behind an architecture choice is traceable, not just asserted.
  - This sits one step *earlier* than the reference-code rule below: that rule is about verifying an algorithm's actual code before copying it; this one is about verifying the *approach itself* is the conventional one before even proposing it.

- **Infrastructure-level defects get fixed properly, not logged and deferred.** (Dana, 2026-10-13, rejecting "log it and move on" for the equirectangular-heightmap pole artifact: *"i want this fixed properly, it could affect any future features. we cannot log this and move on."* and *"i'm leaning towards an over all fix of the infrustructure- complete with fixing all features that are affected."*) When a problem is in shared infrastructure rather than in one feature, the expected response is a real fix of the infrastructure **plus** fixing every feature affected by it — not a deferred/cosmetic-edge-case entry in `ISSUES.md`. Identify and list the affected features as part of the plan, so the full scope is visible before work starts. (This does not override the approval workflow above — the fix still gets planned and approved before any code.)

- **Verify reference code/algorithms before adding them, don't just reproduce from memory.** When adding a "well-established reference implementation" (a noise function, a standard algorithm, etc.) — first search for and fetch the actual current canonical source, diff what's about to be added against it, and fix any discrepancy before committing to it. `npm run build` does not catch GLSL errors (shader source is an opaque string to TypeScript via the `?raw` import) — a build passing is not evidence the shader code is correct. This caught a real bug on 2026-09-14 (a wrong constant in a hand-reproduced 3D Perlin noise function). Credit the verified source in `README.md`'s References section.

- **Log architecture/technical decisions and open questions** in `ISSUES.md` as they come up (see below) — don't let reasoning like "GLSL vs. raymarching vs. plain Three.js" live only in chat history.

- **Proactively split `App.tsx` the moment a new feature adds state to it — don't wait to be caught.** (Dana, 2026-09-22, after `App.tsx` had accumulated five unrelated features' worth of loose `useState`/`useEffect` calls directly in the file before Dana noticed and had to ask for it to be reorganized: "why do I need to catch you instead of you following directions??") `App.tsx` is a composition root only — it calls each feature's hook and wires results into JSX, it never owns a feature's state/logic itself. As soon as a new piece of state or an effect is being added for a given feature, give that feature its own hook file in its own feature-scoped folder immediately, in the same step, rather than adding it inline to `App.tsx` and splitting it out later. See `README.md`'s code-organization section for the resulting structure.

- **Keep `ROADMAP.md` organized by product stage and feature, not chronologically** (Dana, 2026-09-22 — the file had drifted into a dated/chronological log, which is `WEEKLY-PUSHES.md`'s job, not this file's). Structure: numbered stages (`## Stage 01 — ...`), each holding one or more features, each feature following the fixed template **Done:** / **To do:** / **Bugs:** — the Bugs field stays a short pointer only, full technical detail belongs in `ISSUES.md`, cross-referenced by date. Update it after a step is coded and tested (per the workflow above), editing the relevant feature's Done/To do/Bugs in place rather than appending a new dated note.
- Separately, log the syllabus's graded **Weekly Push** report in `WEEKLY-PUSHES.md` each week (due start of Wednesday class) — its own file, a dated/append-only chronological log for a different audience (the instructor grading it) with a fixed required structure (what was attempted/completed, how AI-assisted tools were used, what worked/didn't/comes next).

## Documentation conventions

*How every markdown doc in this repo is written. Adopted 2026-10-13 from the conventions Dana built in the procedural-creative-coding-tool project, after she flagged that `WEEKLY-PUSHES.md` and the other docs here were unformatted by comparison. Those rules are the source; this section is this project's copy of them, and changes here should stay in step with that project's `DESIGN-SYSTEM.md §Documentation`.*

### Writing

- **Plain language.** No jargon where a normal word works. Explain any new term the first time it appears.
- **No em-dashes.** Use commas, colons, parentheses, or split the sentence.
- **US spelling** (color, behavior, organize), in docs, code comments and the interface.
- **No paragraph over two or three sentences.**
- **A one-line summary in italics under every heading.**

### Structure by kind of content

- **Tables only for comparisons:** several items sharing the same attributes.
- **Examples** as quoted lines or bullets, never inside table cells.
- **A new concept:** a one-line definition, then short bullets.
- **A process:** a numbered list.
- **A decision or an open question:** a callout (`> [!NOTE]`, `> [!IMPORTANT]`, `> [!TIP]`, `> [!WARNING]`), which renders on GitHub and in Obsidian.

### State rules, not cases

- **A rule is what generalizes.** When Dana gives an example, write the principle it is an instance of, not the example itself, and do not pile up specific cases.
- **An example appears only to show how a rule is used**, one per rule at most, labeled as an example.
- **Specifics go to the doc they belong to**, and the rule links there rather than repeating them.

### Write less

- **One fact, one place.** Everywhere else links to it.
- **Cut what adds nothing:** obvious columns, empty cells, repeated explanations, detail not worth mentioning. A person has to read all of this.

### Lists: a bold title line, then bullets

Every item has the same shape:

```
**Chosen: a cube inflated into a sphere** · `decided`
- six flat grids pushed out onto the sphere
- a lat/long grid cannot do this, its lines all converge at two points
- *Ulrich's chunked LOD. See REFERENCES.md*
```

- **The title is a bold line, not a bullet**, so every title shares one left edge and the list can be skimmed. A status tag goes after it.
- **Details are bullets under it, in a fixed order:** what it is, an example, the source in italics. A missing line is left out, the order never changes.
- **A blank line between items**, so each one reads as a block.
- **No tags inside the details.** Anything with its own status becomes its own item.
- **A sign covering a whole list goes on the heading once**, not on every line.

### Signs: one sign, one meaning

Never reuse a sign for something else, and put it at the start of the line.

| sign | means, and only this |
|---|---|
| ✅ | a completed step or task, or a do |
| 🟡 | in progress |
| ⚪ | not started |
| ⏸️ | deferred work |
| ❓ | open, Dana's to decide |
| 💡 | an unconfirmed suggestion |
| ⚠️ | a risk |
| 🔴 | an open bug |
| ❌ | a non-goal, or a don't |
| 📌 | a small todo |
| 🖼️ | an image needed |
| 📚 | borrowed from research or convention |
| 🧭 | a decision, and the reasoning behind it |

Status of a rule rather than a task uses a text tag, so it never reads as work: `decided` · `proposed` · `approved` · `open` · `deferred` · `accepted`.

Progress bars are ten cells: `▓▓▓░░░░░░░ 30%`

### Retrofit

`README.md`, `ROADMAP.md`, `ISSUES.md` and `WEEKLY-PUSHES.md` were written before these conventions and do not follow them yet. Dana's call, 2026-10-13: retrofit them as their own step, after the current planet-mesh work is finished. New and edited sections follow the conventions now, so the two formats coexist until then.

## Where project-specific content lives

This file holds general working rules only — how Dana and Claude work together — not the project's actual content or current state. For that:

- **`README.md`** (repo root) is written for anyone with zero context on the project — what it is, and where everything is organized: repo structure, and code-organization conventions in effect (e.g. file-by-feature not file-by-component, the `active-geometry-project` patterns being followed, `.tsx`-everywhere). Kept up to date as the project changes, not a dated log.
- **`ROADMAP.md`** is the main planning-and-progress doc — organized by product stage and feature (not dated/chronological, that's `WEEKLY-PUSHES.md`), each feature following a fixed Done:/To do:/Bugs: template, current status only. Also holds feature ideas not yet turned into a tracked stage (including ones from Dana's Obsidian notes). This is where work picks up from without needing to scan for context each time.
- **`WEEKLY-PUSHES.md`** holds the syllabus's graded Weekly Push reports — a separate append-only log from `ROADMAP.md` despite the format similarity, because its audience (the instructor) and required structure (fixed 3-part format) are different from `ROADMAP.md`'s internal-continuity purpose. Write these for that audience — no internal/meta commentary about the file's own purpose.
- **`ISSUES.md`** holds the *why* behind technical decisions, tradeoffs considered, and open problems (e.g. "GLSL vs. raymarching vs. plain Three.js"). Bugs live here too: this project does not keep a separate bugs file (Dana, 2026-10-13: "issues = bugs here, it doesn't matter").
- **`REFERENCES.md`** holds every outside source, grouped as conceptual, visual and computational. Added 2026-10-13. Any outside method, algorithm or implementation the project relies on is recorded there with what it is and what was taken from it, so a source is cited in one place instead of being repeated across docs.
- This repo root is also Dana's Obsidian vault (`.obsidian/`) — any `.md` file placed anywhere in the repo is automatically part of it, no extra sync step. All project docs (`CLAUDE.md`, `README.md`, `ROADMAP.md`, `ISSUES.md`, `WEEKLY-PUSHES.md`) sit flat at the repo root — `CLAUDE.md` specifically must stay there to keep auto-loading each session; `README.md`/`ROADMAP.md`/`ISSUES.md` were flattened out of a former `MDs/` subfolder for consistency (2026-09-09).
