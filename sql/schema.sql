-- ============================================================
-- ことばの道場 - データベーススキーマ
-- Supabaseの SQL Editor にこのファイルの中身を貼り付けて実行してください。
-- ============================================================

-- 1. プロフィール（学生・教員 共通。auth.users と1:1で紐づく）
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'teacher')),
  display_name text not null,
  student_code text unique,           -- 学生のみ使用。ログイン時に入力するID
  class_id uuid,                      -- 学生のみ使用。所属クラス
  created_by uuid references profiles(id), -- 学生を発行した教員
  current_password_plaintext text,    -- 学生のみ使用。教員がパスワードを忘れた学生に案内できるよう平文でも保持（下記コメント参照）
  created_at timestamptz not null default now()
);
-- 既存のprofilesテーブルに列だけ追加したい場合（テーブルは既にあるがcurrent_password_plaintext列が無い場合）のための保険
alter table profiles add column if not exists current_password_plaintext text;

-- ※ current_password_plaintext について：
-- Supabase Authはパスワードをハッシュ化して保存するため、本来「今のパスワードを確認する」ことはできません。
-- しかし本システムの学生アカウントは実メールを持たない教室運用の疑似アカウントであるため、
-- 教員が忘れた学生に案内できるよう、教員がアカウント発行・再設定した「現在のパスワード」をこの列にも保存しています。
-- この列は教員本人（created_by）と学生本人しかSELECTできません（下記RLS参照）。

-- 2. クラス
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_class_id_fkey'
  ) then
    alter table profiles
      add constraint profiles_class_id_fkey foreign key (class_id) references classes(id) on delete set null;
  end if;
end $$;

-- 3. 問題データ（単語・文法・漢字書き取り・語彙4択・漢字4択・読解・並べ替え　共通テーブル）
-- 単語系は、以前は type='vocab' 1種類が①②③④すべてに使われていたが、
-- （例：漢字を含まない語彙だと①④の「読み方」練習が成立しない、という問題があったため）
-- ①②③④それぞれ専用の種類（flashcardReading / flashcardMeaning / vocab4 / kanji）に分離した。
-- 'vocab'は後方互換のため残しており、引き続き①②③④すべてに使われる（新規にアップロードする場合は
-- 専用の種類を使うことを推奨するが、'vocab'のまま使い続けることも可能）。
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('vocab', 'flashcardReading', 'flashcardMeaning', 'vocab4', 'kanji', 'grammar', 'kakitori', 'vocab4choice', 'kanji4choice', 'reading', 'reorder')),
  level text not null check (level in ('N5', 'N4', 'N3', 'N2', 'N1')),
  word text,          -- vocab系（vocab/flashcardReading/flashcardMeaning/vocab4/kanji）用
  reading text,       -- vocab系 / kakitori用
  meaning text,       -- vocab系 / kakitori用
  meaning_en text,    -- vocab系用（任意）
  example text,       -- vocab系用（任意）
  blank text,         -- grammar / vocab4choice / kanji4choice用（問題文）、reorder用（___を含む例文）
  choice1 text, choice2 text, choice3 text, choice4 text, -- grammar / vocab4choice / kanji4choice用
  answer int,         -- grammar / vocab4choice / kanji4choice用（1〜4）
  char text,          -- kakitori用（単漢字）
  passage text,       -- reading用：文章本文
  reading_questions jsonb, -- reading用：[{question,choice1..4,answer}] を最大5件
  cards jsonb,        -- reorder用：正しい順番の単語配列（3〜6件）
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
-- 既存プロジェクトへの追加保険：
alter table questions add column if not exists passage text;
alter table questions add column if not exists reading_questions jsonb;
alter table questions add column if not exists cards jsonb;
-- 既存プロジェクトのtype制約に新しい種類を追加する（Postgresのデフォルト命名: questions_type_check）
alter table questions drop constraint if exists questions_type_check;
alter table questions add constraint questions_type_check
  check (type in ('vocab', 'flashcardReading', 'flashcardMeaning', 'vocab4', 'kanji', 'grammar', 'kakitori', 'vocab4choice', 'kanji4choice', 'reading', 'reorder'));

