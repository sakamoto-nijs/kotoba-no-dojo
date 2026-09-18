import { Html, Head, Main, NextScript } from "next/document";

// サイト全体（教員向け・学生向けどちらの画面も含む）で、ブラウザの自動翻訳を防ぐ。
// ・<html translate="no"> と <meta name="google" content="notranslate"> の両方を指定するのが、
//   Chromeの自動翻訳の提案・翻訳バーを抑止する標準的な方法（片方だけでは効かない場合があるため両方指定する）。
export default function Document() {
  return (
    <Html lang="ja" translate="no">
      <Head>
        <meta name="google" content="notranslate" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
