import * as fs from 'fs';
import * as path from 'path';
import { ActivityEntry } from '../types';

interface SessionData {
  sessionStart: Date;
  sessionEnd: Date;
  userMessages: string[];
  toolsUsed: Set<string>;
  filesModified: Set<string>;
  aiTitle?: string;
}

function cleanProjectName(dirName: string): string {
  const parts = dirName.split('-');
  const repoStart = parts.findIndex(p =>
    p.toLowerCase() === 'centrix' ||
    p.toLowerCase() === 'etms' ||
    p.toLowerCase() === 'standup'
  );
  if (repoStart >= 0) {
    return parts.slice(repoStart).join('-');
  }
  return parts.slice(-3).join('-');
}

function isValidUserMessage(text: string): boolean {
  const skipPatterns = [
    /^<ide_/,
    /^<system/,
    /^<context/,
    /^<command/,
    /^\s*$/,
    /^请继续/,
    /^继续/,
  ];
  return !skipPatterns.some(p => p.test(text));
}

function buildDescription(session: SessionData, projectName: string): string {
  // Use AI-generated title if available - clean and human readable
  if (session.aiTitle) {
    return `[${projectName}] ${session.aiTitle}`;
  }

  // Fallback: use first meaningful user message
  const firstMsg = session.userMessages[0] || '';
  const firstLine = firstMsg.split('\n')[0].trim().replace(/\s+/g, ' ');
  const chars = Array.from(firstLine);
  const truncated = chars.length > 80 ? chars.slice(0, 80).join('') + '...' : firstLine;

  return `[${projectName}] ${truncated}`;
}

export function collectClaudeActivity(transcriptsPath: string, date: string): ActivityEntry[] {
  const activities: ActivityEntry[] = [];
  const startOfDay = new Date(date + 'T00:00:00');
  const endOfDay = new Date(date + 'T23:59:59.999');

  try {
    const projectDirs = fs.readdirSync(transcriptsPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(transcriptsPath, d.name));

    for (const projectDir of projectDirs) {
      const jsonlFiles = fs.readdirSync(projectDir)
        .filter(f => f.endsWith('.jsonl') && !f.includes('subagent'));

      for (const file of jsonlFiles) {
        const filePath = path.join(projectDir, file);
        const sessionId = path.basename(file, '.jsonl');

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.split('\n').filter(Boolean);

          const session: SessionData = {
            sessionStart: new Date(),
            sessionEnd: new Date(),
            userMessages: [],
            toolsUsed: new Set(),
            filesModified: new Set(),
          };

          let hasActivityToday = false;
          const projectName = cleanProjectName(path.basename(projectDir));

          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              const timestamp = new Date(entry.timestamp);

              if (timestamp < startOfDay || timestamp > endOfDay) continue;
              hasActivityToday = true;

              if (!session.sessionStart || timestamp < session.sessionStart) {
                session.sessionStart = timestamp;
              }
              if (!session.sessionEnd || timestamp > session.sessionEnd) {
                session.sessionEnd = timestamp;
              }

              // Capture AI-generated title
              if (entry.type === 'ai-title' && entry.aiTitle) {
                session.aiTitle = entry.aiTitle;
              }

              // Collect ALL user messages for analysis
              if (entry.type === 'user' && entry.message?.content) {
                for (const c of entry.message.content) {
                  if (c.type === 'text' && c.text && isValidUserMessage(c.text)) {
                    session.userMessages.push(c.text);
                  }
                }
              }

              // Track tool usage
              if (entry.type === 'assistant' && entry.message?.content) {
                for (const c of entry.message.content) {
                  if (c.type === 'tool_use' && c.name) {
                    session.toolsUsed.add(c.name);
                  }
                }
              }

              // Track file modifications from tool results
              if (entry.toolUseResult?.file?.filePath) {
                session.filesModified.add(entry.toolUseResult.file.filePath);
              }
            } catch {}
          }

          if (hasActivityToday && session.userMessages.length > 0) {
            activities.push({
              timestamp: session.sessionStart,
              endTime: session.sessionEnd,
              category: 'ai-assist',
              source: 'claude',
              description: buildDescription(session, projectName),
              metadata: {
                sessionId,
                repo: projectName,
                messageCount: session.userMessages.length,
                toolsUsed: Array.from(session.toolsUsed),
                filesModified: Array.from(session.filesModified).slice(0, 10),
              },
            });
          }
        } catch {}
      }
    }
  } catch (error) {
    console.error('Failed to collect Claude activity:', error);
  }

  return activities.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
