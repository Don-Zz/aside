// Study flashcards — local JSON-file persistence + a small Leitner-style
// spaced-repetition schedule. Generation prompt/parsing lives here too so the
// format the model is asked for and the format we parse never drift apart.
//
// Card shape: { id, question, answer, box, nextReviewAt, createdAt,
//   sourceMeetingId, sourceTitle }
// box 1..5, each box maps to a review interval (see BOX_INTERVAL_DAYS).
// A correct review advances the box (longer gap); a miss resets to box 1.

const fs = require('fs');
const crypto = require('crypto');

const BOX_INTERVAL_DAYS = [1, 2, 4, 7, 14]; // index 0 == box 1
const DAY_MS = 24 * 60 * 60 * 1000;

function newId() { return crypto.randomBytes(12).toString('hex'); }

function loadFile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveFile(file, cards) {
  try { fs.writeFileSync(file, JSON.stringify(cards, null, 2)); } catch { /* ignore */ }
}

function createFlashcardStore(opts = {}) {
  const file = opts.file;
  let cards = file ? loadFile(file) : [];

  function persist() { if (file) saveFile(file, cards); }

  return {
    list() { return cards.slice(); },

    due(now = Date.now()) {
      return cards.filter((c) => c.nextReviewAt <= now).sort((a, b) => a.nextReviewAt - b.nextReviewAt);
    },

    addMany(items, source = {}) {
      const now = Date.now();
      const created = items.map((it) => ({
        id: newId(),
        question: it.question,
        answer: it.answer,
        box: 1,
        nextReviewAt: now, // due immediately — new cards should be reviewed soon
        createdAt: now,
        sourceMeetingId: source.meetingId || null,
        sourceTitle: source.title || ''
      }));
      cards = cards.concat(created);
      persist();
      return created;
    },

    // Leitner review: correct moves the card to a longer interval, a miss
    // drops it back to daily review.
    review(id, correct) {
      const card = cards.find((c) => c.id === id);
      if (!card) return null;
      card.box = correct ? Math.min(card.box + 1, BOX_INTERVAL_DAYS.length) : 1;
      const intervalDays = BOX_INTERVAL_DAYS[card.box - 1];
      card.nextReviewAt = Date.now() + intervalDays * DAY_MS;
      persist();
      return card;
    },

    remove(id) {
      const before = cards.length;
      cards = cards.filter((c) => c.id !== id);
      persist();
      return cards.length < before;
    }
  };
}

// ---- generation prompt + parsing --------------------------------------

function buildFlashcardsPrompt(sourceText, n = 6) {
  return (
    'Source material:\n' + (sourceText || '(empty)') +
    `\n\nWrite exactly ${n} study flashcards drawn ONLY from facts in the source material above. ` +
    'Each card tests one concrete fact, decision, or concept — not vague generalities. ' +
    'Format EACH card exactly as:\nQ: <question>\nA: <answer>\n\n' +
    'Separate cards with a single blank line. No numbering, no extra commentary.'
  );
}

function parseFlashcards(text) {
  if (!text || !text.trim()) return [];
  const blocks = text.split(/\r?\n\s*\r?\n/);
  const out = [];
  for (const block of blocks) {
    const qMatch = /^\s*Q:\s*(.+)$/im.exec(block);
    const aMatch = /^\s*A:\s*(.+)$/im.exec(block);
    if (qMatch && aMatch) {
      out.push({ question: qMatch[1].trim(), answer: aMatch[1].trim() });
    }
  }
  return out;
}

module.exports = { createFlashcardStore, buildFlashcardsPrompt, parseFlashcards, BOX_INTERVAL_DAYS };
