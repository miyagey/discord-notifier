# 開発ガイドライン & プロジェクトルール

本ドキュメントは、`discord-notifier` プロジェクトにおけるコードの品質保持、共通規約、Git運用およびセキュリティに関するガイドラインです。

---

## 1. コーディング規約

### 1.1 命名規則
- **変数名 / 関数名**: キャメルケース (`camelCase`) を使用する。
  - 例: `sendNotification`, `masterSheet`, `remindList`
- **定数名**: アッパー・スネークケース (`UPPER_SNAKE_CASE`) を使用する。
  - 例: `COMMON_SHEET_URL`, `WEBHOOK_APPLY`, `OLD_COL`
- **ファイル名**: 
  - 共通処理・設定系ファイルは役割が明確な名称にする。
  - JSファイルのエンコーディングは UTF-8 とする。

### 1.2 マジックナンバー・直インデックスの禁止
- スプレッドシートの列番号や定数値は直接数値で記述せず、必ずオブジェクト定数（例: `MASTER_COL.BRAND` や `APPLY_COL.STATUS`）で定義して使用する。

### 1.3 JSDoc・ドキュメンテーション
- 各関数の直前には、役割・引数・戻り値を明記した JSDoc コメントを記述する。
  ```javascript
  /**
   * Discordへメッセージを送信する共通関数
   * @param {string} webhookUrl - 送信先のWebhook URL
   * @param {string} message - 送信するメッセージ内容
   */
  function sendNotification(webhookUrl, message) { ... }
  ```

### 1.4 日付処理・ログ出力の標準化
- 日付フォーマットは共通関数 `formatDateJST(date, format)` を使用して形式のバラつきを防ぐ。
- エラーハンドリング時は、`logError(contextName, error)` を使用してログ出力を統一する。

### 1.5 関数の配置ルール（トップダウン記述）
- エントリーポイントとなる**メイン処理関数をファイルの最上部に配置**する。
- メイン関数から呼び出されるデータ抽出・ヘルパー関数は、メイン関数の下部に配置することで、ファイル全体の可読性と流れを明確に保つ。

---


## 2. セキュリティ & クレデンシャル管理

### 2.1 機密情報の記述禁止
- Discord Webhook URL、スプレッドシート ID、カレンダー ID などの機密情報は **ソースコード上に直接ハードコードしない**。
- **ローカル環境**: `config.local.js` で定義する。（`.gitignore` によりコミット対象外）
- **本番環境 (GAS)**: スクリプトのプロパティ (`PropertiesService.getScriptProperties()`) から取得する。

### 2.2 Git 管理対象外ファイル
- 以下は絶対に Git にコミットしないこと：
  - `config.local.js`
  - `.clasprc.json`
  - `node_modules/`

---

## 3. Git ブランチ & コミット規約

### 3.1 ブランチ運用 & ローカル環境最新化（必須ルール）
ユーザーから「マージした」「作業再開」「新しい作業を開始する」旨の指示があった場合、および新しいタスクを開始する際は、**例外なく以下の最新化・クリーンアップ手順を最初に必ず自律実行すること。**

1. **`main` の最新化とマージ済みブランチの整理 (必須)**:
   - `git checkout main`
   - `git pull origin main`
   - `git fetch --prune`
   - マージ済みローカルブランチの一括削除:  
     `git branch --merged main | grep -v '^\*' | grep -v 'main' | xargs git branch -d`
2. **専用作業ブランチの作成と切り替え**:
   - `main`: 安定した本番・最新コードブランチ（直接コミット・直接push禁止）
   - `feature/*`: 機能追加用の作業ブランチ
   - `fix/*`: バグ修正用の作業ブランチ
   - `refactor/*`: リファクタリング用の作業ブランチ
   - `docs/*`: ドキュメント作成・修正用の作業ブランチ

### 3.2 コミットメッセージの接頭辞
コミットメッセージは以下のプレフィックスを推奨します：
- `feat:` 新機能追加
- `fix:` バグ修正
- `refactor:` リファクタリング（機能追加・バグ修正を含まない設計改善）
- `docs:` ドキュメント類（README, AGENTS.md等）の修正
- `style:` コードの意味に影響を与えない変更（フォーマット、空白等）

---

## 4. clasp & GAS デプロイ規約
- **自動デプロイ (CI/CD)**: `main` ブランチへのマージ時、GitHub Actions (`.github/workflows/deploy.yml`) により自動で `clasp push --force` が実行される。
- **手動デプロイ (ローカル)**: 緊急時や開発確認用として `npm run push:all` 等のコマンドを使用可能。
- 不要なファイルが GAS 上に同期されないよう、`.claspignore` を適切に維持・更新する。

---

## 5. エージェントの作業範囲とデプロイ権限

### 5.1 エージェントが自律的に実施してよい操作
- 新タスク開始時の `main` 最新化・`git fetch --prune`・マージ済みブランチ削除
- 目的に応じた新規作業ブランチの作成と切り替え (`git checkout -b ...`)
- ローカルファイルの編集・作成・削除
- `git add` / `git commit`（コミットメッセージは規約に従う）
- `clasp pull`（GASからのコード取得）
- **作業ブランチ（`main` 以外）のリモートへの `git push`**
- **GitHub での Pull Request 作成（`gh pr create` 等）**

### 5.2 ユーザーが手動で実施する操作（エージェントは実行しない）
- `main` ブランチへの直接 push、および Pull Request のマージ操作
  - ※ PR が `main` へマージされると、GitHub Actions により本番 GAS へ自動デプロイされます。

> **理由**: 本番環境（`main` ブランチおよび本番 GAS）への直接反映は、人間が最終確認・判断した上で PR マージを行う。
> 作業ブランチへの push および PR 作成まではエージェントが自律的に行い、ユーザーへ PR のレビュー・マージを案内する。
