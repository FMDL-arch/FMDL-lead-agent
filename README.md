# FMDL Lead Agent

A simple system, no Zapier, no paid tools. One WhatsApp number, one job:

New Meta Lead Ads lead comes in → WhatsApp opens the conversation → agent asks a few qualifying
questions (project type, budget, location, timeline) → if qualified, sends a Cal.com booking link.

## What you need to set up (one-time), in order

1. **A WhatsApp Business Account (WABA)** in Meta Business Manager: business.facebook.com > WhatsApp Accounts. Add your FMDL phone number to it.
2. **Claude API key** — console.anthropic.com > API Keys. Pay-as-you-go, very cheap for this volume.
3. **Supabase account (free)** — supabase.com > New Project. Run everything in `supabase-setup.sql` in the SQL Editor. Grab your Project URL and service_role key from Settings > API.
4. **Cal.com account (free)** — set up one event type ("Intro Call"), copy its public booking link.
5. **Render.com** (free tier to start) — create account > New Web Service > connect this repo > it auto-detects Node.js > add all your `.env` values under the Environment tab > Deploy.

## Connect the webhooks

- In Meta Developer App > WhatsApp > Configuration: set Webhook URL to `https://your-render-url.com/webhook/whatsapp`, verify token = whatever you put in `META_VERIFY_TOKEN`. Subscribe to the `messages` field.
- In Meta Developer App > Webhooks > Page: set URL to `https://your-render-url.com/webhook/meta-leads`, same verify token. Subscribe to the `leadgen` field, and connect it to your Meta Lead Ads Page.

## Team dashboard

Visit `https://your-render-url.com/dashboard?key=YOUR_DASHBOARD_PASSWORD` (set `DASHBOARD_PASSWORD` in Render) to see every conversation and pause/resume the AI per lead for manual takeover.

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
- Cal.com booking link sent to qualified leads
- Team dashboard to view conversations and pause/resume the AI

## You still need to

- Get your FMDL WhatsApp number approved by Meta
- Adjust the wording in `prompts/fmdl-agent.js` to sound exactly how you want
- Publish your Meta Lead Ad pointing at the correct WhatsApp number

## If you get stuck

Paste any error message you see and I'll help debug it.
