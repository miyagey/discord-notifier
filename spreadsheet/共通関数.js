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

/** イベント・申込の登録用 Google フォーム URL */
const REGISTRATION_FORM_URL = "https://forms.gle/VcErZhtVcUHtL6ET8";

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
  EVENT_NAME_ALT: 3, // D列: 代替イベント名
  APPLY_NAME: 4,     // E列: 受付区分/申し込み名称
  APPLY_END_DATE: 6, // G列: 申込締切日時
  APPLY_METHOD: 7,   // H列: 申込方法 (旧: 申込URL)
  URL: 7,            // H列: 互換用エイリアス
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
  if (isNaN(d.getTime())) return "";
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
 * イベント名またはブランド名込みのタイトルからイベントマスター情報を逆引き検索する
 * @param {Array<Array<any>>} masterData - イベントマスターの全行データ
 * @param {string} rawTitle - 検索対象のタイトル文字列 (例: "【デレ】THE IDOLM@STER...", "THE IDOLM@STER...")
 * @returns {{eventId: string, brand: string, eventName: string}|null}
 */
function findMasterEventByTitle(masterData, rawTitle) {
  if (!masterData || masterData.length <= 1 || !rawTitle) return null;

  const cleanRaw = String(rawTitle).trim();

  for (let i = 1; i < masterData.length; i++) {
    const eventId = masterData[i][MASTER_COL.ID];
    const brand = masterData[i][MASTER_COL.BRAND] || "";
    const eventName = masterData[i][MASTER_COL.EVENT_NAME] || "";

    const fullTitleWithBrand = brand ? `【${brand}】${eventName}` : eventName;

    // 完全一致または包含一致の検証
    if (
      cleanRaw === fullTitleWithBrand ||
      cleanRaw === eventName ||
      (eventName && cleanRaw.includes(eventName)) ||
      (fullTitleWithBrand && cleanRaw.includes(fullTitleWithBrand))
    ) {
      return { eventId, brand, eventName };
    }
  }
  return null;
}

/**
 * ブランド名とイベント名からタイトル文字列を生成する（二重付与防止）
 * @param {string} brand - ブランド名 (例: "デレ")
 * @param {string} eventName - イベント名 (例: "THE IDOLM@STER...", "【デレ】THE IDOLM@STER...")
 * @returns {string} 整形されたタイトル文字列
 */
function formatBrandEventTitle(brand, eventName) {
  const name = eventName ? String(eventName).trim() : "";
  if (!name) return brand ? `【${brand}】` : "";

  // すでに【で始まっている場合は重ねてブランド名をつけない
  if (name.startsWith("【")) {
    return name;
  }

  const brandStr = brand ? `【${brand}】` : "";
  return `${brandStr}${name}`;
}

/**
 * 申込方法（URLまたは複数行テキスト）をDiscord用に整形する
 * @param {string} methodText - 申込方法の文字列
 * @returns {string} 整形された申込方法行
 */
function formatApplyMethodBlock(methodText) {
  if (!methodText) return "";
  const trimmed = String(methodText).trim();
  if (!trimmed) return "";

  if (trimmed.includes("\n")) {
    const quoted = trimmed.split("\n").map(line => `> ${line}`).join("\n");
    return ` └ 申込方法:\n${quoted}\n`;
  } else {
    return ` └ 申込方法: ${trimmed}\n`;
  }
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

/**
 * 登録案内メッセージフッター（Googleフォームのみ）を生成
 * @returns {string} 登録案内メッセージフッター
 */
function getRegistrationFooterMessage() {
  const lines = [
    "----------------------------------------",
    "📝 **イベント・申込の登録はこちら**",
    `・【Googleフォーム】: ${REGISTRATION_FORM_URL}`
  ];
  return lines.join("\n");
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

/**
 * アイテムリストを上限文字数(2000字)を超えないよう安全に分割組み立てしてDiscordへ送信する
 * @param {string} webhookUrl - 送信先の Discord Webhook URL
 * @param {string} headerTitle - メッセージ冒頭のタイトル
 * @param {Array<object>} items - 通知対象のアイテム配列
 * @param {function(object): string} formatItemFunc - 各アイテムを文字列に変換するフォーマット関数
 * @param {string} [footer] - 最終メッセージに付与するフッター文字列（省略可）
 */
function sendItemListNotification(webhookUrl, headerTitle, items, formatItemFunc, footer) {
  const DISCORD_MAX_LENGTH = 2000;
  const footerText = footer || "";
  const footerLength = footerText.length;

  if (!items || items.length === 0) return;

  let currentMessage = headerTitle + "\n";

  for (let i = 0; i < items.length; i++) {
    const itemText = formatItemFunc(items[i]);

    // 「現在のメッセージ + 今回のアイテム + フッター」が上限を超えるか判定
    if ((currentMessage + itemText + footerLength).length > DISCORD_MAX_LENGTH) {
      // 超える場合は現在のメッセージ枠を送信（フッターなし）
      sendNotification(webhookUrl, currentMessage);
      Utilities.sleep(500);

      // 新しい通を開始
      currentMessage = headerTitle + "\n" + itemText;
    } else {
      currentMessage += itemText;
    }
  }

  // 最後のメッセージにフッターを付けて送信
  currentMessage += footerText;
  sendNotification(webhookUrl, currentMessage);
}