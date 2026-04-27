export interface ActivityEntry {
  timestamp: Date;
  endTime?: Date;
  category: 'code' | 'email' | 'meeting' | 'jira' | 'ai-assist' | 'docs' | 'training' | 'other';
  source: 'git' | 'outlook' | 'jira' | 'claude' | 'confluence' | 'chrome' | 'local';
  description: string;
  metadata?: {
    repo?: string;
    branch?: string;
    commitHash?: string;
    issueKey?: string;
    sender?: string;
    subject?: string;
    sessionId?: string;
    files?: string[];
    messageCount?: number;
    toolsUsed?: string[];
    filesModified?: string[];
    prNumber?: number;
    prState?: 'open' | 'closed' | 'merged';
    prUrl?: string;
    isReview?: boolean;
    prAuthor?: string;
  };
}

export interface PRHighlight {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  repo: string;
  url: string;
  isReview: boolean;
  author?: string;
}

export interface StandupReport {
  date: string;
  highlights?: PRHighlight[];
  accomplished: TaskRow[];
  todayFocus: string[];
  blockers: string[];
  scriptShort?: string;
  scriptFull?: string;
}

export interface TaskRow {
  timeRange?: string;
  category?: string;
  project?: string;
  description?: string;
  accomplishment?: string;
  outcome?: 'Done' | 'In Progress' | 'Follow-up' | 'Completed';
  status?: string;
  prNumber?: number;
  prState?: 'open' | 'closed' | 'merged';
}

export interface Config {
  git: {
    repos: string[];
  };
  jira: {
    baseUrl: string;
    projects: string[];
  };
  github: {
    baseUrl: string;
  };
  outlook: {
    icsUrl?: string;
  };
  claude: {
    transcriptsPath: string;
  };
  filter: {
    minDurationMinutes: number;
    excludePatterns: string[];
  };
}
