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

```markdown
## 📅 Daily Standup - 2026-04-25

### 🎯 PR Highlights
| PR | Status | Repo |
|----|--------|------|
| #123 Add user auth | 🟢 Merged | my-project |

### ✅ Accomplished
| Time | Category | Description |
|------|----------|-------------|
| 09:30-11:00 | Code | Implemented authentication flow |
| 14:00-15:30 | Meeting | Sprint planning |

### 🎙️ Standup Script
> Yesterday I merged the auth PR and attended sprint planning...
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
