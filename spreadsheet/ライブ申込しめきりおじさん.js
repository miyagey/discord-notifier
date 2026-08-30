/**
 * チケット申込情報を抽出し、Discord へリマインド通知するメイン関数。
 * 1. 通常申込（先着・リセール以外）の本日締切通知
 * 2. 翌日開始の先着受付通知（あれば送信）
 * 3. 受付期間中のリセール通知（あれば送信）
 */
function remindEndDate() {
  try {
    const today = new Date();
    const todayStr = formatDateJST(today, "yyyy-MM-dd");

    // --------------------------------------------------
    // 1. 通常申込（先着・リセール以外）の本日締切通知
    // --------------------------------------------------
    const newItems = fetchNewSheetApplyItems(todayStr, today);
    const regularItems = [...newItems];

    if (regularItems.length > 0) {
      const headerTitle = "🔔 **本日締切のチケット申込があります！**";
      const formatItemFunc = (item) => {
        let str = `\n📅 **${item.brandEvent}**\n └ 受付区分: ${item.applyName}\n └ 締切時刻: **${item.timeStr}**\n`;
        if (item.method) {
          str += formatApplyMethodBlock(item.method);
        }
        return str;
      };

      const footer = "\n" + getRegistrationFooterMessage();
      sendItemListNotification(WEBHOOK_APPLY, headerTitle, regularItems, formatItemFunc, footer);
    } else {
      const message = "🔔 **本日締切のチケット申込はありません！**\n\n漏れがあれば教えてね！\n\n" + getRegistrationFooterMessage();
      sendNotification(WEBHOOK_APPLY, message);
    }

    // --------------------------------------------------
    // 2. 翌日開始の先着受付通知（該当がある場合のみ送信）
    // --------------------------------------------------
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = formatDateJST(tomorrow, "yyyy-MM-dd");

    const firstComeItems = fetchFirstComeApplyItemsTomorrow(tomorrowStr);
    if (firstComeItems.length > 0) {
      Utilities.sleep(500);
      const DISCORD_MAX_LENGTH = 2000;
      const headerTitle = "🏃 **明日から先着受付が始まります！忘れずに！**";
      let currentMessage = headerTitle + "\n";

      for (const item of firstComeItems) {
        let itemText = `\n📅 **${item.brandEvent}**\n └ 受付区分: ${item.applyName}\n └ 開始日時: **${item.timeStr}から**\n`;
        if (item.method) {
          itemText += formatApplyMethodBlock(item.method);
        }
        if ((currentMessage + itemText).length > DISCORD_MAX_LENGTH) {
          sendNotification(WEBHOOK_APPLY, currentMessage);
          Utilities.sleep(500);
          currentMessage = headerTitle + "\n" + itemText;
        } else {
          currentMessage += itemText;
        }
      }
      sendNotification(WEBHOOK_APPLY, currentMessage);
    }

    // --------------------------------------------------
    // 3. 受付期間中のリセール通知（該当がある場合のみ送信）
    // --------------------------------------------------
    const resaleItems = fetchResaleApplyItemsActive(todayStr);
    if (resaleItems.length > 0) {
      Utilities.sleep(500);
      const DISCORD_MAX_LENGTH = 2000;
      const headerTitle = "🔄 **受付中のリセールがあります！**";
      let currentMessage = headerTitle + "\n";

      for (const item of resaleItems) {
        let itemText = `\n📅 **${item.brandEvent}**\n └ 受付区分: ${item.applyName}\n └ 締切日時: **${item.deadlineStr}まで**\n`;
        if (item.method) {
          itemText += formatApplyMethodBlock(item.method);
        }
        if ((currentMessage + itemText).length > DISCORD_MAX_LENGTH) {
          sendNotification(WEBHOOK_APPLY, currentMessage);
          Utilities.sleep(500);
          currentMessage = headerTitle + "\n" + itemText;
        } else {
          currentMessage += itemText;
        }
      }
      sendNotification(WEBHOOK_APPLY, currentMessage);
    }

    Logger.log("=== 申込通知処理が正常終了しました ===");
  } catch (e) {
    logError("remindEndDate (メイン処理)", e);
  }
}

