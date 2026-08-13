// LLM factory — OpenAI, Anthropic, Gemini, and OpenAI-compatible APIs behind one streaming interface.
// stream({ system, turns:[{role,text}], imageDataUrl, maxTokens, onToken }) -> Promise<fullText>

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCompatibleClientOptions } = require('./openai-compatible');

const CUSTOM_PROVIDER = 'custom';
// Providers that shell out to a locally-installed CLI (authenticated against a
// Claude Pro/Max or ChatGPT/Codex subscription you're already paying for)
// instead of calling a metered API with a key. No apiKey/model is required for
// these — see createLLM()'s readiness check below.
const CLI_PROVIDERS = new Set(['claude-code', 'codex']);
// gemini-2.0-flash was Google's default here until it was deprecated (Feb 2026)
// and fully retired (Mar 3 2026) — every request against it now 404s with a
// generic "exception parsing response" body. gemini-2.5-flash is the model
// Google's own SDK examples standardize on and is documented as free-tier
// available, so it is the single default used everywhere in this file.
const CURRENT_GEMINI_DEFAULT = 'gemini-2.5-flash';
const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  gemini: CURRENT_GEMINI_DEFAULT,
  ollama: 'llama3.2',
  groq: 'llama-3.1-8b-instant',
  minimax: 'MiniMax-M2.7',
  azure: 'gpt-4o-mini'
};

// Gemini model ids that Google has since deprecated/retired. A settings file
// saved before this fix can still have one of these persisted on disk, so
// createLLM migrates them at read time rather than only fixing the default —
// otherwise an existing user would keep re-hitting the same 404 forever.
const DEAD_GEMINI_MODEL_RE = /^gemini-(1\.0|1\.5|2\.0)(?:-|$)/i;

const PROVIDER_LABELS = { azure: 'Azure AI Foundry', openai: 'OpenAI', minimax: 'MiniMax', 'claude-code': 'Claude Code', codex: 'Codex' };

