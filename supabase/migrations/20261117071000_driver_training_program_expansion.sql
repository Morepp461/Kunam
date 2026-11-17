begin;
insert into public.caleris_driver_training_catalog
  (training_key,attribute_key,title,tagline,briefing,scenario)
values
 ('race_consistency','race_pace','Race Pace · Consistency Stint','Jaga delta waktu tetap rapat sepanjang long-run.','Rangkaikan lap konsisten saat bahan bakar, grip, dan traffic berubah. Fokus pada ritme yang bisa diulang.','DELTA CONTROL: Target lap berubah karena traffic. Pertahankan ritme tanpa mengejar satu lap sempurna.'),
 ('qualifying_sector','qualifying_pace','Qualifying Pace · Sector Precision','Bangun satu lap cepat dari tiga sektor yang bersih.','Evaluasi entry, apex, dan exit untuk mengoptimalkan waktu sektor tanpa kehilangan momentum.','SECTOR ATTACK: Sektor pertama aman, sektor kedua teknis, sektor ketiga membutuhkan exit speed sempurna.'),
 ('experience_strategy','experience','Experience · Strategy Room','Ambil keputusan tepat dari data yang tidak selalu lengkap.','Latihan membaca undercut, overcut, cuaca, dan jendela pit berdasarkan informasi race engineer.','STRATEGY CALL: Hujan diperkirakan datang dalam beberapa lap. Tentukan respons berdasarkan data stint dan posisi rival.'),
 ('aggression_launch','aggression','Aggression · Launch Window','Ukur keberanian mengambil peluang pada momen start.','Latihan menentukan kapan mengambil ruang dan kapan menahan diri agar serangan tetap terkendali.','START REACTION: Lampu padam dan ruang terbuka di sisi luar. Pilih timing serangan yang tepat.'),
 ('defensive_pressure','defensive_strength','Defensive Strength · Pressure Defence','Tetap disiplin saat rival terus menekan.','Latih konsistensi garis pertahanan dan pengelolaan posisi saat tekanan berlangsung beberapa lap.','MIRROR CHECK: Rival melakukan beberapa percobaan serangan. Pertahankan posisi tanpa kehilangan racing line.'),
 ('overtake_slipstream','overtake_skill','Overtake Skill · Slipstream Craft','Ubah kecepatan tambahan menjadi manuver yang bersih.','Latih pemilihan jarak, momentum keluar tikungan, dan penggunaan slipstream untuk menyiapkan passing zone.','TOW HUNTER: Kamu berada di belakang rival dengan selisih kecil. Susun tow dan pilih titik keluar untuk menyalip.'),
 ('mistake_clean','mistake_rate','Mistake Rate · Clean Sector','Hilangkan kesalahan berulang pada sektor teknis.','Latih input yang halus, titik pengereman konsisten, dan transisi kemudi yang presisi. Nilai Mistake Rate lebih rendah berarti lebih baik.','CLEAN SECTOR: Sektor beruntun menuntut presisi. Jaga setiap input tetap konsisten hingga garis akhir.'),
 ('tyre_degradation','tyre_management','Tyre Management · Degradation Control','Perpanjang umur ban tanpa mengorbankan seluruh pace.','Latihan mengendalikan temperatur dan degradasi saat stint panjang dengan beban ban yang berubah.','DEG CONTROL: Degradasi mulai meningkat. Temukan keseimbangan antara pace, temperatur, dan umur ban.')
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
where c.training_key in (
 'race_consistency','qualifying_sector','experience_strategy','aggression_launch',
 'defensive_pressure','overtake_slipstream','mistake_clean','tyre_degradation'
)
on conflict (training_key,mode_key) do update set
  duration_seconds=excluded.duration_seconds,cooldown_seconds=excluded.cooldown_seconds,
  success_chance=excluded.success_chance,success_gain=excluded.success_gain,
  failure_loss=excluded.failure_loss,is_active=true;
commit;