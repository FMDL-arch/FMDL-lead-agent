// lib/whatsapp.js
// Sends messages using Meta's WhatsApp Cloud API directly (no paid BSP needed).

const axios = require('axios');
const categories = require('./categories');

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

// Sends the 8 project categories as a tappable WhatsApp list message. The lead can
// tap a row, or (handled in routes/whatsapp.js) type the row number 1-8 instead.
async function sendCategoryList(phoneNumberId, to) {
  return axios.post(
    `${GRAPH_URL}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: 'FMDL Architects' },
        body: { text: "Tap one (or just reply with the number) - what's this project?" },
        footer: { text: 'Choose one' },
        action: {
          button: 'Select type',
          sections: [
            {
              title: 'Project type',
              rows: categories.map((c) => ({ id: c.id, title: c.title, description: c.description })),
            },
          ],
        },
      },
    },
    { headers: authHeaders() }
  );
}

// Sends a document (e.g. a portfolio PDF) by public link. `link` must be a URL
// WhatsApp can fetch - e.g. a file hosted on this same Render service.
async function sendDocument(phoneNumberId, to, link, filename, caption) {
  return axios.post(
    `${GRAPH_URL}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { link, filename, caption },
    },
    { headers: authHeaders() }
  );
}

// Sends a pre-approved WhatsApp template message. Unlike sendText, this works
// even when there's no open conversation window (the lead has never messaged
// us, or it's been more than 24h since the lead/last message) - Meta allows
// it because the content was reviewed and approved in advance in WhatsApp
// Manager. `params` are plain strings filled into the template's {{1}}, {{2}}...
// slots in order, in the body component.
async function sendTemplate(phoneNumberId, to, templateName, languageCode, params = []) {
  const components = params.length
    ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }]
    : [];
  return axios.post(
    `${GRAPH_URL}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
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

module.exports = { sendText, sendCategoryList, sendDocument, sendTemplate };
