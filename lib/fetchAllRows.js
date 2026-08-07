// Supabase（PostgREST）は、明示的に件数を指定しない select() でも
// デフォルトで1回のリクエストにつき最大1000件までしか返さない（Project Settings
// の「Max rows」設定。デフォルト値は1000）。
// 登録件数がこれを超えると、単純な select() では一部の行が取得できず、
// 「取得できた分だけ削除する／表示する」ことになり、データが残ってしまったり
// 学生に一部の問題しか出題されなかったりする不具合につながる。
//
// この関数は .range() を使って1000件ずつページ送りしながら全件を取得する。
//
// 使い方: makeQuery には、呼ばれるたびに「新しい」クエリを返す関数を渡す
// （supabase-jsのクエリは一度実行すると再利用できないため）。
// 例: await fetchAllRows(() => supabase.from("questions").select("id"))
export async function fetchAllRows(makeQuery, pageSize = 1000) {
  let allRows = [];
  let from = 0;
  // 万一の無限ループを避けるための安全弁（合計100万件まで）
  const MAX_PAGES = 1000;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < pageSize) break; // これ以上データが無い
    from += pageSize;
  }
  return allRows;
}
