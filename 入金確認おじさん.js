function remindPaymentEndDate() {
  const today = new Date();
  const todayStr = Utilities.formatDate(today, "JST", "yyyy-MM-dd");

  // --- 1. 従来シート（入力用）からの抽出 ---
  try {
    Logger.log("=== 従来シートの入金締切チェックを開始 ===");
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName('入力用');
    let contents = "";

    if (sheet) {
      const sheetData = sheet.getDataRange().getValues();
      for (let i = 4; i < sheetData.length; i++) {
        let rowData = sheetData[i];
        let payDeadlineRaw = rowData[OLD_COL.PAY_DEADLINE];

        if (!payDeadlineRaw || payDeadlineRaw === "") continue;

        let payDeadlineStr = Utilities.formatDate(new Date(payDeadlineRaw), "JST", "yyyy-MM-dd");

        if (payDeadlineStr === todayStr) {
          contents += "\n- 【" + rowData[OLD_COL.BRAND] + "】" + rowData[OLD_COL.EVENT];
          if (rowData[OLD_COL.NOTE] !== "") {
            contents += "【" + rowData[OLD_COL.NOTE] + "】";
          }
          contents += "\n  - " + rowData[OLD_COL.URL];
        }
      }
    }

    if (contents !== "") {
      let message = ":warning: :warning: :warning: 入金しめきり大丈夫？？？ :warning: :warning: :warning:" + contents;
      sendNotification(WEBHOOK_PAYMENT, message);
    }
    Logger.log("=== 従来シートの入金締切チェックが完了 ===");
  } catch(e) {
    Logger.log("従来シートの入金締切処理でエラー: " + e.toString());
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
    
    let masterMap = {};
    for (let i = 1; i < masterData.length; i++) {
      let eventId = masterData[i][0];
      if (eventId) {
        masterMap[eventId] = { brand: masterData[i][1], eventName: masterData[i][2] };
      }
    }
    
    let paymentList = [];
    for (let i = 1; i < applyData.length; i++) {
      let applyId = applyData[i][0];
      let eventId = applyData[i][1];
      let payEndDateRaw = applyData[i][9]; // J列: 入金締め切り日
      let status = applyData[i][10];       // K列: ステータス
      
      if (!applyId || !payEndDateRaw) continue;
      
      let payEndStr = Utilities.formatDate(new Date(payEndDateRaw), "JST", "yyyy-MM-dd");
      
      if (payEndStr === todayStr && status !== "期間終了") {
        let masterInfo = masterMap[eventId] || {};
        let brandStr = masterInfo.brand ? `【${masterInfo.brand}】` : "";
        let eventName = masterInfo.eventName || applyData[i][3];
        let applyName = applyData[i][4];
        let formattedTime = Utilities.formatDate(new Date(payEndDateRaw), "JST", "HH:mm");
        
        paymentList.push({ brandEvent: `${brandStr}${eventName}`, applyName: applyName, timeStr: formattedTime });
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
  } catch(e) {
    Logger.log("新システムの入金締切処理でエラー: " + e.toString());
  }
}