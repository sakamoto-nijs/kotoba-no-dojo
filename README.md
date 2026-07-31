# ことばの道場 - 日本語学習サイト

日本語学習者（留学生）向けの単語・文法・漢字学習サイト。QuizletやMonoxerのような機能を持つ。

## 実装済み機能

- ①フラッシュカード（読み方） ②フラッシュカード（意味） ③単語4択問題 ④漢字読み方入力 ⑤文法穴埋め問題 ⑥漢字書き取り問題（AI手書き認識）
- JLPTレベル（N5〜N1）別の出題、お気に入り、シャッフル、多言語モード（日本語/英語切り替え）
- 学生アカウント（ID・パスワードでログイン）、学生用「マイアカウント」画面（自分の学習状況・登録情報を閲覧）
- 教員管理画面（学生登録・進捗閲覧・CSVによる問題管理・学生の一括登録・パスワード再設定）
- 教員登録は「合言葉（招待コード）」を知っている人だけができるように制限
- 学習進捗の自動記録（正誤は③④⑤⑥のみ。①②は正誤の概念がないため対象外＝仕様）
- 学習時間・学習回数の自動記録（①〜⑥すべてのモードで、画面を開いてから離れるまでの時間を記録）

## 技術構成

- **フロントエンド/バックエンド**：Next.js（Pages Router）
- **認証・データベース**：Supabase（無料枠）
- **ホスティング**：Vercel（無料枠）※Netlifyは2026年7月の課金システム障害により移行済み
- **コード管理**：GitHub

## フォルダ構成

```
pages/                  各画面
  index.js              ログイン状態に応じて振り分け
  login.js              学生ログイン
  app.js                学生用メイン画面（①〜⑥はcomponents/NihongoApp.jsxを埋め込み）
  mypage.js             学生用「マイアカウント」画面（自分の学習状況・登録情報）
  teacher/               教員関連画面
    login.js             教員ログイン（パスワード再設定リンクあり）
    signup.js            教員登録（合言葉が必要）
    reset-password.js    パスワード再設定メールのリンク先
    dashboard.js          学習状況ダッシュボード（フィルター・ソート・CSV出力・詳細モーダル）
    students.js           学生登録（単体・CSV一括）、パスワード再設定
    upload.js             CSVによる問題管理
  api/teacher/
    create-student.js         学生アカウント発行API
    bulk-create-students.js   学生アカウント一括発行API（CSV取り込み用）
    reset-student-password.js 学生パスワード再設定API
    signup.js                  教員登録API（合言葉を検証。一致した場合のみアカウント作成）
components/NihongoApp.jsx   ①〜⑥の学習画面本体（Supabaseからデータ取得・進捗/学習時間の記録に対応）
lib/supabaseClient.js   Supabaseクライアント初期化
lib/statsHelpers.js     学習統計（正答率・学習回数・学習時間）の集計ロジック。ダッシュボードとマイアカウントで共用
sql/schema.sql          データベーススキーマ（テーブル定義・RLSポリシー）
chat-preview-reference/nihongo_gakushu_app.jsx
                        Claudeのチャット内でUIを試作・確認する際に使う単体版
                        （本番では使われない。①〜⑥の見た目を変更する際はこちらで
                        先に試してから、同じ変更をcomponents/NihongoApp.jsxにも反映する）
```

## セットアップ手順

引き継ぎ資料（`kotoba_dojo_handoff.md`）の「②再現手順」を参照。Supabase→GitHub→Vercelの順に進める。
既存プロジェクトを更新する場合は、`sql/schema.sql`を再度SQL Editorで実行し（何度実行しても安全）、
Vercelの環境変数に `TEACHER_INVITE_CODE`（教員登録の合言葉・任意の文字列）を追加してから再デプロイしてください。

## 既知の注意点

- CSVアップロード時、`type=vocab/grammar/kakitori`によって必須列が異なる（詳細はhandoff資料参照）
- 進捗記録は、Supabase上に実在する問題（CSVアップロード済みのもの）に対してのみ行われる。サンプル問題（未アップロード時に表示される内蔵データ）は記録対象外
- ⑥漢字書き取りは、外部サイト（https://sakamoto-nijs.github.io/kanji-tool/model/）からAIモデルを読み込む仕様。実際にデプロイした環境（Vercel等）でのみ動作確認可能で、Claudeのチャット内プレビューでは動作しない
- 学習時間の計測はブラウザのタブを普通に閉じた場合（「戻る」ボタンを押さずに離脱した場合）は記録されないことがある（SPA内の画面遷移・ログアウトでは正しく記録される）
- 学生の「現在のパスワード」はSupabase Authとは別に、`profiles.current_password_plaintext`列に平文でも保存している。これは学生アカウントが実メールを持たない教室運用の疑似アカウントであるための運用上の割り切りであり、教員本人・学生本人しか閲覧できないようRLSで制限している（教員の実メールアカウントのパスワードは表示できない）
