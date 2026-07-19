// routes/whatsapp.js
const express = require('express');
const router = express.Router();
const whatsapp = require('../lib/whatsapp');
const claude = require('../lib/claude');
const calcom = require('../lib/calcom');
const db = require('../lib/db');

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

router.post('/', async (req, res) => {
  res.sendStatus(200); // acknowledge immediately

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    if (!message) return; // could be a status update, not an actual message - ignore

    const from = message.from; // sender's phone number
    const incomingText = message.text?.body;
    if (!incomingText) return;

    const sendingNumberId = value.metadata.phone_number_id; // reply from the SAME number the message came to

    // Load conversation history
    const existing = await db.getConversation(from);
    const history = existing?.messages || [];
    history.push({ role: 'user', content: incomingText });

    // If a team member has paused the AI for this lead, just log the message
    // and don't auto-reply - let a human handle it from the dashboard.
    if (existing?.ai_paused) {
      await db.saveConversation(from, 'fmdl', history, {
        lead_status: existing?.lead_status || 'new',
        project_category: existing?.project_category || null,
      });
      return;
    }

    // If we already know this lead's project category, pull any team-defined
    // reply guidance for it and pass it to Claude as extra context.
    let extraContext = '';
    if (existing?.project_category) {
      const rule = await db.getCategoryRule(existing.project_category);
      if (rule?.instructions) {
        extraContext = `Category guidance for ${rule.label}: ${rule.instructions}`;
      }
    }

    // Get Claude's reply
    const { text, bookMeetingRequest, projectCategory } = await claude.getAgentReply(history, extraContext);
    history.push({ role: 'assistant', content: text });

    await whatsapp.sendText(sendingNumberId, from, text);

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
      project_category: projectCategory || existing?.project_category || null,
    });
  } catch (err) {
    console.error('WhatsApp webhook error:', err.response?.data || err.message);
  }
});

module.exports = router;
