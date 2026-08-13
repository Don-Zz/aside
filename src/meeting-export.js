// Meeting export — turns a finished meeting record (see src/meetings.js) into a
// standalone Markdown file the user can keep, search, or drop into any notes app.
// Pure file I/O, no LLM calls here — the summary/keyPoints/etc. are already on
// the record by the time this runs (see main.js endMeetingSession()).

const fs = require('fs');
const path = require('path');

function pad2(n) { return String(n).padStart(2, '0'); }

// Filesystem-safe, human-readable stamp: 2026-08-12_1904
function timeStamp(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

function slugify(title) {
  return String(title || 'meeting')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'meeting';
}

function bulletList(items) {
  const arr = [].concat(items || []).filter(Boolean);
  return arr.length ? arr.map((i) => `- ${i}`).join('\n') : '_none_';
}

function formatTranscriptBlock(turns) {
  if (!turns || !turns.length) return '_no transcript captured_';
  return turns
    .map((t) => `**${t.channel === 'them' ? 'Them' : 'You'}** (${new Date(t.ts).toLocaleTimeString()}): ${t.text}`)
    .join('\n\n');
}

// Renders one meeting record to a Markdown string. Exported separately from
// the disk write so tests can check formatting without touching the filesystem.
function toMarkdown(meeting) {
  const started = meeting.startedAt ? new Date(meeting.startedAt).toLocaleString() : 'unknown';
  const ended = meeting.endedAt ? new Date(meeting.endedAt).toLocaleString() : 'unknown';
  return [
    `# ${meeting.title || 'Untitled meeting'}`,
    '',
    `*${started} → ${ended}*`,
    '',
    '## Summary',
    meeting.summary || '_no summary_',
    '',
    '## Key Points',
    bulletList(meeting.keyPoints),
    '',
    '## Decisions',
    bulletList(meeting.decisions),
    '',
    '## Action Items',
    bulletList(meeting.actionItems),
    '',
    '## Follow-Up',
    bulletList(meeting.followUp),
    '',
    '## Transcript',
    formatTranscriptBlock(meeting.transcript),
    ''
  ].join('\n');
}

// Writes the meeting to `<dir>/<timestamp>_<slug>.md`, creating `dir` if needed.
// Returns the absolute file path.
function exportMeetingMarkdown(meeting, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${timeStamp(meeting.startedAt || Date.now())}_${slugify(meeting.title)}.md`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, toMarkdown(meeting), 'utf8');
  return filePath;
}

module.exports = { toMarkdown, exportMeetingMarkdown, slugify, timeStamp };
