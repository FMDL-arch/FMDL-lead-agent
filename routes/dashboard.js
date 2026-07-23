// routes/dashboard.js
// Password-protected dashboard: view all conversations, filter by project category,
// read full chat history, reply directly, pause/resume the AI, edit the
// category-specific reply guidance the AI follows, and manage portfolio PDFs.

const express = require('express');
const multer = require('multer');
const router = express.Router();
const db = require('../lib/db');
const whatsapp = require('../lib/whatsapp');
const config = require('../config');

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

const upload = multer({
storage: multer.memoryStorage(),
limits: { fileSize: 10 * 1024 * 1024 },
fileFilter: (req, file, cb) => {
if (file.mimetype !== 'application/pdf') {
return cb(new Error('Only PDF files are allowed.'));
}
cb(null, true);
},
});

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

function displayName(c) {
return c && c.name ? c.name : null;
}

function initials(nameOrPhone) {
const s = String(nameOrPhone || '').trim();
if (!s) return '?';
const parts = s.split(/\s+/).filter(Boolean);
if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Generic admin-page layout (login, reply rules, portfolio PDFs) - unchanged look.
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
input[type=text], input[type=password], input[type=file], textarea, select {
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
<a href="/dashboard/pdfs">Portfolio PDFs</a>
<a href="/dashboard/logout">Logout</a>
</nav>
<div class="wrap">${body}</div>
</body>
</html>
`;
}

// WhatsApp-style layout for the conversations screen: top nav (same as admin
// pages) + a two-pane app below it (sidebar list + main chat panel).
function chatLayout(title, sidebarHtml, mainHtml) {
return `
<html>
<head>
<title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
* { box-sizing: border-box; }
html, body { height: 100%; }
body { font-family: Arial, Helvetica, sans-serif; margin: 0; background: #f7f7f8; color: #111b21; }
nav { background: #1a1a1a; padding: 14px 20px; flex: none; }
nav a { color: #fff; text-decoration: none; margin-right: 20px; font-size: 14px; }
nav a:hover { text-decoration: underline; }
.app { display: flex; flex-direction: column; height: 100vh; }
.panes { flex: 1; display: flex; min-height: 0; }

/* Sidebar */
.sidebar { width: 320px; flex: none; background: #fff; border-right: 1px solid #e9edef; display: flex; flex-direction: column; }
.sidebar-header { padding: 12px; border-bottom: 1px solid #e9edef; flex: none; }
.sidebar-header select { width: 100%; padding: 6px; font-size: 13px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 8px; }
.sidebar-header input[type=text] { width: 100%; padding: 8px 10px; font-size: 13px; border: 1px solid #ddd; border-radius: 18px; background: #f0f2f5; }
.convo-count { font-size: 12px; color: #667781; padding: 6px 12px 0; flex: none; }
.convo-list { overflow-y: auto; flex: 1; }
.convo-item { display: flex; gap: 10px; padding: 10px 12px; text-decoration: none; color: inherit; border-bottom: 1px solid #f2f2f2; }
.convo-item:hover { background: #f5f6f6; }
.convo-item.active { background: #f0f2f5; }
.avatar { width: 42px; height: 42px; border-radius: 50%; background: #a3b0b8; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: bold; flex: none; }
.convo-info { flex: 1; min-width: 0; }
.convo-top { display: flex; justify-content: space-between; align-items: baseline; }
.convo-name { font-size: 14.5px; font-weight: 600; color: #111b21; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.convo-time { font-size: 11px; color: #667781; flex: none; margin-left: 6px; }
.convo-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 2px; }
.convo-preview { font-size: 13px; color: #667781; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
.convo-phone { font-size: 11.5px; color: #8a9aa3; }
.status-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; margin-left: 6px; }
.category-pill { display: inline-block; font-size: 10.5px; background: #e9edef; color: #444; border-radius: 10px; padding: 1px 7px; margin-top: 2px; }

/* Main chat panel */
.main { flex: 1; display: flex; flex-direction: column; background: #efeae2; min-width: 0; }
.chat-header { background: #f0f2f5; border-bottom: 1px solid #e9edef; padding: 10px 18px; display: flex; align-items: center; justify-content: space-between; flex: none; }
.chat-header .who { display: flex; align-items: center; gap: 12px; }
.chat-header .who-text .name { font-size: 15.5px; font-weight: 600; margin: 0; }
.chat-header .who-text .sub { font-size: 12.5px; color: #667781; margin: 0; }
.chat-header .actions { display: flex; align-items: center; gap: 10px; }
.chat-header .actions form { margin: 0; }
.chat-header button.small { padding: 6px 12px; font-size: 12.5px; background: #fff; color: #111b21; border: 1px solid #cfd4d6; }
.chat-header button.small:hover { background: #f0f0f0; }

.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: #667781; font-size: 15px; text-align: center; padding: 40px; }

.messages { flex: 1; overflow-y: auto; padding: 18px 6%; display: flex; flex-direction: column; gap: 4px; }
.bubble-row { display: flex; }
.bubble-row.in { justify-content: flex-start; }
.bubble-row.out { justify-content: flex-end; }
.bubble { max-width: 65%; padding: 7px 10px 8px; border-radius: 8px; font-size: 14.2px; line-height: 1.4; box-shadow: 0 1px 0.5px rgba(0,0,0,0.13); white-space: pre-wrap; word-wrap: break-word; }
.bubble.in { background: #ffffff; border-top-left-radius: 2px; }
.bubble.out { background: #d9fdd3; border-top-right-radius: 2px; }
.bubble .label { font-size: 11px; font-weight: 700; opacity: 0.55; margin-bottom: 2px; }

.composer { flex: none; background: #f0f2f5; padding: 10px 14px; border-top: 1px solid #e9edef; }
.composer .toolbar { display: flex; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
.composer .toolbar button { background: #fff; border: 1px solid #cfd4d6; color: #444; font-size: 12px; padding: 4px 9px; border-radius: 14px; cursor: pointer; }
.composer .toolbar button:hover { background: #e9edef; }
.composer .quick-replies { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.composer .quick-replies button { background: #fff; border: 1px solid #cfd4d6; color: #075e54; font-size: 11.5px; padding: 4px 9px; border-radius: 14px; cursor: pointer; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.composer .quick-replies button:hover { background: #e9edef; }
.composer-row { display: flex; gap: 8px; align-items: flex-end; }
.composer-row textarea { flex: 1; resize: none; border: none; border-radius: 20px; padding: 10px 16px; font-size: 14.5px; font-family: inherit; max-height: 120px; }
.composer-row button.send { background: #00a884; color: #fff; border: none; width: 42px; height: 42px; border-radius: 50%; font-size: 16px; cursor: pointer; flex: none; }
.composer-row button.send:hover { background: #029672; }
.composer form { margin: 0; }
.paused-banner { background: #fff3cd; color: #7a5b00; font-size: 12.5px; padding: 6px 14px; text-align: center; }
</style>
</head>
<body>
<div class="app">
<nav>
<a href="/dashboard">Conversations</a>
<a href="/dashboard/rules">Reply Rules</a>
<a href="/dashboard/pdfs">Portfolio PDFs</a>
<a href="/dashboard/logout">Logout</a>
</nav>
<div class="panes">
<div class="sidebar">${sidebarHtml}</div>
<div class="main">${mainHtml}</div>
</div>
</div>
<script>
function filterConvos(el) {
var q = el.value.toLowerCase();
document.querySelectorAll('.convo-item').forEach(function (item) {
var hay = item.getAttribute('data-search') || '';
item.style.display = hay.indexOf(q) === -1 ? 'none' : 'flex';
});
}
function wrapSelection(before, after) {
var ta = document.getElementById('replyBox');
if (!ta) return;
var start = ta.selectionStart, end = ta.selectionEnd;
var val = ta.value;
var selected = val.slice(start, end) || '';
ta.value = val.slice(0, start) + before + selected + after + val.slice(end);
ta.focus();
ta.selectionStart = start + before.length;
ta.selectionEnd = start + before.length + selected.length;
}
function insertQuickReply(text) {
var ta = document.getElementById('replyBox');
if (!ta) return;
ta.value = text;
ta.focus();
}
document.querySelectorAll('.qr-btn').forEach(function (btn) {
btn.addEventListener('click', function () {
insertQuickReply(btn.getAttribute('data-text') || '');
});
});
var msgs = document.querySelector('.messages');
if (msgs) { msgs.scrollTop = msgs.scrollHeight; }
</script>
</body>
</html>
`;
}

const QUICK_REPLIES = [
"Thanks for reaching out! Could you share a bit more about your project?",
"Happy to help - when's a good time for a quick call?",
"Sharing our portfolio PDF for this project type shortly.",
"Got it, our team will follow up with you soon.",
];

function sidebarHtml(conversations, rules, activePhone, filter) {
const labelFor = (cat) => rules.find((r) => r.category === cat)?.label || cat;
const options = rules
.map((r) => `<option value="${escapeHtml(r.category)}" ${filter === r.category ? 'selected' : ''}>${escapeHtml(r.label)}</option>`)
.join('');

const items = conversations.map((c) => {
const messages = c.messages || [];
const lastMessage = messages[messages.length - 1];
const preview = lastMessage ? escapeHtml(lastMessage.content).slice(0, 40) : '(no messages)';
const name = displayName(c);
const shownName = name ? escapeHtml(name) : escapeHtml(c.phone);
const active = c.phone === activePhone ? 'active' : '';
const statusColor = c.ai_paused ? '#8696a0' : '#25d366';
const updated = c.updated_at ? new Date(c.updated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const searchKey = `${(name || '').toLowerCase()} ${c.phone.toLowerCase()}`;
const category = c.project_category ? `<span class="category-pill">${escapeHtml(labelFor(c.project_category))}</span>` : '';

return `
<a class="convo-item ${active}" href="/dashboard/conversation/${encodeURIComponent(c.phone)}" data-search="${escapeHtml(searchKey)}">
<div class="avatar">${escapeHtml(initials(name || c.phone))}</div>
<div class="convo-info">
<div class="convo-top">
<span class="convo-name">${shownName}</span>
<span class="convo-time">${updated}</span>
</div>
<div class="convo-bottom">
<span class="convo-preview">${preview}</span>
<span class="status-dot" style="background:${statusColor}" title="${c.ai_paused ? 'AI paused' : 'AI active'}"></span>
</div>
${name ? `<div class="convo-phone">${escapeHtml(c.phone)}</div>` : ''}
${category}
</div>
</a>`;
}).join('');

return `
<div class="sidebar-header">
<form method="GET" action="/dashboard">
<select name="category" onchange="this.form.submit()">
<option value="">All categories</option>
${options}
</select>
</form>
<input type="text" placeholder="Search name or phone" oninput="filterConvos(this)" />
</div>
<div class="convo-count">${conversations.length} conversation(s)</div>
<div class="convo-list">
${items || '<p style="padding:16px;color:#667781;font-size:13px;">No conversations yet.</p>'}
</div>
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

// Main dashboard: WhatsApp-style list of all conversations (sidebar) with an
// empty-state main panel until one is selected.
router.get('/', async (req, res) => {
const [conversations, rules] = await Promise.all([db.getAllConversations(), db.getCategoryRules()]);
const filter = req.query.category || '';
const filtered = filter ? conversations.filter((c) => c.project_category === filter) : conversations;

const main = `
<div class="empty-state">Select a conversation on the left to view messages.</div>
`;

res.send(chatLayout('FMDL Lead Dashboard', sidebarHtml(filtered, rules, null, filter), main));
});

// Single conversation view: full history as chat bubbles, pause/resume, manual reply.
router.get('/conversation/:phone', async (req, res) => {
const conversations = await db.getAllConversations();
const convo = conversations.find((c) => c.phone === req.params.phone);
if (!convo) return res.status(404).send(layout('Not found', '<p>Conversation not found.</p>'));

const rules = await db.getCategoryRules();
const categoryLabel = convo.project_category
? (rules.find((r) => r.category === convo.project_category)?.label || convo.project_category)
: 'Uncategorized';

const name = displayName(convo);

const bubbles = (convo.messages || []).map((m) => {
const isLead = m.role === 'user';
return `
<div class="bubble-row ${isLead ? 'in' : 'out'}">
<div class="bubble ${isLead ? 'in' : 'out'}">
<div class="label">${isLead ? 'Lead' : 'Shipra / Team'}</div>
${escapeHtml(m.content)}
</div>
</div>`;
}).join('');

const quickReplyButtons = QUICK_REPLIES.map((q) =>
`<button type="button" class="qr-btn" data-text="${escapeHtml(q)}">${escapeHtml(q).slice(0, 42)}${q.length > 42 ? '…' : ''}</button>`
).join('');

const main = `
<div class="chat-header">
<div class="who">
<div class="avatar" style="background:#a3b0b8;">${escapeHtml(initials(name || convo.phone))}</div>
<div class="who-text">
<p class="name">${name ? escapeHtml(name) : escapeHtml(convo.phone)}</p>
<p class="sub">${escapeHtml(convo.phone)} &middot; ${escapeHtml(categoryLabel)} &middot; ${convo.ai_paused ? 'AI paused' : 'AI active'}${convo.lead_status ? ' &middot; ' + escapeHtml(convo.lead_status) : ''}</p>
</div>
</div>
<div class="actions">
<form method="POST" action="/dashboard/toggle-pause">
<input type="hidden" name="phone" value="${escapeHtml(convo.phone)}" />
<input type="hidden" name="paused" value="${convo.ai_paused ? 'false' : 'true'}" />
<button type="submit" class="small">${convo.ai_paused ? 'Resume AI' : 'Pause AI'}</button>
</form>
</div>
</div>
${convo.ai_paused ? '<div class="paused-banner">AI is paused for this lead - replies here are sent as the team.</div>' : ''}
<div class="messages">
${bubbles || '<p style="color:#667781;">No messages yet.</p>'}
</div>
<div class="composer">
<div class="toolbar">
<button type="button" onclick="wrapSelection('*','*')"><b>B</b></button>
<button type="button" onclick="wrapSelection('_','_')"><i>I</i></button>
<button type="button" onclick="wrapSelection('- ','')">&bull; List</button>
</div>
<div class="quick-replies">${quickReplyButtons}</div>
<form method="POST" action="/dashboard/send-reply">
<input type="hidden" name="phone" value="${escapeHtml(convo.phone)}" />
<div class="composer-row">
<textarea id="replyBox" name="message" rows="1" placeholder="Type a reply to send on WhatsApp..." required></textarea>
<button type="submit" class="send" title="Send">&#10148;</button>
</div>
</form>
</div>
`;

res.send(chatLayout(`Conversation - ${name || convo.phone}`, sidebarHtml(conversations, rules, convo.phone, ''), main));
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

// --- Portfolio PDFs admin ---
// Lets the team upload/replace the profile PDF Shipra sends for each project
// category, without needing a developer. Max 10MB per file, PDF only.

router.get('/pdfs', async (req, res) => {
const pdfs = await db.getPortfolioPdfs();
const errorMsg = req.query.error ? `<p style="color:red;">${escapeHtml(req.query.error)}</p>` : '';

const cards = pdfs.map((p) => `
<div class="card">
<h3>${escapeHtml(p.label)}</h3>
<p style="font-size:13px;color:#666;">
${p.file_url
? `Current file: <a href="${escapeHtml(p.file_url)}" target="_blank">${escapeHtml(p.filename || 'view PDF')}</a>${p.uploaded_at ? ' &middot; uploaded ' + new Date(p.uploaded_at).toLocaleString() : ''}`
: 'No PDF uploaded yet.'}
</p>
<form method="POST" action="/dashboard/pdfs/${encodeURIComponent(p.slug)}" enctype="multipart/form-data">
<input type="file" name="pdf" accept="application/pdf" required />
<button type="submit">${p.file_url ? 'Replace PDF' : 'Upload PDF'}</button>
</form>
</div>
`).join('');

res.send(layout('Portfolio PDFs', `
<h1>Portfolio PDFs</h1>
<p>Upload the latest profile PDF for each project type here. Shipra automatically sends the matching PDF to a lead once their project type is known - no code changes needed. Max 10MB per file, PDF only.</p>
${errorMsg}
${cards}
`));
});

router.post('/pdfs/:slug', (req, res) => {
upload.single('pdf')(req, res, async (err) => {
if (err) {
const message = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large (max 10MB).' : err.message;
return res.redirect(`/dashboard/pdfs?error=${encodeURIComponent(message)}`);
}
if (!req.file) {
return res.redirect(`/dashboard/pdfs?error=${encodeURIComponent('No file selected.')}`);
}
try {
await db.uploadPortfolioPdf(req.params.slug, req.file.buffer, req.file.originalname, req.file.mimetype);
} catch (e) {
return res.redirect(`/dashboard/pdfs?error=${encodeURIComponent('Upload failed. Please try again.')}`);
}
res.redirect('/dashboard/pdfs');
});
});

module.exports = router;
