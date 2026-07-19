// routes/whatsapp.js
const express = require('express');
const router = express.Router();
const whatsapp = require('../lib/whatsapp');
const claude = require('../lib/claude');
const calcom = require('../lib/calcom');
const db = require('../lib/db');
const categories = require('../lib/categories');

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Sends a block of text as one or more separate WhatsApp messages, splitting on
// blank lines, so replies feel like a real person texting instead of one wall of text.
async function sendAsMessages(phoneNumberId, to, text) {
  const parts = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts.length ? parts : [text]) {
    await whatsapp.sendText(phoneNumberId, to, part);
  }
}

router.post('/', async (req, res) => {
  res.sendStatus(200); // acknowledge immediately

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    if (!message) return; // could be a status update, not an actual message - ignore

    const from = message.from; // sender's phone number
    const sendingNumberId = value.metadata.phone_number_id; // reply from the SAME number the message came to

    // Load conversation history
    const existing = await db.getConversation(from);
    const history = existing?.messages || [];

    // Figure out what the lead actually sent: plain text, a tap on our category
    // list, or (fallback) a bare number typed in reply to the category list.
    let incomingText = message.text?.body;
    let selectedCategory = null;

    if (message.type === 'interactive' && message.interactive?.list_reply) {
      const picked = message.interactive.list_reply.id;
      const match = categories.find((c) => c.id === picked);
      selectedCategory = picked;
      incomingText = `Selected: ${match ? match.title : picked}`;
    } else if (incomingText && /^[1-8]$/.test(incomingText.trim()) && !existing?.project_category) {
      const idx = parseInt(incomingText.trim(), 10) - 1;
      if (categories[idx]) {
        selectedCategory = categories[idx].id;
        incomingText = `Selected: ${categories[idx].title}`;
      }
    }

    if (!incomingText) return; // nothing we can act on (e.g. unsupported message type)

    history.push({ role: 'user', content: incomingText });

    // If a team member has paused the AI for this lead, just log the message
    // and don't auto-reply - let a human handle it from the dashboard.
    if (existing?.ai_paused) {
      await db.saveConversation(from, 'fmdl', history, {
        lead_status: existing?.lead_status || 'new',
        project_category: selectedCategory || existing?.project_category || null,
      });
      return;
    }

    // If we already know this lead's project category, pull any team-defined
    // reply guidance for it and pass it to Claude as extra context.
    const knownCategory = selectedCategory || existing?.project_category || null;
    let extraContext = '';
    if (knownCategory) {
      const rule = await db.getCategoryRule(knownCategory);
      if (rule?.instructions) {
        extraContext = `Category guidance for ${rule.label}: ${rule.instructions}`;
      }
    }

    // Get the reply
    const { text, bookMeetingRequest, projectCategory, askCategory } = await claude.getAgentReply(history, extraContext);
    history.push({ role: 'assistant', content: text });

    if (text) {
      await sendAsMessages(sendingNumberId, from, text);
    }

    if (askCategory) {
      await whatsapp.sendCategoryList(sendingNumberId, from);
    }

    let leadStatus = existing?.lead_status || 'new';

    if (bookMeetingRequest) {
      const link = await calcom.getBookingLink();
      await whatsapp.sendText(
        sendingNumberId,
        from,
        `Great, here's our booking link to lock in a time that works: ${link}`
      );
      leadStatus = 'meeting_offered';
    }

    await db.saveConversation(from, 'fmdl', history, {
      lead_status: leadStatus,
      project_category: selectedCategory || projectCategory || existing?.project_category || null,
    });
  } catch (err) {
    console.error('WhatsApp webhook error:', err.response?.data || err.message);
  }
});

module.exports = router;
