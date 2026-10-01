# Project Workflow

Drop this file in the project root. It is the operating workflow for this project.

Superpowers plans, designs, reviews and verifies. Claudiomiro implements one agreed milestone at a
time. Every stage leaves an artifact on disk, so a cleared session can resume without guessing.

This is a manual integration. Neither project documents an automatic Superpowers/Claudiomiro
handoff. Superpowers is a Claude Code plugin of skills; Claudiomiro exists both as an npm CLI and,
on this machine, as a native Claude Code skill. **Check which one is actually installed before
following an execution step** - they are driven very differently.

**Terminal** = the normal terminal. **Claude** = the conversation inside Claude Code.

## Startup prompt for a new session

```text
Read CLAUDE_WORKFLOW.md and use it as the operating workflow for this project.

First inspect the current directory, Git status, existing instructions,
installed tooling and any existing project documentation.

If this is a new project, begin with requirements and design.
If this is an existing project, read CLAUDE.md, HANDOFF.md and
docs/milestones.md where present, and resume from the appropriate stage.
Do not reinitialize Git, overwrite existing work or repeat completed setup.

Use Superpowers for planning, the foundation, review and verification.
Use Claudiomiro for one prepared implementation milestone at a time.
Make the executor handoff explicit and keep progress in project files.

Preserve existing instructions and the scope I have authorised.
Continue routine implementation and verification within that scope.
Ask only about material unresolved decisions or actions requiring
authorisation that I have not already given.
```

Reference to paste into the project's `CLAUDE.md`:

```markdown
## Project workflow

Read CLAUDE_WORKFLOW.md when starting or resuming project work.
Use the stage appropriate to the current project state.
Track the specification in docs/project-spec.md, milestones in
docs/milestones.md, execution briefs and results in docs/work/,
and session handoff information in HANDOFF.md.
```

## 0. Orient

Always first, even when resuming.

```bash
pwd && git status --porcelain && git branch --show-current && git log --oneline -3
ls CLAUDE.md HANDOFF.md docs/project-spec.md docs/milestones.md 2>/dev/null
```

Enter at the first stage whose artifact is missing or stale. Do not re-init Git, re-scaffold, or
repeat completed setup. Preserve the real base branch name if it is not `main`.

New project:

```bash
mkdir my-project && cd my-project && git init -b main
```

## 1. Check the tooling

```bash
node --version && git --version
command -v claudiomiro && claudiomiro --version
```

Claudiomiro's documented prerequisites are Git, Node.js and an authenticated coding CLI. If the
binary is absent, check whether a native `claudiomiro` skill is installed instead - it does the
same job in-session and needs no npm package.

Superpowers: check the installed identifier and scope under `/plugin` before using it in any
enable/disable command. Do not install a duplicate copy just to match an example identifier.

## 2. Design with Superpowers

```text
Use Superpowers brainstorming to help me design this project.

Project: [what the application does]
Users: [who uses it]
Main outcome: [what users must accomplish]
Essential features: [your list]
Design preferences: [examples, screenshots or descriptions]
Existing technology or hosting: [if any]

Clarify the important unknowns and recommend a practical MVP.
Agree on the main user journeys, data structure, permissions
and visual direction with me.

Save the approved specification to docs/project-spec.md.
Save an ordered milestone list to docs/milestones.md.
Each milestone should produce something we can run and test.

Finish the design and plan before implementing features.
```

**Your job:** check the proposed application solves the right problem. Review a mockup or first
screen before approving UI implementation. For an existing project, update the spec and preserve
previously agreed requirements.

## 3. Foundation with Superpowers

```text
Implement the foundation from our approved specification using Superpowers.

Set up the application, local development environment and the testing
tools appropriate for this stack. Build the initial screen so I can
review the visual direction.

Create a concise CLAUDE.md containing:
- Architecture and project conventions.
- Exact development, test and build commands.
- Where the specification and milestone files live.
- A reference to CLAUDE_WORKFLOW.md.

Preserve existing project instructions if CLAUDE.md already exists.

Document environment variables in .env.example using placeholders.
Keep actual credentials out of Git.

Establish a passing baseline, show me how to run the application,
and commit the intended foundation files.
```

