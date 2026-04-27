# Standup Observer

A CLI tool that automatically generates daily standup reports by collecting your activity from multiple sources.

## Features

- **Git commits** - Scans your local repositories
- **GitHub PRs** - Tracks opened, merged PRs and code reviews
- **Claude Code sessions** - Extracts work summaries from transcripts
- **Jira issues** - Fetches your ticket updates (no access to generate JIRA token currently)
- **Outlook calendar** - Lists meetings attended (via ICS)
- **AI summarization** - Uses Claude to generate concise reports

## Installation

```bash
# Clone the repository
git clone https://github.com/yingwang131/Standup-Observer.git
cd Standup-Observer

# Install dependencies
npm install

# Build (required for global command)
npm run build

# Link globally (required to use the `standup` command)
npm link
```

> **Note**: After `npm link`, open a new terminal window for the `standup` command to be available on your PATH.

### Requirements

- Node.js 18 or higher
- **Windows only** for Outlook calendar integration (uses PowerShell to fetch ICS)

## Configuration

### 1. Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your tokens:

| Variable | Required | How to get |
|----------|----------|------------|
| `GITHUB_TOKEN` | Yes | [GitHub Settings > Tokens](https://github.com/settings/tokens) - needs `repo`, `read:user` scopes |
| `AWS_BEARER_TOKEN_BEDROCK` | One of these | AWS Console - for AI summarization via AWS Bedrock |
| `ANTHROPIC_API_KEY` | One of these | [Anthropic Console](https://console.anthropic.com/) - alternative to AWS Bedrock |
| `AWS_REGION` | No | Defaults to `us-east-1` |
| `BEDROCK_MODEL_ID` | No | Defaults to `us.anthropic.claude-sonnet-4-20250514-v1:0` |
| `OUTLOOK_ICS_URL` | No | Can be set here or in `config.yaml` |

> **AI Summarization**: You need **either** `AWS_BEARER_TOKEN_BEDROCK` **or** `ANTHROPIC_API_KEY`. The tool tries Bedrock first, then falls back to the Anthropic API. Without either, use `--no-ai` to get raw data only.

### 2. Configuration File

```bash
cp config.example.yaml config.yaml
```

Edit `config.yaml` to set your:
- Git repository paths (absolute paths to local repos)
- Outlook calendar ICS URL (Outlook > Settings > Calendar > Shared calendars > Publish calendar)
- Claude transcripts path (typically `~/.claude/projects`)

## Usage

```bash
# Generate today's standup report (with AI summarization)
standup

# Generate report for a specific date
standup -d 2026-04-25

# Generate yesterday's report
standup yesterday

# Output to file
standup -o report.md

# Debug mode: skip AI, show raw activity data
# WARNING: Without AI, descriptions are not translated or summarized,
# so the output may contain text in any language used in your commits,
# Jira tickets, or Claude Code sessions.
standup --no-ai

# Show help
standup --help
```

### Development Mode

If you haven't run `npm link`, you can run directly with ts-node (no build required):

```bash
# Run directly without building
npx ts-node src/index.ts -d 2026-04-25

# Or use npm script (note the -- separator for arguments)
npm run dev -- -d 2026-04-25
```

> **Tip**: For daily use, run `standup` without flags. The AI summarization translates and polishes the output into a professional standup script. Use `--no-ai` only for debugging or when you want to inspect raw data.

## Example Output

```
🎯 Highlights ────────────────────────────────────────────────────────────

✅ Merged PR #611: Blob-multistagematrix-part2 and other small fixes

⚡ Quick Version ────────────────────────────────────────────────────────────

• On 2026-04-23, I merged PR #611 for blob multi-stage matrix improvements on the File Manager.
• Also spent time debugging Docker timeouts in SFTP E2E tests and fixing multiple issues in the standup observer tool.

📝 Full Version ────────────────────────────────────────────────────────────

• On 2026-04-23, the main thing I accomplished was merging PR #611 which included blob multi-stage matrix improvements and other small fixes for the File Manager. I also did a deep dive into Docker timeout issues that were affecting our SFTP E2E tests - turns out there were some infrastructure bottlenecks I managed to identify.
• While I was troubleshooting, I also knocked out debugging work on the standup observer tool, specifically around Git activity logs not properly capturing push and PR events. Moving forward, this should help stabilize our test infrastructure and improve our development workflow tracking.

📋 Detailed Breakdown ────────────────────────────────────────────────────────────

File Manager:
• Merged PR #611 with blob multi-stage matrix improvements and small fixes
• Debugged Docker timeout issues in SFTP E2E tests

Standup Observer:
• Fixed Git activity logs not capturing push and PR events
• Debugged multiple system errors
```

## Project Structure

```
standup-observer/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── collectors/        # Data collectors
│   │   ├── git.ts         # Git commit collector
│   │   ├── github.ts      # GitHub PR collector
│   │   ├── claude.ts      # Claude Code transcript collector
│   │   ├── jira.ts        # Jira issue collector
│   │   └── outlook.ts     # Outlook calendar collector
│   ├── processor/
│   │   ├── merger.ts      # Activity deduplication
│   │   └── classifier.ts  # AI classification
│   └── reporter/
│       └── markdown.ts    # Report generator
├── config.example.yaml
├── .env.example
└── package.json
```

## License

MIT License - see [LICENSE](LICENSE)

## Author

Ying Wang ([@yingwang131](https://github.com/yingwang131))
