begin;

create table if not exists public.caleris_driver_training_catalog (
  training_key text primary key,
  attribute_key text not null check (attribute_key in (
    'race_pace','qualifying_pace','experience','aggression',
    'defensive_strength','overtake_skill','mistake_rate','tyre_management'
  )),
  title text not null,
  tagline text not null,
  briefing text not null,
  scenario text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.caleris_driver_training_modes (
  training_key text not null references public.caleris_driver_training_catalog(training_key) on delete cascade,
  mode_key text not null check (mode_key in ('light','normal','hard')),
  duration_seconds integer not null check (duration_seconds between 10 and 600),
  cooldown_seconds integer not null check (cooldown_seconds between 60 and 2592000),
  success_chance numeric(5,2) not null check (success_chance between 1 and 99),
  success_gain numeric(5,2) not null check (success_gain > 0 and success_gain <= 5),
  failure_loss numeric(5,2) not null check (failure_loss > 0 and failure_loss <= 5),
  is_active boolean not null default true,
  primary key (training_key, mode_key)
);

create table if not exists public.caleris_driver_training_attempts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  training_key text not null references public.caleris_driver_training_catalog(training_key),
  mode_key text not null check (mode_key in ('light','normal','hard')),
  status text not null default 'started' check (status in ('started','success','failed','expired')),
  started_at timestamptz not null default now(),
  completes_at timestamptz not null,
  expires_at timestamptz not null,
  resolved_at timestamptz,
  cooldown_until timestamptz,
  success_roll numeric(7,4),
  success_chance numeric(5,2) not null,
  attribute_before numeric(5,2) not null,
  attribute_after numeric(5,2),
  attribute_delta numeric(5,2),
  mode_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists caleris_driver_training_attempts_member_created_idx
  on public.caleris_driver_training_attempts(member_id, created_at desc);
create index if not exists caleris_driver_training_attempts_cooldown_idx
  on public.caleris_driver_training_attempts(member_id, training_key, cooldown_until desc)
  where status in ('success','failed');
create index if not exists caleris_driver_training_attempts_active_idx
  on public.caleris_driver_training_attempts(member_id, expires_at)
  where status='started';

alter table public.caleris_driver_training_catalog enable row level security;
alter table public.caleris_driver_training_modes enable row level security;
alter table public.caleris_driver_training_attempts enable row level security;
revoke all on public.caleris_driver_training_catalog, public.caleris_driver_training_modes,
  public.caleris_driver_training_attempts from public, anon, authenticated;
grant select on public.caleris_driver_training_catalog, public.caleris_driver_training_modes,
  public.caleris_driver_training_attempts to authenticated;

create policy driver_training_catalog_read on public.caleris_driver_training_catalog
  for select to authenticated using (is_active);
create policy driver_training_modes_read on public.caleris_driver_training_modes
  for select to authenticated using (is_active);
create policy driver_training_attempts_read_own on public.caleris_driver_training_attempts
  for select to authenticated using (
    exists(select 1 from public.profiles p where p.user_id=(select auth.uid())
      and p.member_id=caleris_driver_training_attempts.member_id)
  );

insert into public.caleris_driver_training_catalog
  (training_key,attribute_key,title,tagline,briefing,scenario)
values
 ('race_pace','race_pace','Race Pace · Race Rhythm Lab','Bangun konsistensi dari lap pertama sampai chequered flag.','Simulasi long-run dengan perubahan grip, traffic, dan target delta waktu. Jaga ritme tanpa membuang momentum.','THE LONG RUN: Kamu memimpin sesi simulasi 12 lap. Pace harus stabil saat grip mulai turun.'),
 ('qualifying_pace','qualifying_pace','Qualifying Pace · One Lap Project','Satu lap. Satu kesempatan. Maksimalkan performa.','Rangkai sektor bersih dan manfaatkan jendela ban terbaik untuk mencatat flying lap.','FLYING LAP: Out-lap selesai. Ban berada di temperatur ideal dan satu lap cepat menunggu.'),
 ('experience','experience','Experience · Race Intelligence','Asah keputusan lewat evaluasi situasi balapan.','Baca pola stint, perubahan cuaca, dan informasi engineer untuk menentukan keputusan paling tepat.','RACE REVIEW: Data stint berubah. Kamu harus menghubungkan petunjuk sebelum strategi terlambat.'),
 ('aggression','aggression','Aggression · Controlled Attack','Pilih momen menyerang tanpa kehilangan kendali.','Latihan membaca celah, momentum, dan batas risiko saat duel kompetitif.','ATTACK WINDOW: Rival membuka ruang sesaat. Serangan harus tegas, terukur, dan tepat waktu.'),
 ('defensive_strength','defensive_strength','Defensive Strength · Hold The Line','Pertahankan posisi dengan keputusan yang disiplin.','Latih positioning, pemilihan racing line, dan respons terhadap tekanan lawan.','DEFENCE MODE: Rival berada dalam jarak serang. Lindungi racing line dan jaga konsistensi.'),
 ('overtake_skill','overtake_skill','Overtake Skill · Passing Academy','Temukan peluang menyalip yang bersih dan efektif.','Latihan membaca slipstream, deployment energi, dan titik pengereman untuk menyelesaikan manuver.','PASSING ZONE: Kamu mendapat tow di lintasan lurus. Susun manuver hingga keluar tikungan.'),
 ('mistake_rate','mistake_rate','Mistake Rate · Precision Protocol','Kurangi kesalahan kecil yang merusak satu putaran.','Latihan presisi input, konsistensi titik pengereman, dan eksekusi tanpa kesalahan. Nilai lebih rendah berarti lebih baik.','PRECISION RUN: Delapan sektor harus dilewati dengan input yang konsisten dan minim kesalahan.'),
 ('tyre_management','tyre_management','Tyre Management · Tyre Whisperer','Jaga umur ban sambil mempertahankan pace.','Kelola temperatur, sliding, dan degradasi agar performa bertahan sepanjang stint.','TYRE WINDOW: Ban mulai mengalami degradasi. Temukan ritme yang menjaga temperatur dan grip.')
on conflict (training_key) do update set
  attribute_key=excluded.attribute_key,title=excluded.title,tagline=excluded.tagline,
  briefing=excluded.briefing,scenario=excluded.scenario,updated_at=now();

insert into public.caleris_driver_training_modes
  (training_key,mode_key,duration_seconds,cooldown_seconds,success_chance,success_gain,failure_loss)
select c.training_key,m.mode_key,m.duration_seconds,m.cooldown_seconds,
       m.success_chance,m.success_gain,m.failure_loss
from public.caleris_driver_training_catalog c
cross join (values
  ('light',20,3600,82.00,0.20,0.10),
  ('normal',40,14400,65.00,0.50,0.25),
  ('hard',60,43200,45.00,1.00,0.50)
) as m(mode_key,duration_seconds,cooldown_seconds,success_chance,success_gain,failure_loss)
on conflict (training_key,mode_key) do update set
  duration_seconds=excluded.duration_seconds,
  cooldown_seconds=excluded.cooldown_seconds,
  success_chance=excluded.success_chance,
  success_gain=excluded.success_gain,
  failure_loss=excluded.failure_loss,
  is_active=true;

create or replace function public.member_start_driver_training(
  p_actor_id uuid,
  p_training_key text,
  p_mode_key text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_member public.members%rowtype;
  v_training public.caleris_driver_training_catalog%rowtype;
  v_mode public.caleris_driver_training_modes%rowtype;
  v_value numeric(5,2);
  v_now timestamptz:=clock_timestamp();
  v_cooldown timestamptz;
  v_attempt public.caleris_driver_training_attempts%rowtype;
begin
  if p_actor_id is null or p_training_key is null or p_mode_key not in ('light','normal','hard') then
    raise exception 'Pilihan latihan tidak valid.';
  end if;
  select m.* into v_member
  from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=p_actor_id and m.role='Driver'
  for update of m;
  if not found then raise exception 'Training hanya tersedia untuk akun dengan role Driver.'; end if;

  update public.caleris_driver_training_attempts
  set status='expired',resolved_at=v_now
  where member_id=v_member.id and status='started' and expires_at<=v_now;

  if exists(select 1 from public.caleris_driver_training_attempts
    where member_id=v_member.id and status='started' and expires_at>v_now) then
    raise exception 'Selesaikan latihan yang sedang berjalan terlebih dahulu.';
  end if;

  select * into v_training from public.caleris_driver_training_catalog
    where training_key=p_training_key and is_active;
  if not found then raise exception 'Skema latihan tidak tersedia.'; end if;
  select * into v_mode from public.caleris_driver_training_modes
    where training_key=p_training_key and mode_key=p_mode_key and is_active;
  if not found then raise exception 'Mode latihan tidak tersedia.'; end if;

  select max(cooldown_until) into v_cooldown
  from public.caleris_driver_training_attempts
  where member_id=v_member.id and training_key=p_training_key
    and status in ('success','failed') and cooldown_until>v_now;
  if v_cooldown is not null then
    raise exception 'Latihan masih cooldown sampai %.',to_char(v_cooldown at time zone 'Asia/Jakarta','DD Mon YYYY HH24:MI:SS');
  end if;

  select a.current_value into v_value
  from public.caleris_driver_development_attributes a
  where a.member_id=v_member.id and a.attribute_key=v_training.attribute_key
  for update;
  if v_value is null then raise exception 'Data atribut Driver belum tersedia.'; end if;
  if (v_training.attribute_key='mistake_rate' and v_value<=50)
    or (v_training.attribute_key<>'mistake_rate' and v_value>=100) then
    raise exception 'Atribut sudah mencapai batas pengembangan latihan.';
  end if;

  insert into public.caleris_driver_training_attempts(
    member_id,training_key,mode_key,started_at,completes_at,expires_at,
    success_chance,attribute_before,mode_snapshot
  ) values (
    v_member.id,p_training_key,p_mode_key,v_now,
    v_now+make_interval(secs=>v_mode.duration_seconds),
    v_now+make_interval(secs=>v_mode.duration_seconds+900),
    v_mode.success_chance,v_value,
    jsonb_build_object('duration_seconds',v_mode.duration_seconds,
      'cooldown_seconds',v_mode.cooldown_seconds,'success_chance',v_mode.success_chance,
      'success_gain',v_mode.success_gain,'failure_loss',v_mode.failure_loss)
  ) returning * into v_attempt;

  return jsonb_build_object('attempt_id',v_attempt.id,'training_key',p_training_key,
    'mode_key',p_mode_key,'started_at',v_attempt.started_at,
    'completes_at',v_attempt.completes_at,'expires_at',v_attempt.expires_at,
    'duration_seconds',v_mode.duration_seconds,'attribute_before',v_value);
end;
$function$;

create or replace function public.member_complete_driver_training(
  p_actor_id uuid,
  p_attempt_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_member public.members%rowtype;
  v_attempt public.caleris_driver_training_attempts%rowtype;
  v_training public.caleris_driver_training_catalog%rowtype;
  v_mode public.caleris_driver_training_modes%rowtype;
  v_attribute_id uuid;
  v_before numeric(5,2);
  v_after numeric(5,2);
  v_delta numeric(5,2);
  v_roll numeric(7,4);
  v_success boolean;
  v_now timestamptz:=clock_timestamp();
  v_cooldown_until timestamptz;
begin
  if p_actor_id is null or p_attempt_id is null then raise exception 'Sesi latihan tidak valid.'; end if;
  select m.* into v_member
  from public.profiles p join public.members m on m.id=p.member_id
  where p.user_id=p_actor_id and m.role='Driver'
  for update of m;
  if not found then raise exception 'Training hanya tersedia untuk akun dengan role Driver.'; end if;

  select * into v_attempt from public.caleris_driver_training_attempts
  where id=p_attempt_id and member_id=v_member.id for update;
  if not found then raise exception 'Sesi latihan tidak ditemukan.'; end if;
  if v_attempt.status<>'started' then raise exception 'Sesi latihan sudah diselesaikan atau tidak aktif.'; end if;
  if v_now<v_attempt.completes_at then raise exception 'Timer latihan belum selesai.'; end if;
  if v_now>v_attempt.expires_at then
    update public.caleris_driver_training_attempts set status='expired',resolved_at=v_now
      where id=v_attempt.id;
    return jsonb_build_object('status','expired','attempt_id',v_attempt.id);
  end if;

  select * into v_training from public.caleris_driver_training_catalog
    where training_key=v_attempt.training_key;
  select * into v_mode from public.caleris_driver_training_modes
    where training_key=v_attempt.training_key and mode_key=v_attempt.mode_key;
  select id,current_value into v_attribute_id,v_before
  from public.caleris_driver_development_attributes
  where member_id=v_member.id and attribute_key=v_training.attribute_key
  for update;
  if v_attribute_id is null then raise exception 'Data atribut Driver tidak ditemukan.'; end if;

  v_roll:=round((random()*100)::numeric,4);
  v_success:=v_roll<=v_attempt.success_chance;
  if v_training.attribute_key='mistake_rate' then
    v_delta:=case when v_success then -v_mode.success_gain else v_mode.failure_loss end;
  else
    v_delta:=case when v_success then v_mode.success_gain else -v_mode.failure_loss end;
  end if;
  v_after:=greatest(50,least(100,v_before+v_delta));
  v_delta:=v_after-v_before;
  update public.caleris_driver_development_attributes
    set current_value=v_after,updated_at=v_now,updated_by=p_actor_id
    where id=v_attribute_id;

  v_cooldown_until:=v_now+make_interval(secs=>v_mode.cooldown_seconds);
  update public.caleris_driver_training_attempts
  set status=case when v_success then 'success' else 'failed' end,
      resolved_at=v_now,cooldown_until=v_cooldown_until,success_roll=v_roll,
      attribute_before=v_before,attribute_after=v_after,attribute_delta=v_delta
  where id=v_attempt.id;

  return jsonb_build_object('status',case when v_success then 'success' else 'failed' end,
    'attempt_id',v_attempt.id,'training_key',v_attempt.training_key,
    'attribute_key',v_training.attribute_key,'previous_value',v_before,
    'new_value',v_after,'attribute_delta',v_delta,'success_roll',v_roll,
    'success_chance',v_attempt.success_chance,'cooldown_until',v_cooldown_until);
end;
$function$;

revoke all on function public.member_start_driver_training(uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.member_complete_driver_training(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.member_start_driver_training(uuid,text,text) to service_role;
grant execute on function public.member_complete_driver_training(uuid,uuid) to service_role;

commit;
