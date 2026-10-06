// ==================================================
// 【定期通知バッチ処理】
// 時間主導型トリガーによって定期実行されるメイン関数群
// ==================================================

/**
 * チケット申込情報を抽出し、Discord へリマインド通知するメイン関数
 * 1. 通常申込（先着・リセール以外）の本日締切通知
 * 2. 翌日開始の先着受付通知（該当がある場合のみ）
 * 3. 受付期間中のリセール通知（該当がある場合のみ）
 */
function remindEndDate() {
  try {
    Logger.log("=== 申込通知処理を開始 ===");
    const today = new Date();
    const todayStr = formatDateJST(today, "yyyy-MM-dd");

    // 1. 通常申込（先着・リセール以外）の本日締切通知
    const regularItems = SheetService.fetchDeadlineApplyItems(todayStr, today);
    if (regularItems.length > 0) {
      const headerTitle = "🔔 **本日締切のチケット申込があります！**";
      const formatItemFunc = (item) => {
        let str = `\n📅 **${item.brandEvent}**\n └ 受付区分: ${item.applyName}\n └ 締切時刻: **${item.timeStr}**\n`;
        if (item.method) str += DiscordService.formatApplyMethodBlock(item.method);
        return str;
      };
      const footer = "\n" + DiscordService.getRegistrationFooterMessage();
      DiscordService.sendItemListNotification(WEBHOOK_APPLY, headerTitle, regularItems, formatItemFunc, footer);
    } else {
      const message = "🔔 **本日締切のチケット申込はありません！**\n\n漏れがあれば教えてね！\n\n" + DiscordService.getRegistrationFooterMessage();
      DiscordService.sendNotification(WEBHOOK_APPLY, message);
    }

    // 2. 翌日開始の先着受付通知
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = formatDateJST(tomorrow, "yyyy-MM-dd");
    const firstComeItems = SheetService.fetchFirstComeApplyItems(tomorrowStr);

    if (firstComeItems.length > 0) {
      Utilities.sleep(500);
      const headerTitle = "🏃 **明日から先着受付が始まります！忘れずに！**";
      const formatItemFunc = (item) => {
        let str = `\n📅 **${item.brandEvent}**\n └ 受付区分: ${item.applyName}\n └ 開始日時: **${item.timeStr}から**\n`;
        if (item.method) str += DiscordService.formatApplyMethodBlock(item.method);
        return str;
      };
      DiscordService.sendItemListNotification(WEBHOOK_APPLY, headerTitle, firstComeItems, formatItemFunc);
    }

    // 3. 受付期間中のリセール通知
    const resaleItems = SheetService.fetchResaleApplyItems(todayStr);
    if (resaleItems.length > 0) {
      Utilities.sleep(500);
      const headerTitle = "🔄 **受付中のリセールがあります！**";
      const formatItemFunc = (item) => {
        let str = `\n📅 **${item.brandEvent}**\n └ 受付区分: ${item.applyName}\n └ 締切日時: **${item.deadlineStr}まで**\n`;
        if (item.method) str += DiscordService.formatApplyMethodBlock(item.method);
        return str;
      };
      DiscordService.sendItemListNotification(WEBHOOK_APPLY, headerTitle, resaleItems, formatItemFunc);
    }

    Logger.log("=== 申込通知処理が正常終了しました ===");
  } catch (e) {
    logError("remindEndDate", e);
  }
}

/**
 * 入金締切情報を抽出し、Discord へリマインド通知するメイン関数
 */
function remindPaymentEndDate() {
  try {
    Logger.log("=== 入金締切通知処理を開始 ===");
    const today = new Date();
    const todayStr = formatDateJST(today, "yyyy-MM-dd");

    const paymentItems = SheetService.fetchPaymentApplyItems(todayStr, today);

    if (paymentItems.length > 0) {
      const headerTitle = "💸 **本日入金締切のチケットがあります！**";
      const formatItemFunc = (item) => {
        let str = `\n📅 **${item.brandEvent}**\n └ 受付区分: ${item.applyName}\n └ 入金締切: **${item.timeStr}**\n`;
        if (item.method) str += DiscordService.formatApplyMethodBlock(item.method);
        return str;
      };
      const footer = "\n" + DiscordService.getRegistrationFooterMessage();
      DiscordService.sendItemListNotification(WEBHOOK_PAYMENT, headerTitle, paymentItems, formatItemFunc, footer);
    } else {
      const message = "💸 **本日入金締切のチケットはありません！**\n\n漏れがあれば教えてね！\n\n" + DiscordService.getRegistrationFooterMessage();
      DiscordService.sendNotification(WEBHOOK_PAYMENT, message);
    }

    Logger.log("=== 入金締切通知処理が正常終了しました ===");
  } catch (e) {
    logError("remindPaymentEndDate", e);
  }
}

/**
 * イベントマスターからカレンダー未登録のイベントを同期登録するメイン関数
 */
function registerEventsToCalendar() {
  try {
    Logger.log("=== カレンダー自動登録処理を開始 ===");
    const unsyncedEvents = SheetService.getUnsyncedMasterEvents();

    if (unsyncedEvents.length === 0) {
      Logger.log("新しく登録するカレンダーイベントはありませんでした。");
      return;
    }

    const registeredEventsLog = [];

    for (const ev of unsyncedEvents) {
      const title = DiscordService.formatBrandEventTitle(ev.brand, ev.eventName);
      const calId = CalendarService.createAllDayEvent(
        title, ev.startDateRaw, ev.endDateRaw, ev.location, ev.summary
      );

      if (calId) {
        SheetService.updateMasterCalendarId(ev.rowIndex, calId);

        let dateStr = formatDateJST(new Date(ev.startDateRaw), "yyyy-MM-dd");
        if (ev.endDateRaw && ev.endDateRaw !== ev.startDateRaw) {
          dateStr += ` 〜 ${formatDateJST(new Date(ev.endDateRaw), "yyyy-MM-dd")}`;
        }

        registeredEventsLog.push({
          title: title,
          date: dateStr,
          location: ev.location,
          summary: ev.summary
        });
      }
    }

    if (registeredEventsLog.length > 0) {
      DiscordService.notifyBatchCalendarEvents(registeredEventsLog);
      Logger.log(`Discordへ ${registeredEventsLog.length} 件のカレンダー登録完了通知を送信しました。`);
    }

    Logger.log("=== カレンダー自動登録処理を正常終了 ===");
  } catch (e) {
    logError("registerEventsToCalendar", e);
  }
}

/**
 * 明日の予定を Google カレンダーから取得し、Discord へ通知するメイン関数
 */
function notifyTomorrowEvents() {
  try {
    Logger.log("=== 明日の予定通知処理を開始 ===");
    const result = CalendarService.getTomorrowEvents();
    if (!result) return;

    DiscordService.notifyTomorrowEvents(result.dateTitle, result.events);
    Logger.log("=== 明日の予定通知処理が完了 ===");
  } catch (e) {
    logError("notifyTomorrowEvents", e);
  }
}
