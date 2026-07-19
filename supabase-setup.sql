-- Run this in Supabase > SQL Editor once, before going live.

create table conversations (
  phone text primary key,
  agent_type text default 'fmdl',
  messages jsonb default '[]',
  lead_status text, -- 'new', 'hot', 'cold', 'meeting_offered', 'meeting_booked'
  ai_paused boolean default false,
  updated_at timestamptz default now()
);
