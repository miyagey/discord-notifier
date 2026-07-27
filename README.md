# Discord Notifier (GAS Project)

Google Apps Script (GAS) を活用し、Google スプレッドシートのイベント・申込・入金締切情報を管理し、Google カレンダーへの自動登録および Discord チャンネルへの通知を行うシステムです。

---

## 📁 プロジェクト構成

```text
.
├── .clasp.json               # clasp 設定ファイル (GASプロジェクト連携)
├── .gitignore                # Git 除外設定 (.env, config.local.js 等)
├── README.md                 # 本ドキュメント
├── appsscript.json           # GAS マニフェストファイル
├── config.local.example.js   # ローカル用設定ファイルのサンプル
├── config.local.js           # 【Git管理対象外】ローカル環境用クレデンシャル設定ファイル
├── jsconfig.json             # JS開発サポート設定
├── 共通関数.js               # 設定読み込み・Discord送信等の共通処理
├── 予定通知.js               # 予定通知処理
├── 入金確認おじさん.js       # 入金締切確認・通知処理
├── ライブ申込しめきりおじさん.js # チケット申込締切確認・通知処理
└── カレンダー自動登録.js     # Googleカレンダーへのイベント自動登録処理
```

---

## 🔐 クレデンシャル情報・環境変数のセットアップ方法

本プロジェクトでは、Discord Webhook URL やスプレッドシート ID などの機密情報を安全に管理するため、ローカル環境と本番（GAS環境）で以下の方法を提供しています。

---

### 方法 A: ローカル開発環境での設定 (推奨)

`clasp push` などでローカルからコードをアップロード・開発する場合の設定方法です。

1. **設定ファイルの作成**  
   リポジトリ内の `config.local.example.js` をコピーして `config.local.js` を作成します。
   ```bash
   cp config.local.example.js config.local.js
   ```

2. **設定値の入力**  
   `config.local.js` を開き、実際の URL や ID を設定します。
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
> `config.local.js` は `.gitignore` に含まれているため、`git push` しても GitHub に公開されることはありません。

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

---

## 🛠️ clasp による開発・デプロイ手順

`clasp` を使用してコードのアップロード・ダウンロードを行うことができます。

### コードのプッシュ (GASへ反映)
```bash
npx clasp push
```

### コードのプル (GASから取得)
```bash
npx clasp pull
```

---

## ⚠️ セキュリティに関する注意点

- `config.local.js` や認証情報ファイル (`.clasprc.json` 等) をコミット・公開しないよう注意してください。
- 万が一 Webhook URL や API キーが外部に漏洩した場合は、Discord サーバーの設定画面より対象の Webhook を再生成（削除・作成）してください。
