// ==================================================
// 【共通設定】
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

// ==================================================
// 【列インデックス定義】
// ==================================================

/** 従来シート（入力用）の列インデックス（0始まり） */
const OLD_COL = {
  BRAND: 1,        // B列: ブランド
  EVENT: 2,        // C列: イベント名
  URL: 3,          // D列: URL
  END_DATE: 6,     // G列: 申込締切日
  NOTE: 8,         // I列: 備考
  PAY_DEADLINE: 12 // M列: 入金締切日
};

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
  EVENT_NAME_ALT: 3, // D列: 代替イベント名
  APPLY_NAME: 4,     // E列: 受付区分/申し込み名称
  APPLY_END_DATE: 6, // G列: 申込締切日時
  URL: 7,            // H列: 申込URL
  PAY_END_DATE: 9,   // J列: 入金締切日時
  STATUS: 10         // K列: ステータス
};

// ==================================================
// 【共通ユーティリティ関数】
// ==================================================

/**
 * 日本標準時 (JST) で指定のフォーマットに日付文字列を変換
 * @param {Date|string} date - 対象の日付オブジェクトまたは文字列
 * @param {string} formatStr - フォーマット文字列 (例: "yyyy-MM-dd", "HH:mm", "MM/dd")
 * @returns {string} フォーマットされた日付文字列
 */
function formatDateJST(date, formatStr) {
  if (!date) return "";
  const d = (date instanceof Date) ? date : new Date(date);
  return Utilities.formatDate(d, "JST", formatStr);
}

/**
 * イベントマスターシートのデータ配列から eventId をキーとした情報マップを生成
 * @param {Array<Array<any>>} masterData - イベントマスターの全行データ
 * @returns {Object<string, {brand: string, eventName: string}>} マップオブジェクト
 */
function getMasterEventMap(masterData) {
  const masterMap = {};
  if (!masterData || masterData.length <= 1) return masterMap;

  for (let i = 1; i < masterData.length; i++) {
    const eventId = masterData[i][MASTER_COL.ID];
    if (eventId) {
      masterMap[eventId] = {
        brand: masterData[i][MASTER_COL.BRAND],
        eventName: masterData[i][MASTER_COL.EVENT_NAME]
      };
    }
  }
  return masterMap;
}

/**
 * エラーログを統一形式で出力する
 * @param {string} context - エラーが発生した処理・関数名
 * @param {Error|any} error - キャッチされたエラーオブジェクト
 */
function logError(context, error) {
  const message = (error && error.toString) ? error.toString() : String(error);
  console.error(`[ERROR] ${context} でエラーが発生しました: ${message}`);
  Logger.log(`[ERROR] ${context}: ${message}`);
}

// ==================================================
// 【共通関数】Discord（プロキシ）へのメッセージ送信
// ==================================================

/**
 * Discord（プロキシ経由）へメッセージを送信する
 * @param {string} webhookUrl - 送信先の Discord Webhook URL
 * @param {string} message - 送信するメッセージ（Markdown形式可）
 */
function sendNotification(webhookUrl, message) {
  try {
    Logger.log("--- Discordへのメッセージ送信を開始 ---");

    if (!webhookUrl) {
      throw new Error("Webhook URLが設定されていません。");
    }

    // URLが「discord.com」だった場合、自動で自分専用プロキシに書き換える
    if (PROXY_BASE_URL && webhookUrl.includes("https://discord.com")) {
      webhookUrl = webhookUrl.replace("https://discord.com", PROXY_BASE_URL);
    }

    const payload = { "content": message };
    const options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };

    const MAX_RETRIES = 3;
    let isSuccess = false;

    for (let i = 0; i < MAX_RETRIES; i++) {
      const response = UrlFetchApp.fetch(webhookUrl, options);
      const responseCode = response.getResponseCode();

      if (responseCode === 200 || responseCode === 204) {
        Logger.log(`送信成功 (試行回数: ${i + 1}回目)`);
        isSuccess = true;
        break;
      }

      if (responseCode === 429) {
        const responseText = response.getContentText();
        let waitTime = 5000;

        try {
          const json = JSON.parse(responseText);
          if (json.retry_after) {
            waitTime = json.retry_after < 1000 ? json.retry_after * 1000 : json.retry_after;
          }
        } catch (e) {
          const headers = response.getHeaders();
          if (headers["Retry-After"]) {
            waitTime = parseInt(headers["Retry-After"]) * 1000;
          }
        }

        console.warn(`429エラー: ${waitTime} ms 待機して再試行します。`);
        Utilities.sleep(waitTime + 500);
      } else {
        console.error(`送信エラー ステータスコード: ${responseCode}`);
        break;
      }
    }

    if (!isSuccess) {
      throw new Error("Discordへの送信に完全に失敗しました。");
    }

    Logger.log("--- Discordへのメッセージ送信を正常終了 ---");
  } catch (e) {
    logError("sendNotification", e);
    throw e;
  }
}