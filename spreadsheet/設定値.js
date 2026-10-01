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

// ==================================================
// 【列インデックス定義】
// ==================================================

/** 新システム「イベントマスター」シートの列インデックス（0始まり） */
const MASTER_COL = {
  ID: 0,         // A列: イベントID
  BRAND: 1,      // B列: ブランド名
  EVENT_NAME: 2, // C列: イベント名
  START_DATE: 3, // D列: 開始日
  END_DATE: 4,   // E列: 終了日
  LOCATION: 5,   // F列: 会場
  SUMMARY: 6,    // G列: イベント概要
  CAL_ID: 7      // H列: カレンダー登録ID
};

/** 新システム「申し込み管理」シートの列インデックス（0始まり） */
const APPLY_COL = {
  APPLY_ID: 0,       // A列: 申し込みID
  EVENT_ID: 1,       // B列: イベントID
  BRAND: 2,          // C列: ブランド名
  EVENT_NAME_ALT: 3, // D列: 代替イベント名
  APPLY_NAME: 4,     // E列: 受付区分/申し込み名称
  START_DATE: 5,     // F列: 申込開始日時
  APPLY_END_DATE: 6, // G列: 申込締切日時
  APPLY_METHOD: 7,   // H列: 申込方法 (旧: 申込URL)
  URL: 7,            // H列: 互換用エイリアス
  RESULT_DATE: 8,    // I列: 当落発表日時
  PAY_END_DATE: 9,   // J列: 入金締切日時
  STATUS: 10         // K列: ステータス
};
