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

  let text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const bookMatch = text.match(/\[\[BOOK_MEETING:\s*(.+?)\]\]/);
  text = text.replace(/\[\[BOOK_MEETING:.+?\]\]/, '').trim();

  const categoryMatch = text.match(/\[\[PROJECT_CATEGORY:\s*(.+?)\]\]/);
  text = text.replace(/\[\[PROJECT_CATEGORY:.+?\]\]/, '').trim();

  const askCategoryMatch = text.match(/\[\[ASK_CATEGORY\]\]/);
  text = text.replace(/\[\[ASK_CATEGORY\]\]/, '').trim();

  const nameMatch = text.match(/\[\[LEAD_NAME:\s*(.+?)\]\]/);
  text = text.replace(/\[\[LEAD_NAME:.+?\]\]/, '').trim();

  return {
    text,
    bookMeetingRequest: bookMatch ? bookMatch[1] : null,
    projectCategory: categoryMatch ? categoryMatch[1].trim() : null,
    askCategory: !!askCategoryMatch,
    leadName: nameMatch ? nameMatch[1].trim() : null,
  };
}

module.exports = { getAgentReply };
