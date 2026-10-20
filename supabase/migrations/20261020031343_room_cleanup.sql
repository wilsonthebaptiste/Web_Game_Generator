-- Hourly cleanup of old rooms (plan.md Phase 4). Rooms expire 12 hours after creation and every
-- RPC refuses them from then on (access-time expiry). This job deletes them 24 hours after
-- creation. Players, rounds, round_secrets, and answers go with them (on delete cascade).
-- pg_cron is available on every Supabase plan, including Free.
--
-- Never edit this file once it has been applied anywhere. Add a new migration instead.

create extension if not exists pg_cron with schema pg_catalog;

-- Returns how many rooms were deleted, so a manual `select private.delete_old_rooms();` reports it.
create function private.delete_old_rooms()
returns integer
language sql
set search_path = ''
as $$
  with deleted as (
    delete from public.rooms r
    where r.created_at < now() - interval '24 hours'
    returning 1
  )
  select count(*)::int from deleted;
$$;

revoke all on function private.delete_old_rooms() from public, anon, authenticated;

-- Minute 17 of every hour. Scheduling a job name that already exists replaces that job.
select cron.schedule('delete-old-rooms', '17 * * * *', 'select private.delete_old_rooms()');
