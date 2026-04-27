import { ActivityEntry } from '../types';

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    updated: string;
    assignee?: { displayName: string };
  };
}

export async function collectJiraActivity(
  baseUrl: string,
  projects: string[],
  date: string,
  userEmail?: string
): Promise<ActivityEntry[]> {
  const activities: ActivityEntry[] = [];
  const token = process.env.JIRA_API_TOKEN;
  const email = userEmail || process.env.JIRA_EMAIL;

  if (!token || !email) {
    console.warn('JIRA_API_TOKEN or JIRA_EMAIL not set, skipping Jira collection');
    return activities;
  }

  const auth = Buffer.from(`${email}:${token}`).toString('base64');

  for (const project of projects) {
    try {
      const jql = encodeURIComponent(
        `project = ${project} AND updated >= "${date}" AND updated < "${date}" + 1d AND assignee was currentUser()`
      );

      const response = await fetch(
        `${baseUrl}/rest/api/3/search?jql=${jql}&fields=summary,status,updated,assignee`,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.warn(`Jira API error: ${response.status}`);
        continue;
      }

      const data = await response.json() as { issues: JiraIssue[] };

      for (const issue of data.issues || []) {
        activities.push({
          timestamp: new Date(issue.fields.updated),
          category: 'jira',
          source: 'jira',
          description: `[${issue.key}] ${issue.fields.summary}`,
          metadata: {
            issueKey: issue.key,
          },
        });
      }
    } catch (error) {
      console.error(`Failed to collect Jira activity for ${project}:`, error);
    }
  }

  return activities.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
