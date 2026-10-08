# Discord Notifier (GAS Project)

Google Apps Script (GAS) を活用し、Google フォームの送信受付、Google スプレッドシートのイベント・申込・入金締切情報の管理、Google カレンダーへの自動登録および Discord チャンネルへの通知を行うシステムです。

> 📖 **詳細仕様書**:
> - [docs/SYSTEM_SPEC.md](docs/SYSTEM_SPEC.md): システム構造・スプレッドシート定義・Webアプリ・通知仕様
> - [docs/FORM_SPEC.md](docs/FORM_SPEC.md): Google フォーム連携・設問項目・トリガー仕様

---

## 📁 プロジェクト構成

本リポジトリでは、スプレッドシート側のGASスクリプトとフォーム側のGASスクリプトをサブディレクトリで分離し、一括管理しています。

```text
.
├── .github/
│   └── workflows/
│       └── deploy.yml        # GitHub Actions 自動デプロイワークフロー
├── .gitignore                # Git 除外設定
├── README.md                 # 本ドキュメント
├── docs/                     # 各種仕様書・ドキュメント
│   ├── SYSTEM_SPEC.md        # システム構造・スプレッドシート定義・Webアプリ仕様書
│   └── FORM_SPEC.md          # Google フォーム連携・設問項目・処理フロー仕様書
├── package.json              # clasp 一括操作用スクリプト・依存関係定義
├── jsconfig.json             # JS開発サポート設定
├── spreadsheet/              # スプレッドシート側 GAS プロジェクト
│   ├── .clasp.json           # clasp 設定ファイル
│   ├── .claspignore
│   ├── appsscript.json       # GAS マニフェストファイル
│   ├── Webアプリ.js          # Webアプリ公開 (doGet) & フロントエンドSPA向け RPC API
│   ├── 定期通知バッチ.js     # 時間主導型トリガーによる定期実行バッチ関数群
│   ├── スプレッドシート操作.js # SheetService: シートCRUD・データマッピング処理
│   ├── カレンダー操作.js     # CalendarService: Googleカレンダー連携処理
│   ├── Discord操作.js        # DiscordService: Webhook送信・メッセージ整形処理
│   ├── 設定値.js             # 設定値・URL・列インデックス定数管理
│   ├── 共通関数.js           # 日付フォーマット・エラーログ・ステータス計算
│   └── index.html            # Webアプリ (カンバン・タイムラインビューア) UI
└── form/                     # フォーム側 GAS プロジェクト
    ├── .clasp.json           # clasp 設定ファイル
    ├── .claspignore
    ├── appsscript.json       # GAS マニフェストファイル
    ├── コード.js             # フォーム送信受付・シート書込・プルダウン自動更新処理
    └── 新規申込通知.js       # Discord への新着申込通知送信処理
```

---

## 🔐 クレデンシャル情報・環境変数のセットアップ方法

本プロジェクトでは、Discord Webhook URL やスプレッドシート ID などの機密情報を安全に管理するため、ローカル環境と本番（GAS環境）で以下の方法を提供しています。

---

### 方法 A: ローカル開発環境での設定 (推奨)

`clasp push` などでローカルからコードをアップロード・開発する場合の設定方法です。

1. **設定ファイルの作成**  
   `config.local.example.js` を参考に、各対象フォルダ（例: `spreadsheet/`）に `config.local.js` を作成します。
   ```bash
   cp config.local.example.js spreadsheet/config.local.js
   ```

2. **設定値の入力**  
   `spreadsheet/config.local.js` を開き、実際の URL や ID を設定します。
   ```javascript
   const CONFIG = {
     COMMON_SHEET_URL: "https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit",
     CALENDAR_ID: "YOUR_CALENDAR_ID@group.calendar.google.com",
     PROXY_BASE_URL: "https://your-discord-proxy.workers.dev",
     WEBHOOK_APPLY: "https://discord.com/api/webhooks/...",
     WEBHOOK_PAYMENT: "https://discord.com/api/webhooks/...",
     WEBHOOK_CALENDAR: "https://discord.com/api/webhooks/..."
   };
   ```

> [!IMPORTANT]
> `config.local.js` は `.gitignore` により Git 管理対象外となっています。

---

### 方法 B: GAS 本番環境での設定 (スクリプトのプロパティ)

GAS の Web エディタ上で本番稼働させる場合、コード内に直接クレデンシャルを書かず、**スクリプトのプロパティ**を使用します。

1. ブラウザで Google Apps Script エディタを開きます。
2. 左メニューの **⚙️ プロジェクトの設定** をクリックします。
3. **「スクリプトのプロパティ」** の項目で **「スクリプトのプロパティを追加」** を選択し、以下のプロパティ名（キー）と値を登録します。

