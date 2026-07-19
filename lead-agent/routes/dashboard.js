// routes/dashboard.js
// A simple team-facing dashboard. Protected by a password (set in .env as DASHBOARD_PASSWORD).
// No separate login system - just one shared password for the team, kept simple on purpose.

const express = require('express');
const router = express.Router();
const db = require('../lib/db');

// --- Simple password gate ---
function checkPassword(req, res, next) {
  const suppliedPassword = req.query.key || req.body.key;
  if (suppliedPassword !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).send(`
      <html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
        <h2>FMDL Lead Dashboard</h2>
        <form method="GET">
          <input type="password" name="key" placeholder="Enter dashboard password" style="padding:8px; font-size:16px;" />
          <button type="submit" style="padding:8px 16px; font-size:16px;">Enter</button>
        </form>
      </body></html>
    `);
  }
  next();
}

router.use(checkPassword);

// --- Main dashboard: list all conversations ---
router.get('/', async (req, res) => {
  try {
    const conversations = await db.getAllConversations();
    const key = req.query.key;

    const rows = conversations
      .map((c) => {
        const messages = c.messages || [];
        const lastMsg = messages[messages.length - 1];
        const lastText = lastMsg ? lastMsg.content.slice(0, 80) : '(no messages)';
        const statusBadge = badgeFor(c.lead_status);
        const pausedBadge = c.ai_paused
          ? '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:4px;font-size:12px;">AI PAUSED</span>'
          : '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;font-size:12px;">AI ACTIVE</span>';

        return `
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:12px;"><a href="/dashboard/chat/${c.phone}?key=${key}" style="color:#2563eb;text-decoration:none;font-weight:600;">${c.phone}</a></td>
            <td style="padding:12px;">${c.agent_type}</td>
            <td style="padding:12px;">${statusBadge}</td>
            <td style="padding:12px;">${pausedBadge}</td>
            <td style="padding:12px;color:#666;font-size:14px;">${escapeHtml(lastText)}...</td>
            <td style="padding:12px;color:#999;font-size:12px;">${timeAgo(c.updated_at)}</td>
          </tr>
        `;
      })
      .join('');

    res.send(`
      <html>
      <head>
        <title>FMDL Lead Dashboard</title>
        <meta http-equiv="refresh" content="30">
        <style>
          body { font-family: -apple-system, sans-serif; margin: 0; background: #f9fafb; }
          .header { background: white; padding: 20px 30px; border-bottom: 1px solid #e5e7eb; }
          table { width: 100%; border-collapse: collapse; background: white; }
          th { text-align: left; padding: 12px; background: #f3f4f6; font-size: 13px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2 style="margin:0;">FMDL Lead Conversations</h2>
          <p style="color:#666;margin:4px 0 0;">Auto-refreshes every 30s. ${conversations.length} total conversations.</p>
        </div>
        <table>
          <thead><tr>
            <th>Phone</th><th>Agent</th><th>Status</th><th>AI</th><th>Last message</th><th>Updated</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="6" style="padding:20px;text-align:center;color:#999;">No conversations yet</td></tr>'}</tbody>
        </table>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Error loading dashboard: ' + err.message);
  }
});

// --- Individual chat thread view ---
router.get('/chat/:phone', async (req, res) => {
  try {
    const key = req.query.key;
    const convo = await db.getConversation(req.params.phone);
    if (!convo) return res.status(404).send('Conversation not found');

    const messages = convo.messages || [];
    const bubbles = messages
      .map((m) => {
        const isUser = m.role === 'user';
        return `
          <div style="display:flex; justify-content:${isUser ? 'flex-start' : 'flex-end'}; margin:8px 0;">
            <div style="max-width:60%; padding:10px 14px; border-radius:12px; background:${isUser ? '#f3f4f6' : '#dcfce7'};">
              <div style="font-size:15px; white-space:pre-wrap;">${escapeHtml(m.content)}</div>
            </div>
          </div>
        `;
      })
      .join('');

    const pauseAction = convo.ai_paused ? 'resume' : 'pause';
    const pauseLabel = convo.ai_paused ? 'Resume AI' : 'Pause AI (take over manually)';
    const pauseColor = convo.ai_paused ? '#16a34a' : '#dc2626';

    res.send(`
      <html>
      <head>
        <title>Chat with ${convo.phone}</title>
        <style>body { font-family: -apple-system, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background: #f9fafb; }</style>
      </head>
      <body>
        <a href="/dashboard?key=${key}" style="color:#2563eb;text-decoration:none;">&larr; Back to all conversations</a>
        <h2>${convo.phone} <span style="font-size:14px;color:#666;">(${convo.agent_type})</span></h2>
        <p><strong>Status:</strong> ${convo.lead_status || 'new'}</p>
        <form method="POST" action="/dashboard/toggle-pause/${convo.phone}?key=${key}" style="margin-bottom:20px;">
          <button type="submit" style="background:${pauseColor}; color:white; border:none; padding:10px 20px; border-radius:6px; font-size:14px; cursor:pointer;">${pauseLabel}</button>
        </form>
        <div style="background:white; padding:20px; border-radius:8px;">
          ${bubbles || '<p style="color:#999;">No messages yet</p>'}
        </div>
        <p style="color:#999; font-size:13px; margin-top:20px;">To reply manually, message this number directly from your phone's WhatsApp (FMDL or Products number). Pausing AI here just stops the bot from auto-replying — it doesn't send messages for you.</p>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Error loading chat: ' + err.message);
  }
});

// --- Toggle pause/resume ---
router.post('/toggle-pause/:phone', async (req, res) => {
  const key = req.query.key;
  const convo = await db.getConversation(req.params.phone);
  await db.setAiPaused(req.params.phone, !convo?.ai_paused);
  res.redirect(`/dashboard/chat/${req.params.phone}?key=${key}`);
});

// --- Helpers ---
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function badgeFor(status) {
  const colors = {
    new: '#e0e7ff',
    hot: '#fee2e2',
    meeting_offered: '#fef3c7',
    meeting_booked: '#dcfce7',
    cold: '#f3f4f6',
  };
  const bg = colors[status] || '#f3f4f6';
  return `<span style="background:${bg}; padding:2px 8px; border-radius:4px; font-size:12px;">${status || 'new'}</span>`;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

module.exports = router;
