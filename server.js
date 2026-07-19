// server.js
// This is the ONE server that runs both agents.
// It listens for: (1) Meta Lead Ads webhooks, (2) WhatsApp message webhooks, (3) Razorpay payment webhooks.

require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());

const metaLeadsRoute = require('./routes/metaLeads');
const whatsappRoute = require('./routes/whatsapp');
const razorpayRoute = require('./routes/razorpay');
const dashboardRoute = require('./routes/dashboard');
const { startCrossSellScheduler } = require('./lib/scheduler');

// Meta Lead Ads sends new FMDL leads here
app.use('/webhook/meta-leads', metaLeadsRoute);

// WhatsApp Cloud API sends incoming messages here (BOTH numbers point to this same route -
// we tell them apart using the "phone_number_id" inside the payload, see routes/whatsapp.js)
app.use('/webhook/whatsapp', whatsappRoute);

// Razorpay sends "payment successful" events here (for digital products)
app.use('/webhook/razorpay', razorpayRoute);

// Team-facing dashboard to read conversations and pause/resume the AI per lead.
// Needs urlencoded parsing for the pause/resume button's form submission.
app.use(express.urlencoded({ extended: true }));
app.use('/dashboard', dashboardRoute);

app.get('/', (req, res) => res.send('Lead agent server is running.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startCrossSellScheduler(); // starts the "check in every 2 days" job
});
