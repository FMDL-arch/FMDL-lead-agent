// lib/claude.js
const Anthropic = require('@anthropic-ai/sdk');
const fmdlPrompt = require('../prompts/fmdl-agent');
const productsPrompt = require('../prompts/products-agent');
const config = require('../config');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// messages: array of {role: 'user'|'assistant', content: string} — the running conversation
async function getAgentReply(agentType, messages, extraContext = '') {
  const systemPrompt = agentType === 'fmdl' ? fmdlPrompt : productsPrompt;

  const productLinks = Object.entries(config.products)
    .map(([key, p]) => `${p.label}: ${p.paymentLink} (₹${p.price})`)
    .join('\n');

  const fullSystem =
    agentType === 'fmdl'
      ? systemPrompt
      : `${systemPrompt}\n\nCurrent payment links to use when relevant:\n${productLinks}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: fullSystem + (extraContext ? `\n\n${extraContext}` : ''),
    messages,
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  // Check if the FMDL agent decided to book a meeting
  const bookMatch = text.match(/\[\[BOOK_MEETING:\s*(.+?)\]\]/);

  return {
    text: text.replace(/\[\[BOOK_MEETING:.+?\]\]/, '').trim(),
    bookMeetingRequest: bookMatch ? bookMatch[1] : null,
  };
}

module.exports = { getAgentReply };
