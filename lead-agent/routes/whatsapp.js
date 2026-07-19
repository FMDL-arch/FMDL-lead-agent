// routes/whatsapp.js
const express = require('express');
const router = express.Router();
const whatsapp = require('../lib/whatsapp');
const claude = require('../lib/claude');
const calcom = require('../lib/calcom');
const db = require('../lib/db');
const config = require('../config');

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

    const phoneNumberId = value.metadata.phone_number_id;

    // Tell the two numbers apart
    const agentType =
      phoneNumberId === config.numbers.FMDL_PHONE_NUMBER_ID ? 'fmdl' : 'products';
    const sendingNumberId = phoneNumberId; // reply from the SAME number the message came to

    // Load conversation history
    const existing = await db.getConversation(from);
    const history = existing?.messages || [];
    history.push({ role: 'user', content: incomingText });

    // If a team member has paused the AI for this lead, just log the message
    // and don't auto-reply - let a human handle it from the dashboard.
    if (existing?.ai_paused) {
      await db.saveConversation(from, agentType, history, {
        lead_status: existing?.lead_status || 'new',
      });
      return;
    }

    // Get Claude's reply
    const { text, bookMeetingRequest } = await claude.getAgentReply(agentType, history);
    history.push({ role: 'assistant', content: text });

    await whatsapp.sendText(sendingNumberId, from, text);

    let leadStatus = existing?.lead_status || 'new';

    if (agentType === 'fmdl' && bookMeetingRequest) {
      const link = await calcom.getBookingLink();
      await whatsapp.sendText(
        sendingNumberId,
        from,
        `Great, here's our booking link to lock in a time that works: ${link}`
      );
      leadStatus = 'meeting_offered';
    }

    await db.saveConversation(from, agentType, history, { lead_status: leadStatus });
  } catch (err) {
    console.error('WhatsApp webhook error:', err.response?.data || err.message);
  }
});

module.exports = router;