Node projects: ask for `npm run verify` as the single command for the agreed checks, using tests
that terminate rather than sitting in watch mode. Other stacks: document the equivalent.

If the foundation exists, verify it rather than rebuild it, and record pre-existing failures so
later reviews can distinguish them from new regressions.

## 4. Prepare one milestone for Claudiomiro

```text
Prepare milestone M1 for Claudiomiro.

Use Superpowers planning, then create a self-contained execution
brief at docs/work/m1.md.

Include:
- The goal and approved requirements.
- Relevant files and existing implementation.
- Dependencies and implementation order.
- Acceptance criteria and meaningful tests.
- Exact verification commands.
- Exclusions and unresolved blockers.

The execution brief must name Claudiomiro as the executor and be
usable without invoking Superpowers skills. Preserve all approved
requirements and constraints.

Create a feature/m1 branch in this working directory.
Commit the specification and execution brief.
Report the current directory, branch and baseline commit.
Record these details in docs/milestones.md so the review session
can identify the exact starting point.
```

**Why a separate brief:** the Superpowers plan template directs agents to its own execution skills.
A Claudiomiro handoff must preserve the approved requirements while leaving execution to
Claudiomiro. Keep briefs in `docs/work/`, not `.claudiomiro/`, whose state a fresh run can reset.

For later milestones replace `M1`, `m1` and `feature/m1` consistently. Do not recreate a branch
that already holds ongoing work.

## 5. Implement the milestone

### If the native Claudiomiro skill is installed

Stay in Claude and invoke it. Point it at `CLAUDE.md`, `docs/project-spec.md` and
`docs/work/m1.md` as the source of truth rather than letting it re-derive requirements. Stop it
before it pushes or opens a PR - stage 7 owns that. The brief is the scope; do not let another
skill re-plan mid-execution.

### If the npm CLI is installed

Exit Claude Code. In Terminal, from the exact directory reported above:

```bash
git status
git branch --show-current
```

Confirm the branch and that the checkpoint is committed. Account for unrelated uncommitted changes
before proceeding. Then:

```bash
claudiomiro --claude --same-branch --push=false --maxConcurrent=1 --limit=5 --prompt="Read CLAUDE.md, docs/project-spec.md and docs/work/m1.md. Implement only milestone M1, following its requirements and acceptance criteria. Run the documented verification commands. Do not weaken tests to obtain a pass. Record completed work, verification results and unresolved issues in docs/work/m1-result.md. Do not push or deploy."
```

| Setting | Purpose |
| --- | --- |
| `--claude` | Use Claude as the executor. |
| `--same-branch` | Work on the prepared branch. |
| `--push=false` | Skip the automatic push to the remote. Not a sandbox or deploy restriction. |
| `--maxConcurrent=1` | Begin with one concurrent task; consider 2 once proven. |
| `--limit=5` | Attempts per task. |
| `--prompt` | Start a fresh task from the supplied instructions. |

Some workflows disable Superpowers here to give Claudiomiro sole control of execution. That is a
preference, not a documented requirement, and it only works if the identifier and scope match the
real installation - verify with `/plugin` first.

Let the executor finish before another Claude session edits this directory.

## 6. Questions or failures - do not reset the run

If Claudiomiro stops for clarification, answer the generated questions, then:

```bash
claudiomiro --continue --same-branch --push=false --maxConcurrent=1 --limit=5
```

`--continue` is documented for clarification; do not assume it recovers every interrupted run.
**Avoid re-sending `--prompt` to resume** - documented behaviour starts fresh and removes existing
working state. For other failures, inspect the error and logs first, and preserve useful logs
before any intentional fresh start. Record branch, last completed work, error and next action in
`HANDOFF.md`.

