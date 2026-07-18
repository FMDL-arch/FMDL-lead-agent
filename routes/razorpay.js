// routes/razorpay.js
// Set this URL as a webhook in Razorpay Dashboard > Settings > Webhooks,
// subscribed to the "payment.captured" event, for EACH of your payment links/products.

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const whatsapp = require('../lib/whatsapp');
const db = require('../lib/db');
const config = require('../config');

router.post('/', express.json({ verify: rawBodySaver }), async (req, res) => {
  // Verify the webhook is really from Razorpay
  const signature = req.headers['x-razorpay-signature'];
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest('hex');

  if (signature !== expected) {
    return res.sendStatus(401);
  }
  res.sendStatus(200); // acknowledge immediately

  try {
    if (req.body.event !== 'payment.captured') return;

    const payment = req.body.payload.payment.entity;
    const phoneRaw = payment.contact; // customer's phone as entered at checkout
    const phone = phoneRaw.replace(/[^\d]/g, '');
    const amountPaid = payment.amount / 100; // paise -> rupees

    // Figure out which product this was, by matching amount (simplest approach
    // since you said links are fixed one-per-product)
    const productKey = Object.keys(config.products).find(
      (key) => config.products[key].price === amountPaid
    );
    if (!productKey) {
      console.warn('Could not match payment to a product. Amount:', amountPaid);
      return;
    }

    const product = config.products[productKey];
    const numberId = config.numbers.PRODUCTS_PHONE_NUMBER_ID;

    // 1. Send the file immediately
    await whatsapp.sendText(
      numberId,
      phone,
      `Thank you for purchasing the ${product.label}! Sending it your way now 🙌`
    );
    await whatsapp.sendFile(numberId, phone, product.fileUrl, product.label);

    // 2. Record the purchase so the 2-day follow-up job picks it up later
    await db.recordPurchase(phone, productKey);
  } catch (err) {
    console.error('Razorpay webhook error:', err.message);
  }
});

function rawBodySaver(req, res, buf) {
  req.rawBody = buf;
}

module.exports = router;
