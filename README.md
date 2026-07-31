# ことばの道場 - 日本語学習サイト

日本語学習者（留学生）向けの単語・文法・漢字学習サイト。QuizletやMonoxerのような機能を持つ。

## 実装済み機能

- ①フラッシュカード（読み方） ②フラッシュカード（意味） ③単語4択問題 ④漢字読み方入力 ⑤文法穴埋め問題 ⑥漢字書き取り問題（AI手書き認識）
- JLPTレベル（N5〜N1）別の出題、お気に入り、シャッフル、多言語モード（日本語/英語切り替え）
- 学生アカウント（ID・パスワードでログイン）
- 教員管理画面（学生登録・進捗閲覧・CSVによる問題管理）
- 学習進捗の自動記録（③④⑤⑥のみ。①②は正誤の概念がないため記録対象外＝仕様）

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
  teacher/               教員関連画面（login, signup, dashboard, students, upload）
  api/teacher/create-student.js   学生アカウント発行API（service_roleキー使用・サーバー専用）
components/NihongoApp.jsx   ①〜⑥の学習画面本体（Supabaseからデータ取得・進捗記録に対応）
lib/supabaseClient.js   Supabaseクライアント初期化
sql/schema.sql          データベーススキーマ（テーブル定義・RLSポリシー）
chat-preview-reference/nihongo_gakushu_app.jsx
                        Claudeのチャット内でUIを試作・確認する際に使う単体版
                        （本番では使われない。①〜⑥の見た目を変更する際はこちらで
                        先に試してから、同じ変更をcomponents/NihongoApp.jsxにも反映する）
```

## セットアップ手順

引き継ぎ資料（`kotoba_dojo_handoff.md`）の「②再現手順」を参照。Supabase→GitHub→Vercelの順に進める。

## 既知の注意点

- CSVアップロード時、`type=vocab/grammar/kakitori`によって必須列が異なる（詳細はhandoff資料参照）
- 進捗記録は、Supabase上に実在する問題（CSVアップロード済みのもの）に対してのみ行われる。サンプル問題（未アップロード時に表示される内蔵データ）は記録対象外
- ⑥漢字書き取りは、外部サイト（https://sakamoto-nijs.github.io/kanji-tool/model/）からAIモデルを読み込む仕様。実際にデプロイした環境（Vercel等）でのみ動作確認可能で、Claudeのチャット内プレビューでは動作しない
