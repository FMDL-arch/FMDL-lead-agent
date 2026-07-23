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

// Generic partial-column update, used by things like the job-seeker follow-up
// scheduler that need to update a couple of flags without touching messages.
async function updateConversationFields(phone, fields) {
  const { error } = await supabase
    .from('conversations')
    .update(fields)
    .eq('phone', phone);
  if (error) console.error('updateConversationFields error:', error);
}

// Job-seeker leads who haven't yet confirmed they filled the application form -
// used by the 2h/12h WhatsApp follow-up reminder scheduler.
async function getPendingJobSeekers() {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('lead_type', 'job_seeker')
    .eq('job_form_confirmed', false)
    .not('job_form_sent_at', 'is', null);
  if (error) console.error('getPendingJobSeekers error:', error);
  return data || [];
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

// The 8 categories are fixed, pre-seeded rows (see supabase-setup.sql / the
// original seed migration) - this admin form only ever edits an EXISTING row's
// instructions, it never needs to create a new category. Using a plain UPDATE
// (instead of upsert) avoids Postgres rejecting the write because the
// not-null "label" column isn't part of this payload - upsert's underlying
// INSERT...ON CONFLICT still validates NOT NULL columns on the insert branch
// even when the row already exists, which was silently failing every save.
async function upsertCategoryRule(category, instructions) {
  const { data, error } = await supabase
    .from('category_rules')
    .update({ instructions, updated_at: new Date().toISOString() })
    .eq('category', category)
    .select();
  if (error) {
    console.error('upsertCategoryRule error:', error);
    return;
  }
  if (!data || data.length === 0) {
    console.error(`upsertCategoryRule: no row found for category "${category}" - nothing was saved.`);
  }
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
  updateConversationFields,
  getPendingJobSeekers,
  getCategoryRules,
  getCategoryRule,
  upsertCategoryRule,
  getPortfolioPdfs,
  getPortfolioPdf,
  uploadPortfolioPdf,
};
