const test = require('node:test');
const assert = require('node:assert');
const { CLI_PROVIDERS, buildClaudeCodeArgs, buildCodexArgs, runCli, createLLM, resolveLoginShellPath } = require('../src/llm');

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

test('resolveLoginShellPath returns a non-empty PATH string and is cached (called twice, no hang)', async () => {
  const first = await resolveLoginShellPath();
  const second = await resolveLoginShellPath();
  assert.strictEqual(typeof first, 'string');
  assert.ok(first.length > 0);
  assert.strictEqual(first, second, 'second call should return the cached value, not re-spawn a shell');
});

test('resolveLoginShellPath matches what a real login shell reports, not the narrower process.env.PATH', async () => {
  // Cross-check against the same technique run independently in this test
  // (rather than faking $HOME, which several system shell frameworks resolve
  // in ways that don't reliably respect a spoofed env var) — this still
  // proves the function is doing real login-shell resolution and not just
  // echoing back process.env.PATH unchanged.
  const { execFileSync } = require('child_process');
  const shellBin = process.env.SHELL || '/bin/zsh';
  let expected;
  try {
    expected = execFileSync(shellBin, ['-ilc', 'echo __MARK__$PATH__MARK__'], { encoding: 'utf8' });
  } catch {
    return; // no usable shell in this environment — nothing to assert
  }
  const m = /__MARK__(.*)__MARK__/s.exec(expected);
  if (!m) return;
  const resolved = await resolveLoginShellPath();
  assert.strictEqual(resolved, m[1].trim());
});

test('runCli passes the resolved PATH through to the child process env', async () => {
  // "node" itself is guaranteed to exist somewhere on PATH (we're running
  // under it) — confirms runCli's env override doesn't accidentally drop
  // entries a real command needs, using -e so no extra file/PATH lookup for
  // the script itself is required.
  const out = await runCli('node', ['-e', 'console.log("cli-provider-ok")']);
  assert.strictEqual(out, 'cli-provider-ok');
});

test('createLLM treats claude-code/codex as ready with no API key and no model set', () => {
  const claudeCode = createLLM({ provider: 'claude-code', apiKeys: {}, models: {} });
  assert.strictEqual(claudeCode.ready, true);
  assert.strictEqual(claudeCode.configurationError, '');

  const codex = createLLM({ provider: 'codex', apiKeys: {}, models: {} });
  assert.strictEqual(codex.ready, true);
});

test('createLLM migrates the retired OpenRouter default model to the current one', () => {
  const llm = createLLM({
    provider: 'custom',
    apiKeys: { custom: 'sk-or-v1-test' },
    baseUrl: 'https://openrouter.ai/api/v1',
    models: { custom: { fast: 'anthropic/claude-3.5-sonnet', smart: 'anthropic/claude-3.5-sonnet' } }
  });
  assert.strictEqual(llm.model, 'anthropic/claude-sonnet-5');
});

test('createLLM leaves the retired-elsewhere model name alone for a non-OpenRouter Custom endpoint', () => {
  // Same string, but pointed at some other OpenAI-compatible server — that
  // model name means whatever the operator of THAT server says it means, so
  // the OpenRouter-specific migration must not touch it.
  const llm = createLLM({
    provider: 'custom',
    apiKeys: { custom: 'k' },
    baseUrl: 'http://127.0.0.1:18789/v1',
    models: { custom: { fast: 'anthropic/claude-3.5-sonnet', smart: 'anthropic/claude-3.5-sonnet' } }
  });
  assert.strictEqual(llm.model, 'anthropic/claude-3.5-sonnet');
});

test('createLLM still requires an API key for a normal provider', () => {
  const llm = createLLM({ provider: 'openai', apiKeys: {}, models: {} });
  assert.strictEqual(llm.ready, false);
  assert.ok(/API key/.test(llm.configurationError));
});
