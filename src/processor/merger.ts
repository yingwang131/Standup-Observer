import { ActivityEntry } from '../types';

export function mergeActivities(
  activities: ActivityEntry[],
  minDurationMinutes: number = 2
): ActivityEntry[] {
  if (activities.length === 0) return [];

  // Sort by timestamp
  const sorted = [...activities].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  const merged: ActivityEntry[] = [];
  let current: ActivityEntry | null = null;

  for (const activity of sorted) {
    if (!current) {
      current = { ...activity };
      continue;
    }

    // Check if activities can be merged (same source, same category, within 30 min)
    // Never merge Claude sessions - each is a distinct conversation
    // Never merge meetings - each meeting is a separate event
    const timeDiff = (activity.timestamp.getTime() - (current.endTime || current.timestamp).getTime()) / 1000 / 60;
    const canMerge =
      current.source !== 'claude' &&
      current.category !== 'meeting' &&
      current.source === activity.source &&
      current.category === activity.category &&
      current.metadata?.repo === activity.metadata?.repo &&
      timeDiff < 30;

    if (canMerge) {
      // Merge activities
      current.endTime = activity.endTime || activity.timestamp;
      if (current.source === 'git') {
        // For git, concatenate commit messages
        const existingCommits = current.description.includes('\n')
          ? current.description.split('\n').length
          : 1;
        if (existingCommits < 5) {
          current.description += `\n${activity.description}`;
        } else if (existingCommits === 5) {
          current.description += '\n...and more commits';
        }
        // Merge files
        if (current.metadata?.files && activity.metadata?.files) {
          const allFiles = new Set([...current.metadata.files, ...activity.metadata.files]);
          current.metadata.files = Array.from(allFiles).slice(0, 10);
        }
      }
    } else {
      // Calculate duration and decide whether to keep
      const duration = current.endTime
        ? (current.endTime.getTime() - current.timestamp.getTime()) / 1000 / 60
        : minDurationMinutes; // Default to min if no end time

      if (duration >= minDurationMinutes || current.source === 'git') {
        merged.push(current);
      }
      current = { ...activity };
    }
  }

  // Don't forget the last activity
  if (current) {
    merged.push(current);
  }

  return merged;
}

export function groupByTimeBlocks(activities: ActivityEntry[]): Map<string, ActivityEntry[]> {
  const blocks = new Map<string, ActivityEntry[]>();

  for (const activity of activities) {
    const hour = activity.timestamp.getHours();
    let blockKey: string;

    if (hour < 12) {
      blockKey = 'morning';
    } else if (hour < 17) {
      blockKey = 'afternoon';
    } else {
      blockKey = 'evening';
    }

    if (!blocks.has(blockKey)) {
      blocks.set(blockKey, []);
    }
    blocks.get(blockKey)!.push(activity);
  }

  return blocks;
}
