import { ActivityEntry } from '../types';

export interface PRInfo {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  repo: string;
  url: string;
  createdAt: Date;
  mergedAt?: Date;
  isReview: boolean;
  author: string;
}

export interface GitHubActivity {
  prs: PRInfo[];
  commitToPR: Map<string, PRInfo>;
}

export async function collectGitHubActivity(
  repos: string[],
  date: string,
  username?: string
): Promise<GitHubActivity> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { prs: [], commitToPR: new Map() };
  }

  // Get current user if not provided
  if (!username) {
    username = await getCurrentUser(token);
  }

  const prs: PRInfo[] = [];
  const commitToPR = new Map<string, PRInfo>();

  for (const repoPath of repos) {
    try {
      const repoInfo = extractRepoInfo(repoPath);
      if (!repoInfo) continue;

      const { owner, repo } = repoInfo;

      // Get PRs authored by user
      const authoredPRs = await fetchPRs(token, owner, repo, date, username);
      prs.push(...authoredPRs);

      // Get PRs reviewed by user
      const reviewedPRs = await fetchReviewedPRs(token, owner, repo, date, username);
      prs.push(...reviewedPRs);

      // Map commits to PRs
      for (const pr of authoredPRs) {
        const commits = await fetchPRCommits(token, owner, repo, pr.number);
        for (const sha of commits) {
          commitToPR.set(sha.substring(0, 7), pr);
        }
      }
    } catch (error) {
      console.error(`Failed to fetch GitHub activity for ${repoPath}:`, error);
    }
  }

  return { prs, commitToPR };
}

function extractRepoInfo(repoPath: string): { owner: string; repo: string } | null {
  // Try to get remote URL from git config
  try {
    const { execSync } = require('child_process');
    const remoteUrl = execSync(`git -C "${repoPath}" remote get-url origin`, {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    // Parse GitHub URL: https://github.com/owner/repo.git or git@github.com:owner/repo.git
    const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
    const sshMatch = remoteUrl.match(/github\.com:([^/]+)\/([^/.]+)/);
    const match = httpsMatch || sshMatch;

    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  } catch {}

  return null;
}

async function getCurrentUser(token: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { login: string };
    return data.login;
  } catch {
    return undefined;
  }
}

async function fetchPRs(
  token: string,
  owner: string,
  repo: string,
  date: string,
  username?: string
): Promise<PRInfo[]> {
  const prs: PRInfo[] = [];
  const dateStart = new Date(`${date}T00:00:00`);
  const dateEnd = new Date(`${date}T23:59:59`);

  try {
    // Fetch open and closed PRs
    for (const state of ['open', 'closed'] as const) {
      const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&sort=updated&direction=desc&per_page=50`;
      const response = await fetch(url, {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) continue;

      const data = (await response.json()) as any[];

      for (const pr of data) {
        const createdAt = new Date(pr.created_at);
        const updatedAt = new Date(pr.updated_at);
        const mergedAt = pr.merged_at ? new Date(pr.merged_at) : undefined;

        // Check if PR was active on the target date
        const wasCreatedOnDate = createdAt >= dateStart && createdAt <= dateEnd;
        const wasMergedOnDate = mergedAt && mergedAt >= dateStart && mergedAt <= dateEnd;
        const wasUpdatedOnDate = updatedAt >= dateStart && updatedAt <= dateEnd;

        if (!wasCreatedOnDate && !wasMergedOnDate && !wasUpdatedOnDate) continue;

        // Filter by username if provided
        if (username && pr.user.login.toLowerCase() !== username.toLowerCase()) continue;

        // Determine PR state based on target date (not current state)
        let prState: 'open' | 'closed' | 'merged';
        if (wasMergedOnDate) {
          prState = 'merged';
        } else if (wasCreatedOnDate) {
          prState = 'open';
        } else {
          // Updated on date but not created or merged - skip or show as current state
          prState = pr.merged_at ? 'merged' : state;
        }

        prs.push({
          number: pr.number,
          title: pr.title,
          state: prState,
          repo: repo,
          url: pr.html_url,
          createdAt,
          mergedAt,
          isReview: false,
          author: pr.user.login,
        });
      }
    }
  } catch (error) {
    console.error(`Failed to fetch PRs for ${owner}/${repo}:`, error);
  }

  return prs;
}

async function fetchReviewedPRs(
  token: string,
  owner: string,
  repo: string,
  date: string,
  username?: string
): Promise<PRInfo[]> {
  if (!username) return [];

  const prs: PRInfo[] = [];

  try {
    // Search for PRs reviewed by user
    const query = `repo:${owner}/${repo} reviewed-by:${username} updated:${date}`;
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=50`;
    const response = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) return [];

    const data = (await response.json()) as { items?: any[] };

    for (const issue of data.items || []) {
      if (!issue.pull_request) continue;

      prs.push({
        number: issue.number,
        title: issue.title,
        state: issue.state === 'open' ? 'open' : 'closed',
        repo: repo,
        url: issue.html_url,
        createdAt: new Date(issue.created_at),
        isReview: true,
        author: issue.user.login,
      });
    }
  } catch (error) {
    console.error(`Failed to fetch reviewed PRs for ${owner}/${repo}:`, error);
  }

  return prs;
}

async function fetchPRCommits(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string[]> {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/commits?per_page=100`;
    const response = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) return [];

    const data = (await response.json()) as any[];
    return data.map((c: any) => c.sha);
  } catch {
    return [];
  }
}

export function convertPRsToActivities(githubActivity: GitHubActivity): ActivityEntry[] {
  const activities: ActivityEntry[] = [];

  for (const pr of githubActivity.prs) {
    const timestamp = pr.mergedAt || pr.createdAt;
    const prefix = pr.isReview ? 'Reviewed' : pr.state === 'merged' ? 'Merged' : 'Opened';

    activities.push({
      timestamp,
      category: 'code',
      source: 'git',
      description: `[${pr.repo}] ${prefix} PR #${pr.number}: ${pr.title}`,
      metadata: {
        repo: pr.repo,
        prNumber: pr.number,
        prState: pr.state,
        prUrl: pr.url,
        isReview: pr.isReview,
        prAuthor: pr.author,
      } as any,
    });
  }

  return activities;
}
