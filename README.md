# Standup Observer

A CLI tool that automatically generates daily standup reports by collecting your activity from multiple sources.

## Features

- **Git commits** - Scans your local repositories
- **GitHub PRs** - Tracks opened, merged PRs and code reviews
- **Claude Code sessions** - Extracts work summaries from transcripts
- **Jira issues** - Fetches your ticket updates (optional)
- **Outlook calendar** - Lists meetings attended (via ICS)
- **AI summarization** - Uses Claude to generate concise reports

## Installation

```bash
# Clone the repository
git clone https://github.com/yingwang131/standup-observer.git
cd standup-observer

# Install dependencies
npm install

# Build
npm run build

# Link globally (optional, enables `standup` command)
npm link
```

## Configuration

### 1. Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your tokens:

| Variable | Required | How to get |
|----------|----------|------------|
| `GITHUB_TOKEN` | Yes | [GitHub Settings > Tokens](https://github.com/settings/tokens) - needs `repo`, `read:user` scopes |
| `AWS_BEARER_TOKEN_BEDROCK` | Yes | AWS Console or contact your admin |
| `JIRA_API_TOKEN` | No | [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |

### 2. Configuration File

```bash
cp config.example.yaml config.yaml
```

Edit `config.yaml` to set your:
- Git repository paths
- Jira project keys
- Outlook calendar ICS URL
- Claude transcripts path

## Usage

```bash
# Generate today's standup report
standup

# Generate report for a specific date
standup -d 2026-04-25

# Generate yesterday's report
standup yesterday

# Output to file
standup -o report.md

# Skip AI summarization (faster, raw data only)
standup --no-ai

# Show help
standup --help
```

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
