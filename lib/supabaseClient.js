import { createClient } from "@supabase/supabase-js";

// Vercelの環境変数（NEXT_PUBLIC_ で始まるものはブラウザにも公開されます。
// 公開して問題ないのはURLと「anonキー」のみです。service_role キーは絶対にここに書かないでください。
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 学生IDは実際のメールアドレスではないため、Supabase Authが要求する
// メール形式に変換するための共通ルール（ログイン・アカウント発行の両方で使用）
export function studentCodeToEmail(studentCode) {
  return `${studentCode.trim().toLowerCase()}@kotoba-dojo.local`;
}
