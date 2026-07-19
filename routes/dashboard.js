// routes/dashboard.js
// Password-protected dashboard: view all conversations, filter by project category,
// read full chat history, reply directly, pause/resume the AI, and edit the
// category-specific reply guidance the AI follows.

const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const whatsapp = require('../lib/whatsapp');
const config = require('../config');

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = decodeURIComponent(pair.slice(idx + 1).trim());
    cookies[key] = val;
  });
  return cookies;
}

function requireLogin(req, res, next) {
  const cookies = parseCookies(req);
  if (!DASHBOARD_PASSWORD || cookies.dash_auth !== DASHBOARD_PASSWORD) {
    return res.redirect('/dashboard/login');
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

function layout(title, body) {
  return `
  <html>
  <head>
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
  body { font-family: Arial, sans-serif; margin: 0; background: #f7f7f8; color: #222; }
  nav { background: #1a1a1a; padding: 14px 20px; }
  nav a { color: #fff; text-decoration: none; margin-right: 20px; font-size: 14px; }
  nav a:hover { text-decoration: underline; }
  .wrap { padding: 20px; max-width: 1000px; margin: 0 auto; }
  table { border-collapse: collapse; width: 100%; background: #fff; }
  td, th { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 14px; }
  th { background: #eee; }
  input[type=text], input[type=password], textarea, select {
  width: 100%; padding: 8px; font-size: 14px; box-sizing: border-box;
  border: 1px solid #ccc; border-radius: 4px; margin-bottom: 10px;
  }
  button { background: #1a1a1a; color: #fff; border: none; padding: 8px 16px;
  border-radius: 4px; cursor: pointer; font-size: 14px; }
  button:hover { background: #333; }
  .card { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin-bottom: 16px; }
  </style>
  </head>
  <body>
  <nav>
  <a href="/dashboard">Conversations</a>
  <a href="/dashboard/rules">Reply Rules</a>
  <a href="/dashboard/logout">Logout</a>
  </nav>
  <div class="wrap">${body}</div>
  </body>
  </html>
  `;
}

// --- Login (not behind requireLogin) ---

router.get('/login', (req, res) => {
  const error = req.query.error ? '<p style="color:red;">Wrong password.</p>' : '';
  res.send(`
  <html>
  <head>
  <title>FMDL Dashboard Login</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
  body { font-family: Arial, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#f7f7f8; }
  form { background:#fff; padding:24px; border-radius:8px; border:1px solid #ddd; width:280px; }
  input { width:100%; padding:8px; margin-bottom:12px; box-sizing:border-box; border:1px solid #ccc; border-radius:4px; }
  button { width:100%; padding:8px; background:#1a1a1a; color:#fff; border:none; border-radius:4px; cursor:pointer; }
  </style>
  </head>
  <body>
  <form method="POST" action="/dashboard/login">
  <h2>FMDL Dashboard</h2>
  ${error}
  <input type="password" name="password" placeholder="Password" autofocus required />
  <button type="submit">Log in</button>
  </form>
  </body>
  </html>
  `);
});

router.post('/login', (req, res) => {
  if (DASHBOARD_PASSWORD && req.body.password === DASHBOARD_PASSWORD) {
    res.setHeader(
      'Set-Cookie',
      `dash_auth=${encodeURIComponent(DASHBOARD_PASSWORD)}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`
      );
    return res.redirect('/dashboard');
  }
  res.redirect('/dashboard/login?error=1');
});

router.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'dash_auth=; HttpOnly; Path=/; Max-Age=0');
  res.redirect('/dashboard/login');
});

// --- Everything below requires login ---

router.use(requireLogin);

// Main dashboard: list of all conversations, optional category filter
router.get('/', async (req, res) => {
  const [conversations, rules] = await Promise.all([db.getAllConversations(), db.getCategoryRules()]);
  const labelFor = (cat) => rules.find((r) => r.category === cat)?.label || cat;
  const filter = req.query.category || '';
  const filtered = filter ? conversations.filter((c) => c.project_category === filter) : conversations;

           const options = rules
  .map((r) => `<option value="${escapeHtml(r.category)}" ${filter === r.category ? 'selected' : ''}>${escapeHtml(r.label)}</option>`)
  .join('');

           const rows = filtered.map((c) => {
             const messages = c.messages || [];
             const lastMessage = messages[messages.length - 1];
             const preview = lastMessage ? escapeHtml(lastMessage.content).slice(0, 70) : '(no messages)';
             const pausedLabel = c.ai_paused ? '&#9208; Paused' : '&#9654; AI active';
             const updated = c.updated_at ? new Date(c.updated_at).toLocaleString() : '';
             const category = c.project_category ? escapeHtml(labelFor(c.project_category)) : '<em>Uncategorized</em>';
             return `
             <tr>
             <td>${escapeHtml(c.phone)}</td>
             <td>${category}</td>
             <td>${escapeHtml(c.lead_status || '')}</td>
             <td>${pausedLabel}</td>
             <td>${preview}</td>
             <td>${updated}</td>
             <td><a href="/dashboard/conversation/${encodeURIComponent(c.phone)}">View</a></td>
             </tr>`;
           }).join('');

           res.send(layout('FMDL Lead Dashboard', `
           <h1>Conversations</h1>
           <form method="GET" action="/dashboard" style="max-width:300px;">
           <select name="category" onchange="this.form.submit()">
           <option value="">All categories</option>
           ${options}
           </select>
           </form>
           <p>${filtered.length} of ${conversations.length} conversation(s)</p>
           <table>
           <tr><th>Phone</th><th>Category</th><th>Status</th><th>AI</th><th>Last message</th><th>Updated</th><th></th></tr>
           ${rows || '<tr><td colspan="7">No conversations yet.</td></tr>'}
           </table>
           `));
});