function normalizeProviderName(provider) {
  if (!provider) return 'provider';
  if (PROVIDER_LABELS[provider]) return PROVIDER_LABELS[provider];
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

// Pulled out so both the LLM and STT error paths (llm.js and stt.js) agree on
// what counts as a rate-limit/quota failure instead of drifting independently.
function isQuotaError(error) {
  const status = error && (error.status || error.statusCode || error.response?.status);
  const code = error && (error.code || error.error?.code);
  const rawMessage = (error && (error.message || String(error))) || '';
  const text = `${rawMessage} ${status || ''} ${code || ''}`.toLowerCase();
  return status === 429 || code === 429 || code === 'insufficient_quota' || code === 'rate_limit_exceeded' ||
    code === 'RESOURCE_EXHAUSTED' || /quota|billing|rate limit|exceeded your current quota|resource_exhausted|too many requests/i.test(text);
}

function isNotFoundError(error) {
  const status = error && (error.status || error.statusCode || error.response?.status);
  const code = error && (error.code || error.error?.code);
  const rawMessage = (error && (error.message || String(error))) || '';
  const text = `${rawMessage} ${status || ''} ${code || ''}`.toLowerCase();
  return status === 404 || code === 404 || /\b404\b|is not found for api version|model not found/i.test(text);
}

// Gemini 429 bodies often carry a google.rpc.RetryInfo detail like
// {"retryDelay":"38s"} inside the JSON error text. Not every quota error has
// one (OpenAI/Anthropic don't), so this is best-effort and returns null when
// absent instead of guessing a wait time.
function extractRetryDelaySeconds(rawMessage) {
  const match = /retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)\s*s/i.exec(String(rawMessage || ''));
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function formatRetryWait(seconds) {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function formatProviderErrorMessage(error, provider, model) {
  const label = normalizeProviderName(provider);
  const rawMessage = (error && (error.message || String(error))) || '';

  if (isQuotaError(error)) {
    const retrySeconds = extractRetryDelaySeconds(rawMessage);
    const waitHint = retrySeconds ? ` Wait about ${formatRetryWait(retrySeconds)}` : ' Wait a moment';
    return `${label} free-tier quota exhausted (429 Too Many Requests).${waitHint} and try again, or add billing to your ${label} account. You can also switch providers or models in Settings.`;
  }

  if (isNotFoundError(error)) {
    const modelHint = model ? ` "${model}"` : '';
    return `${label} model${modelHint} is unavailable (404) — it may have been renamed, retired by the provider, or misspelled. Open Settings and pick a current model for ${label} (or clear the field to use cue's default), then try again.`;
  }

  return rawMessage || 'Unknown LLM error.';
}

function sanitizeTurns(turns) {
  const valid = new Set(['user', 'assistant']);
  return (turns || []).filter(t => valid.has(t.role)).map(t => ({ role: t.role, text: String(t.text || '') }));
}

// MiniMax is OpenAI-compatible and exposes two regional gateways. MiniMax-M3
// accepts image input, so it reuses the OpenAI screenshot path via baseURL.
const MINIMAX_BASE_URLS = {
  global_en: 'https://api.minimax.io/v1',
  cn_zh: 'https://api.minimaxi.com/v1'
};

function stripDataUrl(dataUrl) {
  const m = /^data:(.+?);base64,(.*)$/s.exec(dataUrl || '');
  return m ? { mime: m[1], b64: m[2] } : null;
}

async function streamOpenAI({ apiKey, baseURL, model, system, turns, imageDataUrl, maxTokens, onToken }) {
  const OpenAI = require('openai');
  const client = new OpenAI(baseURL ? { apiKey, baseURL } : { apiKey });
  const messages = [{ role: 'system', content: system }];
  turns.forEach((t, i) => {
    const last = i === turns.length - 1;
    if (last && imageDataUrl && t.role === 'user') {
      messages.push({
        role: 'user', content: [
          { type: 'text', text: t.text },
          { type: 'image_url', image_url: { url: imageDataUrl } }
        ]
      });
    } else {
      messages.push({ role: t.role, content: t.text });
    }
  });
  const stream = await client.chat.completions.create({ model, messages, stream: true, max_tokens: maxTokens });
  let full = '';
  for await (const part of stream) {
    const d = part.choices && part.choices[0] && part.choices[0].delta && part.choices[0].delta.content;
    if (d) { full += d; onToken(d); }
  }
  return full;
}

// Azure AI Foundry Models API (cognitiveservices.azure.com hosts) lives under
// {endpoint}/openai/v1 and authenticates with the `api-key` header.
function normalizeAzureBaseURL(raw) {
  let u = String(raw || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
  if (!u) return '';
  if (/cognitiveservices\.azure\.com/i.test(u) && !/\/openai\/v1$/i.test(u)) {
    u += '/openai/v1';
  }
  return u;
}

async function streamAzure({ apiKey, model, system, turns, imageDataUrl, maxTokens, onToken, endpoint }) {
  const url = normalizeAzureBaseURL(endpoint);
  if (!url) throw new Error('Missing Azure endpoint. Add your Azure AI Foundry or Azure OpenAI endpoint in Settings.');
  const messages = [{ role: 'system', content: system }];
  turns.forEach((t, i) => {
    const last = i === turns.length - 1;
    if (last && imageDataUrl && t.role === 'user') {
      messages.push({ role: 'user', content: [
        { type: 'text', text: t.text },
        { type: 'image_url', image_url: { url: imageDataUrl } }
      ] });
    } else {
      messages.push({ role: t.role, content: t.text });
    }
  });
  const OpenAI = require('openai');
  let client;
  if (/openai\.azure\.com/i.test(url)) {
    client = new OpenAI.AzureOpenAI({ endpoint: url.replace(/\/openai$/i, ''), apiKey, apiVersion: '2024-10-21' });
  } else {
    // Foundry / OpenAI-compatible base: force the `api-key` header and drop the
    // Authorization header the SDK adds by default (those hosts don't take a Bearer key).
    const azureFetch = async (input, init) => {
      const headers = new Headers(init && init.headers);
      headers.set('api-key', apiKey);
      headers.delete('authorization');
      return fetch(input, { ...init, headers });
    };
    client = new OpenAI({ baseURL: url, apiKey, fetch: azureFetch });
  }
  const stream = await client.chat.completions.create({ model, messages, stream: true, max_completion_tokens: maxTokens });
  let full = '';
  for await (const part of stream) {
    const d = part.choices && part.choices[0] && part.choices[0].delta && part.choices[0].delta.content;
    if (d) { full += d; onToken(d); }
  }
  return full;
}

async function streamAnthropic({ apiKey, model, system, turns, imageDataUrl, maxTokens, onToken }) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const messages = turns.map((t, i) => {
    const last = i === turns.length - 1;
    if (last && imageDataUrl && t.role === 'user') {
      const img = stripDataUrl(imageDataUrl);
      const content = [];
      if (img) content.push({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.b64 } });
      content.push({ type: 'text', text: t.text });
      return { role: 'user', content };
    }
    return { role: t.role, content: t.text };
  });
  const stream = await client.messages.create({ model, max_tokens: maxTokens, system, messages, stream: true });
  let full = '';
  for await (const ev of stream) {
    if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') { full += ev.delta.text; onToken(ev.delta.text); }
  }
  return full;
}

async function streamGemini({ apiKey, model, system, turns, imageDataUrl, maxTokens, onToken }) {
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const contents = turns.map((t, i) => {
    const last = i === turns.length - 1;
    const parts = [{ text: t.text }];
    if (last && imageDataUrl && t.role === 'user') {
      const img = stripDataUrl(imageDataUrl);
      if (img) parts.push({ inlineData: { mimeType: img.mime, data: img.b64 } });
    }
    return { role: t.role === 'assistant' ? 'model' : 'user', parts };
  });
  const stream = await ai.models.generateContentStream({
    model, contents, config: { systemInstruction: system, maxOutputTokens: maxTokens }
  });
  let full = '';
  for await (const chunk of stream) {
    const t = chunk && chunk.text;
    if (t) { full += t; onToken(t); }
  }
  return full;
}

async function streamOllama({ apiKey, model, system, turns, imageDataUrl, maxTokens, onToken }) {
  const baseUrl = apiKey || 'http://localhost:11434';
  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;

  const messages = [{ role: 'system', content: system }];
  turns.forEach((t, i) => {
    const last = i === turns.length - 1;
    if (last && imageDataUrl && t.role === 'user') {
      const img = stripDataUrl(imageDataUrl);
      if (img) {
        messages.push({ role: 'user', content: t.text, images: [img.b64] });
      } else {
        messages.push({ role: 'user', content: t.text });
      }
    } else {
      messages.push({ role: t.role, content: t.text });
    }
  });

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true })
    });
  } catch (err) {
    throw new Error(`Ollama fetch failed: ${err.message}. Is Ollama running at ${baseUrl}?`);
  }

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.message && data.message.content) {
          full += data.message.content;
          onToken(data.message.content);
        }
      } catch (e) {
        // ignore
      }
    }
  }
  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer);
      if (data.message && data.message.content) {
        full += data.message.content;
        onToken(data.message.content);
      }
    } catch (e) { }
  }
  return full;
}