-- 3-1. CSVアップロード履歴（教員が「問題管理」で取り込んだCSVを1回ずつ記録する）
--      raw_csv には元のCSVをそのまま保存し、後から「そのままの内容」をダウンロードできるようにする。
create table if not exists csv_uploads (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  file_name text,
  mode text not null check (mode in ('add', 'replace')), -- add=追加 / replace=新規（全削除して追加）
  row_count int not null default 0,
  raw_csv text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz -- このアップロード分の問題が削除された日時（未削除ならnull）
);
create index if not exists csv_uploads_teacher_idx on csv_uploads(teacher_id);
-- 既存プロジェクトへの追加保険：
alter table csv_uploads add column if not exists deleted_at timestamptz;

-- questionsがどのアップロードで追加されたかを記録（履歴からのダウンロード・そのCSV分だけの削除に使う）
-- 既存プロジェクトへの追加保険：
alter table questions add column if not exists upload_id uuid references csv_uploads(id) on delete set null;

-- 4. 学習進捗（誰が・どの問題を・いつ・正解したか）
create table if not exists progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  mode text not null check (mode in ('flashcardReading','flashcardMeaning','vocab4','kanji','grammar4','kakitori','vocab4choice','kanji4choice','reading','reorder')),
  correct boolean not null,
  favorited boolean not null default false,
  answered_at timestamptz not null default now()
);
-- 既存プロジェクトのmode制約に新しいモードを追加する（Postgresのデフォルト命名: progress_mode_check）
alter table progress drop constraint if exists progress_mode_check;
alter table progress add constraint progress_mode_check
  check (mode in ('flashcardReading','flashcardMeaning','vocab4','kanji','grammar4','kakitori','vocab4choice','kanji4choice','reading','reorder'));

create index if not exists progress_student_idx on progress(student_id);
create index if not exists progress_question_idx on progress(question_id);

-- 5. 学習セッション（「学習時間」「フラッシュカードの学習回数」を記録するためのテーブル）
--    1行 = ある学生が、あるモード・レベルの画面を1回開いてから離れるまでの記録。
--    items は「1回」とみなした回数（③④⑤⑥は解答した問題数、①②は「次へ」でカードを進めた回数）。
create table if not exists study_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  mode text not null check (mode in ('flashcardReading','flashcardMeaning','vocab4','kanji','grammar4','kakitori','vocab4choice','kanji4choice','reading','reorder')),
  level text not null,
  items int not null default 0,
  duration_seconds int not null default 0,
  started_at timestamptz not null default now()
);
create index if not exists study_sessions_student_idx on study_sessions(student_id);
-- 既存プロジェクトのmode制約に新しいモードを追加する（Postgresのデフォルト命名: study_sessions_mode_check）
alter table study_sessions drop constraint if exists study_sessions_mode_check;
alter table study_sessions add constraint study_sessions_mode_check
  check (mode in ('flashcardReading','flashcardMeaning','vocab4','kanji','grammar4','kakitori','vocab4choice','kanji4choice','reading','reorder'));

-- ============================================================
-- Row Level Security（各自のデータしか見えない/触れないようにする）
-- ============================================================
alter table profiles enable row level security;
alter table classes enable row level security;
alter table questions enable row level security;
alter table progress enable row level security;
alter table study_sessions enable row level security;
alter table csv_uploads enable row level security;

-- profiles: 本人は自分の行を見られる。教員は自分が発行した学生を見られる。
drop policy if exists "自分のプロフィールを見る" on profiles;
create policy "自分のプロフィールを見る" on profiles for select
  using (id = auth.uid());
drop policy if exists "教員は自分が発行した学生を見る" on profiles;
create policy "教員は自分が発行した学生を見る" on profiles for select
  using (created_by = auth.uid());
drop policy if exists "本人はプロフィールを更新できる" on profiles;
create policy "本人はプロフィールを更新できる" on profiles for update
  using (id = auth.uid());

