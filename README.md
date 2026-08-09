# Hanashi - デプロイ手順

## 必要なもの
- Googleアカウント
- GitHubアカウント（無料）
- Vercelアカウント（無料）

---

## STEP 1: Firebaseのセットアップ

1. https://console.firebase.google.com/ を開く
2. 「プロジェクトを作成」→ 名前を入力（例: hanashi-app）→ 作成
3. 左メニュー「構築」→「Realtime Database」→「データベースを作成」
   - ロケーション: asia-southeast1（シンガポール）を選択
   - セキュリティルール: **テストモード** で開始
4. 左メニュー「構築」→「Storage」→「始める」
   - セキュリティルール: **テストモード** で開始
5. 左メニュー「プロジェクトの概要」の歯車アイコン→「プロジェクトの設定」
6. 下にスクロール→「マイアプリ」→「</>」（ウェブ）ボタン
7. アプリ名を入力→「アプリを登録」
8. 表示された `firebaseConfig` をコピーしておく

---

## STEP 2: Firebaseの設定を貼り付ける

`src/firebase.js` を開いて、コピーした内容で上書き：

```js
const firebaseConfig = {
  apiKey: "実際の値",
  authDomain: "実際の値",
  databaseURL: "実際の値",   // ← Realtime DBのURLを必ず入れる
  projectId: "実際の値",
  storageBucket: "実際の値",
  messagingSenderId: "実際の値",
  appId: "実際の値"
};
```

⚠️ `databaseURL` は Realtime Database の画面に表示されるURLです（Storage とは別）

---

## STEP 3: GitHubにアップロード

1. https://github.com/new でリポジトリを作成（名前: hanashi、Privateがおすすめ）
2. このフォルダ全体をアップロード（「uploading an existing file」をクリック）
3. 全ファイルをドラッグ＆ドロップ → 「Commit changes」

---

## STEP 4: Vercelにデプロイ

1. https://vercel.com にアクセス → GitHubでログイン
2. 「New Project」→ hanashiリポジトリを選択
3. Framework Preset: **Create React App**
4. 「Deploy」ボタンを押す
5. 1〜2分でデプロイ完了 → URLが発行される 🎉

---

## Firebaseのセキュリティルール（本番前に設定）

Realtime Database のルールを以下に変更：

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

（将来的にはユーザー認証を追加してルールを厳しくすることを推奨）

---

## 管理者アカウント
- ユーザー名: ARATA
- パスワード: arata0502
