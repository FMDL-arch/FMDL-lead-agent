# FMDL Lead Agent

A simple system, no Zapier, no paid tools. One WhatsApp number, one job:

New Meta Lead Ads lead comes in -> WhatsApp opens the conversation -> agent asks a few qualifying
questions (project type, budget, location, timeline) -> if qualified, sends a Cal.com booking link.

## What you need to set up (one-time), in order

1. **A WhatsApp Business Account (WABA)** in Meta Business Manager: business.facebook.com > WhatsApp Accounts. Add your FMDL phone number to it.
2. **Claude API key** -- console.anthropic.com > API Keys. Pay-as-you-go, very cheap for this volume.
3. **Supabase account (free)** -- supabase.com > New Project. Run everything in `supabase-setup.sql` in the SQL Editor. Grab your Project URL and service_role key from Settings > API.
4. **Cal.com account (free)** -- set up one event type ("Intro Call"), copy its public booking link.
5. **Render.com** (free tier to start) -- create account > New Web Service > connect this repo > it auto-detects Node.js > add all your `.env` values under the Environment tab > Deploy. Also set `DASHBOARD_PASSWORD` here -- this is the login password for the team dashboard.

## Connect the webhooks

- In Meta Developer App > WhatsApp > Configuration: set Webhook URL to `https://your-render-url.com/webhook/whatsapp`, verify token = whatever you put in `META_VERIFY_TOKEN`. Subscribe to the `messages` field.
- In Meta Developer App > Webhooks > Page: set URL to `https://your-render-url.com/webhook/meta-leads`, same verify token. Subscribe to the `leadgen` field, and connect it to your Meta Lead Ads Page.

## Team dashboard

Visit `https://your-render-url.com/dashboard/login` and log in with the password you set as `DASHBOARD_PASSWORD` in Render. The old `?key=` URL no longer works -- use the login page instead.

Once logged in:

- **Conversations** (`/dashboard`) -- every lead, filterable by project category, showing status, whether the AI is paused, and a preview of the last message. Click "View" to open one.
- **Conversation view** -- full chat history, a button to pause the AI (so your team can take over manually) or resume it, and a box to send a reply directly on WhatsApp as the team. Sending a reply automatically pauses the AI for that lead so it doesn't talk over you.
- **Reply Rules** (`/dashboard/rules`) -- one card per project category (Architecture Residence, Interior Residence, Architecture Hospital, Interior Hospital, Architecture Temple/Public, Interior Office, Interior SPA, and a fallback "Other"). Type instructions in a box and save -- those instructions get added to the AI's guidance automatically once a lead's category is known. Leave blank to use default behavior.

The AI classifies each lead into one of these categories on its own during the conversation and tags the conversation accordingly, so review and rule-editing get easier over time as more chats come in.

## Running it locally to test first

```
npm install
cp .env.example .env
# fill in .env with your real values
npm start
```

To test webhooks locally before deploying, use a tool like ngrok to get a temporary public URL pointing at your laptop.

## What's already built

- Receiving leads from Meta, opening a WhatsApp conversation automatically
- Claude-powered qualification conversation, remembering chat history
- Automatic project-category classification (8 categories) with per-category reply guidance you control
- Cal.com booking link sent to qualified leads
- Team dashboard with login, category filtering, manual reply, and pause/resume

## You still need to

- Get your FMDL WhatsApp number approved by Meta
- Adjust the wording in `prompts/fmdl-agent.js` to sound exactly how you want
- Fill in reply rules per category on `/dashboard/rules` as you learn what works
- Publish your Meta Lead Ad pointing at the correct WhatsApp number

## If you get stuck

Paste any error message you see and I'll help debug it.
