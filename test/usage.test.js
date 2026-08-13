const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createUsageTracker, estimateTokens } = require('../src/usage');
const { estimateCostUsd } = require('../src/usage-pricing');

test('estimateTokens is roughly chars/4', () => {
  assert.strictEqual(estimateTokens(''), 0);
  assert.strictEqual(estimateTokens('abcd'), 1);
  assert.strictEqual(estimateTokens('a'.repeat(40)), 10);
});

test('estimateCostUsd returns 0 for an unknown provider instead of guessing', () => {
  assert.strictEqual(estimateCostUsd('made-up-provider', 'x', 1000, 1000), 0);
});

test('estimateCostUsd scales with tokens for a known model', () => {
  const cost = estimateCostUsd('anthropic', 'claude-3-5-haiku-latest', 1_000_000, 0);
  assert.ok(cost > 0);
  const doubleCost = estimateCostUsd('anthropic', 'claude-3-5-haiku-latest', 2_000_000, 0);
  assert.ok(Math.abs(doubleCost - cost * 2) < 1e-9);
});

function withTempTracker(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-usage-'));
  const file = path.join(dir, 'usage.json');
  try { fn(createUsageTracker({ file })); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('record accumulates requests/tokens/cost per provider+model', () => {
  withTempTracker((usage) => {
    usage.record({ provider: 'openai', model: 'gpt-4o-mini', inputText: 'a'.repeat(400), outputText: 'b'.repeat(400) });
    usage.record({ provider: 'openai', model: 'gpt-4o-mini', inputText: 'a'.repeat(400), outputText: 'b'.repeat(400) });
    const { today, allTime } = usage.summary();
    assert.strictEqual(today.length, 1);
    assert.strictEqual(today[0].requests, 2);
    assert.strictEqual(today[0].inputTokens, 200);
    assert.strictEqual(allTime.length, 1);
    assert.strictEqual(allTime[0].requests, 2);
  });
});

test('record keeps separate rows per provider+model', () => {
  withTempTracker((usage) => {
    usage.record({ provider: 'openai', model: 'gpt-4o-mini', inputText: 'x', outputText: 'y' });
    usage.record({ provider: 'anthropic', model: 'claude-3-5-haiku-latest', inputText: 'x', outputText: 'y' });
    const { today } = usage.summary();
    assert.strictEqual(today.length, 2);
  });
});
