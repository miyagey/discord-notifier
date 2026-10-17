# Discord Notifier (GAS Project)

Google Apps Script (GAS) を活用し、チケット申込・イベントスケジュールの管理、Google カレンダーへの自動同期、Webアプリ（カンバンボード）による閲覧・登録、および Discord へのリマインド通知を行う統合通知システムです。

---

## 📚 ドキュメント構成（4層構造）

プロジェクトの理解・開発・保守のためのドキュメントは以下の体系で整理されています。目的に応じて参照してください。

```
.
├── README.md                 # 【本ドキュメント】オンボーディング & 開発者ガイド
├── AGENTS.md                 # AI エージェント用行動規範 & 制約ルール
└── docs/
    ├── ARCHITECTURE.md       # アーキテクチャ・設計方針・レイヤー構造・DTO規約
    ├── SYSTEM_SPEC.md        # システム仕様・データエンティティ・バッチ仕様書
    └── FORM_SPEC.md          # Google フォーム連携・設問項目・トリガー仕様書
```

| ドキュメント | 対象・目的 |
| :--- | :--- |
| **[`README.md`](README.md)** | **開発者向け**: 環境構築、クレデンシャル設定、clasp 操作、CI/CD 手順 |
| **[`AGENTS.md`](AGENTS.md)** | **AI エージェント向け**: コード生成制約、カプセル化ルール、Git 運用規約 |
| **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** | **設計者・開発者向け**: レイヤー構造（オーケストレーション/データアクセス/メッセージ）、DTOパターン、429リトライ |
| **[`docs/SYSTEM_SPEC.md`](docs/SYSTEM_SPEC.md)** | **システム仕様**: スプレッドシートエンティティ、定期通知バッチ、Webアプリ API |
| **[`docs/FORM_SPEC.md`](docs/FORM_SPEC.md)** | **フォーム仕様**: 設問項目、動的選択肢更新、フォーム送信時トリガー |

---

## 📁 ディレクトリ構成

本リポジトリでは、スプレッドシート側の GAS スクリプトとフォーム側の GAS スクリプトをサブディレクトリで分離し、一括管理しています。

```text
.
├── .github/
│   └── workflows/
│       └── deploy.yml        # GitHub Actions 自動デプロイワークフロー (CI/CD)
├── AGENTS.md                 # AI エージェント用プロンプトルール & 開発規約
├── docs/                     # 各種設計・仕様書
│   ├── ARCHITECTURE.md       # アーキテクチャ & 設計方針書
│   ├── SYSTEM_SPEC.md        # システム & データエンティティ仕様書
│   └── FORM_SPEC.md          # Google フォーム連携仕様書
├── package.json              # clasp 一括操作・構文検証用スクリプト
├── jsconfig.json             # JS 開発用エディタ設定
├── spreadsheet/              # スプレッドシート側 GAS プロジェクト (メイン)
│   ├── .clasp.json           # clasp 設定ファイル
│   ├── appsscript.json       # GAS マニフェスト (Webアプリ設定含む)
│   ├── Webアプリ.js          # Webアプリ公開 (doGet) & フロントエンド向け RPC API
│   ├── 定期通知バッチ.js     # 定期リマインド・カレンダー同期オーケストレーション
│   ├── スプレッドシート操作.js # SheetService: 列インデックス隠蔽 & データアクセス
│   ├── カレンダー操作.js     # CalendarService: Google カレンダー同期処理
│   ├── Discord操作.js        # DiscordService: メッセージフォーマット & Webhook送信
│   ├── 設定値.js             # 外部連携URL・プロパティキー等の定数管理
│   ├── 共通関数.js           # 日付フォーマット・共通エラーロガー
│   └── index.html            # Webアプリ (カンバン / タイムライン) SPA UI
└── form/                     # フォーム側 GAS プロジェクト
    ├── .clasp.json           # clasp 設定ファイル
    ├── appsscript.json       # GAS マニフェスト
    ├── コード.js             # フォーム送信受付・シート追記・選択肢動的同期
    └── 新規申込通知.js       # Discord への新着申込即時通知
```

---

## 🔐 クレデンシャル & 環境設定

機密情報（Webhook URL やスプレッドシート ID 等）を保護するため、ローカル環境と本番環境（GAS）で設定方法を分離しています。

### 方法 A: ローカル開発環境での設定 (推奨)

ローカルから `clasp push` 等を行う場合の設定です。

1. **設定ファイルの作成**  
   `config.local.example.js` をコピーして `spreadsheet/config.local.js` を作成します。
   ```bash
   cp config.local.example.js spreadsheet/config.local.js
   ```

2. **設定値の入力**  
   `spreadsheet/config.local.js` に実際の URL や ID を設定します（`.gitignore` により Git コミット対象外）。
   ```javascript
   const CONFIG = {
     COMMON_SHEET_URL: "https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit",
     CALENDAR_ID: "YOUR_CALENDAR_ID@group.calendar.google.com",
     PROXY_BASE_URL: "https://your-discord-proxy.workers.dev",
     WEBHOOK_APPLY: "https://discord.com/api/webhooks/...",
     WEBHOOK_PAYMENT: "https://discord.com/api/webhooks/...",
     WEBHOOK_CALENDAR: "https://discord.com/api/webhooks/...",
     WEBAPP_URL: "https://your-domain.workers.dev" // 任意: Webアプリ短縮URL
   };
   ```

