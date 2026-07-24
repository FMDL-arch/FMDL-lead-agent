// lib/leadIntake.js
// Shared "a new lead showed up, start the WhatsApp conversation" logic, used by
// BOTH the real-time Meta webhook (routes/metaLeads.js) and the backup poller
// (routes/sync.js). Meta's own docs say the leadgen webhook is "best effort"
// and can be delayed by minutes - or, per what we saw with a couple of real
// leads, not arrive at all - so the poller re-checks the Graph API every
// 15 minutes and imports anything the webhook missed. Both paths funnel
// through here so a lead is never double-greeted: if a phone number already
// has a conversation row (created by the webhook OR a previous poll OR a
// manual "Add Lead" dashboard entry), we skip it instead of re-sending the
// opener message.

const whatsapp = require('./whatsapp');
const db = require('./db');
const config = require('../config');

// Founders/sales team who get a WhatsApp DM whenever a new lead comes in
// (and, separately, whenever an existing lead replies to Shipra for the
// first time - see routes/whatsapp.js). NOTE: each of these numbers must
// have messaged the FMDL WhatsApp number at least once (even just "hi")
// for WhatsApp to allow us to message them - otherwise Meta blocks
// free-form messages outside an open 24-hour conversation window.
const TEAM_NOTIFY_NUMBERS = [
        '917836915552', // Akshaay
        '919654663651', // Amrita
        '919354224831', // Shweta
    ];

async function intakeLead({ phone, name, sourceTag }) {
        const cleanPhone = (phone || '').replace(/[^\d]/g, '');
        if (!cleanPhone) return { skipped: true, reason: 'no phone' };

    const existing = await db.getConversation(cleanPhone);
        if (existing) return { skipped: true, reason: 'already exists' };

    // Per the team's request, Shipra should always get the lead's name and location
    // before anything else - so the opener leads with that instead of jumping
    // straight into project questions.
    const opener = name
            ? `Hi ${name}! Thanks for reaching out to FMDL Architects - I'm Shipra from the team. Which city are you based in?`
                : `Hi! Thanks for reaching out to FMDL Architects - I'm Shipra from the team. What's your name?`;

    await whatsapp.sendText(config.numbers.FMDL_PHONE_NUMBER_ID, cleanPhone, opener);
        await db.saveConversation(cleanPhone, 'fmdl', [
            { role: 'assistant', content: opener },
                ], {
                    lead_status: 'new',
                    name: name || null,
                    source_tag: sourceTag || null,
        });

    const notifyText = `New lead! ${name || 'Unknown name'} (${cleanPhone}) just submitted the FMDL Instant Form. Shipra has started the WhatsApp conversation.`;
        for (const teamNumber of TEAM_NOTIFY_NUMBERS) {
                    try {
                                    await whatsapp.sendText(config.numbers.FMDL_PHONE_NUMBER_ID, teamNumber, notifyText);
                    } catch (notifyErr) {
                                    console.error('Team notify error:', notifyErr.response?.data || notifyErr.message);
                    }
        }

    return { skipped: false, phone: cleanPhone };
}

module.exports = { intakeLead, TEAM_NOTIFY_NUMBERS };
