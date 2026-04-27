import { execSync } from 'child_process';
import { ActivityEntry } from '../types';

export function collectGitActivity(repos: string[], date: string): ActivityEntry[] {
  const activities: ActivityEntry[] = [];

  for (const repo of repos) {
    try {
      const repoName = repo.split('/').pop() || repo;

      // Get user email first (Windows doesn't support $() substitution in execSync)
      const userEmail = execSync(`git -C "${repo}" config user.email`, {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();

      const logOutput = execSync(
        `git -C "${repo}" log --all --author="${userEmail}" --since="${date} 00:00" --until="${date} 23:59" --format="%H|%ad|%s" --date=format:"%Y-%m-%d %H:%M"`,
        { encoding: 'utf-8', timeout: 10000 }
      ).trim();

      if (!logOutput) continue;

      const commits = logOutput.split('\n').filter(Boolean);

      for (const commit of commits) {
        const [hash, dateTime, message] = commit.split('|');

        let filesChanged: string[] = [];
        try {
          const diffStat = execSync(
            `git -C "${repo}" diff-tree --no-commit-id --name-only -r ${hash}`,
            { encoding: 'utf-8', timeout: 5000 }
          ).trim();
          filesChanged = diffStat.split('\n').filter(Boolean);
        } catch {}

        activities.push({
          timestamp: new Date(dateTime),
          category: 'code',
          source: 'git',
          description: `[${repoName}] ${message}`,
          metadata: {
            repo: repoName,
            commitHash: hash.substring(0, 7),
            files: filesChanged.slice(0, 5),
          },
        });
      }
    } catch (error) {
      console.error(`Failed to collect git activity from ${repo}:`, error);
    }
  }

  return activities.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