// ---- CLI-backed providers: Claude Code and Codex -------------------------
// These run your own locally-installed, already-authenticated CLI instead of
// calling a metered API — no apiKey, billed against whatever subscription you
// logged the CLI into. Two real trade-offs vs. every provider above:
//   1. No streaming — a CLI subprocess's stdout arrives in unpredictable
//      chunks, not one token at a time, so onToken fires with larger pieces of
//      text (or once at the end) rather than a smooth typewriter effect.
//   2. A process spawn + the CLI's own startup cost adds real latency
//      (roughly 1-3s+) versus a direct HTTP streaming call.
// Exact CLI flags can drift between tool versions — if this errors, the raw
// stderr is surfaced rather than swallowed, so the actual failure is visible
// instead of a silent hang.

// Pure argument-building, kept separate from spawning so it's unit-testable
// without a real `claude`/`codex` install on the test machine.
function buildClaudeCodeArgs({ system, prompt, model }) {
  const fullPrompt = system ? `${system}\n\n${prompt}` : prompt;
  const args = ['-p', fullPrompt, '--output-format', 'text'];
  if (model) args.push('--model', model);
  return args;
}

function buildCodexArgs({ system, prompt, model }) {
  const fullPrompt = system ? `${system}\n\n${prompt}` : prompt;
  const args = ['exec', fullPrompt, '--skip-git-repo-check'];
  if (model) args.push('--model', model);
  return args;
}

