import { StandupReport, TaskRow, PRHighlight } from '../types';

export function generateMarkdownReport(report: StandupReport): string {
  const lines: string[] = [];

  lines.push(`## Daily Standup - ${report.date}`);
  lines.push('');

  const grouped = groupByProject(report.accomplished);

  // Determine the appropriate time word based on the report date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const reportDate = new Date(`${report.date}T00:00:00`);

  const isToday = reportDate.getTime() === today.getTime();
  const isYesterday = reportDate.getTime() === yesterday.getTime();
  const timeWord = isToday ? 'Today' : isYesterday ? 'Yesterday' : `On ${report.date}`;

  // Highlights section (only show if there are PR highlights)
  if (report.highlights && report.highlights.length > 0) {
    lines.push('🎯 Highlights');
    lines.push('────────────────────────────────────────────────────────────');
    lines.push('');
    for (const pr of report.highlights) {
      const icon = pr.isReview ? '👀' : pr.state === 'merged' ? '✅' : '🔄';
      const action = pr.isReview ? `Reviewed PR #${pr.number} from @${pr.author}` :
                     pr.state === 'merged' ? `Merged PR #${pr.number}` : `Opened PR #${pr.number}`;
      lines.push(`- ${icon} ${action}: ${pr.title}`);
    }
    lines.push('');
  }

  // Check if we have AI-generated scripts
  const hasAIScripts = report.scriptShort || report.scriptFull;

  if (hasAIScripts) {
    // AI Mode: Show two script versions
    lines.push('⚡ Quick Version');
    lines.push('────────────────────────────────────────────────────────────');
    lines.push('');
    // Split into sentences with bullet points
    const shortText = report.scriptShort || '';
    const shortSentences = shortText.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    for (let i = 0; i < shortSentences.length; i++) {
      lines.push(`• ${shortSentences[i].trim()}`);
      if (i < shortSentences.length - 1) lines.push('');
    }
    lines.push('');
    lines.push('📝 Full Version');
    lines.push('────────────────────────────────────────────────────────────');
    lines.push('');
    // Split into logical paragraphs (2-3 sentences each)
    const fullText = report.scriptFull || '';
    const sentences = fullText.split(/(?<=[.!?])\s+/);
    const paragraphs: string[] = [];
    let currentPara = '';
    let sentenceCount = 0;

    for (const sentence of sentences) {
      currentPara += (currentPara ? ' ' : '') + sentence;
      sentenceCount++;
      // Start new paragraph every 2-3 sentences or if getting long
      if (sentenceCount >= 2 && (sentenceCount >= 3 || currentPara.length > 120)) {
        paragraphs.push(currentPara.trim());
        currentPara = '';
        sentenceCount = 0;
      }
    }
    if (currentPara) paragraphs.push(currentPara.trim());

    for (let i = 0; i < paragraphs.length; i++) {
      lines.push(`• ${paragraphs[i]}`);
      if (i < paragraphs.length - 1) lines.push('');
    }
  } else {
    // Fallback: Show quick version
    lines.push('⚡ Quick Version');
    lines.push('────────────────────────────────────────────────────────────');
    lines.push('');
    const projectNames = Object.keys(grouped);
    const mainProject = projectNames[0] || 'current tasks';
    const otherProjects = projectNames.slice(1);

    let script = `${timeWord}, I spent most of my time on **${mainProject}** work.`;
    if (otherProjects.length > 0) {
      script += ` I also worked on ${otherProjects.join(' and ')}.`;
    }
    if (!isToday) {
      script += ' Today, my plan is to continue driving these efforts forward.';
    }
    lines.push(`> ${script}`);
  }

  lines.push('');

  // Always show detailed breakdown
  lines.push('📋 Detailed Breakdown');
  lines.push('────────────────────────────────────────────────────────────');
  lines.push('');

  for (const [project, tasks] of Object.entries(grouped)) {
    lines.push(`**${project}:**`);
    for (const task of tasks) {
      let desc = task.accomplishment || task.description || 'Task completed';
      desc = desc.replace(/^\[[^\]]+\]\s*/, '');

      // Add PR annotation if commit is linked to a PR
      if (task.prNumber && task.prState) {
        const stateLabel = task.prState === 'merged' ? 'Merged' :
                          task.prState === 'open' ? 'Open' : 'Closed';
        desc += ` → PR #${task.prNumber} (${stateLabel})`;
      }

      lines.push(`- ${desc}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function groupByProject(tasks: TaskRow[]): Record<string, TaskRow[]> {
  const grouped: Record<string, TaskRow[]> = {};

  for (const task of tasks) {
    let project = task.project;
    if (!project) {
      const match = (task.description || '').match(/^\[([^\]]+)\]/);
      project = match ? match[1] : 'General';
    }
    project = cleanProjectName(project);

    if (!grouped[project]) {
      grouped[project] = [];
    }
    grouped[project].push(task);
  }

  return grouped;
}

function cleanProjectName(name: string): string {
  return name
    .replace(/^centrix-/, '')
    .replace(/^decision-intelligence-/, '')
    .replace(/-Users-.*$/, '')
    .replace(/^projects-/, '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
