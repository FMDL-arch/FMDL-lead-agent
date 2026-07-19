// routes/dashboard.js
// Password-protected dashboard: view all conversations, read full chat history,
// and pause/resume the AI per lead so a human can take over manually.
// Open it at: https://YOUR-APP.onrender.com/dashboard?key=YOUR_DASHBOARD_PASSWORD

const express = require('express');
const router = express.Router();
const db = require('../lib/db');

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

function checkPassword(req, res, next) {
  const key = req.query.key || req.body.key;
  if (!DASHBOARD_PASSWORD || key !== DASHBOARD_PASSWORD) {
    return res.status(401).send('Not authorized. Add ?key=YOUR_PASSWORD to the URL.');
  }
  next();
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

router.use(checkPassword);

// Main dashboard: list of all conversations
router.get('/', async (req, res) => {
  const key = req.query.key;
  const conversations = await db.getAllConversations();

  const rows = conversations.map((c) => {
    const messages = c.messages || [];
    const lastMessage = messages[messages.length - 1];
    const preview = lastMessage ? escapeHtml(lastMessage.content).slice(0, 80) : '(no messages)';
    const pausedLabel = c.ai_paused ? '&#9208; Paused' : '&#9654; AI active';
    const updated = c.updated_at ? new Date(c.updated_at).toLocaleString() : '';
    return `
      <tr>
        <td>${escapeHtml(c.phone)}</td>
        <td>${escapeHtml(c.agent_type)}</td>
        <td>${escapeHtml(c.lead_status || '')}</td>
        <td>${pausedLabel}</td>
        <td>${preview}</td>
        <td>${updated}</td>
        <td><a href="/dashboard/conversation/${encodeURIComponent(c.phone)}?key=${encodeURIComponent(key)}">View</a></td>
      </tr>`;
  }).join('');

  res.send(`
    <html>
      <head>
        <title>FMDL Lead Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          table { border-collapse: collapse; width: 100%; }
          td, th { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 14px; }
          th { background: #f4f4f4; }
        </style>
      </head>
      <body>
        <h1>FMDL Lead Dashboard</h1>
        <p>${conversations.length} conversation(s)</p>
        <table>
          <tr><th>Phone</th><th>Agent</th><th>Status</th><th>AI</th><th>Last message</th><th>Updated</th><th></th></tr>
          ${rows || '<tr><td colspan="7">No conversations yet.</td></tr>'}
        </table>
      </body>
    </html>
  `);
});

// Single conversation view + pause/resume button
router.get('/conversation/:phone', async (req, res) => {
  const key = req.query.key;
  const conversations = await db.getAllConversations();
  const convo = conversations.find((c) => c.phone === req.params.phone);
  if (!convo) return res.status(404).send('Conversation not found.');

  const messages = (convo.messages || []).map((m) => `
    <div style="margin-bottom:10px; padding:10px; border-radius:6px; background:${m.role === 'user' ? '#e8f0fe' : '#f1f1f1'};">
      <strong>${m.role === 'user' ? 'Lead' : 'AI'}:</strong> ${escapeHtml(m.content)}
    </div>`).join('');

  res.send(`
    <html>
      <head>
        <title>Conversation - ${escapeHtml(convo.phone)}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>body { font-family: Arial, sans-serif; margin: 20px; }</style>
      </head>
      <body>
        <p><a href="/dashboard?key=${encodeURIComponent(key)}">&larr; Back to all conversations</a></p>
        <h1>${escapeHtml(convo.phone)}</h1>
        <p>Agent: ${escapeHtml(convo.agent_type)} | Status: ${escapeHtml(convo.lead_status || '')} | AI is currently ${convo.ai_paused ? 'PAUSED' : 'ACTIVE'}</p>
        <form method="POST" action="/dashboard/toggle-pause?key=${encodeURIComponent(key)}">
          <input type="hidden" name="phone" value="${escapeHtml(convo.phone)}" />
          <input type="hidden" name="paused" value="${convo.ai_paused ? 'false' : 'true'}" />
          <button type="submit">${convo.ai_paused ? 'Resume AI' : 'Pause AI (take over manually)'}</button>
        </form>
        <hr/>
        ${messages || '<p>No messages yet.</p>'}
      </body>
    </html>
  `);
});

// Pause/resume handler
router.post('/toggle-pause', async (req, res) => {
  const key = req.query.key;
  const { phone, paused } = req.body;
  await db.setAiPaused(phone, paused === 'true');
  res.redirect(`/dashboard/conversation/${encodeURIComponent(phone)}?key=${encodeURIComponent(key)}`);
});

module.exports = router;
