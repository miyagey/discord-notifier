/**
 * 本日が支払締め切り日のイベント情報を新旧シートから抽出・統合し、Discord へリマインド通知するメイン関数
 */
function remindPaymentEndDate() {
  try {
    const today = new Date();
    const todayStr = formatDateJST(today, "yyyy-MM-dd");

    // 1. 新旧シートからのデータ抽出とマージ
    const oldItems = fetchOldSheetPaymentItems(todayStr);
    const newItems = fetchNewSheetPaymentItems(todayStr);
    const allItems = [...oldItems, ...newItems];

    // 2. 通知メッセージの構築と送信
    if (allItems.length > 0) {
      const headerTitle = "💸 **本日が入金締め切り日です！お支払いを忘れずに！**";
      const formatItemFunc = (item) => {
        let str = `\n📅 **${item.brandEvent}**\n └ 受付区分: ${item.applyName}\n └ 入金締切: **${item.timeStr}**\n`;
        if (item.url) {
          str += ` └ 決済URL: ${item.url}\n`;
        }
        return str;
      };

      sendItemListNotification(WEBHOOK_PAYMENT, headerTitle, allItems, formatItemFunc);
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
 * 従来シート（入力用）から本日の入金締切アイテムを抽出する
 * @param {string} todayStr - 本日の日付文字列 ("yyyy-MM-dd")
 * @returns {Array<{brandEvent: string, applyName: string, timeStr: string, url: string, sourceType: string}>}
 */
function fetchOldSheetPaymentItems(todayStr) {
  const items = [];
  try {
    Logger.log("=== 従来シートの入金締切チェックを開始 ===");
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet() || (COMMON_SHEET_URL ? SpreadsheetApp.openByUrl(COMMON_SHEET_URL) : null);
    const sheet = spreadsheet ? spreadsheet.getSheetByName('入力用') : null;

    if (sheet) {
      const sheetData = sheet.getDataRange().getValues();
      for (let i = 4; i < sheetData.length; i++) {
        const rowData = sheetData[i];
        const payDeadlineRaw = rowData[OLD_COL.PAY_DEADLINE];

        if (!payDeadlineRaw) continue;

        const payDeadlineStr = formatDateJST(payDeadlineRaw, "yyyy-MM-dd");

        if (payDeadlineStr === todayStr) {
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
    Logger.log(`従来シートの入金締切件数: ${items.length}件`);
  } catch (e) {
    logError("fetchOldSheetPaymentItems", e);
  }
  return items;
}

/**
 * 新システム（イベントマスター/申し込み管理）から本日の入金締切アイテムを抽出する
 * @param {string} todayStr - 本日の日付文字列 ("yyyy-MM-dd")
 * @returns {Array<{brandEvent: string, applyName: string, timeStr: string, url: string, sourceType: string}>}
 */
function fetchNewSheetPaymentItems(todayStr) {
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

      if (payEndStr === todayStr && status !== "期間終了") {
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
    }
    Logger.log(`新システムの入金締切件数: ${items.length}件`);
  } catch (e) {
    logError("fetchNewSheetPaymentItems", e);
  }
  return items;
}