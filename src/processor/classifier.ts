import Anthropic from '@anthropic-ai/sdk';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { ActivityEntry, TaskRow, PRHighlight } from '../types';

const CATEGORY_LABELS: Record<string, string> = {
  'code': 'Code',
  'email': 'Email',
  'meeting': 'Meeting',
  'jira': 'Jira',
  'ai-assist': 'AI Assist',
  'docs': 'Docs',
  'training': 'Training',
  'other': 'Other',
};

const STANDUP_PROMPT = `You are a Senior SDET at a Silicon Valley company giving a natural, conversational standup update.

# STYLE: SILICON VALLEY SENIOR ENGINEER

## 1. NARRATIVE OVER LIST
- Don't just list tasks. Connect them with logical transitions
- Use: "Specifically," "Which helped us to," "This was causing issues with..." "After that,"
- Tell a STORY of your day, not a bullet list

## 2. IMPACT-FIRST
- Start with the BIGGEST achievement (e.g., "Stabilized the E2E test suite")
- Group smaller tasks as "maintenance," "clean-up," or "while I was in there, I also..."
- End with what this unblocks or improves

## 3. ENGINEERING SLANG
Use naturally: "deep dive," "bottleneck," "flaky tests," "unblocked," "streamlined," "root-caused," "spun up," "hit a wall," "figured out," "turns out"

## 4. NATURAL FILLERS
Use: "I spent some time on," "I managed to," "Moving forward," "The main thing was," "I also knocked out," "On a related note,"

# CRITICAL RULES
1. OUTPUT 100% ENGLISH - translate Chinese naturally
2. NO ROBOT TALK: Never use "Keywords:", "Files:", pipe symbols "|"
3. MERGE related tasks into ONE narrative (e.g., 5 Docker timeout debugs → 1 story)
4. Clean project names: "centrix-decision-intelligence-file-manager" → "File Manager"

# SDET CONTEXT
Focus on: test stability, flaky test fixes, Docker/Testcontainers infrastructure, E2E reliability, unblocking the dev team

# OUTPUT FORMAT
Return JSON with THREE fields:
{
  "scriptShort": "2-3 sentence summary. Quick version for time-constrained standups.",
  "scriptFull": "Full 30-second narrative with details, transitions, and impact.",
  "tasks": [
    {"project": "Clean Project Name", "description": "Concise English description of what was done"},
    ...
  ]
}

The "tasks" array should:
- Group related activities by project (clean the project name, e.g., "centrix-decision-intelligence-file-manager" → "File Manager")
- Translate ALL Chinese to natural English
- Keep descriptions concise (one line each)
- Merge similar/related tasks within the same project

# EXAMPLE FULL SCRIPT (this is the quality bar)
"Yesterday, I spent most of my time doing a deep dive into the Docker timeout issues that were making our SFTP E2E tests flaky. Turns out there was a connection pooling bottleneck in the test container setup. I managed to root-cause it and push a fix that stabilized the entire test suite. On a related note, I also knocked out some cleanup work on the standup reporter tool. Moving forward, I'll keep an eye on the test stability metrics and start looking at the blob storage tests next."

# EXAMPLE SHORT SCRIPT
"Yesterday I focused on stabilizing the E2E test infrastructure - root-caused Docker timeout issues affecting SFTP tests. Also refactored the standup reporter. Today I'll monitor test stability."

Return ONLY valid JSON.`;

interface AITask {
  project: string;
  description: string;
}

interface AIResponse {
  scriptShort: string;
  scriptFull: string;
  tasks: AITask[];
}

let lastScriptShort: string = '';
let lastScriptFull: string = '';

export function getLastScripts(): { short: string; full: string } {
  return { short: lastScriptShort, full: lastScriptFull };
}

