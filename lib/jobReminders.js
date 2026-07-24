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
              let reminderText = null;
              let flagField = null;

          if (elapsed >= TWELVE_HOURS_MS && !convo.job_reminder_12h_sent) {
                    reminderText = `Have you sent it? I'd already mentioned you to our HR - I believe she must be waiting on your form.`;
                    flagField = 'job_reminder_12h_sent';
          } else if (elapsed >= TWO_HOURS_MS && !convo.job_reminder_2h_sent) {
                    reminderText = `Hey! Just checking in - have you had a chance to fill out the form yet?`;
                    flagField = 'job_reminder_2h_sent';
          }

          if (reminderText) {
                    await whatsapp.sendText(config.numbers.FMDL_PHONE_NUMBER_ID, convo.phone, reminderText);
                    // Append the reminder to the saved conversation history too, not just
                // flip the tracking flag - otherwise the message goes out on WhatsApp
                // but never shows up in the team dashboard, which looked like a bug.
                const history = [...(convo.messages || []), { role: 'assistant', content: reminderText }];
                    await db.saveConversation(convo.phone, convo.agent_type || 'fmdl', history, {
                                [flagField]: true,
                    });
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
