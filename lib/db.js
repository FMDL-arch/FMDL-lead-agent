// lib/db.js
// Uses Supabase (free tier) as the database. Sign up at supabase.com, create a project,
// then run the SQL in supabase-setup.sql (included) to create the tables.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// --- Conversations (leads chatting with the FMDL agent) ---

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

async function getAllConversations() {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) console.error('getAllConversations error:', error);
  return data || [];
}

async function setAiPaused(phone, paused) {
  const { error } = await supabase
    .from('conversations')
    .update({ ai_paused: paused })
    .eq('phone', phone);
  if (error) console.error('setAiPaused error:', error);
}

module.exports = {
  getConversation,
  saveConversation,
  getAllConversations,
  setAiPaused,
};
