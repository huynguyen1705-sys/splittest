import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignsApi } from '@/lib/api';
import { Campaign, CampaignRule, Variant, CampaignStatus } from '@/types/database';
import { toast } from 'sonner';

export function useCampaigns(projectId: string | undefined) {
  return useQuery({
    queryKey: ['campaigns', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data } = await campaignsApi.list(projectId);
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
      try {
        const { data } = await campaignsApi.get(id);
        return data;
      } catch (e: any) {
        if (e.status === 404) return null;
        throw e;
      }
    },
    enabled: !!id,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
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
        country_in?: string[]; device_in?: string[]; browser_in?: string[];
        os_in?: string[]; lang_in?: string[]; include_paths?: string[]; url_match_mode?: string;
      };
    }) => {
      const { data: campaign } = await campaignsApi.create({
        project_id: data.project_id,
        name: data.name,
        status: data.status || 'draft',
        sticky_enabled: data.sticky_enabled,
        respect_dnt: data.respect_dnt,
        start_at: data.start_at,
        end_at: data.end_at,
      });

      // Create variants sequentially
      for (const v of data.variants) {
        await campaignsApi.variants.create(campaign.id, v);
      }
      if (data.rules) {
        await campaignsApi.rules.set(campaign.id, data.rules);
      }
      return campaign as Campaign;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['campaigns', data.project_id] });
      toast.success('Campaign created successfully');
    },
    onError: (e: any) => toast.error('Failed to create campaign: ' + (e.message || 'error')),
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: {
      id: string; name?: string; status?: CampaignStatus; sticky_enabled?: boolean;
      respect_dnt?: boolean; start_at?: string | null; end_at?: string | null;
    }) => {
      const { data } = await campaignsApi.update(id, patch);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaigns', 'detail', data.id] });
      toast.success('Campaign updated successfully');
    },
    onError: (e: any) => toast.error('Failed to update campaign: ' + (e.message || 'error')),
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await campaignsApi.remove(id); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign deleted successfully');
    },
    onError: (e: any) => toast.error('Failed to delete campaign: ' + (e.message || 'error')),
  });
}

export function useDuplicateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, projectId }: { campaignId: string; projectId: string }) => {
      const { data: orig } = await campaignsApi.get(campaignId);
      const { data: copy } = await campaignsApi.create({
        project_id: projectId,
        name: `${orig.name} (Copy)`,
        status: 'draft',
        sticky_enabled: orig.sticky_enabled,
        respect_dnt: orig.respect_dnt,
        priority: orig.priority,
      });
      if (orig.variants?.length) {
        for (const v of orig.variants) {
          await campaignsApi.variants.create(copy.id, {
            name: v.name, destination_url: v.destination_url, weight: v.weight, is_control: v.is_control,
          });
        }
      }
      if (orig.campaign_rules) {
        await campaignsApi.rules.set(copy.id, orig.campaign_rules);
      }
      return copy;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['campaigns', data.project_id] });
      toast.success('Campaign duplicated successfully');
    },
    onError: (e: any) => toast.error('Failed to duplicate campaign: ' + (e.message || 'error')),
  });
}

export function useUpdateVariants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, variants }: {
      campaignId: string;
      variants: { id?: string; name: string; destination_url: string; weight: number; is_control: boolean }[];
    }) => {
      // Get existing
      const { data: existing } = await campaignsApi.variants.list(campaignId);
      for (const v of existing) await campaignsApi.variants.remove(campaignId, v.id);
      for (const v of variants) await campaignsApi.variants.create(campaignId, v);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Variants updated successfully');
    },
    onError: (e: any) => toast.error('Failed to update variants: ' + (e.message || 'error')),
  });
}

export function useUpdateRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, rules }: {
      campaignId: string;
      rules: {
        country_in?: string[]; device_in?: string[]; browser_in?: string[];
        os_in?: string[]; lang_in?: string[]; include_paths?: string[]; url_match_mode?: string;
      };
    }) => {
      await campaignsApi.rules.set(campaignId, rules);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Targeting rules updated successfully');
    },
    onError: (e: any) => toast.error('Failed to update rules: ' + (e.message || 'error')),
  });
}
