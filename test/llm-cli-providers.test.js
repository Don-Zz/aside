const test = require('node:test');
const assert = require('node:assert');
const { CLI_PROVIDERS, buildClaudeCodeArgs, buildCodexArgs, runCli, createLLM } = require('../src/llm');

test('CLI_PROVIDERS lists exactly claude-code and codex', () => {
  assert.deepStrictEqual([...CLI_PROVIDERS].sort(), ['claude-code', 'codex']);
});

test('buildClaudeCodeArgs prepends system to the prompt and requests plain text output', () => {
  const args = buildClaudeCodeArgs({ system: 'Be terse.', prompt: 'What time is it?', model: '' });
  assert.deepStrictEqual(args, ['-p', 'Be terse.\n\nWhat time is it?', '--output-format', 'text']);
});

test('buildClaudeCodeArgs appends --model only when one is set', () => {
  const withModel = buildClaudeCodeArgs({ system: '', prompt: 'hi', model: 'opus' });
  assert.ok(withModel.includes('--model'));
  const withoutModel = buildClaudeCodeArgs({ system: '', prompt: 'hi', model: '' });
  assert.ok(!withoutModel.includes('--model'));
});

test('buildClaudeCodeArgs with no system prompt uses the prompt as-is', () => {
  const args = buildClaudeCodeArgs({ system: '', prompt: 'plain question', model: '' });
  assert.strictEqual(args[1], 'plain question');
});

test('buildCodexArgs uses exec subcommand and skips the git-repo check', () => {
  const args = buildCodexArgs({ system: 'Be terse.', prompt: 'Solve this.', model: '' });
  assert.strictEqual(args[0], 'exec');
  assert.strictEqual(args[1], 'Be terse.\n\nSolve this.');
  assert.ok(args.includes('--skip-git-repo-check'));
});

test('buildCodexArgs appends --model only when one is set', () => {
  const withModel = buildCodexArgs({ system: '', prompt: 'hi', model: 'gpt-5.1-codex-max' });
  assert.ok(withModel.includes('--model'));
});

test('runCli rejects with a clear message when the command does not exist', async () => {
  await assert.rejects(
    () => runCli('definitely-not-a-real-cli-binary-xyz', ['--version']),
    /was not found on your PATH/
  );
});

test('createLLM treats claude-code/codex as ready with no API key and no model set', () => {
  const claudeCode = createLLM({ provider: 'claude-code', apiKeys: {}, models: {} });
  assert.strictEqual(claudeCode.ready, true);
  assert.strictEqual(claudeCode.configurationError, '');

  const codex = createLLM({ provider: 'codex', apiKeys: {}, models: {} });
  assert.strictEqual(codex.ready, true);
});

test('createLLM still requires an API key for a normal provider', () => {
  const llm = createLLM({ provider: 'openai', apiKeys: {}, models: {} });
  assert.strictEqual(llm.ready, false);
  assert.ok(/API key/.test(llm.configurationError));
});
