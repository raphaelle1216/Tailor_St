create extension if not exists "pgcrypto";
create extension if not exists pg_net;
create extension if not exists pg_cron;

insert into storage.buckets (id, name, public)
values ('uniform-photos', 'uniform-photos', true)
on conflict (id) do update set public = true;

create table if not exists public.uniforms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  size text not null,
  condition text not null,
  notes text default '',
  image_url text,
  status text not null default 'available' check (status in ('available', 'reserved', 'completed', 'hidden')),
  created_at timestamptz not null default now()
);

create table if not exists public.pickup_slots (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  starts_at timestamptz,
  capacity integer not null default 1 check (capacity > 0),
  booked_count integer not null default 0 check (booked_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  uniform_id uuid not null references public.uniforms(id) on delete cascade,
  slot_id uuid not null references public.pickup_slots(id) on delete restrict,
  pickup_code text not null,
  student_email text,
  student_note text default '',
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'cancelled')),
  confirmation_email_sent_at timestamptz,
  reminder_email_sent_at timestamptz,
  completion_email_sent_at timestamptz,
  email_error text,
  created_at timestamptz not null default now()
);

alter table public.bookings
  add column if not exists student_email text,
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists reminder_email_sent_at timestamptz,
  add column if not exists completion_email_sent_at timestamptz,
  add column if not exists email_error text;

create index if not exists uniforms_status_idx on public.uniforms(status);
create index if not exists pickup_slots_active_idx on public.pickup_slots(is_active);
create index if not exists bookings_status_idx on public.bookings(status);

create or replace function public.reserve_uniform(
  requested_uniform_id uuid,
  requested_slot_id uuid,
  requested_pickup_code text,
  requested_student_email text,
  requested_student_note text default ''
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  slot_record public.pickup_slots;
  booking_record public.bookings;
begin
  if requested_student_email is null
    or btrim(requested_student_email) = ''
    or requested_student_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'A valid email address is required';
  end if;

  select * into slot_record
  from public.pickup_slots
  where id = requested_slot_id
    and is_active = true
    and booked_count < capacity
  for update;

  if not found then
    raise exception 'Pickup slot is no longer available';
  end if;

  update public.uniforms
  set status = 'reserved'
  where id = requested_uniform_id
    and status = 'available';

  if not found then
    raise exception 'Uniform is no longer available';
  end if;

  update public.pickup_slots
  set booked_count = booked_count + 1
  where id = requested_slot_id;

  insert into public.bookings (
    uniform_id,
    slot_id,
    pickup_code,
    student_email,
    student_note,
    status
  )
  values (
    requested_uniform_id,
    requested_slot_id,
    requested_pickup_code,
    lower(btrim(requested_student_email)),
    requested_student_note,
    'reserved'
  )
  returning * into booking_record;

  return booking_record;
end;
$$;

alter table public.uniforms enable row level security;
alter table public.pickup_slots enable row level security;
alter table public.bookings enable row level security;

create policy "Public can view available uniforms"
  on public.uniforms for select
  using (status = 'available');

create policy "Public can view active pickup slots"
  on public.pickup_slots for select
  using (is_active = true and booked_count < capacity);

grant execute on function public.reserve_uniform(uuid, uuid, text, text, text) to anon, authenticated;

create or replace function public.tailor_st_vault_secret(secret_name text)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = secret_name
  limit 1;
$$;

create or replace function public.tailor_st_send_booking_email(
  requested_booking_id uuid,
  requested_email_kind text
)
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  booking_record record;
  resend_api_key text;
  from_email text;
  subject_text text;
  body_text text;
  send_at timestamptz := now();
begin
  select
    b.id,
    b.student_email,
    b.pickup_code,
    b.student_note,
    b.status,
    b.confirmation_email_sent_at,
    b.reminder_email_sent_at,
    u.title as uniform_title,
    u.size as uniform_size,
    ps.label as pickup_label,
    ps.starts_at
  into booking_record
  from public.bookings b
  join public.uniforms u on u.id = b.uniform_id
  join public.pickup_slots ps on ps.id = b.slot_id
  where b.id = requested_booking_id;

  if not found then
    return;
  end if;

  if booking_record.student_email is null or btrim(booking_record.student_email) = '' then
    update public.bookings
    set email_error = 'Email not sent: booking has no student_email.'
    where id = requested_booking_id;
    return;
  end if;

  resend_api_key := public.tailor_st_vault_secret('resend_api_key');
  from_email := public.tailor_st_vault_secret('tailor_st_email_from');

  if resend_api_key is null or btrim(resend_api_key) = '' or from_email is null or btrim(from_email) = '' then
    update public.bookings
    set email_error = 'Email not sent: missing resend_api_key or tailor_st_email_from Supabase Vault secret.'
    where id = requested_booking_id;
    return;
  end if;

  if requested_email_kind = 'confirmation' then
    if booking_record.confirmation_email_sent_at is not null then
      return;
    end if;

    subject_text := 'Your Tailor St pickup code is ' || booking_record.pickup_code;
    body_text := 'Thank you for using Tailor St.' || E'\n\n'
      || 'Your pickup code is: ' || booking_record.pickup_code || E'\n'
      || 'Uniform: ' || coalesce(booking_record.uniform_title, 'Uniform item') || coalesce(' (' || booking_record.uniform_size || ')', '') || E'\n'
      || 'Pickup time: ' || coalesce(booking_record.pickup_label, 'Your selected pickup time') || E'\n\n'
      || 'Please show this pickup code when you arrive.';

    update public.bookings
    set confirmation_email_sent_at = send_at,
        email_error = null
    where id = requested_booking_id;
  elsif requested_email_kind = 'reminder' then
    if booking_record.reminder_email_sent_at is not null then
      return;
    end if;

    subject_text := 'Reminder: your Tailor St pickup is in 24 hours';
    body_text := 'This is a reminder that your Tailor St pickup is taking place in about 24 hours.' || E'\n\n'
      || 'Pickup code: ' || booking_record.pickup_code || E'\n'
      || 'Uniform: ' || coalesce(booking_record.uniform_title, 'Uniform item') || coalesce(' (' || booking_record.uniform_size || ')', '') || E'\n'
      || 'Pickup time: ' || coalesce(booking_record.pickup_label, 'Your selected pickup time') || E'\n\n'
      || 'Please show this pickup code when you arrive.';

    update public.bookings
    set reminder_email_sent_at = send_at,
        email_error = null
    where id = requested_booking_id;
  else
    raise exception 'Unknown booking email kind: %', requested_email_kind;
  end if;

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || resend_api_key
    ),
    body := jsonb_build_object(
      'from', from_email,
      'to', jsonb_build_array(booking_record.student_email),
      'subject', subject_text,
      'text', body_text
    ),
    timeout_milliseconds := 10000
  );