## 7. Review and verify with Superpowers

```text
Review milestone M1 using Superpowers code review and verification.

Read the specification, execution brief and result file.
Inspect the actual changes against the baseline commit recorded
in docs/milestones.md.
Check requirement coverage, correctness and regressions.

Run the documented verification commands yourself.
Check for skipped or weakened tests and unfinished functionality.

Fix concrete issues within this milestone and re-run affected checks.
Report what passed, what failed and what still needs manual testing.
```

Then use the application yourself: main journey, incorrect inputs, page refresh, saved data, mobile
layout. A passing build does not establish that the feature works - compare actual behaviour with
the acceptance criteria.

## 8. Finish the milestone, then repeat

```text
Use Superpowers finishing-a-development-branch.

Update the milestone status and commit the reviewed changes.
Push the feature branch and open a pull request to the project's
base branch with a concise description and verification results.
```

Connect a GitHub repository first if the project has none. Review the PR, confirm its checks pass,
then merge. This reusable guide is not itself approval to push, merge or deploy - the explicit
instructions for the current task determine that scope.

Return to the updated base branch and **repeat steps 4-8 for M2, M3, ...** Keep `docs/milestones.md`
current with status, branch, baseline commit, brief, result, verification outcome and next action.

## 9. Release and hand off

```text
Prepare the MVP for release.

Verify the complete application against docs/project-spec.md.
Run the agreed checks and test the main user journeys together.

Prepare a preview deployment on our chosen host.
Document required environment variables, database migrations,
deployment steps and rollback steps.

Update README.md with setup and operating instructions.
Create HANDOFF.md with completed features, known issues,
verification results, deployment details and next priorities.

Show me the preview and any remaining release blockers.
```

Test the preview with test accounts and data. Authorise production explicitly, then re-check the
main journeys on the live URL.

## End every working session

```text
Update HANDOFF.md and docs/milestones.md with the actual project state.

Record:
- Current working directory, branch and milestone.
- Completed work and any uncommitted changes.
- Verification commands run and their results.
- Unresolved issues or decisions.
- Whether a Claudiomiro run completed, failed or awaits clarification.
- Relevant result and log locations.
- The next concrete action and which tool should perform it.

Keep credentials out of these documents.
Do not mark unfinished work as complete.
```

## Start the next session

```text
Read CLAUDE_WORKFLOW.md, CLAUDE.md, HANDOFF.md and docs/milestones.md.
Inspect the current branch and working tree.
Summarise the project status and prepare the next milestone,
or resume the incomplete milestone at the appropriate stage.
```

## Files this workflow uses

| File | Purpose |
| --- | --- |
| `CLAUDE_WORKFLOW.md` | This reusable operating workflow. |
| `CLAUDE.md` | Concise project instructions and exact commands. |
| `docs/project-spec.md` | Approved requirements and design. |
| `docs/milestones.md` | Ordered work, status and baseline references. |
| `docs/work/m1.md` | Self-contained execution brief for milestone M1. |
| `docs/work/m1-result.md` | Implementation results, checks and unresolved issues. |
| `.env.example` | Environment variable names with placeholder values. |
| `README.md` | Setup and operating instructions. |
| `HANDOFF.md` | Current session state and next actions. |

## Reference documentation

Commands and plugin behaviour change. If a command fails, inspect the installed version and its
help output before rewriting the workflow.

- Superpowers: https://github.com/obra/superpowers
- Superpowers planning skill: https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md
- Superpowers branch finishing: https://github.com/obra/superpowers/blob/main/skills/finishing-a-development-branch/SKILL.md
- Claudiomiro basic usage: https://github.com/samuelfaj/claudiomiro/blob/main/docs/basic-usage.md
- Claudiomiro task executor: https://github.com/samuelfaj/claudiomiro/blob/main/docs/commands/task-executor.md
- Claude Code plugins: https://code.claude.com/docs/en/discover-plugins
- Claude Code memory: https://code.claude.com/docs/en/memory
