create extension if not exists "pgcrypto";

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
  created_at timestamptz not null default now()
);

alter table public.bookings
  add column if not exists student_email text;

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