// Both CLIs are filesystem-capable coding agents, so a screenshot is passed
// as a temp file path in the prompt text (not inline base64) — the agent
// reads it with its own file tool. Cleaned up after the call either way.
function writeTempScreenshot(imageDataUrl) {
  const img = stripDataUrl(imageDataUrl);
  if (!img) return null;
  const ext = /png/i.test(img.mime) ? 'png' : /jpe?g/i.test(img.mime) ? 'jpg' : 'png';
  const filePath = path.join(os.tmpdir(), `aside-screenshot-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`);
  fs.writeFileSync(filePath, Buffer.from(img.b64, 'base64'));
  return filePath;
}

function withScreenshotNote(prompt, imagePath) {
  if (!imagePath) return prompt;
  return `${prompt}\n\nA screenshot for this request is saved at: ${imagePath}\nOpen and read that image file before answering.`;
}

// GUI-launched apps (Dock icon, Finder double-click — not a terminal) inherit
// the OS's bare default PATH, not your shell profile's extended one. A CLI
// installed via nvm/homebrew/npm-global/pip/etc. works fine when you type its
// name in Terminal and is invisible here for that reason alone. Resolve the
// real PATH once per process by asking the user's actual login shell for it —
// the same environment Terminal.app effectively uses — and merge it into every
// spawn below. Cached because spawning a login shell has real overhead.
let cachedShellPathPromise = null;
function resolveLoginShellPath() {
  if (cachedShellPathPromise) return cachedShellPathPromise;
  cachedShellPathPromise = new Promise((resolve) => {
    const shellBin = process.env.SHELL || '/bin/zsh';
    const MARK = '__ASIDE_PATH__';
    let child;
    try {
      // -ilc: interactive + login + run this command, so .zshrc/.zprofile (or
      // bash/fish equivalents) actually get sourced, same as opening Terminal.
      child = spawn(shellBin, ['-ilc', `echo ${MARK}$PATH${MARK}`]);
    } catch {
      resolve(process.env.PATH || '');
      return;
    }
    let out = '';
    child.stdout.on('data', (c) => { out += c.toString('utf8'); });
    child.on('error', () => resolve(process.env.PATH || ''));
    // Startup banners/MOTD from shell plugins can print extra noise around our
    // markers — extract only what's between them rather than trusting stdout as-is.
    child.on('close', () => {
      const m = new RegExp(`${MARK}(.*)${MARK}`, 's').exec(out);
      resolve(m ? m[1].trim() : (process.env.PATH || ''));
    });
    // Don't let a hung/misconfigured shell block every CLI call forever, and
    // don't leave it running in the background if we give up on it.
    setTimeout(() => { try { child.kill(); } catch { /* already gone */ } resolve(process.env.PATH || ''); }, 5000).unref();
  });
  return cachedShellPathPromise;
}

