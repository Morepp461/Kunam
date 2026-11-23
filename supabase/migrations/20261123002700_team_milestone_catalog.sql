insert into public.caleris_milestone_definitions(scope,code,title,description,metric_key,target_value,xp_reward,badge_code)
values
('team','team_races_10','Race Team','Menyelesaikan 10 entri balapan.','team_races',10,0,null),
('team','team_wins_5','Winning Team','Meraih 5 kemenangan balapan.','team_wins',5,0,null),
('team','team_podiums_10','Podium Collective','Meraih 10 podium balapan.','team_podiums',10,0,null),
('team','team_drivers_2','Full Line-up','Memiliki dua Driver aktif dalam roster.','team_drivers',2,0,null)
on conflict(code) do nothing;
do $refresh$
declare t record;
begin
 for t in select id from public.teams loop
  perform public.caleris_refresh_team_milestones(t.id);
 end loop;
end;
$refresh$;
