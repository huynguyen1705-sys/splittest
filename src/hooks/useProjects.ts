import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { Project } from '@/types/database';
import { toast } from 'sonner';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data } = await projectsApi.list();
      return data as Project[];
    },
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: async () => {
      if (!id) return null;
      try {
        const { data } = await projectsApi.get(id);
        return data as Project | null;
      } catch (e: any) {
        if (e.status === 404) return null;
        throw e;
      }
    },
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string; primary_domain: string; timezone?: string }) => {
      const { data } = await projectsApi.create(body);
      return data as Project;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project created successfully');
    },
    onError: (error: any) => toast.error('Failed to create project: ' + (error.message || 'error')),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; primary_domain?: string; timezone?: string; data_retention_days?: number }) => {
      const { data } = await projectsApi.update(id, patch);
      return data as Project;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['projects', data.id] });
      toast.success('Project updated successfully');
    },
    onError: (error: any) => toast.error('Failed to update project: ' + (error.message || 'error')),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await projectsApi.remove(id); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted successfully');
    },
    onError: (error: any) => toast.error('Failed to delete project: ' + (error.message || 'error')),
  });
}
