begin;

-- Update the live difficulty payout table used by future quest assignments.
update public.caleris_quest_difficulty_rewards
set reward_amount = case difficulty
  when 'easy' then 100000
  when 'normal' then 200000
  when 'hard' then 400000
  when 'elite' then 750000
end,
updated_at = now()
where difficulty in ('easy','normal','hard','elite');

-- Refresh rewards on quests that have not been paid yet.
-- Completed/paid history remains unchanged; pending and active quests adopt the new rates.
update public.caleris_quest_assignments a
set reward_amount = r.reward_amount
from public.caleris_quest_catalog c
join public.caleris_quest_difficulty_rewards r on r.difficulty = c.difficulty
where a.quest_id = c.id
  and a.reward_status <> 'paid';

commit;