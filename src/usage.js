// Usage/cost tracking — local JSON-file counters, keyed by day then
// provider/model. Token counts are estimated from character length (roughly
// 4 chars/token in English), since not every provider path here returns real
// usage numbers back to us. Good enough to answer "about how much am I
// spending", not good enough to reconcile against an invoice.

const fs = require('fs');
const { estimateCostUsd } = require('./usage-pricing');

const CHARS_PER_TOKEN = 4;

function estimateTokens(text) {
  return Math.ceil((text || '').length / CHARS_PER_TOKEN);
}

function today() { return new Date().toISOString().slice(0, 10); } // YYYY-MM-DD

function loadFile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function saveFile(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch { /* ignore */ }
}

function createUsageTracker(opts = {}) {
  const file = opts.file;
  let byDay = file ? loadFile(file) : {}; // { 'YYYY-MM-DD': { 'provider:model': {requests,inputTokens,outputTokens,costUsd} } }

  function persist() { if (file) saveFile(file, byDay); }

  return {
    // Call once per completed LLM call.
    record({ provider, model, inputText, outputText }) {
      const inputTokens = estimateTokens(inputText);
      const outputTokens = estimateTokens(outputText);
      const costUsd = estimateCostUsd(provider, model, inputTokens, outputTokens);
      const day = today();
      const key = `${provider}:${model || 'default'}`;
      byDay[day] = byDay[day] || {};
      const row = byDay[day][key] || { provider, model: model || 'default', requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      row.requests += 1;
      row.inputTokens += inputTokens;
      row.outputTokens += outputTokens;
      row.costUsd += costUsd;
      byDay[day][key] = row;
      persist();
      return row;
    },

    // { today: [...rows], allTime: [...rows summed across every day] }
    summary() {
      const day = today();
      const todayRows = Object.values(byDay[day] || {});
      const totals = {};
      for (const rows of Object.values(byDay)) {
        for (const row of Object.values(rows)) {
          const key = `${row.provider}:${row.model}`;
          const t = totals[key] || { provider: row.provider, model: row.model, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
          t.requests += row.requests; t.inputTokens += row.inputTokens; t.outputTokens += row.outputTokens; t.costUsd += row.costUsd;
          totals[key] = t;
        }
      }
      return { today: todayRows, allTime: Object.values(totals) };
    }
  };
}

module.exports = { createUsageTracker, estimateTokens };