export async function classifyAndSummarize(
  activities: ActivityEntry[],
  date?: string,
  prHighlights?: PRHighlight[]
): Promise<TaskRow[]> {
  if (activities.length === 0) {
    return [];
  }

  // Determine the appropriate time word based on the report date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const reportDate = date ? new Date(`${date}T00:00:00`) : today;

  const isToday = reportDate.getTime() === today.getTime();
  const isYesterday = reportDate.getTime() === yesterday.getTime();
  const timeWord = isToday ? 'Today' : isYesterday ? 'Yesterday' : `On ${date}`;

  // Separate training activities - don't send to AI, keep original description with time
  const trainingActivities = activities.filter(a => a.category === 'training');
  const otherActivities = activities.filter(a => a.category !== 'training');

  // Convert training to TaskRow directly (preserve time info)
  const trainingRows: TaskRow[] = trainingActivities.map(a => ({
    project: 'Training',
    accomplishment: a.description,
    status: 'Completed',
  }));

  if (otherActivities.length === 0) {
    return trainingRows;
  }

  const activitiesText = otherActivities.map(a => {
    const time = formatTime(a.timestamp);
    const endTime = a.endTime ? formatTime(a.endTime) : time;
    return `- [${time}-${endTime}] [${a.category}] [${a.metadata?.repo || 'general'}] ${a.description}`;
  }).join('\n');

  // Add date context to prompt - CRITICAL for correct time references
  const dateLabel = isToday ? 'TODAY' : isYesterday ? 'YESTERDAY' : `a past date (${date})`;
  const dateContext = `\n\n# CRITICAL DATE CONTEXT\nThis report is for ${dateLabel}. You MUST use "${timeWord}" (not "Yesterday") when referring to when the work was done. ${isToday ? 'Do NOT mention "today I will" plans since this is a same-day report.' : ''}`;

  // Add PR context if available
  let prContext = '';
  if (prHighlights && prHighlights.length > 0) {
    const prList = prHighlights.map(pr => {
      const action = pr.isReview ? 'Reviewed' : pr.state === 'merged' ? 'Merged' : 'Opened';
      return `- ${action} PR #${pr.number}: ${pr.title}`;
    }).join('\n');
    prContext = `\n\n# PR ACTIVITY (MUST mention in scripts)\nThese PRs MUST be mentioned in both scriptShort and scriptFull:\n${prList}`;
  }

  const userMessage = `${STANDUP_PROMPT}${dateContext}${prContext}\n\nRaw Activities:\n${activitiesText}`;

  // Try Bedrock first, then Anthropic API, then fallback
  // Default to us-east-1 if no region specified but try Bedrock anyway
  const useBedrock = true; // Always try Bedrock first
  const useAnthropic = process.env.ANTHROPIC_API_KEY;

  let aiResponse: AIResponse | null = null;

  console.log(`  Using AI: Bedrock=${!!useBedrock}, Anthropic=${!!useAnthropic}`);

  if (useBedrock) {
    try {
      aiResponse = await classifyWithBedrock(userMessage);
      console.log('  ✓ Bedrock response received');
    } catch (error: any) {
      console.warn('  ✗ Bedrock failed:', error?.message || error);
    }
  }

  if (!aiResponse && useAnthropic) {
    try {
      aiResponse = await classifyWithAnthropic(userMessage);
      console.log('  ✓ Anthropic response received');
    } catch (error: any) {
      console.warn('  ✗ Anthropic failed:', error?.message || error);
    }
  }

  if (aiResponse) {
    lastScriptShort = aiResponse.scriptShort || '';
    lastScriptFull = aiResponse.scriptFull || '';

    // Use AI-translated tasks if available
    if (aiResponse.tasks && aiResponse.tasks.length > 0) {
      const aiTaskRows: TaskRow[] = aiResponse.tasks.map(t => ({
        project: t.project,
        accomplishment: t.description,
        status: 'Completed',
      }));
      return [...trainingRows, ...aiTaskRows];
    }
  } else {
    lastScriptShort = '';
    lastScriptFull = '';
  }

  // Fallback to original activities if AI didn't return tasks
  const activityRows = otherActivities.map(a => activityToTaskRow(a));
  return [...trainingRows, ...activityRows];
}

function extractJSON(text: string): string {
  // Remove markdown code blocks if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

async function classifyWithBedrock(userMessage: string): Promise<AIResponse> {
  const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
  const region = process.env.AWS_REGION || 'us-east-1';
  const modelId = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0';

  // If we have a Bearer Token, use direct HTTP call
  if (bearerToken) {
    const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/invoke`;

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 2048,
      messages: [{ role: 'user', content: userMessage }],
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bedrock API error: ${response.status} - ${errorText}`);
    }

    const responseBody = await response.json() as { content?: { text?: string }[] };
    const text = responseBody.content?.[0]?.text || '';
    return JSON.parse(extractJSON(text)) as AIResponse;
  }

  // Fallback to AWS SDK with credentials
  const client = new BedrockRuntimeClient({ region });

  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 2048,
    messages: [{ role: 'user', content: userMessage }],
  };

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });

  const response = await client.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const text = responseBody.content[0]?.text || '';
  return JSON.parse(extractJSON(text)) as AIResponse;
}

async function classifyWithAnthropic(userMessage: string): Promise<AIResponse> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return JSON.parse(extractJSON(text)) as AIResponse;
}

function activityToTaskRow(activity: ActivityEntry): TaskRow {
  const startTime = formatTime(activity.timestamp);
  const endTime = activity.endTime ? formatTime(activity.endTime) : startTime;

  // Keep full description - truncation happens in reporter
  const description = activity.description.split('\n')[0];

  return {
    timeRange: startTime === endTime ? startTime : `${startTime}-${endTime}`,
    category: CATEGORY_LABELS[activity.category] || 'Other',
    description,
    outcome: 'Done',
  };
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