end;
$$;

create or replace function public.tailor_st_send_booking_confirmation_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.tailor_st_send_booking_email(new.id, 'confirmation');
  return new;
end;
$$;

drop trigger if exists send_booking_confirmation_email on public.bookings;
create trigger send_booking_confirmation_email
after insert on public.bookings
for each row
execute function public.tailor_st_send_booking_confirmation_email();

create or replace function public.tailor_st_send_pickup_completion_email()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  uniform_lines text;
  resend_api_key text;
  from_email text;
  recipient_email text;
  pickup_code_text text;
  group_id uuid;
  already_sent_at timestamptz;
  incomplete_count integer;
  request_id bigint;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  group_id := new.reservation_group_id;

  select
    max(b.student_email),
    max(b.pickup_code),
    max(b.completion_email_sent_at),
    count(*) filter (where b.status <> 'completed')
  into recipient_email, pickup_code_text, already_sent_at, incomplete_count
  from public.bookings b
  where b.reservation_group_id = group_id;

  if incomplete_count > 0 or already_sent_at is not null then
    return new;
  end if;

  if recipient_email is null or btrim(recipient_email) = '' then
    update public.bookings
    set email_error = 'Pickup completion email not sent: booking has no student_email.'
    where reservation_group_id = group_id;
    return new;
  end if;

  resend_api_key := public.tailor_st_vault_secret('resend_api_key');
  from_email := public.tailor_st_vault_secret('tailor_st_email_from');

  if resend_api_key is null or btrim(resend_api_key) = ''
    or from_email is null or btrim(from_email) = '' then
    update public.bookings
    set email_error = 'Pickup completion email not sent: missing resend_api_key or tailor_st_email_from Supabase Vault secret.'
    where reservation_group_id = group_id;
    return new;
  end if;

  select string_agg(
    '- ' || u.title || coalesce(' (' || u.size || ')', ''),
    E'\n' order by u.title, u.size
  )
  into uniform_lines
  from public.bookings b
  join public.uniforms u on u.id = b.uniform_id
  where b.reservation_group_id = group_id;

  select net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || resend_api_key
    ),
    body := jsonb_build_object(
      'from', from_email,
      'to', jsonb_build_array(recipient_email),
      'subject', 'Your Tailor St pickup is complete',
      'text', 'Your Tailor St pickup has been marked complete.' || E'\n\n'
        || 'Uniforms picked up:' || E'\n' || coalesce(uniform_lines, '- Uniform item') || E'\n\n'
        || 'Pickup code: ' || coalesce(pickup_code_text, 'Not available') || E'\n\n'
        || 'Thank you for using Tailor St. We hope these uniforms serve you well!'
    ),
    timeout_milliseconds := 10000
  )
  into request_id;

  update public.bookings
  set completion_email_sent_at = now(),
      email_error = null
  where reservation_group_id = group_id;

  return new;
end;
$$;

drop trigger if exists send_pickup_completion_email on public.bookings;
create trigger send_pickup_completion_email
after update of status on public.bookings
for each row
execute function public.tailor_st_send_pickup_completion_email();

create or replace function public.tailor_st_send_pickup_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_record record;
begin
  for booking_record in
    select b.id
    from public.bookings b
    join public.pickup_slots ps on ps.id = b.slot_id
    where b.status = 'reserved'
      and b.student_email is not null
      and b.reminder_email_sent_at is null
      and ps.starts_at is not null
      and ps.starts_at between now() + interval '23 hours 45 minutes'
        and now() + interval '24 hours 15 minutes'
  loop
    perform public.tailor_st_send_booking_email(booking_record.id, 'reminder');
  end loop;
end;
$$;

do $$
begin
  perform cron.unschedule('tailor-st-pickup-reminders');
exception
  when others then null;
end $$;

select cron.schedule(
  'tailor-st-pickup-reminders',
  '*/15 * * * *',
  $$select public.tailor_st_send_pickup_reminders();$$
);

create policy "Admin full access to uniforms"
  on public.uniforms for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Admin full access to pickup slots"
  on public.pickup_slots for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Admin full access to bookings"
  on public.bookings for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Public can view uniform photos"
  on storage.objects for select
  using (bucket_id = 'uniform-photos');

create policy "Admin can upload uniform photos"
  on storage.objects for insert
  with check (bucket_id = 'uniform-photos' and auth.role() = 'authenticated');

create policy "Admin can update uniform photos"
  on storage.objects for update
  using (bucket_id = 'uniform-photos' and auth.role() = 'authenticated')
  with check (bucket_id = 'uniform-photos' and auth.role() = 'authenticated');
