// lib/db.js
// Uses Supabase (free tier) as the database. Sign up at supabase.com, create a project,
// then run the SQL in supabase-setup.sql (included) to create the tables.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// --- Conversations (used by BOTH agents to remember chat history) ---

async function getConversation(phone) {
  const { data } = await supabase
    .from('conversations')
    .select('*')
    .eq('phone', phone)
    .single();
  return data;
}

async function saveConversation(phone, agentType, messages, extra = {}) {
  const { error } = await supabase
    .from('conversations')
    .upsert({ phone, agent_type: agentType, messages, updated_at: new Date().toISOString(), ...extra });
  if (error) console.error('saveConversation error:', error);
}

// --- Purchases (used by the Digital Products agent for follow-ups & cross-sell) ---

async function recordPurchase(phone, productKey) {
  const { error } = await supabase.from('purchases').insert({
    phone,
    product_key: productKey,
    purchased_at: new Date().toISOString(),
    last_followup_at: null,
    followup_count: 0,
  });
  if (error) console.error('recordPurchase error:', error);
}

async function getPurchasesDueForFollowup(intervalDays) {
  const cutoff = new Date(Date.now() - intervalDays * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('purchases')
    .select('*')
    .lt('purchased_at', cutoff)
    .or(`last_followup_at.is.null,last_followup_at.lt.${cutoff}`);
  return data || [];
}

async function markFollowedUp(id) {
  await supabase
    .from('purchases')
    .update({ last_followup_at: new Date().toISOString() })
    .eq('id', id);
}

module.exports = {
  getConversation,
  saveConversation,
  recordPurchase,
  getPurchasesDueForFollowup,
  markFollowedUp,
};