| プロパティ名 (キー) | 説明 | 設定例 |
| :--- | :--- | :--- |
| `COMMON_SHEET_URL` | 管理用スプレッドシートのURL | `https://docs.google.com/spreadsheets/d/...` |
| `CALENDAR_ID` | Google カレンダー ID | `xxxx@group.calendar.google.com` |
| `PROXY_BASE_URL` | Discord 送信用プロキシのベース URL | `https://my-discord-proxy.workers.dev` |
| `WEBHOOK_APPLY` | 申込締切用 Discord Webhook URL | `https://discord.com/api/webhooks/...` |
| `WEBHOOK_PAYMENT` | 入金締切用 Discord Webhook URL | `https://discord.com/api/webhooks/...` |
| `WEBHOOK_CALENDAR` | カレンダー予定用 Discord Webhook URL | `https://discord.com/api/webhooks/...` |

#### フォーム側 (`form/`) プロジェクトに設定するプロパティ

| プロパティ名 (キー) | 説明 | 設定例 |
| :--- | :--- | :--- |
| `COMMON_SHEET_URL` | 管理用スプレッドシートのURL | `https://docs.google.com/spreadsheets/d/...` |
| `PROXY_BASE_URL` | Discord 送信用プロキシのベース URL | `https://my-discord-proxy.workers.dev` |
| `WEBHOOK_APPLY` | 新着申込通知用 Discord Webhook URL | `https://discord.com/api/webhooks/...` |
| `FORM_URL` | このフォーム自身のURL（通知メッセージ内で表示） | `https://forms.gle/...` |

---


## 🚀 GitHub Actions 自動デプロイ (CI/CD)
 
`main` ブランチに Pull Request がマージ（または push）されると、GitHub Actions が自動でトリガーされ、GAS プロジェクトへコードを自動デプロイ（`clasp push --force`）します。
 
- **差分検知**: `spreadsheet/` フォルダに変更があればスプレッドシート側、`form/` フォルダに変更があればフォーム側を自動判別して反映します。
- **構文チェック**: デプロイ前に `npm run lint` (`node --check`) による構文検証を実行し、不正なコードの反映を防ぎます。
- **Webアプリのバージョン更新 (任意)**: `WEBAPP_DEPLOYMENT_ID` が設定されていれば、Webアプリの本番デプロイバージョンも自動更新されます。
 
### 必要な GitHub Secrets 設定
 
リポジトリの **Settings > Secrets and variables > Actions > Secrets** に以下の Secret を登録します：
 
| Secret 名 | 必須 | 内容・設定方法 |
| :--- | :---: | :--- |
| `CLASPRC_JSON` | **必須** | ローカルの `~/.clasprc.json` の**中身全体（JSON文字列）**。<br>※ 下記のコマンドでクリップボードにコピーできます。<br>`cat ~/.clasprc.json \| pbcopy` (Mac) |
| `WEBAPP_DEPLOYMENT_ID` | 任意 | スプレッドシート Web アプリのデプロイメント ID（例: `AKfycbxeW3b...`）。<br>設定するとコード反映後に `clasp deploy -i <ID>` が実行され、Webアプリのバージョンが自動更新されます。 |
 
---
 
## 🛠️ clasp による開発・デプロイ手順 (ローカル)

`npm scripts` を使用して、ルートディレクトリから各プロジェクトの管理が行えます。

### コードのプッシュ (GASへ反映)
```bash
# スプレッドシート側のみプッシュ
npm run push:spreadsheet

# フォーム側のみプッシュ
npm run push:form

# 両方をまとめてプッシュ
npm run push:all
```

### コードのプル (GASから取得)
```bash
# スプレッドシート側のみプル
npm run pull:spreadsheet

# フォーム側のみプル
npm run pull:form

# 両方をまとめてプル
npm run pull:all
```

---

## ⏰ GAS トリガーの設定方法

本プロジェクトの各自動通知機能を有効化するには、Google Apps Script エディタの **「⏰ トリガー」** メニューより以下のイベントを設定します。

| スクリプト | トリガー対象の関数 | イベントのソース | イベントの種類 | 役割・概要 |
| :--- | :--- | :--- | :--- | :--- |
| **フォーム** | `onFormSubmit` | **フォーム** | **フォーム送信時** | フォーム回答受付、スプレッドシート書き戻し、選択肢更新、即時 Discord 通知 |
| スプレッドシート (`定期通知バッチ.js`) | `remindEndDate` | 時間主導型 | 日時タイマー (毎日午前中推奨) | 本日申込締切のチケット一覧通知 |
| スプレッドシート (`定期通知バッチ.js`) | `remindPaymentEndDate` | 時間主導型 | 日時タイマー (毎日午前中推奨) | 本日入金締切のイベント一覧通知 |
| スプレッドシート (`定期通知バッチ.js`) | `notifyTomorrowEvents` | 時間主導型 | 日時タイマー (毎日夕方/夜推奨) | 明日の Google カレンダー予定通知 |
| スプレッドシート (`定期通知バッチ.js`) | `registerEventsToCalendar` | 時間主導型 | 日時タイマー (1時間おき等) | カレンダー未登録イベントの自動同期 |

---

## ⚠️ セキュリティに関する注意点

- `config.local.js` や認証情報ファイル (`.clasprc.json` 等) をコミット・公開しないよう注意してください。
- 万が一 Webhook URL や API キーが外部に漏洩した場合は、Discord サーバーの設定画面より対象の Webhook を再生成（削除・作成）してください。
