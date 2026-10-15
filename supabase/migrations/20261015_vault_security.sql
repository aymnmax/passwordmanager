-- Apply in Supabase SQL Editor after backing up your project.
-- Enforces per-user access even if a client attempts to query another user's rows.
alter table public.vault_items enable row level security;

 drop policy if exists "Users can read their own vault items" on public.vault_items;
create policy "Users can read their own vault items"
  on public.vault_items for select to authenticated
  using (auth.uid() = user_id);

 drop policy if exists "Users can insert their own vault items" on public.vault_items;
create policy "Users can insert their own vault items"
  on public.vault_items for insert to authenticated
  with check (auth.uid() = user_id);

 drop policy if exists "Users can update their own vault items" on public.vault_items;
create policy "Users can update their own vault items"
  on public.vault_items for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

 drop policy if exists "Users can delete their own vault items" on public.vault_items;
create policy "Users can delete their own vault items"
  on public.vault_items for delete to authenticated
  using (auth.uid() = user_id);

-- Do not create a public/anon policy for vault_items. Keep the Supabase service-role key server-side only.
