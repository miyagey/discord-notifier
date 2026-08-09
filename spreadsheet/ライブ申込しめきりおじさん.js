/**
 * 本日が申込締切日のチケット申込情報を新旧シートから抽出・統合し、Discord へリマインド通知するメイン関数
 */
function remindEndDate() {
  try {
    const today = new Date();
    const todayStr = formatDateJST(today, "yyyy-MM-dd");

    // 1. 新旧シートからのデータ抽出とマージ
    const oldItems = fetchOldSheetApplyItems(todayStr);
    const newItems = fetchNewSheetApplyItems(todayStr);
    const allItems = [...oldItems, ...newItems];

    // 2. 通知メッセージの構築と送信
    if (allItems.length > 0) {
      const headerTitle = "🔔 **本日締切のチケット申込があります！**";
      const formatItemFunc = (item) => {
        let str = `\n📅 **${item.brandEvent}**\n └ 受付区分: ${item.applyName}\n └ 締切時刻: **${item.timeStr}**\n`;
        if (item.url) {
          str += ` └ 申込URL: ${item.url}\n`;
        }
        return str;
      };

      sendItemListNotification(WEBHOOK_APPLY, headerTitle, allItems, formatItemFunc);
    } else {
      const message = "🔔 **本日締切のチケット申込はありません！**\n\n漏れがあれば教えてね！\n\n" + getRegistrationFooterMessage();
      sendNotification(WEBHOOK_APPLY, message);
    }

    Logger.log("=== 申込締切通知処理が正常終了しました ===");
  } catch (e) {
    logError("remindEndDate (メイン処理)", e);
  }
}

// ==================================================
// 【ヘルパー関数】データ抽出処理
// ==================================================

/**
 * 従来シート（入力用）から本日の申込締切アイテムを抽出する
 * @param {string} todayStr - 本日の日付文字列 ("yyyy-MM-dd")
 * @returns {Array<{brandEvent: string, applyName: string, timeStr: string, url: string, sourceType: string}>}
 */
function fetchOldSheetApplyItems(todayStr) {
  const items = [];
  try {
    Logger.log("=== 従来シートの申込締切チェックを開始 ===");
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet() || (COMMON_SHEET_URL ? SpreadsheetApp.openByUrl(COMMON_SHEET_URL) : null);
    const sheet = spreadsheet ? spreadsheet.getSheetByName('入力用') : null;

    if (sheet) {
      const sheetData = sheet.getDataRange().getValues();
      for (let i = 4; i < sheetData.length; i++) {
        const rowData = sheetData[i];
        const endDateRaw = rowData[OLD_COL.END_DATE];

        if (!endDateRaw) continue;

        const endDateStr = formatDateJST(endDateRaw, "yyyy-MM-dd");

        if (endDateStr === todayStr) {
          const brand = rowData[OLD_COL.BRAND] ? `【${rowData[OLD_COL.BRAND]}】` : "";
          const eventName = rowData[OLD_COL.EVENT] || "";
          const note = rowData[OLD_COL.NOTE] ? ` (備考: ${rowData[OLD_COL.NOTE]})` : "";

          items.push({
            brandEvent: `${brand}${eventName}`,
            applyName: `従来シート${note}`,
            timeStr: "23:59まで",
            url: rowData[OLD_COL.URL] || "",
            sourceType: "old"
          });
        }
      }
    }
    Logger.log(`従来シートの申込締切件数: ${items.length}件`);
  } catch (e) {
    logError("fetchOldSheetApplyItems", e);
  }
  return items;
}

/**
 * 新システム（イベントマスター/申し込み管理）から本日の申込締切アイテムを抽出する
 * @param {string} todayStr - 本日の日付文字列 ("yyyy-MM-dd")
 * @returns {Array<{brandEvent: string, applyName: string, timeStr: string, url: string, sourceType: string}>}
 */
function fetchNewSheetApplyItems(todayStr) {
  const items = [];
  try {
    Logger.log("=== 新システムの申込締切チェックを開始 ===");
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
      const applyEndDateRaw = row[APPLY_COL.APPLY_END_DATE];

      if (!applyId || !applyEndDateRaw) continue;

      const applyEndStr = formatDateJST(applyEndDateRaw, "yyyy-MM-dd");

      if (applyEndStr === todayStr) {
        const masterInfo = masterMap[eventId] || {};
        const eventName = masterInfo.eventName || row[APPLY_COL.EVENT_NAME_ALT];
        const brandEventTitle = formatBrandEventTitle(masterInfo.brand, eventName);
        const applyName = row[APPLY_COL.APPLY_NAME];
        const applyUrl  = row[APPLY_COL.URL];
        const formattedTime = formatDateJST(applyEndDateRaw, "HH:mm");

        items.push({
          brandEvent: brandEventTitle,
          applyName: applyName,
          timeStr: `${formattedTime}まで`,
          url: applyUrl || "",
          sourceType: "new"
        });
      }
    }
    Logger.log(`新システムの申込締切件数: ${items.length}件`);
  } catch (e) {
    logError("fetchNewSheetApplyItems", e);
  }
  return items;
}