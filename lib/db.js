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

// --- Category reply rules (team-editable guidance per project category) ---

async function getCategoryRules() {
  const { data, error } = await supabase
    .from('category_rules')
    .select('*')
    .order('category', { ascending: true });
  if (error) console.error('getCategoryRules error:', error);
  return data || [];
}

async function getCategoryRule(category) {
  const { data } = await supabase
    .from('category_rules')
    .select('*')
    .eq('category', category)
    .single();
  return data;
}

async function upsertCategoryRule(category, instructions) {
  const { error } = await supabase
    .from('category_rules')
    .upsert({ category, instructions, updated_at: new Date().toISOString() });
  if (error) console.error('upsertCategoryRule error:', error);
}

// --- Portfolio PDFs (team-uploaded profile PDFs Shipra sends to leads) ---

async function getPortfolioPdfs() {
  const { data, error } = await supabase
    .from('portfolio_pdfs')
    .select('*')
    .order('slug', { ascending: true });
  if (error) console.error('getPortfolioPdfs error:', error);
  return data || [];
}

async function getPortfolioPdf(slug) {
  const { data } = await supabase
    .from('portfolio_pdfs')
    .select('*')
    .eq('slug', slug)
    .single();
  return data;
}

async function uploadPortfolioPdf(slug, buffer, filename, mimetype) {
  const path = `${slug}-${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from('portfolios')
    .upload(path, buffer, { contentType: mimetype || 'application/pdf', upsert: true });
  if (uploadError) {
    console.error('uploadPortfolioPdf storage error:', uploadError);
    throw uploadError;
  }
  const { data: urlData } = supabase.storage.from('portfolios').getPublicUrl(path);
  const { error } = await supabase
    .from('portfolio_pdfs')
    .update({
      file_url: urlData.publicUrl,
      filename,
      uploaded_at: new Date().toISOString(),
    })
    .eq('slug', slug);
  if (error) console.error('uploadPortfolioPdf db error:', error);
  return urlData.publicUrl;
}

module.exports = {
  getConversation,
  saveConversation,
  getAllConversations,
  setAiPaused,
  getCategoryRules,
  getCategoryRule,
  upsertCategoryRule,
  getPortfolioPdfs,
  getPortfolioPdf,
  uploadPortfolioPdf,
};
