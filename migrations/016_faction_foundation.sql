-- 016: 会派への移行 F1 — 新しいテーブルと列の追加（既存の列・テーブルは残す）
-- 適用: 2026-10-20 22:48 JST（Supabase SQL Editor で実行）
-- 設計書: claude/design_kaiha_v1.md
-- 本番の表示には影響しない（画面はまだ新しいテーブルを読まない）。

-- 会派マスタ（衆参の公式の会派一覧から毎日取得）
create table if not exists public.factions (
  house         text    not null check (house in ('衆議院', '参議院')),
  name          text    not null,              -- 正式名（公式表記のまま）
  short_name    text,                          -- 公式の略称（無ければ空）
  first_seen_on date    not null default current_date,
  last_seen_on  date    not null default current_date,
  is_current    boolean not null default true,
  primary key (house, name)
);

-- 会派の所属履歴
--   source = 'roster' : 毎日の議員名簿で所属の変化を検知した日（start_on）〜次の変化の検知日（end_on、所属中は空）
--   source = 'ndl'    : 国会会議録上、その会派で最初に発言した日（start_on）〜最後に発言した日（end_on）
create table if not exists public.member_faction_history (
  id           bigint generated always as identity primary key,
  member_id    text    not null references public.members(id) on delete cascade,
  house        text    not null check (house in ('衆議院', '参議院')),
  faction_name text    not null,
  source       text    not null check (source in ('roster', 'ndl')),
  start_on     date    not null,
  end_on       date,
  record_count integer,                        -- ndl のみ：期間内の発言件数（根拠の量）
  updated_at   timestamptz not null default now(),
  unique (member_id, house, faction_name, source, start_on)
);
create index if not exists idx_mfh_member on public.member_faction_history (member_id);

-- 既存テーブルへの列追加
alter table public.members  add column if not exists faction_short text;  -- 会派の略称
alter table public.speeches add column if not exists speaker_group text;  -- 会議録の発言時点の会派（そのまま）
alter table public.votes    add column if not exists faction       text;  -- 投票結果ページの会派見出し（そのまま）
alter table public.votes    add column if not exists vote_key      text;  -- 投票結果ページのファイル名（例: 221-0323-v008）
create index if not exists idx_votes_vote_key on public.votes (vote_key);

-- 採決ごと・会派ごとの公式の票数（投票結果ページの記載どおり）
create table if not exists public.vote_faction_totals (
  vote_key       text    not null,
  session_number integer not null,
  vote_date      date,
  bill_title     text,
  faction_name   text    not null,
  member_count   integer,
  yes_count      integer not null,
  no_count       integer not null,
  primary key (vote_key, faction_name)
);

-- 会派ペアの採決一致（参院・会期ごと）
--   会派の賛否 = 公式票数で 賛成>反対 なら賛成、反対>賛成 なら反対。同数・0票は対象外。
create table if not exists public.faction_vote_alignments (
  house          text    not null default '参議院',
  session_number integer not null,
  faction_a      text    not null,
  faction_b      text    not null,
  agree_count    integer not null,
  total_count    integer not null,
  updated_at     timestamptz not null default now(),
  primary key (house, session_number, faction_a, faction_b)
);

-- 会派のキーワード（現所属議員のキーワードの合算）
create table if not exists public.faction_keywords (
  house        text    not null,
  faction_name text    not null,
  word         text    not null,
  count        integer not null,
  last_seen_at date,
  primary key (house, faction_name, word)
);

-- 権限：015 と同じく公開キーは読み取りのみ
do $$
declare t text;
begin
  foreach t in array array['factions', 'member_faction_history', 'vote_faction_totals',
                           'faction_vote_alignments', 'faction_keywords'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists public_read on public.%I', t);
    execute format('create policy public_read on public.%I for select to anon, authenticated using (true)', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on sequence public.member_faction_history_id_seq to service_role;
