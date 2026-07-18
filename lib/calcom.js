// lib/calcom.js
// Uses Cal.com's API (free tier / self-hosted) to create a booking.
// Simplest working version: send the lead a Cal.com booking LINK rather than
// auto-picking a slot for them — this avoids needing to parse "Tuesday afternoon"
// into an exact slot, and still feels instant and human.

async function getBookingLink() {
  // Just your public Cal.com event link, e.g. https://cal.com/fmdl-architects/intro-call
  return process.env.CALCOM_BOOKING_LINK;
}

module.exports = { getBookingLink };
