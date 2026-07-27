function remindEndDate() {
  const today = new Date();
  const todayStr = Utilities.formatDate(today, "JST", "yyyy-MM-dd");

  // --- 1. 従来シート（入力用）からの抽出 ---
  try {
    Logger.log("=== 従来シートの申込締切チェックを開始 ===");
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName('入力用');
    let contents = "";

    if (sheet) {
      const sheetData = sheet.getDataRange().getValues();
      for (let i = 4; i < sheetData.length; i++) {
        let rowData = sheetData[i];
        let endDateRaw = rowData[OLD_COL.END_DATE];

        if (!endDateRaw || endDateRaw === "") continue;

        let endDateStr = Utilities.formatDate(new Date(endDateRaw), "JST", "yyyy-MM-dd");

        if (endDateStr === todayStr) {
          contents += "\n- 【" + rowData[OLD_COL.BRAND] + "】" + rowData[OLD_COL.EVENT];
          if (rowData[OLD_COL.NOTE] !== "") {
            contents += "【" + rowData[OLD_COL.NOTE] + "】";
          }
          contents += "\n  - " + rowData[OLD_COL.URL];
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
  } catch(e) {
    Logger.log("従来シートの申込締切処理でエラー: " + e.toString());
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
    
    let masterMap = {};
    for (let i = 1; i < masterData.length; i++) {
      let eventId = masterData[i][0];
      if (eventId) {
        masterMap[eventId] = { brand: masterData[i][1], eventName: masterData[i][2] };
      }
    }
    
    let remindList = [];
    for (let i = 1; i < applyData.length; i++) {
      let applyId = applyData[i][0];
      let eventId = applyData[i][1];
      let applyEndDateRaw = applyData[i][6]; // G列: 申込締切日
      
      if (!applyId || !applyEndDateRaw) continue;
      
      let applyEnd = new Date(applyEndDateRaw);
      let applyEndStr = Utilities.formatDate(applyEnd, "JST", "yyyy-MM-dd");
      
      if (applyEndStr === todayStr) {
        let masterInfo = masterMap[eventId] || {};
        let brandStr = masterInfo.brand ? `【${masterInfo.brand}】` : "";
        let eventName = masterInfo.eventName || applyData[i][3];
        let applyName = applyData[i][4];
        let applyUrl  = applyData[i][7];
        let formattedTime = Utilities.formatDate(applyEnd, "JST", "HH:mm");
        
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
      let message = "🔔 **【新システム】本日締切のチケット申込はありません！**\n\n漏れがあれば教えてね！\n\nイベント・申込の登録はこちらから！\nhttps://forms.gle/VcErZhtVcUHtL6ET8\n";
      sendNotification(WEBHOOK_APPLY, message);
    }
    Logger.log("=== 新システムの申込締切チェックが完了 ===");
  } catch(e) {
    Logger.log("新システムの申込締切処理でエラー: " + e.toString());
  }
}