// ==================================================
// 【ヘルパー関数】データ抽出処理
// ==================================================

/**
 * 新システム（イベントマスター/申し込み管理）から本日の申込締切アイテム（先着・リセール以外）を抽出する
 * @param {string} todayStr - 本日の日付文字列 ("yyyy-MM-dd")
 * @param {Date} now - 現在時刻（時刻考慮の厳密判定用）
 * @returns {Array<{brandEvent: string, applyName: string, timeStr: string, method: string, sourceType: string}>}
 */
function fetchNewSheetApplyItems(todayStr, now) {
  const items = [];
  try {
    Logger.log("=== 新システムの通常申込締切チェックを開始 ===");
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
      const applyName = row[APPLY_COL.APPLY_NAME] || "";

      if (!applyId || !applyEndDateRaw) continue;

      // 先着またはリセールは個別通知枠で処理するため除外
      if (applyName.includes("先着") || applyName.includes("リセール")) continue;

      const applyEndStr = formatDateJST(applyEndDateRaw, "yyyy-MM-dd");

      if (applyEndStr !== todayStr) continue;

      // 締切時刻が現在時刻より過去の場合はスキップ（時刻考慮）
      if (new Date(applyEndDateRaw) <= now) continue;

      const masterInfo = masterMap[eventId] || {};
      const eventName = masterInfo.eventName || row[APPLY_COL.EVENT_NAME_ALT];
      const brandEventTitle = formatBrandEventTitle(masterInfo.brand, eventName);
      const applyMethod = row[APPLY_COL.APPLY_METHOD] || row[APPLY_COL.URL] || "";
      const formattedTime = formatDateJST(applyEndDateRaw, "HH:mm");

      items.push({
        brandEvent: brandEventTitle,
        applyName: applyName,
        timeStr: `${formattedTime}まで`,
        method: applyMethod,
        sourceType: "new"
      });
    }
    Logger.log(`新システムの通常申込締切件数: ${items.length}件`);
  } catch (e) {
    logError("fetchNewSheetApplyItems", e);
  }
  return items;
}

/**
 * 新システム（申し込み管理）から明日が申込開始日かつ受付名に「先着」を含むアイテムを抽出する
 * @param {string} tomorrowStr - 明日の日付文字列 ("yyyy-MM-dd")
 * @returns {Array<{brandEvent: string, applyName: string, timeStr: string, method: string}>}
 */
function fetchFirstComeApplyItemsTomorrow(tomorrowStr) {
  const items = [];
  try {
    Logger.log("=== 先着前日リマインドチェックを開始 ===");
    const ss = SpreadsheetApp.openByUrl(COMMON_SHEET_URL);
    const masterSheet = ss.getSheetByName("イベントマスター");
    const applySheet = ss.getSheetByName("申し込み管理");

    if (!masterSheet || !applySheet) return items;

    const masterData = masterSheet.getDataRange().getValues();
    const applyData = applySheet.getDataRange().getValues();

    const masterMap = getMasterEventMap(masterData);

    // 申し込み管理シートの申込開始日は F列 (インデックス5)
    const APPLY_START_DATE_COL = 5;

    for (let i = 1; i < applyData.length; i++) {
      const row = applyData[i];
      const applyId = row[APPLY_COL.APPLY_ID];
      const applyStartDateRaw = row[APPLY_START_DATE_COL];

      // 申込IDが空、または申込開始日が未設定の行はスキップ
      if (!applyId || !applyStartDateRaw) continue;

      const applyStartStr = formatDateJST(applyStartDateRaw, "yyyy-MM-dd");

      // 申込開始日が明日でない行はスキップ
      if (applyStartStr !== tomorrowStr) continue;

      const applyName = row[APPLY_COL.APPLY_NAME] || "";

      // 受付名に「先着」が含まれない行はスキップ
      if (!applyName.includes("先着")) continue;

      const eventId = row[APPLY_COL.EVENT_ID];
      const masterInfo = masterMap[eventId] || {};
      const eventName = masterInfo.eventName || row[APPLY_COL.EVENT_NAME_ALT];
      const brandEventTitle = formatBrandEventTitle(masterInfo.brand, eventName);
      const applyMethod = row[APPLY_COL.APPLY_METHOD] || row[APPLY_COL.URL] || "";
      const formattedDateTime = formatDateJST(applyStartDateRaw, "yyyy/MM/dd HH:mm");

      items.push({
        brandEvent: brandEventTitle,
        applyName: applyName,
        timeStr: formattedDateTime,
        method: applyMethod
      });
    }
    Logger.log(`先着前日リマインド対象件数: ${items.length}件`);
  } catch (e) {
    logError("fetchFirstComeApplyItemsTomorrow", e);
  }
  return items;
}

