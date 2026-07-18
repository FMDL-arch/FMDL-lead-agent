// lib/scheduler.js
const cron = require('node-cron');
const whatsapp = require('./whatsapp');
const db = require('./db');
const config = require('../config');

function startCrossSellScheduler() {
  // Runs once a day at 10:00 server time. Checks who is "due" for a follow-up
  // (purchased >= 2 days ago and not followed up in the last 2 days).
  cron.schedule('0 10 * * *', async () => {
    console.log('Running cross-sell/feedback check...');
    try {
      const due = await db.getPurchasesDueForFollowup(config.crossSellIntervalDays);
      for (const purchase of due) {
        const product = config.products[purchase.product_key];
        if (!product) continue;

        const crossSellProduct = config.products[product.crossSell?.[0]];
        const crossSellLine = crossSellProduct
          ? `\n\nBy the way, a lot of people who use the ${product.label} also pick up the ${crossSellProduct.label} (₹${crossSellProduct.price}) - here's the link if you want to check it out: ${crossSellProduct.paymentLink}`
          : '';

        const message = `Hey! Just checking in - how's the ${product.label} working out for you? Any questions or feedback, I'm right here.${crossSellLine}`;

        await whatsapp.sendText(
          config.numbers.PRODUCTS_PHONE_NUMBER_ID,
          purchase.phone,
          message
        );
        await db.markFollowedUp(purchase.id);
      }
      console.log(`Followed up with ${due.length} customer(s).`);
    } catch (err) {
      console.error('Scheduler error:', err.message);
    }
  });
}

module.exports = { startCrossSellScheduler };
