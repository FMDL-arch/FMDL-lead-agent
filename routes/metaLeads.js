// routes/metaLeads.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const whatsapp = require('../lib/whatsapp');
const db = require('../lib/db');
const config = require('../config');

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

// Founders/sales team who get a WhatsApp DM whenever a new lead comes in.
// NOTE: each of these numbers must have messaged the FMDL WhatsApp number at least
// once (even just "hi") for WhatsApp to allow us to message them - otherwise Meta
// blocks free-form messages outside an open 24-hour conversation window.
const TEAM_NOTIFY_NUMBERS = [
  '917836915552', // Akshaay
  '919654663651', // Amrita
  '919354224831', // Shweta
];

// Meta calls this once, with a GET request, to verify you own this webhook URL.
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Meta calls this every time someone submits your Lead Ad form.
router.post('/', async (req, res) => {
  res.sendStatus(200); // acknowledge immediately, Meta requires a fast response

  try {
    const entries = req.body.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        if (change.field !== 'leadgen') continue;
        const leadgenId = change.value.leadgen_id;

        // Fetch the actual answers from Meta's Graph API
        const { data: lead } = await axios.get(
          `https://graph.facebook.com/v20.0/${leadgenId}`,
          { params: { access_token: process.env.META_PAGE_ACCESS_TOKEN } }
        );

        const fieldData = lead.field_data || [];
        const phone = fieldData.find((f) => f.name.includes('phone'))?.values?.[0];
        const name = fieldData.find((f) => f.name.includes('name'))?.values?.[0] || 'there';

        if (!phone) continue;
        const cleanPhone = phone.replace(/[^\d]/g, '');

        // Kick off the conversation on the FMDL WhatsApp number
        const opener = `Hi ${name}! Thanks for your interest in FMDL Architects. Could you tell me a bit about your project - is it residential, hospital, wellness, temple, or something else?`;

        await whatsapp.sendText(config.numbers.FMDL_PHONE_NUMBER_ID, cleanPhone, opener);
        await db.saveConversation(cleanPhone, 'fmdl', [
          { role: 'assistant', content: opener },
        ], { lead_status: 'new', name: name !== 'there' ? name : null });

        // Notify the founders/sales team so they know a new lead just came in.
        const notifyText = `New lead! ${name} (${cleanPhone}) just submitted the FMDL Instant Form. Shipra has started the WhatsApp conversation.`;
        for (const teamNumber of TEAM_NOTIFY_NUMBERS) {
          try {
            await whatsapp.sendText(config.numbers.FMDL_PHONE_NUMBER_ID, teamNumber, notifyText);
          } catch (notifyErr) {
            console.error('Team notify error:', notifyErr.response?.data || notifyErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('Meta lead webhook error:', err.response?.data || err.message);
  }
});

module.exports = router;
