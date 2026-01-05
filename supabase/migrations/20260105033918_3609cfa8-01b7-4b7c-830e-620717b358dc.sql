-- Allow users to insert events into their own projects (for testing purposes)
CREATE POLICY "Users can insert events for their projects"
ON public.events_raw
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = events_raw.project_id
    AND projects.user_id = auth.uid()
  )
);