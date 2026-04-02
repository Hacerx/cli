# Skill Registry — alpha-cli

Generated: 2026-04-01

## User Skills

| Skill | Trigger Context |
|-------|----------------|
| branch-pr | Creating pull requests |
| issue-creation | Creating GitHub issues |
| judgment-day | Adversarial code review |
| skill-creator | Creating new skills |
| find-skills | Discovering available skills |
| sdd-explore | SDD: explore phase |
| sdd-propose | SDD: proposal phase |
| sdd-spec | SDD: spec writing phase |
| sdd-design | SDD: design phase |
| sdd-tasks | SDD: task breakdown phase |
| sdd-apply | SDD: implementation phase |
| sdd-verify | SDD: verification phase |
| sdd-archive | SDD: archive phase |

## Project Conventions

No project-level CLAUDE.md, AGENTS.md, or .cursorrules found.

## Compact Rules

### TypeScript / Node.js (alpha-cli)
- All commands extend `CommandBase<T>` from `src/lib/CommandBase.ts`
- Use `FlagType.string/integer/boolean/float/array` helpers for flag definitions
- Command file name (minus extension) becomes the CLI command name
- Directory structure under `src/commands/` maps to subcommand hierarchy
- Project uses ESM (`"type": "module"`) — use `.js` extensions in imports
- Build output goes to `dist/` via `tsc`