/**
 * 新システム（申し込み管理）から本日が受付期間中（開始日 <= 本日 <= 締切日）かつ受付名に「リセール」を含むアイテムを抽出する
 * @param {string} todayStr - 本日の日付文字列 ("yyyy-MM-dd")
 * @returns {Array<{brandEvent: string, applyName: string, deadlineStr: string, method: string}>}
 */
function fetchResaleApplyItemsActive(todayStr) {
  const items = [];
  try {
    Logger.log("=== リセール受付中チェックを開始 ===");
    const ss = SpreadsheetApp.openByUrl(COMMON_SHEET_URL);
    const masterSheet = ss.getSheetByName("イベントマスター");
    const applySheet = ss.getSheetByName("申し込み管理");

    if (!masterSheet || !applySheet) return items;

    const masterData = masterSheet.getDataRange().getValues();
    const applyData = applySheet.getDataRange().getValues();

    const masterMap = getMasterEventMap(masterData);

    // 申し込み管理シートの申込開始日は F列 (インデックス5)
    const APPLY_START_DATE_COL = 5;

    for (let i = 1; i < applyData.length; i++) {
      const row = applyData[i];
      const applyId = row[APPLY_COL.APPLY_ID];
      const applyStartDateRaw = row[APPLY_START_DATE_COL];
      const applyEndDateRaw = row[APPLY_COL.APPLY_END_DATE];
      const applyName = row[APPLY_COL.APPLY_NAME] || "";

      // 申込IDが空、または受付名に「リセール」が含まれない行はスキップ
      if (!applyId || !applyName.includes("リセール")) continue;

      // 締切日が未設定の場合はスキップ
      if (!applyEndDateRaw) continue;

      const applyEndStr = formatDateJST(applyEndDateRaw, "yyyy-MM-dd");

      // 申込開始日が設定されている場合は 開始日 <= 本日 <= 締切日
      // 申込開始日が未設定の場合は 本日 <= 締切日
      let isActive = false;
      if (applyStartDateRaw) {
        const applyStartStr = formatDateJST(applyStartDateRaw, "yyyy-MM-dd");
        if (applyStartStr <= todayStr && todayStr <= applyEndStr) {
          isActive = true;
        }
      } else {
        if (todayStr <= applyEndStr) {
          isActive = true;
        }
      }

      if (!isActive) continue;

      const eventId = row[APPLY_COL.EVENT_ID];
      const masterInfo = masterMap[eventId] || {};
      const eventName = masterInfo.eventName || row[APPLY_COL.EVENT_NAME_ALT];
      const brandEventTitle = formatBrandEventTitle(masterInfo.brand, eventName);
      const applyMethod = row[APPLY_COL.APPLY_METHOD] || row[APPLY_COL.URL] || "";
      const formattedDeadline = formatDateJST(applyEndDateRaw, "yyyy/MM/dd HH:mm");

      items.push({
        brandEvent: brandEventTitle,
        applyName: applyName,
        deadlineStr: formattedDeadline,
        method: applyMethod
      });
    }
    Logger.log(`リセール受付中対象件数: ${items.length}件`);
  } catch (e) {
    logError("fetchResaleApplyItemsActive", e);
  }
  return items;
}