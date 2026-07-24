// routes/metaLeads.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { intakeLead } = require('../lib/leadIntake');

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

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
// NOTE: Meta's own docs describe this as "best effort" - real-time pings can be
// delayed by minutes, or in some cases never arrive. routes/sync.js polls the
// Graph API every 15 minutes as a backup so a dropped webhook doesn't mean a
// lost lead - both paths share the same intake logic in lib/leadIntake.js.
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
                                      // Meta lead forms often include a name field already - if we have it, greet them by
                              // name and skip asking again; Shipra's prompt only asks for what's still missing.
                              const formName = fieldData.find((f) => f.name.includes('name'))?.values?.[0];

                              if (!phone) continue;
                                      await intakeLead({ phone, name: formName, sourceTag: 'Meta webhook' });
                            }
                    }
              } catch (err) {
                    console.error('Meta lead webhook error:', err.response?.data || err.message);
              }
});

module.exports = router;
