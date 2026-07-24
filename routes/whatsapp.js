// routes/whatsapp.js
const express = require('express');
const router = express.Router();
const whatsapp = require('../lib/whatsapp');
const claude = require('../lib/claude');
const calcom = require('../lib/calcom');
const db = require('../lib/db');
const categories = require('../lib/categories');
const { TEAM_NOTIFY_NUMBERS } = require('../lib/leadIntake');

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

// Maps each of the 8 project categories to the portfolio PDF slug that best
// represents it, so Shipra can automatically send the right profile PDF once
// a lead's project type is known. Slugs match the rows in portfolio_pdfs.
// NOTE: 'other' ("Not listed above") is deliberately NOT in this map - it gets
// FMDL's Instagram/website links instead of a PDF, handled separately below.
const categoryToPdfSlug = {
    architecture_residence: 'residential',
    interior_residence: 'residential',
    architecture_hospital: 'healthcare',
    interior_hospital: 'healthcare',
    architecture_temple_public: 'public_building',
    interior_office: 'commercial',
    interior_spa: 'commercial',
};

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

// Sends the portfolio PDF that matches a newly-selected project category, if
// the team has uploaded one for it from the dashboard. For "Not listed above"
// (category 'other') there's no matching PDF - send FMDL's Instagram/website
// links instead so the lead has something useful to look at.
async function sendCategoryFollowUp(phoneNumberId, to, category) {
    if (category === 'other') {
          const links = [
                  process.env.FMDL_WEBSITE_URL && `Website: ${process.env.FMDL_WEBSITE_URL}`,
                  process.env.FMDL_INSTAGRAM_URL && `FMDL Instagram: ${process.env.FMDL_INSTAGRAM_URL}`,
                  process.env.FMDL_FOUNDERS_INSTAGRAM_URL && `Akshaay & Amrita's Instagram: ${process.env.FMDL_FOUNDERS_INSTAGRAM_URL}`,
                ].filter(Boolean);
          if (links.length) {
                  await whatsapp.sendText(phoneNumberId, to, `Here's a bit more about us in the meantime:\n${links.join('\n')}`);
          }
          return;
    }
    const slug = categoryToPdfSlug[category];
    if (!slug) return;
    const pdf = await db.getPortfolioPdf(slug);
    if (!pdf?.file_url) return;
    try {
          await whatsapp.sendDocument(phoneNumberId, to, pdf.file_url, pdf.filename || `${pdf.label}.pdf`, pdf.label);
    } catch (err) {
          console.error('sendCategoryFollowUp error:', err.response?.data || err.message);
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

      // This lead hasn't sent a single message before now - fire a one-time
      // "lead replied!" ping to the team so nobody misses a first response
      // (separate from the "new lead" ping intakeLead sends when the
      // conversation is first created - that fires before the lead has said
      // anything back).
      const isFirstReply = !history.some((m) => m.role === 'user');

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

      if (isFirstReply) {
              const leadLabel = existing?.name || from;
              const notifyText = `💬 ${leadLabel} (${from}) just replied to Shipra for the first time - check the dashboard.`;
              for (const teamNumber of TEAM_NOTIFY_NUMBERS) {
                        try {
                                    await whatsapp.sendText(sendingNumberId, teamNumber, notifyText);
                        } catch (notifyErr) {
                                    console.error('Team reply-notify error:', notifyErr.response?.data || notifyErr.message);
                        }
              }
      }

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
      const { text, bookMeetingRequest, projectCategory, askCategory, leadName, leadLocation, jobFormSent, jobFormConfirmed } =
              await claude.getAgentReply(history, extraContext);
                    history.push({ role: 'assistant', content: text });

      if (text) {
              await sendAsMessages(sendingNumberId, from, text);
      }

      if (askCategory) {
              await whatsapp.sendCategoryList(sendingNumberId, from);
      }

      // A category was just picked this turn - send the matching follow-up
      // (portfolio PDF, or links for "Not listed above").
      if (selectedCategory) {
              await sendCategoryFollowUp(sendingNumberId, from, selectedCategory);
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

      // Job-seeker tracking: only stamp job_form_sent_at the FIRST time the link
      // goes out, so the 2h/12h reminder timers don't keep resetting on every
      // later message in the same conversation.
      const jobSeekerFields = {};
                    if (jobFormSent && !existing?.job_form_sent_at) {
                            jobSeekerFields.lead_type = 'job_seeker';
                            jobSeekerFields.job_form_sent_at = new Date().toISOString();
                    }
                    if (jobFormConfirmed) {
                            jobSeekerFields.job_form_confirmed = true;
                    }

      await db.saveConversation(from, 'fmdl', history, {
              lead_status: leadStatus,
              project_category: selectedCategory || projectCategory || existing?.project_category || null,
              name: leadName || existing?.name || null,
              location: leadLocation || existing?.location || null,
              ...jobSeekerFields,
      });
              } catch (err) {
                    console.error('WhatsApp webhook error:', err.response?.data || err.message);
              }
});

module.exports = router;
