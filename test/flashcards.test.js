const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFlashcardStore, buildFlashcardsPrompt, parseFlashcards, BOX_INTERVAL_DAYS } = require('../src/flashcards');

test('buildFlashcardsPrompt asks for the exact Q:/A: format', () => {
  const p = buildFlashcardsPrompt('We decided to ship Friday.', 4);
  assert.ok(p.includes('exactly 4 study flashcards'));
  assert.ok(p.includes('Q: <question>'));
  assert.ok(p.includes('We decided to ship Friday.'));
});

test('parseFlashcards extracts every Q/A block', () => {
  const blob = 'Q: When do we ship?\nA: Friday.\n\nQ: Who owns the README?\nA: Mohammed.\n\nSome stray text with no card.';
  const cards = parseFlashcards(blob);
  assert.strictEqual(cards.length, 2);
  assert.deepStrictEqual(cards[0], { question: 'When do we ship?', answer: 'Friday.' });
  assert.deepStrictEqual(cards[1], { question: 'Who owns the README?', answer: 'Mohammed.' });
});

test('parseFlashcards returns nothing for empty or malformed input', () => {
  assert.deepStrictEqual(parseFlashcards(''), []);
  assert.deepStrictEqual(parseFlashcards('just prose, no Q/A markers'), []);
});

function withTempStore(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-flashcards-'));
  const file = path.join(dir, 'cards.json');
  try { fn(createFlashcardStore({ file })); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('addMany persists cards due immediately, review reschedules them', () => {
  withTempStore((store) => {
    const [card] = store.addMany([{ question: 'Q1', answer: 'A1' }], { meetingId: 'm1', title: 'Standup' });
    assert.strictEqual(card.box, 1);
    assert.ok(store.due().some((c) => c.id === card.id), 'new card should be due right away');

    const afterCorrect = store.review(card.id, true);
    assert.strictEqual(afterCorrect.box, 2);
    assert.ok(afterCorrect.nextReviewAt > Date.now() + (BOX_INTERVAL_DAYS[0] * 23 * 60 * 60 * 1000), 'a correct answer should push the review out at least ~1 day');

    const afterMiss = store.review(card.id, false);
    assert.strictEqual(afterMiss.box, 1, 'a miss should drop the card back to box 1');
  });
});

test('review on an unknown id is a no-op that returns null', () => {
  withTempStore((store) => {
    assert.strictEqual(store.review('does-not-exist', true), null);
  });
});

test('store reloads persisted cards from disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-flashcards-reload-'));
  const file = path.join(dir, 'cards.json');
  try {
    const store1 = createFlashcardStore({ file });
    store1.addMany([{ question: 'Q', answer: 'A' }]);
    const store2 = createFlashcardStore({ file });
    assert.strictEqual(store2.list().length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