// Single conversation view: full history, pause/resume, manual reply
router.get('/conversation/:phone', async (req, res) => {
  const conversations = await db.getAllConversations();
  const convo = conversations.find((c) => c.phone === req.params.phone);
  if (!convo) return res.status(404).send(layout('Not found', '<p>Conversation not found.</p>'));

           const rules = await db.getCategoryRules();
  const categoryLabel = convo.project_category
  ? (rules.find((r) => r.category === convo.project_category)?.label || convo.project_category)
    : 'Uncategorized';

           const messages = (convo.messages || []).map((m) => `
           <div style="margin-bottom:10px; padding:10px; border-radius:6px; background:${m.role === 'user' ? '#e8f0fe' : '#f1f1f1'};">
           <strong>${m.role === 'user' ? 'Lead' : 'AI/Team'}:</strong> ${escapeHtml(m.content)}
           </div>`).join('');

           res.send(layout(`Conversation - ${convo.phone}`, `
           <p><a href="/dashboard">&larr; Back to all conversations</a></p>
           <h1>${escapeHtml(convo.phone)}</h1>
           <p>Category: <strong>${escapeHtml(categoryLabel)}</strong> | Status: ${escapeHtml(convo.lead_status || '')} | AI is currently ${convo.ai_paused ? 'PAUSED' : 'ACTIVE'}</p>
           <form method="POST" action="/dashboard/toggle-pause">
           <input type="hidden" name="phone" value="${escapeHtml(convo.phone)}" />
           <input type="hidden" name="paused" value="${convo.ai_paused ? 'false' : 'true'}" />
           <button type="submit">${convo.ai_paused ? 'Resume AI' : 'Pause AI (take over manually)'}</button>
           </form>
           <hr/>
           <div>${messages || '<p>No messages yet.</p>'}</div>
           <hr/>
           <h3>Send a message as the team</h3>
           <form method="POST" action="/dashboard/send-reply">
           <input type="hidden" name="phone" value="${escapeHtml(convo.phone)}" />
           <input type="text" name="message" placeholder="Type a reply to send on WhatsApp..." required />
           <button type="submit">Send</button>
           </form>
           <p style="font-size:12px;color:#666;">Sending a message here automatically pauses the AI for this lead.</p>
           `));
});

// Pause/resume handler
router.post('/toggle-pause', async (req, res) => {
  const { phone, paused } = req.body;
  await db.setAiPaused(phone, paused === 'true');
  res.redirect(`/dashboard/conversation/${encodeURIComponent(phone)}`);
});

// Manual reply from the dashboard
router.post('/send-reply', async (req, res) => {
  const { phone, message } = req.body;
  try {
    await whatsapp.sendText(config.numbers.FMDL_PHONE_NUMBER_ID, phone, message);
    const existing = await db.getConversation(phone);
    const history = existing?.messages || [];
    history.push({ role: 'assistant', content: message });
    await db.saveConversation(phone, 'fmdl', history, {
      lead_status: existing?.lead_status || 'new',
      project_category: existing?.project_category || null,
      ai_paused: true,
    });
  } catch (err) {
    console.error('send-reply error:', err.response?.data || err.message);
  }
  res.redirect(`/dashboard/conversation/${encodeURIComponent(phone)}`);
});

// --- Category reply-rules admin ---

router.get('/rules', async (req, res) => {
  const rules = await db.getCategoryRules();
  const cards = rules.map((r) => `
  <div class="card">
  <form method="POST" action="/dashboard/rules/${encodeURIComponent(r.category)}">
  <h3>${escapeHtml(r.label)}</h3>
  <textarea name="instructions" rows="4" placeholder="What should the AI emphasize or say for this category? Leave blank for default behavior.">${escapeHtml(r.instructions || '')}</textarea>
  <button type="submit">Save</button>
  </form>
  </div>
  `).join('');

           res.send(layout('Reply Rules', `
           <h1>Category Reply Rules</h1>
           <p>These instructions are added to the AI's guidance once a lead's project category is known. Leave blank to use the default agent behavior only.</p>
           ${cards}
           `));
});

router.post('/rules/:category', async (req, res) => {
  await db.upsertCategoryRule(req.params.category, req.body.instructions || '');
  res.redirect('/dashboard/rules');
});

module.exports = router;
