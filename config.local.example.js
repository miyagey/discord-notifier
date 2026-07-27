// ==================================================
// 【設定サンプルファイル】 (config.local.example.js)
// ローカルで開発する場合は、このファイルを config.local.js にコピーして
// 実際のURLやIDを設定してください。
// ==================================================

const CONFIG = {
  // 管理用スプレッドシートのURL
  COMMON_SHEET_URL: "https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit",

  // GoogleカレンダーID
  CALENDAR_ID: "YOUR_CALENDAR_ID@group.calendar.google.com",

  // 送信用プロキシのベースURL
  PROXY_BASE_URL: "https://your-discord-proxy.workers.dev",

  // 各通知ごとのDiscord Webhook URL
  WEBHOOK_APPLY: "https://discord.com/api/webhooks/YOUR_WEBHOOK_URL_1", // 申込締切用
  WEBHOOK_PAYMENT: "https://discord.com/api/webhooks/YOUR_WEBHOOK_URL_2", // 入金締切用
  WEBHOOK_CALENDAR: "https://discord.com/api/webhooks/YOUR_WEBHOOK_URL_3" // カレンダー予定用
};
