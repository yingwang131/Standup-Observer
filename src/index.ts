#!/usr/bin/env node

import * as dotenv from 'dotenv';
dotenv.config({ override: true });
import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import dayjs from 'dayjs';

import { Config, StandupReport, ActivityEntry, PRHighlight } from './types';
import {
  collectGitActivity,
  collectClaudeActivity,
  collectJiraActivity,
  collectOutlookActivity,
  collectGitHubActivity,
  GitHubActivity,
} from './collectors';
import { mergeActivities } from './processor/merger';
import { classifyAndSummarize, getLastScripts } from './processor/classifier';
import { generateMarkdownReport } from './reporter/markdown';

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'config.yaml');

async function loadConfig(configPath: string): Promise<Config> {
  const content = fs.readFileSync(configPath, 'utf-8');
  return yaml.parse(content) as Config;
}

interface CollectionResult {
  activities: ActivityEntry[];
  githubActivity: GitHubActivity;
}

async function collectAllActivities(config: Config, date: string): Promise<CollectionResult> {
  console.log(`📊 Collecting activities for ${date}...`);

  const activities: ActivityEntry[] = [];

  // Git
  console.log('  → Git commits...');
  const gitActivities = collectGitActivity(config.git.repos, date);
  console.log(`    Found ${gitActivities.length} commits`);
  activities.push(...gitActivities);

  // GitHub PRs
  console.log('  → GitHub PRs...');
  const githubActivity = await collectGitHubActivity(config.git.repos, date);
  const prCount = githubActivity.prs.length;
  const reviewCount = githubActivity.prs.filter(p => p.isReview).length;
  console.log(`    Found ${prCount - reviewCount} PRs, ${reviewCount} reviews`);

  // Claude Code
  console.log('  → Claude Code sessions...');
  const claudeActivities = collectClaudeActivity(config.claude.transcriptsPath, date);
  console.log(`    Found ${claudeActivities.length} sessions`);
  activities.push(...claudeActivities);

  // Jira (if configured)
  if (process.env.JIRA_API_TOKEN) {
    console.log('  → Jira issues...');
    const jiraActivities = await collectJiraActivity(
      config.jira.baseUrl,
      config.jira.projects,
      date
    );
    console.log(`    Found ${jiraActivities.length} issues`);
    activities.push(...jiraActivities);
  } else {
    console.log('  → Jira: skipped (no token)');
  }

  // Outlook (via ICS calendar subscription)
  console.log('  → Outlook calendar...');
  const outlookActivities = await collectOutlookActivity(date, config.outlook?.icsUrl);
  console.log(`    Found ${outlookActivities.length} meetings`);
  activities.push(...outlookActivities);

  return { activities, githubActivity };
}

async function generateStandup(config: Config, date: string, useAI: boolean): Promise<string> {
  // Collect all activities
  const { activities: rawActivities, githubActivity } = await collectAllActivities(config, date);

  if (rawActivities.length === 0 && githubActivity.prs.length === 0) {
    console.log('\n⚠️  No activities found for this date');
    return `## 📅 Daily Standup - ${date}\n\n_No activities recorded_`;
  }

  // Merge similar activities
  console.log('\n🔄 Merging activities...');
  const merged = mergeActivities(rawActivities, config.filter.minDurationMinutes);
  console.log(`  ${rawActivities.length} → ${merged.length} items`);

  // Build PR highlights
  const highlights: PRHighlight[] = githubActivity.prs.map(pr => ({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    repo: pr.repo,
    url: pr.url,
    isReview: pr.isReview,
    author: pr.author,
  }));

  // Classify and summarize
  console.log('\n🤖 Generating report...');
  const tasks = useAI
    ? await classifyAndSummarize(merged, date, highlights)
    : merged.map(a => ({
        timeRange: formatTimeRange(a.timestamp, a.endTime),
        category: a.category.charAt(0).toUpperCase() + a.category.slice(1),
        description: a.description.split('\n')[0],
        outcome: 'Done' as const,
        prNumber: a.metadata?.commitHash ? githubActivity.commitToPR.get(a.metadata.commitHash)?.number : undefined,
        prState: a.metadata?.commitHash ? githubActivity.commitToPR.get(a.metadata.commitHash)?.state : undefined,
      }));

  // Generate report
  const scripts = useAI ? getLastScripts() : { short: '', full: '' };
  const report: StandupReport = {
    date,
    highlights: highlights.length > 0 ? highlights : undefined,
    accomplished: tasks,
    todayFocus: [],
    blockers: [],
    scriptShort: scripts.short || undefined,
    scriptFull: scripts.full || undefined,
  };

  return generateMarkdownReport(report);
}

function formatTimeRange(start: Date, end?: Date): string {
  const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return end ? `${fmt(start)}-${fmt(end)}` : fmt(start);
}

// CLI Setup
program
  .name('standup')
  .description('Generate daily standup reports from your activity logs')
  .version('1.0.0');

program
  .option('-d, --date <date>', 'Date to generate report for (YYYY-MM-DD)', dayjs().format('YYYY-MM-DD'))
  .option('-c, --config <path>', 'Path to config file', DEFAULT_CONFIG_PATH)
  .option('-o, --output <path>', 'Output file path (default: stdout)')
  .option('--no-ai', 'Skip AI classification')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      const report = await generateStandup(config, options.date, options.ai !== false);

      console.log('\n' + '='.repeat(60) + '\n');

      if (options.output) {
        fs.writeFileSync(options.output, report);
        console.log(`✅ Report saved to ${options.output}`);
      } else {
        console.log(report);
      }
    } catch (error) {
      console.error('❌ Error:', error);
      process.exit(1);
    }
  });

program
  .command('yesterday')
  .description('Generate report for yesterday')
  .action(async () => {
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    const config = await loadConfig(DEFAULT_CONFIG_PATH);
    const report = await generateStandup(config, yesterday, true);
    console.log(report);
  });

program.parse();
