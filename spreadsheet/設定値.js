// ==================================================
// 【共通設定 & 定数管理】
// ローカル設定 (config.local.js) または GASのスクリプトプロパティから取得
// ==================================================
const _props = PropertiesService.getScriptProperties();

/** 管理用スプレッドシートのURL */
const COMMON_SHEET_URL = (typeof CONFIG !== 'undefined' && CONFIG.COMMON_SHEET_URL)
  ? CONFIG.COMMON_SHEET_URL
  : (_props.getProperty("COMMON_SHEET_URL") || "");

/** GoogleカレンダーID */
const CALENDAR_ID = (typeof CONFIG !== 'undefined' && CONFIG.CALENDAR_ID)
  ? CONFIG.CALENDAR_ID
  : (_props.getProperty("CALENDAR_ID") || "");

/** 送信用プロキシのベースURL */
const PROXY_BASE_URL = (typeof CONFIG !== 'undefined' && CONFIG.PROXY_BASE_URL)
  ? CONFIG.PROXY_BASE_URL
  : (_props.getProperty("PROXY_BASE_URL") || "");

/** 申込締切用 Discord Webhook URL */
const WEBHOOK_APPLY = (typeof CONFIG !== 'undefined' && CONFIG.WEBHOOK_APPLY)
  ? CONFIG.WEBHOOK_APPLY
  : (_props.getProperty("WEBHOOK_APPLY") || "");

/** 入金締切用 Discord Webhook URL */
const WEBHOOK_PAYMENT = (typeof CONFIG !== 'undefined' && CONFIG.WEBHOOK_PAYMENT)
  ? CONFIG.WEBHOOK_PAYMENT
  : (_props.getProperty("WEBHOOK_PAYMENT") || "");

/** カレンダー予定用 Discord Webhook URL */
const WEBHOOK_CALENDAR = (typeof CONFIG !== 'undefined' && CONFIG.WEBHOOK_CALENDAR)
  ? CONFIG.WEBHOOK_CALENDAR
  : (_props.getProperty("WEBHOOK_CALENDAR") || "");

/** イベント・申込の登録用 Google フォーム URL */
const REGISTRATION_FORM_URL = "https://forms.gle/VcErZhtVcUHtL6ET8";

/** Webアプリ（閲覧用カンバンボード）のURL（Cloudflare等で短縮されたURLまたはGAS WebApp URL） */
const WEBAPP_URL = (typeof CONFIG !== 'undefined' && CONFIG.WEBAPP_URL)
  ? CONFIG.WEBAPP_URL
  : (_props.getProperty("WEBAPP_URL") || "");

/** Discord Bot Token（イベント用チャンネル自動作成等） */
const DISCORD_BOT_TOKEN = (typeof CONFIG !== 'undefined' && CONFIG.DISCORD_BOT_TOKEN)
  ? CONFIG.DISCORD_BOT_TOKEN
  : (_props.getProperty("DISCORD_BOT_TOKEN") || "");

/** Discord サーバーID (Guild ID) */
const DISCORD_GUILD_ID = (typeof CONFIG !== 'undefined' && CONFIG.DISCORD_GUILD_ID)
  ? CONFIG.DISCORD_GUILD_ID
  : (_props.getProperty("DISCORD_GUILD_ID") || "");

/** Discord チャンネル作成先カテゴリID (任意) */
const DISCORD_CATEGORY_ID = (typeof CONFIG !== 'undefined' && CONFIG.DISCORD_CATEGORY_ID)
  ? CONFIG.DISCORD_CATEGORY_ID
  : (_props.getProperty("DISCORD_CATEGORY_ID") || "");



