// lib/claude.js
const Anthropic = require('@anthropic-ai/sdk');
const fmdlPrompt = require('../prompts/fmdl-agent');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// messages: array of {role: 'user'|'assistant', content: string} — the running conversation
async function getAgentReply(messages, extraContext = '') {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: fmdlPrompt + (extraContext ? `\n\n${extraContext}` : ''),
    messages,
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  // Check if the agent decided to book a meeting
  const bookMatch = text.match(/\[\[BOOK_MEETING:\s*(.+?)\]\]/);

  return {
    text: text.replace(/\[\[BOOK_MEETING:.+?\]\]/, '').trim(),
    bookMeetingRequest: bookMatch ? bookMatch[1] : null,
  };
}

module.exports = { getAgentReply };
