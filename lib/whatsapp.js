// lib/whatsapp.js
// Sends messages using Meta's WhatsApp Cloud API directly (no paid BSP needed).

const axios = require('axios');

const GRAPH_URL = 'https://graph.facebook.com/v20.0';

async function sendText(phoneNumberId, to, text) {
  return axios.post(
    `${GRAPH_URL}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    },
    { headers: authHeaders() }
  );
}

async function sendFile(phoneNumberId, to, fileUrl, caption) {
  return axios.post(
    `${GRAPH_URL}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { link: fileUrl, caption },
    },
    { headers: authHeaders() }
  );
}

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

module.exports = { sendText, sendFile };
