# ことばの道場 - アカウント・教員管理サイト（土台）

このプロジェクトには、以下が含まれています。

- 学生ログイン（ID・パスワード）
- 教員ログイン・新規登録
- 教員による学生アカウント発行
- 教員ダッシュボード（学生ごとの進捗サマリー）
- CSVによる問題データのアップロード（Supabaseのquestionsテーブルへ反映）

**まだ含まれていないもの**：これまで作成した①〜⑥の学習画面（フラッシュカード等）本体との統合です。
この土台が正しく動くことを確認できたら、次のステップで統合します。

---

## 手順1：Supabaseプロジェクトを作る（無料）

1. https://supabase.com にアクセスし、GitHubアカウントでサインイン
2. 「New project」から新規プロジェクトを作成（Database Passwordは控えておく）
3. 作成後、左メニューの **SQL Editor** を開き、`sql/schema.sql` の中身を全部貼り付けて実行
4. 左メニューの **Authentication → Providers → Email** を開き、「Confirm email」を **オフ** にする
   - オンのままだと、アカウント作成のたびにメール確認が必要になり、学生アカウント（実在しないメール形式）が使えなくなります
5. 左メニューの **Settings → API** を開き、次の3つをメモする
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` キー → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` キー → `SUPABASE_SERVICE_ROLE_KEY`（**絶対に人に見せない・公開しない**）

## 手順2：GitHubにアップロードする

1. GitHubで新しいリポジトリを作成（例: `kotoba-no-dojo`）
2. このフォルダの中身をそのリポジトリにpush
   ```
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/あなたのアカウント/kotoba-no-dojo.git
   git push -u origin main
   ```

## 手順3：Netlifyでデプロイする

1. https://app.netlify.com にログイン → 「Add new site」→「Import an existing project」
2. 先ほどのGitHubリポジトリを選択
3. Build settings はそのまま（`netlify.toml` に設定済みなので変更不要）
4. デプロイ前に **Site settings → Environment variables** で、手順1でメモした3つの値を登録
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. 「Deploy site」

## 手順4：動作確認

1. 発行されたURL（例: `https://xxxx.netlify.app`）にアクセス → `/teacher/signup` で教員アカウントを作成
2. ログインしてダッシュボードが表示されることを確認
3. 「学生登録」から学生アカウントを1件発行してみる
4. ブラウザのシークレットウィンドウなどで `/login` を開き、発行した学生ID・パスワードでログインできることを確認
5. 「問題管理」からテンプレートCSVをそのままアップロードし、エラーなく取り込めることを確認

ここまで動けば土台は完成です。次のステップで、①〜⑥の学習画面をこの中に組み込み、
学生が問題を解くたびに `progress` テーブルへ記録されるようにします。

## ローカルで試したい場合

```
npm install
cp .env.local.example .env.local   # 値を埋める
npm run dev
```
