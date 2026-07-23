// server.js
// This is the server for the FMDL lead-qualification agent.
// It listens for: (1) Meta Lead Ads webhooks, (2) WhatsApp message webhooks.

require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());

const metaLeadsRoute = require('./routes/metaLeads');
const whatsappRoute = require('./routes/whatsapp');
const dashboardRoute = require('./routes/dashboard');
const { startJobReminderScheduler } = require('./lib/jobReminders');

// Meta Lead Ads sends new FMDL leads here
app.use('/webhook/meta-leads', metaLeadsRoute);

// WhatsApp Cloud API sends incoming messages here
app.use('/webhook/whatsapp', whatsappRoute);

// Team-facing dashboard to read conversations and pause/resume the AI per lead.
// Needs urlencoded parsing for the pause/resume button's form submission.
app.use(express.urlencoded({ extended: true }));
app.use('/dashboard', dashboardRoute);

app.get('/', (req, res) => res.send('Lead agent server is running.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Background job: nudges job-seeker leads at 2h/12h if they haven't confirmed
  // filling out the application form yet.
  startJobReminderScheduler();
});
