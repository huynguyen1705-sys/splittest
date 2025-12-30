-- Add unique constraint on campaign_id for campaign_rules table
-- This allows upsert to work correctly
ALTER TABLE public.campaign_rules 
ADD CONSTRAINT campaign_rules_campaign_id_unique UNIQUE (campaign_id);