# FMDL / Archipreneur Lead Agent

A simple system, no Zapier, no paid tools. Two WhatsApp numbers, two jobs:

- **Number 1 (FMDL):** New Meta Lead Ads lead comes in → WhatsApp opens the conversation →
  agent asks a few questions → if qualified, sends a booking link.
- **Number 2 (Digital Products):** Someone pays via your existing Razorpay link → agent
  instantly sends the file on WhatsApp → checks in every 2 days → offers the next product.

## What you need to set up (one-time), in order

1. **A WhatsApp Business Account (WABA)** in Meta Business Manager, with your Meta account:
   business.facebook.com > WhatsApp Accounts. Add TWO phone numbers to it — one for FMDL,
   one for Archipreneur/products. (These can be new numbers, don't need to be your personal one.)

2. **Claude API key** — console.anthropic.com > API Keys. This is pay-as-you-go, very cheap
   for this volume (a few paisa per conversation turn).

3. **Supabase account** (free) — supabase.com > New Project. Once created, go to the
   SQL Editor and run everything in `supabase-setup.sql` (included in this folder). Then
   grab your Project URL and `service_role` key from Settings > API.

4. **Cal.com account** (free) — cal.com, set up one event type ("Intro Call"), copy its
   public booking link.

5. **A place to host this code, running 24/7** — Render.com has a free tier that works fine
   to start. Steps: create account > New Web Service > connect this code (I can help you
   push it to GitHub) > it auto-detects Node.js > add all your `.env` values under
   Environment tab > Deploy.

6. **Connect the webhooks** (this is the "wiring"):
   - In Meta Developer App > WhatsApp > Configuration: set Webhook URL to
     `https://your-render-url.com/webhook/whatsapp`, verify token = whatever you put in
     `META_VERIFY_TOKEN`. Subscribe to the `messages` field.
   - In Meta Developer App > Webhooks > Page: set URL to
     `https://your-render-url.com/webhook/meta-leads`, same verify token. Subscribe to
     `leadgen` field, and connect it to your Meta Lead Ads Page.
   - In Razorpay Dashboard > Settings > Webhooks: set URL to
     `https://your-render-url.com/webhook/razorpay`, event = `payment.captured`. Copy the
     secret it gives you into `RAZORPAY_WEBHOOK_SECRET`.

7. **Fill in `config.js`** with your real product payment links and file URLs (the file URL
   must be a direct, public link — e.g. a file hosted on Google Drive with "anyone with the
   link can view" + direct download, or any file host you use).

## Running it locally to test first (recommended before going live)

```
cd lead-agent
npm install
cp .env.example .env
# fill in .env with your real values
npm start
```

To test webhooks locally before deploying, use a tool like `ngrok` to get a temporary
public URL pointing at your laptop.

## What's already built vs. what needs your input

**Built and working:**
- Receiving leads from Meta, opening WhatsApp conversation automatically
- Claude-powered conversation for both agents, remembering chat history
- Automatic file delivery after Razorpay payment
- 2-day automatic feedback + cross-sell follow-up

**You still need to:**
- Actually create the two WhatsApp numbers and get them approved by Meta (takes a day or two)
- Fill in real payment links and file URLs in `config.js`
- Adjust the wording in `prompts/fmdl-agent.js` and `prompts/products-agent.js` to sound
  exactly how you want (I wrote a reasonable first draft based on what you told me)
- Deploy to Render (or ask me to walk you through it step by step)

## If you get stuck

This is genuinely a "have a developer spend a day on it" task, OR I can keep walking you
through each step here — just paste any error message you see and I'll help debug it.