-- 【変更点】教員登録は招待コードを検証するAPI（service_roleキー使用）経由でのみ行うようにしたため、
-- クライアントから誰でも role='teacher' のプロフィールを自己登録できてしまう以下のポリシーは削除します。
drop policy if exists "教員は自分のプロフィールを作成できる" on profiles;

-- classes: 教員は自分のクラスのみ操作可能。学生は自分が所属するクラスだけ見られる（マイアカウント画面用）。
drop policy if exists "教員は自分のクラスを見る" on classes;
create policy "教員は自分のクラスを見る" on classes for select
  using (teacher_id = auth.uid());
drop policy if exists "教員は自分のクラスを作れる" on classes;
create policy "教員は自分のクラスを作れる" on classes for insert
  with check (teacher_id = auth.uid());
drop policy if exists "学生は自分のクラスを見る" on classes;
create policy "学生は自分のクラスを見る" on classes for select
  using (exists (select 1 from profiles where profiles.class_id = classes.id and profiles.id = auth.uid()));
drop policy if exists "教員は自分のクラスを削除できる" on classes;
create policy "教員は自分のクラスを削除できる" on classes for delete
  using (teacher_id = auth.uid());

-- questions: ログインしていれば誰でも閲覧可（学生が問題を解くため）。作成・編集は教員のみ。
drop policy if exists "ログインユーザーは問題を見られる" on questions;
create policy "ログインユーザーは問題を見られる" on questions for select
  using (auth.uid() is not null);
drop policy if exists "教員は問題を追加できる" on questions;
create policy "教員は問題を追加できる" on questions for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'teacher'));
drop policy if exists "教員は問題を削除できる" on questions;
create policy "教員は問題を削除できる" on questions for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'teacher'));

-- progress: 学生は自分の記録のみ読み書きできる。教員は自分が発行した学生の記録を読める。
drop policy if exists "学生は自分の進捗を書き込める" on progress;
create policy "学生は自分の進捗を書き込める" on progress for insert
  with check (student_id = auth.uid());
drop policy if exists "学生は自分の進捗を見られる" on progress;
create policy "学生は自分の進捗を見られる" on progress for select
  using (student_id = auth.uid());
drop policy if exists "教員は担当学生の進捗を見られる" on progress;
create policy "教員は担当学生の進捗を見られる" on progress for select
  using (exists (
    select 1 from profiles where profiles.id = progress.student_id and profiles.created_by = auth.uid()
  ));

-- study_sessions: 学生は自分の記録のみ読み書き。教員は自分が発行した学生の記録を読める。
drop policy if exists "学生は自分の学習セッションを書き込める" on study_sessions;
create policy "学生は自分の学習セッションを書き込める" on study_sessions for insert
  with check (student_id = auth.uid());
drop policy if exists "学生は自分の学習セッションを見られる" on study_sessions;
create policy "学生は自分の学習セッションを見られる" on study_sessions for select
  using (student_id = auth.uid());
drop policy if exists "教員は担当学生の学習セッションを見られる" on study_sessions;
create policy "教員は担当学生の学習セッションを見られる" on study_sessions for select
  using (exists (
    select 1 from profiles where profiles.id = study_sessions.student_id and profiles.created_by = auth.uid()
  ));

-- csv_uploads: アップロードした教員本人のみ、読み書き・削除できる。
drop policy if exists "教員は自分のアップロード履歴を見られる" on csv_uploads;
create policy "教員は自分のアップロード履歴を見られる" on csv_uploads for select
  using (teacher_id = auth.uid());
drop policy if exists "教員はアップロード履歴を作れる" on csv_uploads;
create policy "教員はアップロード履歴を作れる" on csv_uploads for insert
  with check (teacher_id = auth.uid());
drop policy if exists "教員は自分のアップロード履歴を削除できる" on csv_uploads;
create policy "教員は自分のアップロード履歴を削除できる" on csv_uploads for delete
  using (teacher_id = auth.uid());
drop policy if exists "教員は自分のアップロード履歴を更新できる" on csv_uploads;
create policy "教員は自分のアップロード履歴を更新できる" on csv_uploads for update
  using (teacher_id = auth.uid());
