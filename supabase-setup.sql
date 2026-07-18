-- Run this in Supabase > SQL Editor once, before going live.

create table conversations (
  phone text primary key,
  agent_type text, -- 'fmdl' or 'products'
  messages jsonb default '[]',
  lead_status text, -- 'new', 'hot', 'cold', 'meeting_booked' (fmdl only)
  updated_at timestamptz default now()
);

create table purchases (
  id bigint generated always as identity primary key,
  phone text not null,
  product_key text not null,
  purchased_at timestamptz default now(),
  last_followup_at timestamptz,
  followup_count int default 0
);
