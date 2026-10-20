-- 015: 公開キー（anon / authenticated）を読み取り専用にする
-- 適用: 2026-10-20 22:12 JST（Supabase SQL Editor で実行）
--
-- 背景（2026-10-20 監査）:
--   - 8テーブルで RLS が無効、残りのテーブルも「insert/update/delete を public に許可（条件 true）」の
--     ポリシーになっており、サイトに埋め込まれた公開キーで誰でも全テーブルを改ざん・削除できた。
--   - コレクター（GitHub Actions）は service_role キーで書き込んでおり、RLS の対象外なので影響しない。
--   - フロント（Next.js）は読み取りのみで、書き込み・RPC 呼び出しはない。
--
-- 方針:
--   1. public スキーマの全テーブルで RLS を有効化
--   2. 既存ポリシーを全削除し、「anon / authenticated は SELECT のみ」を一律に作り直す
--   3. anon / authenticated から書き込み系の権限を剥奪（今後作るテーブルも既定で剥奪）
--   4. SECURITY DEFINER 関数を公開 API から実行できないようにし、search_path を固定

do $$
declare
  t   text;
  pol record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', t);

    for pol in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    execute format(
      'create policy public_read on public.%I for select to anon, authenticated using (true)', t
    );
  end loop;
end $$;

revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from anon, authenticated;

-- 関数（コード上の呼び出しはなし。手動実行用）
revoke execute on function public.recalc_speech_counts()      from public, anon, authenticated;
revoke execute on function public.recalc_question_counts()    from public, anon, authenticated;
revoke execute on function public.recalculate_member_scores() from public, anon, authenticated;

alter function public.recalc_speech_counts()      set search_path = public, pg_temp;
alter function public.recalc_question_counts()    set search_path = public, pg_temp;
alter function public.recalculate_member_scores() set search_path = public, pg_temp;
