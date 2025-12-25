import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Campaign, CampaignRule, Variant, CampaignStatus } from '@/types/database';
import { toast } from 'sonner';

export function useCampaigns(projectId: string | undefined) {
  return useQuery({
    queryKey: ['campaigns', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from('campaigns')
        .select(`
          *,
          variants (*),
          campaign_rules (*)
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as (Campaign & { variants: Variant[]; campaign_rules: CampaignRule | null })[];
    },
    enabled: !!projectId,
  });
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: ['campaigns', 'detail', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('campaigns')
        .select(`
          *,
          variants (*),
          campaign_rules (*),
          projects (*)
        `)
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      project_id: string;
      name: string;
      status?: CampaignStatus;
      sticky_enabled?: boolean;
      respect_dnt?: boolean;
      start_at?: string | null;
      end_at?: string | null;
      variants: { name: string; destination_url: string; weight: number; is_control: boolean }[];
      rules?: {
        country_in?: string[];
        device_in?: string[];
        browser_in?: string[];
        os_in?: string[];
        lang_in?: string[];
        include_paths?: string[];
      };
    }) => {
      // Create campaign
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert({
          project_id: data.project_id,
          name: data.name,
          status: data.status || 'draft',
          sticky_enabled: data.sticky_enabled ?? true,
          respect_dnt: data.respect_dnt ?? true,
          start_at: data.start_at,
          end_at: data.end_at,
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Create variants
      if (data.variants.length > 0) {
        const { error: variantsError } = await supabase
          .from('variants')
          .insert(
            data.variants.map((v) => ({
              campaign_id: campaign.id,
              name: v.name,
              destination_url: v.destination_url,
              weight: v.weight,
              is_control: v.is_control,
            }))
          );

        if (variantsError) throw variantsError;
      }

      // Create rules
      if (data.rules) {
        const { error: rulesError } = await supabase
          .from('campaign_rules')
          .insert({
            campaign_id: campaign.id,
            country_in: data.rules.country_in || [],
            device_in: data.rules.device_in || [],
            browser_in: data.rules.browser_in || [],
            os_in: data.rules.os_in || [],
            lang_in: data.rules.lang_in || [],
            include_paths: data.rules.include_paths || [],
          });

        if (rulesError) throw rulesError;
      }

      return campaign as Campaign;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', data.project_id] });
      toast.success('Campaign created successfully');
    },
    onError: (error) => {
      toast.error('Failed to create campaign: ' + error.message);
    },
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { 
      id: string; 
      name?: string;
      status?: CampaignStatus;
      sticky_enabled?: boolean;
      respect_dnt?: boolean;
      start_at?: string | null;
      end_at?: string | null;
    }) => {
      const { data: campaign, error } = await supabase
        .from('campaigns')
        .update(data)
        .eq('id', id)
        .select('*, projects(*)')
        .single();

      if (error) throw error;
      return campaign;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', 'detail', data.id] });
      toast.success('Campaign updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update campaign: ' + error.message);
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete campaign: ' + error.message);
    },
  });
}

export function useDuplicateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, projectId }: { campaignId: string; projectId: string }) => {
      // Fetch original campaign with variants and rules
      const { data: original, error: fetchError } = await supabase
        .from('campaigns')
        .select(`
          *,
          variants (*),
          campaign_rules (*)
        `)
        .eq('id', campaignId)
        .single();

      if (fetchError) throw fetchError;

      // Create new campaign
      const { data: newCampaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert({
          project_id: projectId,
          name: `${original.name} (Copy)`,
          status: 'draft',
          sticky_enabled: original.sticky_enabled,
          respect_dnt: original.respect_dnt,
          priority: original.priority,
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Copy variants
      if (original.variants && original.variants.length > 0) {
        const { error: variantsError } = await supabase
          .from('variants')
          .insert(
            original.variants.map((v: any) => ({
              campaign_id: newCampaign.id,
              name: v.name,
              destination_url: v.destination_url,
              weight: v.weight,
              is_control: v.is_control,
            }))
          );

        if (variantsError) throw variantsError;
      }

      // Copy rules
      if (original.campaign_rules) {
        const rules = original.campaign_rules;
        const { error: rulesError } = await supabase
          .from('campaign_rules')
          .insert({
            campaign_id: newCampaign.id,
            country_in: rules.country_in || [],
            device_in: rules.device_in || [],
            browser_in: rules.browser_in || [],
            os_in: rules.os_in || [],
            lang_in: rules.lang_in || [],
            include_paths: rules.include_paths || [],
          });

        if (rulesError) throw rulesError;
      }

      return newCampaign;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', data.project_id] });
      toast.success('Campaign duplicated successfully');
    },
    onError: (error) => {
      toast.error('Failed to duplicate campaign: ' + error.message);
    },
  });
}

export function useUpdateVariants() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, variants }: {
      campaignId: string;
      variants: { id?: string; name: string; destination_url: string; weight: number; is_control: boolean }[];
    }) => {
      // Delete existing variants
      await supabase.from('variants').delete().eq('campaign_id', campaignId);

      // Insert new variants
      const { error } = await supabase
        .from('variants')
        .insert(
          variants.map((v) => ({
            campaign_id: campaignId,
            name: v.name,
            destination_url: v.destination_url,
            weight: v.weight,
            is_control: v.is_control,
          }))
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Variants updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update variants: ' + error.message);
    },
  });
}

export function useUpdateRules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, rules }: {
      campaignId: string;
      rules: {
        country_in?: string[];
        device_in?: string[];
        browser_in?: string[];
        os_in?: string[];
        lang_in?: string[];
        include_paths?: string[];
      };
    }) => {
      const { error } = await supabase
        .from('campaign_rules')
        .upsert({
          campaign_id: campaignId,
          country_in: rules.country_in || [],
          device_in: rules.device_in || [],
          browser_in: rules.browser_in || [],
          os_in: rules.os_in || [],
          lang_in: rules.lang_in || [],
          include_paths: rules.include_paths || [],
        }, { onConflict: 'campaign_id' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Targeting rules updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update rules: ' + error.message);
    },
  });
}
