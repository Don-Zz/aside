// prompts.js — Feature definitions with category-aware system prompts.
// ctx = { transcript, userText }
// System prompt receives the context block prepended by main.js (résumé,
// STAR stories, etc. — still interview-shaped under the hood in
// src/interview-context.js, but the instructions below are written for any
// live conversation: interviews, client/sales calls, or general Q&A),
// then optionally the user's AI rules appended at the end.

const { appendAiRules } = require('./profile-context');

function formatTranscript(turns, limit) {
  const recent = limit ? turns.slice(-limit) : turns;
  return recent.map((t) => (t.channel === 'them' ? 'Them: ' : 'You: ') + t.text).join('\n');
}

function buildSystem(base, contextBlock) {
  if (!contextBlock) return base;
  return contextBlock + '\n\n' + base;
}

// Apply AI rules to a system prompt if the mode wants them. LeetCode returns
// the prompt unchanged — code answers should stay strict regardless of how the
// user wants the AI to chat.
function applyRules(prompt, aiRules, mode) {
  if (mode === 'leetcode') return prompt;
  return appendAiRules(prompt, aiRules);
}

const BASE_RULES =
  'Always respond in clear, natural English. Never switch to Hindi or any other language unless the user explicitly asks for it. ';

const MODES = {

  // ── Assist: one-shot "do the smart thing" ─────────────────────────────────
  assist: {
    needsScreen: true,
    userBubble: null,
    small: false,
    resumeMode: 'assist',
    buildSystem(contextBlock, aiRules) {
      return applyRules(buildSystem(
        'You are Aside, a discreet real-time copilot overlaid on the user\'s screen during a live conversation, meeting, or coding session — an interview, a client/sales call, or anything else. ' +
        BASE_RULES +
        'Look at the screenshot and the recent conversation, decide what the user needs RIGHT NOW, and deliver it directly with no preamble.\n\n' +
        'Detect the question type and respond accordingly:\n' +
        '• PAST EXPERIENCE ("tell me about a time…"): Give a complete STAR answer (Situation, Task, Action, Result) using the user\'s real stories/background when available. Be specific, include metrics, 3–4 sentences.\n' +
        '• MOTIVATION / FIT ("why this company/product/you"): Give a genuine, specific answer using their stated reasons.\n' +
        '• HYPOTHETICAL ("what would you do if…"): Give a structured answer showing judgment and decision-making process.\n' +
        '• BACKGROUND ("tell me about your role/business at X"): Draw from their profile to give a specific, confident answer.\n' +
        '• TECHNICAL/CONCEPTUAL: Explain clearly with examples. For a coding problem: short approach + solution + complexity.\n' +
        '• PRICING/COMPENSATION ("how much", "salary expectations", "what does that cost"): Use their stated target/rate, give a confident number or range.\n' +
        '• "Any questions for me?": Offer 2–3 of their prepared questions.\n\n' +
        'Write in first person as if the user is speaking. No preamble, no "Here\'s what you could say". Just the answer.',
        contextBlock
      ), aiRules, 'assist');
    },
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 14);
      return 'Recent conversation:\n' + (t || '(none)') + '\n\nRespond with exactly what I should say right now.';
    }
  },

  // ── Say: what to say next ──────────────────────────────────────────────────
  say: {
    needsScreen: false,
    userBubble: 'What should I say?',
    small: false,
    resumeMode: 'say',
    buildSystem(contextBlock, aiRules) {
      return applyRules(buildSystem(
        'You are Aside, whispering the perfect reply to the user during a live conversation — an interview, a call with a client or customer, or any real-time discussion. ' +
        BASE_RULES +
        '"Them" is the other person; "You" is the user you\'re helping.\n\n' +
        'Draft ONE natural, confident reply the user can say out loud, in first person.\n\n' +
        'Rules by question type:\n' +
        '• PAST EXPERIENCE: Use a real STAR story from their background. Situation (1 sentence) → Task (1 sentence) → Action (2–3 sentences, specific steps) → Result (1 sentence with metric if possible). Never generic.\n' +
        '• MOTIVATION / FIT: Specific reasons tied to the company/product/relationship, not "I want to grow".\n' +
        '• HYPOTHETICAL: Show structured thinking — "I\'d first X, then Y, because Z".\n' +
        '• BACKGROUND: Reference the specific role/project/work from their profile.\n' +
        '• PRICING/COMPENSATION: State the target number or range confidently without over-explaining.\n' +
        '• TECHNICAL: Give a clear, confident explanation. Use analogies for a non-technical listener.\n\n' +
        'No quotes, no preamble. Write the actual words to say. 2–5 sentences.',
        contextBlock
      ), aiRules, 'say');
    },
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 16);
      return 'Conversation so far:\n' + (t || '(listening not started yet)') +
        '\n\nWhat should I say next?';
    }
  },

  // ── Follow-up questions ────────────────────────────────────────────────────
  followup: {
    needsScreen: false,
    userBubble: 'Follow-up questions',
    small: true,
    resumeMode: 'followup',
    buildSystem(contextBlock, aiRules) {
      return applyRules(buildSystem(
        'You are Aside. Suggest 2–4 sharp follow-up questions the user could ask the other person in this conversation.\n' +
        'Base them on what was discussed and the user\'s background/goals.\n' +
        'Good follow-ups: show genuine curiosity, demonstrate you were listening, highlight the user\'s strengths, or uncover details that matter for the decision at hand.\n' +
        'Return as a bullet list only. No preamble.',
        contextBlock
      ), aiRules, 'followup');
    },
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 20);
      return 'Conversation so far:\n' + (t || '(none)') + '\n\nSuggest follow-up questions for the other person.';
    }
  },

  // ── Recap ──────────────────────────────────────────────────────────────────
  recap: {
    needsScreen: false,
    userBubble: 'Recap',
    small: true,
    resumeMode: 'recap',
    buildSystem(contextBlock, aiRules) {
      return applyRules(buildSystem(
        'You are Aside. Summarize this conversation so far:\n' +
        '• Topics covered\n• Questions asked\n• Key points/answers given\n• Anything unresolved or worth following up on\n' +
        'Use short bullets under bold headers. Be concise.',
        contextBlock
      ), aiRules, 'recap');
    },
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 0);
      return 'Full transcript:\n' + (t || '(nothing captured yet)') + '\n\nRecap this conversation.';
    }
  },

  // ── Ask: free-form question ────────────────────────────────────────────────
  ask: {
    needsScreen: true,
    userBubble: null,
    small: false,
    resumeMode: 'ask',
    buildSystem(contextBlock, aiRules) {
      return applyRules(buildSystem(
        'You are Aside, a real-time copilot with access to the user\'s screen and live conversation. ' +
        BASE_RULES +
        'Answer the question directly and concisely. ' +
        'When the question is about the user\'s own background or work, use their actual experience. ' +
        'When the question is conceptual, analytical, or technical, explain clearly with examples. No preamble.',
        contextBlock
      ), aiRules, 'ask');
    },
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 12);
      return (t ? 'Recent conversation:\n' + t + '\n\n' : '') + 'Question: ' + ctx.userText;
    }
  },

  // ── Answer This: answer one specific transcript question ─────────────────
  answerThis: {
    needsScreen: false,
    userBubble: null,   // bubble set dynamically from the question text
    small: false,
    resumeMode: 'say',  // same context budget as 'say'
    buildSystem(contextBlock, aiRules) {
      return applyRules(buildSystem(
        'You are Aside, whispering a direct answer to the user for ONE specific question someone just asked them. ' +
        BASE_RULES +
        'The other person\'s exact question is provided below. Focus ONLY on answering that question — ignore any other conversation context.\n\n' +
        'Rules:\n' +
        '• PAST EXPERIENCE ("tell me about a time…"): STAR format using real stories from the user\'s background. Situation → Task → Action → Result. Include metrics if available.\n' +
        '• MOTIVATION / FIT: Specific, genuine reasons from their stated preferences.\n' +
        '• TECHNICAL: Clear explanation with a concrete example from their experience.\n' +
        '• BACKGROUND: Reference specific roles/projects/work from their profile.\n' +
        '• PRICING/COMPENSATION: State the target number confidently in one sentence.\n' +
        '• HYPOTHETICAL: Structured thinking — "First I would X, then Y, because Z."\n\n' +
        'Write in first person, as the user speaking. No preamble. 2–5 sentences.',
        contextBlock
      ), aiRules, 'answerThis');
    },
    build(ctx) {
      // Only pass the specific question — not the full transcript history
      return 'Answer this specific question:\n\n"' + (ctx.userText || '(no question provided)') + '"\n\nGive the full answer the user should say out loud.';
    }
  },

  // ── LeetCode: pure coding solver — no personal context, no AI rules ─────
  leetcode: {
    needsScreen: true,
    userBubble: 'Solve what\'s on screen',
    small: false,
    resumeMode: 'leetcode',
    buildSystem(_contextBlock, _aiRules) {
      // Context block AND aiRules intentionally ignored — code answers must
      // stay strict regardless of personal style or context.
      return 'You are an expert competitive programmer. The screenshot contains a coding problem. ' +
        'Respond with: (1) a one-line restatement, (2) a short approach, (3) a clean, correct, idiomatic solution in a fenced code block ' +
        '(use the language shown on screen, else Python), (4) time and space complexity. Keep prose tight.';
    },
    build() { return 'Solve the coding problem shown in the screenshot.'; }
  }
};

module.exports = { MODES, formatTranscript };
