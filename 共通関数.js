// ==================================================
// 【共通設定】
// ローカル設定 (config.local.js) または GASのスクリプトプロパティから取得
// ==================================================
const _props = PropertiesService.getScriptProperties();

const COMMON_SHEET_URL = (typeof CONFIG !== 'undefined' && CONFIG.COMMON_SHEET_URL)
  ? CONFIG.COMMON_SHEET_URL
  : (_props.getProperty("COMMON_SHEET_URL") || "");

const CALENDAR_ID = (typeof CONFIG !== 'undefined' && CONFIG.CALENDAR_ID)
  ? CONFIG.CALENDAR_ID
  : (_props.getProperty("CALENDAR_ID") || "");

const PROXY_BASE_URL = (typeof CONFIG !== 'undefined' && CONFIG.PROXY_BASE_URL)
  ? CONFIG.PROXY_BASE_URL
  : (_props.getProperty("PROXY_BASE_URL") || "");

const WEBHOOK_APPLY = (typeof CONFIG !== 'undefined' && CONFIG.WEBHOOK_APPLY)
  ? CONFIG.WEBHOOK_APPLY
  : (_props.getProperty("WEBHOOK_APPLY") || "");

const WEBHOOK_PAYMENT = (typeof CONFIG !== 'undefined' && CONFIG.WEBHOOK_PAYMENT)
  ? CONFIG.WEBHOOK_PAYMENT
  : (_props.getProperty("WEBHOOK_PAYMENT") || "");

const WEBHOOK_CALENDAR = (typeof CONFIG !== 'undefined' && CONFIG.WEBHOOK_CALENDAR)
  ? CONFIG.WEBHOOK_CALENDAR
  : (_props.getProperty("WEBHOOK_CALENDAR") || "");

// 従来シート（入力用）の列インデックス（0から数える：A=0, B=1, C=2...）
const OLD_COL = {
  BRAND: 1,       // B列: ブランド
  EVENT: 2,       // C列: イベント名
  URL: 3,         // D列: URL
  END_DATE: 6,    // G列: 申込締切日
  NOTE: 8,        // I列: 備考
  PAY_DEADLINE: 12 // M列: 入金締切日
};

// ==================================================
// 【共通関数】Discord（プロキシ）へのメッセージ送信
// ==================================================
function sendNotification(webhookUrl, message) {
  try {
    Logger.log("--- Discordへのメッセージ送信を開始 ---");

    // URLが「discord.com」だった場合、自動で自分専用プロキシに書き換える
    if (webhookUrl.includes("https://discord.com")) {
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
    console.error("sendNotification関数内でエラーが発生しました: " + e.toString());
    throw e; 
  }
}