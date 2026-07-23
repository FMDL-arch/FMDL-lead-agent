// lib/jobReminders.js
// Background scheduler for the job-seeker flow: once we've sent someone the
// application form link, follow up automatically if they haven't confirmed
// filling it in - a nudge at 2 hours, then a firmer one at 12 hours.

const db = require('./db');
const whatsapp = require('./whatsapp');
const config = require('../config');

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // check every 10 minutes

async function checkJobReminders() {
  let pending;
  try {
    pending = await db.getPendingJobSeekers();
  } catch (err) {
    console.error('checkJobReminders: failed to load pending job seekers:', err.message);
    return;
  }

  const now = Date.now();

  for (const convo of pending) {
    if (!convo.job_form_sent_at) continue;
    const sentAt = new Date(convo.job_form_sent_at).getTime();
    const elapsed = now - sentAt;

    try {
      if (elapsed >= TWELVE_HOURS_MS && !convo.job_reminder_12h_sent) {
        await whatsapp.sendText(
          config.numbers.FMDL_PHONE_NUMBER_ID,
          convo.phone,
          `Have you sent it? I'd already mentioned you to our HR - I believe she must be waiting on your form.`
        );
        await db.updateConversationFields(convo.phone, { job_reminder_12h_sent: true });
      } else if (elapsed >= TWO_HOURS_MS && !convo.job_reminder_2h_sent) {
        await whatsapp.sendText(
          config.numbers.FMDL_PHONE_NUMBER_ID,
          convo.phone,
          `Hey! Just checking in - have you had a chance to fill out the form yet?`
        );
        await db.updateConversationFields(convo.phone, { job_reminder_2h_sent: true });
      }
    } catch (err) {
      console.error(`checkJobReminders: failed to nudge ${convo.phone}:`, err.response?.data || err.message);
    }
  }
}

function startJobReminderScheduler() {
  // Run once shortly after boot, then on a fixed interval.
  setTimeout(checkJobReminders, 60 * 1000);
  setInterval(checkJobReminders, CHECK_INTERVAL_MS);
}

module.exports = { startJobReminderScheduler, checkJobReminders };