---

### 方法 B: GAS 本番環境での設定 (スクリプトのプロパティ)

GAS の Web エディタ上で本番稼働させる場合、**スクリプトのプロパティ**（`⚙️ プロジェクトの設定 > スクリプトのプロパティ`）に登録します。

#### スプレッドシート側 (`spreadsheet/`)
| プロパティ名 (キー) | 説明 | 設定例 |
| :--- | :--- | :--- |
| `COMMON_SHEET_URL` | 管理用スプレッドシートの URL | `https://docs.google.com/spreadsheets/d/...` |
| `CALENDAR_ID` | Google カレンダー ID | `xxxx@group.calendar.google.com` |
| `PROXY_BASE_URL` | Discord 送信用プロキシのベース URL | `https://my-discord-proxy.workers.dev` |
| `WEBHOOK_APPLY` | 申込締切通知用 Discord Webhook URL | `https://discord.com/api/webhooks/...` |
| `WEBHOOK_PAYMENT` | 入金締切通知用 Discord Webhook URL | `https://discord.com/api/webhooks/...` |
| `WEBHOOK_CALENDAR` | カレンダー同期・予定通知用 Discord Webhook URL | `https://discord.com/api/webhooks/...` |
| `WEBAPP_URL` | Webアプリ公開 URL（Cloudflare 等の短縮 URL） | `https://ticket.example.com` |

#### フォーム側 (`form/`)
| プロパティ名 (キー) | 説明 | 設定例 |
| :--- | :--- | :--- |
| `COMMON_SHEET_URL` | 管理用スプレッドシートの URL | `https://docs.google.com/spreadsheets/d/...` |
| `PROXY_BASE_URL` | Discord 送信用プロキシのベース URL | `https://my-discord-proxy.workers.dev` |
| `WEBHOOK_APPLY` | 新着申込通知用 Discord Webhook URL | `https://discord.com/api/webhooks/...` |
| `FORM_URL` | フォーム自身の URL（通知メッセージ内リンク用） | `https://forms.gle/...` |

---

## 🚀 GitHub Actions 自動デプロイ (CI/CD)

本リポジトリでは、GitHub Actions（`.github/workflows/deploy.yml`）により PR 作成時と main マージ時で処理を分離した安全な CI/CD パイプラインを運用しています。

- **PR作成・コミット時 (CI)**:
  - 構文検証（`npm run lint`）および自動単体テスト（`npm test` / Vitest）が走り、コードの整合性と品質を自動検証します。
  - ※ PR 検証段階では GAS へのデプロイは一切行われません。
- **`main` マージ時 (CD)**:
  - テスト通過後、変更されたディレクトリ（`spreadsheet/` または `form/`）を検知して対象の GAS プロジェクトへ自動デプロイ（`clasp push --force`）されます。
  - **Webアプリバージョン自動更新**: `WEBAPP_DEPLOYMENT_ID` が登録されている場合、マージされた PR 名またはコミット内容をバージョン説明欄に自動記録しながら `clasp deploy` を実行します。

### 必要な GitHub Secrets 設定
リポジトリの **Settings > Secrets and variables > Actions** に以下を登録します：

| Secret 名 | 必須 | 内容 |
| :--- | :---: | :--- |
| `CLASPRC_JSON` | **必須** | ローカルの `~/.clasprc.json` の JSON 文字列全体。<br>`cat ~/.clasprc.json \| pbcopy` (Mac) で取得可能。 |
| `WEBAPP_DEPLOYMENT_ID` | 任意 | スプレッドシート Web アプリのデプロイ ID。設定すると本番バージョンが自動更新されます。 |

---

## 🛠️ ローカル開発コマンド (`npm scripts`)

```bash
# 構文チェック (全スクリプトの node --check 検証)
npm run lint

# 単体テスト (Vitest による実行)
npm test

# 単体テスト (ウォッチモード)
npm run test:watch

# GAS からコードを取得 (clasp pull)
npm run pull:spreadsheet
npm run pull:form
npm run pull:all

# GAS へコードを反映 (clasp push)
npm run push:spreadsheet
npm run push:form
npm run push:all
```

---

## ⏰ 自動化トリガー設定

GAS エディタの **「⏰ トリガー」** メニューより、以下のトリガーを設定します。

| スクリプト | 関数名 | イベントのソース | 実行頻度 / タイミング | 概要 |
| :--- | :--- | :--- | :--- | :--- |
| **フォーム** | `onFormSubmit` | **フォーム** | **フォーム送信時** | 回答受付、シート追記、選択肢自動更新、Discord 即時通知 |
| **スプレッドシート** | `remindEndDate` | 時間主導型 | 毎日 午前 (08:00〜09:00推奨) | 本日申込締切（通常/先着前日/リセール）通知 |
| **スプレッドシート** | `remindPaymentEndDate` | 時間主導型 | 毎日 午前 (08:00〜09:00推奨) | 本日入金締切通知（対象なし時は送信せずログ終了） |
| **スプレッドシート** | `notifyTomorrowEvents` | 時間主導型 | 毎日 夕方〜夜 (20:00〜21:00推奨) | 明日の Google カレンダー予定通知 |
| **スプレッドシート** | `registerEventsToCalendar` | 時間主導型 | 1時間おき推奨 | 未登録イベントの Google カレンダー自動同期 |