// Spawns `command args`, streams stdout chunks through onToken as they
// arrive, and resolves with the full combined stdout on a clean exit.
async function runCli(command, args, { onToken } = {}) {
  const resolvedPath = await resolveLoginShellPath();
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, { shell: false, env: { ...process.env, PATH: resolvedPath || process.env.PATH } });
    } catch (err) {
      reject(new Error(`Could not start "${command}": ${err.message}`));
      return;
    }
    let out = '';
    let errText = '';
    child.on('error', (e) => {
      if (e.code === 'ENOENT') {
        reject(new Error(`"${command}" was not found on your PATH. Install it and confirm "${command}" works from a terminal, then try again.`));
      } else {
        reject(new Error(`${command} failed to start: ${e.message}`));
      }
    });
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      out += text;
      if (onToken) onToken(text);
    });
    child.stderr.on('data', (chunk) => { errText += chunk.toString('utf8'); });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}${errText ? ': ' + errText.trim().slice(0, 500) : ''}`));
        return;
      }
      resolve(out.trim());
    });
  });
}

async function streamClaudeCode({ system, turns, model, imageDataUrl, onToken }) {
  const basePrompt = (turns[turns.length - 1] || {}).text || '';
  const imagePath = writeTempScreenshot(imageDataUrl);
  try {
    const prompt = withScreenshotNote(basePrompt, imagePath);
    return await runCli('claude', buildClaudeCodeArgs({ system, prompt, model }), { onToken });
  } finally {
    if (imagePath) fs.unlink(imagePath, () => {});
  }
}

async function streamCodex({ system, turns, model, imageDataUrl, onToken }) {
  const basePrompt = (turns[turns.length - 1] || {}).text || '';
  const imagePath = writeTempScreenshot(imageDataUrl);
  try {
    const prompt = withScreenshotNote(basePrompt, imagePath);
    return await runCli('codex', buildCodexArgs({ system, prompt, model }), { onToken });
  } finally {
    if (imagePath) fs.unlink(imagePath, () => {});
  }
}

function createLLM(settings) {
  const provider = settings.provider;
  const keys = settings.apiKeys || {};
  let apiKey = keys[provider];
  let baseURL = '';
  let configurationError = '';
  const tier = settings.smart ? 'smart' : 'fast';
  const models = settings.models || {};
  let model = (models[provider] || {})[tier];
  if (provider === 'gemini' && DEAD_GEMINI_MODEL_RE.test(model || '')) {
    model = CURRENT_GEMINI_DEFAULT;
  }
  if (!model) model = DEFAULT_MODELS[provider] || '';
  const minimaxRegion = settings.minimaxRegion || 'global_en';
  const endpoint = settings.azureEndpoint || '';

  if (provider === CUSTOM_PROVIDER) {
    try {
      const clientOptions = createCompatibleClientOptions(apiKey, settings.baseUrl);
      apiKey = clientOptions.apiKey;
      baseURL = clientOptions.baseURL;
    } catch (error) {
      configurationError = error.message;
    }
    if (!model && !configurationError) {
      configurationError = 'Set a Fast or Smart model for the Custom provider.';
    }
  } else if (provider !== 'ollama' && !CLI_PROVIDERS.has(provider) && !apiKey) {
    // Ollama is a local server (field holds a URL) and the CLI providers use
    // your already-logged-in `claude`/`codex` CLI — neither needs a key here.
    configurationError = `Add your ${provider} API key in Settings.`;
  }

  // Azure needs a second credential: the resource endpoint.
  if (!configurationError && provider === 'azure' && !endpoint) {
    configurationError = 'Add your Azure AI Foundry endpoint in Settings.';
  }

  // CLI providers pick their own default model when none is set (no
  // DEFAULT_MODELS entry for them), so don't require one to be "ready".
  const ready = !configurationError && (!!model || CLI_PROVIDERS.has(provider));
  const maxTokens = settings.smart ? 1400 : 700;

  return {
    provider, model, apiKey, baseURL,
    ready,
    configurationError,
    async stream(params) {
      if (!ready) throw new Error(configurationError || `Complete the ${provider} provider settings.`);
      const args = { apiKey, baseURL, endpoint, model, maxTokens, ...params, turns: sanitizeTurns(params.turns) };
      try {
        if (provider === 'openai') return await streamOpenAI(args);
        if (provider === CUSTOM_PROVIDER) return await streamOpenAI(args);
        if (provider === 'ollama') return await streamOllama(args);
        if (provider === 'groq') return await streamOpenAI({ ...args, baseURL: 'https://api.groq.com/openai/v1' });
        if (provider === 'minimax') return await streamOpenAI({ ...args, baseURL: MINIMAX_BASE_URLS[minimaxRegion] || MINIMAX_BASE_URLS.global_en });
        if (provider === 'anthropic') return await streamAnthropic(args);
        if (provider === 'gemini') return await streamGemini(args);
        if (provider === 'azure') return await streamAzure(args);
        if (provider === 'claude-code') return await streamClaudeCode(args);
        if (provider === 'codex') return await streamCodex(args);
        throw new Error('unknown provider: ' + provider);
      } catch (error) {
        throw new Error(formatProviderErrorMessage(error, provider, model));
      }
    }
  };
}

module.exports = {
  createLLM, formatProviderErrorMessage, isQuotaError, CURRENT_GEMINI_DEFAULT,
  CLI_PROVIDERS, buildClaudeCodeArgs, buildCodexArgs, runCli, resolveLoginShellPath
};
