// config.js
// EDIT THIS FILE with your real numbers, phone_number_ids, and product links.
// phone_number_id comes from Meta Business Manager > WhatsApp > API Setup (NOT the phone number itself).

module.exports = {
  // Which WhatsApp number handles which job
  numbers: {
    FMDL_PHONE_NUMBER_ID: process.env.FMDL_PHONE_NUMBER_ID, // e.g. "1029384756"
    PRODUCTS_PHONE_NUMBER_ID: process.env.PRODUCTS_PHONE_NUMBER_ID,
  },

  // Your digital products: name -> { fixed Razorpay link, file to send after payment, price }
  products: {
    boq_toolkit: {
      label: 'BOQ Tool Kit',
      price: 799,
      paymentLink: 'https://rzp.io/l/YOUR-BOQ-LINK',
      fileUrl: 'https://your-file-host.com/files/boq-toolkit.pdf', // must be a public, direct file link
      crossSell: ['sow_kit', 'fee_calculator'], // what to offer after this one
    },
    sow_kit: {
      label: 'Scope of Work Kit',
      price: 299,
      paymentLink: 'https://rzp.io/l/YOUR-SOW-LINK',
      fileUrl: 'https://your-file-host.com/files/sow-kit.pdf',
      crossSell: ['fee_calculator', 'boq_toolkit'],
    },
    fee_calculator: {
      label: 'Fee Calculator',
      price: 199,
      paymentLink: 'https://rzp.io/l/YOUR-FEE-CALC-LINK',
      fileUrl: 'https://your-file-host.com/files/fee-calculator.xlsx',
      crossSell: ['boq_toolkit', 'sow_kit'],
    },
    // add crm / sales funnel products here later, same shape
  },

  // How many days between "how's it going + cross-sell" follow-ups
  crossSellIntervalDays: 2,
};
