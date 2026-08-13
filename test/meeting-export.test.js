const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { toMarkdown, exportMeetingMarkdown, slugify } = require('../src/meeting-export');

const meeting = {
  title: 'Q3 roadmap sync',
  startedAt: Date.UTC(2026, 0, 5, 10, 0),
  endedAt: Date.UTC(2026, 0, 5, 10, 30),
  summary: 'Agreed to ship the export feature first.',
  keyPoints: ['Export ships before flashcards'],
  decisions: ['No scope creep this sprint'],
  actionItems: ['Mohammed writes the README'],
  followUp: [],
  transcript: [{ channel: 'them', text: 'What ships first?', ts: 1 }, { channel: 'you', text: 'Export.', ts: 2 }]
};

test('toMarkdown includes every section with real content', () => {
  const md = toMarkdown(meeting);
  assert.ok(md.startsWith('# Q3 roadmap sync'));
  assert.ok(md.includes('Agreed to ship the export feature first.'));
  assert.ok(md.includes('- Export ships before flashcards'));
  assert.ok(md.includes('- No scope creep this sprint'));
  assert.ok(md.includes('**Them**'));
  assert.ok(md.includes('**You**'));
});

test('toMarkdown falls back to placeholders for empty sections', () => {
  const md = toMarkdown({ ...meeting, decisions: [], followUp: [], transcript: [] });
  assert.ok(md.includes('_none_'));
  assert.ok(md.includes('_no transcript captured_'));
});

test('slugify produces a filesystem-safe, lowercase slug', () => {
  assert.strictEqual(slugify('Q3 Roadmap Sync!!'), 'q3-roadmap-sync');
  assert.strictEqual(slugify(''), 'meeting');
});

test('exportMeetingMarkdown writes a file and returns its path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-meeting-export-'));
  const filePath = exportMeetingMarkdown(meeting, dir);
  assert.ok(fs.existsSync(filePath));
  assert.ok(filePath.endsWith('.md'));
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('Q3 roadmap sync'));
  fs.rmSync(dir, { recursive: true, force: true });
});
