/**
 * 本日が入金締め切り日のイベントを抽出して Discord へリマインド通知する関数
 */
function remindPaymentEndDate() {
  const today = new Date();
  const todayStr = formatDateJST(today, "yyyy-MM-dd");

  // --- 1. 従来シート（入力用）からの抽出 ---
  try {
    Logger.log("=== 従来シートの入金締切チェックを開始 ===");
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet ? spreadsheet.getSheetByName('入力用') : null;
    let contents = "";

    if (sheet) {
      const sheetData = sheet.getDataRange().getValues();
      for (let i = 4; i < sheetData.length; i++) {
        const rowData = sheetData[i];
        const payDeadlineRaw = rowData[OLD_COL.PAY_DEADLINE];

        if (!payDeadlineRaw) continue;

        const payDeadlineStr = formatDateJST(payDeadlineRaw, "yyyy-MM-dd");

        if (payDeadlineStr === todayStr) {
          contents += `\n- 【${rowData[OLD_COL.BRAND]}】${rowData[OLD_COL.EVENT]}`;
          if (rowData[OLD_COL.NOTE] !== "") {
            contents += `【${rowData[OLD_COL.NOTE]}】`;
          }
          contents += `\n  - ${rowData[OLD_COL.URL]}`;
        }
      }
    }

    if (contents !== "") {
      const message = ":warning: :warning: :warning: 入金しめきり大丈夫？？？ :warning: :warning: :warning:" + contents;
      sendNotification(WEBHOOK_PAYMENT, message);
    }
    Logger.log("=== 従来シートの入金締切チェックが完了 ===");
  } catch (e) {
    logError("remindPaymentEndDate (従来シート)", e);
  }

  // --- 2. 新システムからの抽出 ---
  try {
    Logger.log("=== 新システムの入金締切チェックを開始 ===");
    const ss = SpreadsheetApp.openByUrl(COMMON_SHEET_URL);
    const masterSheet = ss.getSheetByName("イベントマスター");
    const applySheet = ss.getSheetByName("申し込み管理");

    if (!masterSheet || !applySheet) return;

    const masterData = masterSheet.getDataRange().getValues();
    const applyData = applySheet.getDataRange().getValues();

    // 共通関数を利用してマスター情報をマップ化
    const masterMap = getMasterEventMap(masterData);

    const paymentList = [];
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
        const brandStr = masterInfo.brand ? `【${masterInfo.brand}】` : "";
        const eventName = masterInfo.eventName || row[APPLY_COL.EVENT_NAME_ALT];
        const applyName = row[APPLY_COL.APPLY_NAME];
        const formattedTime = formatDateJST(payEndDateRaw, "HH:mm");

        paymentList.push({
          brandEvent: `${brandStr}${eventName}`,
          applyName: applyName,
          timeStr: formattedTime
        });
      }
    }

    if (paymentList.length > 0) {
      let message = "💸 **【新システム】本日が入金締め切り日です！お支払いを忘れずに！**\n";
      paymentList.forEach(item => {
        message += `\n📅 **${item.brandEvent}**\n └ 受付区分: ${item.applyName}\n └ 入金締切: **${item.timeStr}まで**\n`;
      });
      sendNotification(WEBHOOK_PAYMENT, message);
    }
    Logger.log("=== 新システムの入金締切チェックが完了 ===");
  } catch (e) {
    logError("remindPaymentEndDate (新システム)", e);
  }
}