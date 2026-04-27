import { execSync } from 'child_process';
import { ActivityEntry } from '../types';

// node-ical doesn't have @types, declare module
const ical = require('node-ical');

async function fetchICSWithPowerShell(url: string): Promise<string> {
  const psCommand = `(Invoke-WebRequest -Uri '${url}' -UseBasicParsing).Content`;
  const result = execSync(`powershell -NoProfile -Command "${psCommand}"`, {
    encoding: 'utf-8',
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return result;
}

export async function collectOutlookActivity(
  date: string,
  icsUrl?: string
): Promise<ActivityEntry[]> {
  const activities: ActivityEntry[] = [];

  const calendarUrl = icsUrl || process.env.OUTLOOK_ICS_URL;

  if (!calendarUrl) {
    console.warn('    ⚠️  No ICS URL configured (set OUTLOOK_ICS_URL or outlook.icsUrl in config)');
    return activities;
  }

  try {
    // Fetch ICS with PowerShell (works with corporate proxies), then parse
    const icsContent = await fetchICSWithPowerShell(calendarUrl);
    const events = ical.sync.parseICS(icsContent);

    // Use explicit time string to avoid timezone issues
    const targetStart = new Date(`${date}T00:00:00`);
    const targetEnd = new Date(`${date}T23:59:59.999`);

    for (const key in events) {
      const event = events[key];
      if (event.type !== 'VEVENT') continue;

      // Handle recurring events - expand occurrences for the target date
      if (event.rrule) {
        // First, check for meetings moved INTO this date from other dates
        // Use a Set to track added meetings and avoid duplicates
        const addedMeetingKeys = new Set<string>();

        if (event.recurrences) {
          for (const recKey in event.recurrences) {
            const modified = event.recurrences[recKey];
            const modifiedStart = new Date(modified.start);
            // Check if this modified instance falls on the target date
            if (modifiedStart >= targetStart && modifiedStart <= targetEnd) {
              // Check if the original date was different (moved to this date)
              const originalDate = recKey.split('T')[0];
              const targetDateStr = date;
              if (originalDate !== targetDateStr) {
                // Create a unique key to avoid duplicates
                const meetingKey = `${event.summary}-${modifiedStart.toISOString()}`;
                if (!addedMeetingKeys.has(meetingKey)) {
                  addedMeetingKeys.add(meetingKey);
                  const duration = event.end.getTime() - event.start.getTime();
                  activities.push({
                    timestamp: modifiedStart,
                    endTime: new Date(modifiedStart.getTime() + duration),
                    category: 'meeting',
                    source: 'outlook',
                    description: `Meeting: ${modified.summary || event.summary || 'Untitled'}`,
                    metadata: {
                      subject: modified.summary || event.summary || 'Untitled',
                    },
                  });
                }
              }
            }
          }
        }

        const occurrences = event.rrule.between(targetStart, targetEnd, true);
        for (const occurrence of occurrences) {
          // Check if this occurrence was modified or moved to a different date
          // node-ical stores modified instances in event.recurrences
          if (event.recurrences) {
            const occDateStr = occurrence.toISOString().split('T')[0];
            const occISOStr = occurrence.toISOString();
            const modified = event.recurrences[occDateStr] || event.recurrences[occISOStr];
            if (modified) {
              // This occurrence was modified - check if it was moved to a different date
              const modifiedStart = new Date(modified.start);
              if (modifiedStart < targetStart || modifiedStart > targetEnd) {
                // Meeting was moved to a different date, skip it for this day
                continue;
              }
              // Use the modified time instead
              const duration = event.end.getTime() - event.start.getTime();
              activities.push({
                timestamp: modifiedStart,
                endTime: new Date(modifiedStart.getTime() + duration),
                category: 'meeting',
                source: 'outlook',
                description: `Meeting: ${modified.summary || event.summary || 'Untitled'}`,
                metadata: {
                  subject: modified.summary || event.summary || 'Untitled',
                },
              });
              continue;
            }
          }

          const duration = event.end.getTime() - event.start.getTime();
          const endTime = new Date(occurrence.getTime() + duration);

          activities.push({
            timestamp: occurrence,
            endTime: endTime,
            category: 'meeting',
            source: 'outlook',
            description: `Meeting: ${event.summary || 'Untitled'}`,
            metadata: {
              subject: event.summary || 'Untitled',
            },
          });
        }
      } else {
        // Non-recurring event - check if it's on target date
        const eventStart = new Date(event.start);
        if (eventStart >= targetStart && eventStart <= targetEnd) {
          activities.push({
            timestamp: eventStart,
            endTime: event.end ? new Date(event.end) : undefined,
            category: 'meeting',
            source: 'outlook',
            description: `Meeting: ${event.summary || 'Untitled'}`,
            metadata: {
              subject: event.summary || 'Untitled',
            },
          });
        }
      }
    }
  } catch (error: any) {
    console.error('    Failed to collect Outlook activity:', error.message || error);
  }

  return activities.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
