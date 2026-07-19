-- Run this in Supabase > SQL Editor. Your conversations table already exists,
-- this just adds the one new column the dashboard needs for the pause/resume button.

alter table conversations add column if not exists ai_paused boolean default false;
