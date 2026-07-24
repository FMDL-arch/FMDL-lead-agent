// routes/sync.js
// Backup lead poller. Meta's leadgen webhook is documented as best-effort -
// deliveries can be delayed by minutes, or (as we saw with real leads that never
// showed up) sometimes never arrive at all. This route re-checks the Graph API
// for any leads submitted in the last hour and imports whatever the webhook
// missed, using the exact same intake logic (lib/leadIntake.js) so nobody gets
// double-greeted. Meant to be hit every 15 minutes by an external scheduler
// (cron-job.org) - it's a GET so a simple HTTP ping can trigger it, guarded by
// a shared-secret query token since it's a public URL.

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { intakeLead } = require('../lib/leadIntake');

const PAGE_ID = process.env.META_PAGE_ID;
const SYNC_SECRET = process.env.CRON_SYNC_SECRET;

router.get('/sync-leads', async (req, res) => {
    if (!SYNC_SECRET || req.query.token !== SYNC_SECRET) return res.sendStatus(403);
    if (!PAGE_ID) return res.status(500).send('META_PAGE_ID not configured');
    res.sendStatus(202); // acknowledge immediately, do the real work after responding

             try {
                   const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
                   // Look back 1 hour even though this runs every 15 min - safe overlap in case
      // a run gets skipped (e.g. the free-tier instance was mid-spin-up).
      const sinceUnix = Math.floor(Date.now() / 1000) - 60 * 60;

      const { data: formsResp } = await axios.get(
              `https://graph.facebook.com/v20.0/${PAGE_ID}/leadgen_forms`,
        { params: { access_token: accessToken, fields: 'id,name' } }
            );
                   const forms = formsResp.data || [];

      let imported = 0;
                   let checked = 0;
                   for (const form of forms) {
                           try {
                                     const { data: leadsResp } = await axios.get(
                                                 `https://graph.facebook.com/v20.0/${form.id}/leads`,
                                       {
                                                     params: {
                                                                     access_token: accessToken,
                                                                     fields: 'created_time,id,ad_name,form_id,field_data',
                                                                     filtering: JSON.stringify([
                                                                       { field: 'time_created', operator: 'GREATER_THAN', value: sinceUnix },
                                                                                     ]),
                                                     },
                                       }
                                               );
                                     for (const lead of leadsResp.data || []) {
                                                 checked++;
                                                 const fieldData = lead.field_data || [];
                                                 const phone = fieldData.find((f) => f.name.includes('phone'))?.values?.[0];
                                                 const name = fieldData.find((f) => f.name.includes('name'))?.values?.[0];
                                                 if (!phone) continue;
                                                 const result = await intakeLead({
                                                               phone,
                                                               name,
                                                               sourceTag: lead.ad_name || form.name || 'Auto-synced',
                                                 });
                                                 if (!result.skipped) imported++;
                                     }
                           } catch (formErr) {
                                     console.error(`sync-leads form ${form.id} error:`, formErr.response?.data || formErr.message);
                           }
                   }
                   console.log(`sync-leads: ${forms.length} form(s), ${checked} lead(s) checked, ${imported} imported`);
             } catch (err) {
                   console.error('sync-leads error:', err.response?.data || err.message);
             }
});

module.exports = router;
