/**
 * 本日が申込締切日のチケット申込情報を抽出して Discord へリマインド通知する関数
 */
function remindEndDate() {
  const today = new Date();
  const todayStr = formatDateJST(today, "yyyy-MM-dd");

  // --- 1. 従来シート（入力用）からの抽出 ---
  try {
    Logger.log("=== 従来シートの申込締切チェックを開始 ===");
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet ? spreadsheet.getSheetByName('入力用') : null;
    let contents = "";

    if (sheet) {
      const sheetData = sheet.getDataRange().getValues();
      for (let i = 4; i < sheetData.length; i++) {
        const rowData = sheetData[i];
        const endDateRaw = rowData[OLD_COL.END_DATE];

        if (!endDateRaw) continue;

        const endDateStr = formatDateJST(endDateRaw, "yyyy-MM-dd");

        if (endDateStr === todayStr) {
          contents += `\n- 【${rowData[OLD_COL.BRAND]}】${rowData[OLD_COL.EVENT]}`;
          if (rowData[OLD_COL.NOTE] !== "") {
            contents += `【${rowData[OLD_COL.NOTE]}】`;
          }
          contents += `\n  - ${rowData[OLD_COL.URL]}`;
        }
      }
    }

    let message = "";
    if (contents !== "") {
      message = "本日のしめきりだよ" + contents + "\n\n↓に記載のないものや他に漏れがないか確認もしてね\n" + COMMON_SHEET_URL;
    } else {
      message = "↓に登録されたイベントで本日しめきりはないよ\n" + COMMON_SHEET_URL + "\n漏れなどあれば各自教えてね";
    }

    sendNotification(WEBHOOK_APPLY, message);
    Logger.log("=== 従来シートの申込締切チェックが完了 ===");
  } catch (e) {
    logError("remindEndDate (従来シート)", e);
  }

  // --- 2. 新システムからの抽出 ---
  try {
    Logger.log("=== 新システムの申込締切チェックを開始 ===");
    const ss = SpreadsheetApp.openByUrl(COMMON_SHEET_URL);
    const masterSheet = ss.getSheetByName("イベントマスター");
    const applySheet = ss.getSheetByName("申し込み管理");

    if (!masterSheet || !applySheet) return;

    const masterData = masterSheet.getDataRange().getValues();
    const applyData = applySheet.getDataRange().getValues();

    // 共通関数を利用してマスター情報をマップ化
    const masterMap = getMasterEventMap(masterData);

    const remindList = [];
    for (let i = 1; i < applyData.length; i++) {
      const row = applyData[i];
      const applyId = row[APPLY_COL.APPLY_ID];
      const eventId = row[APPLY_COL.EVENT_ID];
      const applyEndDateRaw = row[APPLY_COL.APPLY_END_DATE];

      if (!applyId || !applyEndDateRaw) continue;

      const applyEndStr = formatDateJST(applyEndDateRaw, "yyyy-MM-dd");

      if (applyEndStr === todayStr) {
        const masterInfo = masterMap[eventId] || {};
        const brandStr = masterInfo.brand ? `【${masterInfo.brand}】` : "";
        const eventName = masterInfo.eventName || row[APPLY_COL.EVENT_NAME_ALT];
        const applyName = row[APPLY_COL.APPLY_NAME];
        const applyUrl  = row[APPLY_COL.URL];
        const formattedTime = formatDateJST(applyEndDateRaw, "HH:mm");

        remindList.push({
          brandEvent: `${brandStr}${eventName}`,
          applyName: applyName,
          timeStr: formattedTime,
          url: applyUrl
        });
      }
    }

    if (remindList.length > 0) {
      let message = "🔔 **【新システム】本日締切のチケット申込があります！**\n";
      remindList.forEach(item => {
        message += `\n📅 **${item.brandEvent}**\n └ 受付区分: ${item.applyName}\n └ 締切時刻: **${item.timeStr}**\n`;
        if (item.url) message += ` └ 申込URL: ${item.url}\n`;
      });
      sendNotification(WEBHOOK_APPLY, message);
    } else {
      const message = "🔔 **【新システム】本日締切のチケット申込はありません！**\n\n漏れがあれば教えてね！\n\nイベント・申込の登録はこちらから！\nhttps://forms.gle/VcErZhtVcUHtL6ET8\n";
      sendNotification(WEBHOOK_APPLY, message);
    }
    Logger.log("=== 新システムの申込締切チェックが完了 ===");
  } catch (e) {
    logError("remindEndDate (新システム)", e);
  }
}