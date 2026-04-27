# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

CLI tool that generates daily standup reports by aggregating activity from Git, GitHub, Claude Code transcripts, Jira, and Outlook calendar. Uses AWS Bedrock (Claude) to summarize activities into a standup script.

## Architecture

Data flow: **Collectors → Merger → Classifier → Reporter**

```
src/
├── index.ts              # CLI entry (commander), orchestrates the pipeline
├── types.ts              # ActivityEntry, StandupReport, Config types
├── collectors/           # Each collector returns ActivityEntry[]
│   ├── git.ts            # Local git log via execSync
│   ├── github.ts         # GitHub REST API (PRs + reviews)
│   ├── claude.ts         # Parses ~/.claude/projects/*.jsonl transcripts
│   ├── jira.ts           # Jira REST API
│   └── outlook.ts        # ICS calendar feed
├── processor/
│   ├── merger.ts         # Deduplicates and merges similar activities
│   └── classifier.ts     # AWS Bedrock Claude call for AI summarization
└── reporter/
    └── markdown.ts       # Renders the final standup markdown
```

## Key Conventions

- **Config**: Loaded from `config.yaml` (not committed; user copies from `config.example.yaml`).
- **Secrets**: Read from `.env` via `dotenv`. Never hardcode tokens.
- **Dates**: Use `dayjs` for formatting, Date objects internally.
- **Collectors**: Must gracefully skip when credentials are missing (e.g. `github.ts` returns empty if no `GITHUB_TOKEN`).
- **Errors**: Log and continue — one failed collector shouldn't break the whole report.

## Common Commands

```bash
npm run build              # tsc compile to dist/
npm run dev                # Run via ts-node (no build needed)
npm link                   # Install `standup` command globally
standup -d 2026-04-25      # Generate report for specific date
standup --no-ai            # Skip Bedrock call (faster, for debugging)
```

## Adding a New Collector

1. Create `src/collectors/<name>.ts` exporting `collect<Name>Activity(...)`.
2. Return `ActivityEntry[]` with appropriate `category` and `source`.
3. Export from `src/collectors/index.ts`.
4. Wire into `collectAllActivities()` in `src/index.ts`.
5. Add config schema to `Config` in `src/types.ts`.

## Things to Be Careful About

- **GitHub rate limits**: The collector fetches PRs + reviews + commits per repo. Don't add parallel fan-out without throttling.
- **`execSync` in git.ts / github.ts**: `repoPath` comes from user's config.yaml — treat as trusted but avoid accepting arbitrary user input from CLI flags without validation.
- **Bedrock costs**: Each `standup` run with `--ai` makes 1-2 Claude calls. Use `--no-ai` during development.
- **Transcript path**: Claude Code transcripts are at `~/.claude/projects/<url-encoded-project>/*.jsonl`. Path format is OS-specific.
