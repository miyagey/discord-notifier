/**
 * 本日が支払締め切り日のイベント情報を新システムから抽出・統合し、Discord へリマインド通知するメイン関数
 */
function remindPaymentEndDate() {
  try {
    const today = new Date();
    const todayStr = formatDateJST(today, "yyyy-MM-dd");

    // 新システムシートからのデータ抽出
    const allItems = fetchNewSheetPaymentItems(todayStr, today);

    // 通知メッセージの構築と送信（フッターなし）
    if (allItems.length > 0) {
      const DISCORD_MAX_LENGTH = 2000;
      const headerTitle = "💸 **本日が入金締め切り日です！お支払いを忘れずに！**";
      let currentMessage = headerTitle + "\n";

      for (const item of allItems) {
        let itemText = `\n📅 **${item.brandEvent}**\n └ 受付区分: ${item.applyName}\n └ 入金締切: **${item.timeStr}**\n`;
        if (item.url) {
          itemText += ` └ 決済URL: ${item.url}\n`;
        }

        if ((currentMessage + itemText).length > DISCORD_MAX_LENGTH) {
          sendNotification(WEBHOOK_PAYMENT, currentMessage);
          Utilities.sleep(500);
          currentMessage = headerTitle + "\n" + itemText;
        } else {
          currentMessage += itemText;
        }
      }

      sendNotification(WEBHOOK_PAYMENT, currentMessage);
    } else {
      Logger.log("本日が入金締め切り日のイベントはありませんでした。");
    }

    Logger.log("=== 入金締切通知処理が正常終了しました ===");
  } catch (e) {
    logError("remindPaymentEndDate (メイン処理)", e);
  }
}

// ==================================================
// 【ヘルパー関数】データ抽出処理
// ==================================================

/**
 * 新システム（イベントマスター/申し込み管理）から本日の入金締切アイテムを抽出する
 * @param {string} todayStr - 本日の日付文字列 ("yyyy-MM-dd")
 * @param {Date} now - 現在時刻（時刻考慮の厳密判定用）
 * @returns {Array<{brandEvent: string, applyName: string, timeStr: string, url: string, sourceType: string}>}
 */
function fetchNewSheetPaymentItems(todayStr, now) {
  const items = [];
  try {
    Logger.log("=== 新システムの入金締切チェックを開始 ===");
    const ss = SpreadsheetApp.openByUrl(COMMON_SHEET_URL);
    const masterSheet = ss.getSheetByName("イベントマスター");
    const applySheet = ss.getSheetByName("申し込み管理");

    if (!masterSheet || !applySheet) return items;

    const masterData = masterSheet.getDataRange().getValues();
    const applyData = applySheet.getDataRange().getValues();

    const masterMap = getMasterEventMap(masterData);

    for (let i = 1; i < applyData.length; i++) {
      const row = applyData[i];
      const applyId = row[APPLY_COL.APPLY_ID];
      const eventId = row[APPLY_COL.EVENT_ID];
      const payEndDateRaw = row[APPLY_COL.PAY_END_DATE];
      const status = row[APPLY_COL.STATUS];

      if (!applyId || !payEndDateRaw) continue;

      const payEndStr = formatDateJST(payEndDateRaw, "yyyy-MM-dd");

      // 日付が本日でない場合はスキップ
      if (payEndStr !== todayStr) continue;

      // 締切時刻が現在時刻より過去の場合はスキップ（時刻考慮）
      if (new Date(payEndDateRaw) <= now) continue;

      // ステータスが期間終了の場合はスキップ
      if (status === "期間終了") continue;

      const masterInfo = masterMap[eventId] || {};
      const eventName = masterInfo.eventName || row[APPLY_COL.EVENT_NAME_ALT];
      const brandEventTitle = formatBrandEventTitle(masterInfo.brand, eventName);
      const applyName = row[APPLY_COL.APPLY_NAME];
      const formattedTime = formatDateJST(payEndDateRaw, "HH:mm");

      items.push({
        brandEvent: brandEventTitle,
        applyName: applyName,
        timeStr: `${formattedTime}まで`,
        url: "",
        sourceType: "new"
      });
    }
    Logger.log(`新システムの入金締切件数: ${items.length}件`);
  } catch (e) {
    logError("fetchNewSheetPaymentItems", e);
  }
  return items;
}