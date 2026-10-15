// ==================================================
// 【定期通知バッチ処理】
// 時間主導型トリガーによって定期実行されるメイン関数群
// （オーケストレーション層：データ取得・メッセージ生成・送信のフロー制御に専念）
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
    DiscordService.sendApplyRemindNotification(regularItems);

    // 2. 翌日開始の先着受付通知
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = formatDateJST(tomorrow, "yyyy-MM-dd");
    const firstComeItems = SheetService.fetchFirstComeApplyItems(tomorrowStr);

    if (firstComeItems.length > 0) {
      Utilities.sleep(500);
      DiscordService.sendFirstComeRemindNotification(firstComeItems);
    }

    // 3. 受付期間中のリセール通知
    const resaleItems = SheetService.fetchResaleApplyItems(todayStr);
    if (resaleItems.length > 0) {
      Utilities.sleep(500);
      DiscordService.sendResaleRemindNotification(resaleItems);
    }

    Logger.log("=== 申込通知処理が正常終了しました ===");
  } catch (e) {
    logError("remindEndDate", e);
  }
}

/**
 * 入金締切情報を抽出し、Discord へリマインド通知するメイン関数
 * ※ 対象がない場合は送信せずログを出力して終了する（フッターなし）
 */
function remindPaymentEndDate() {
  try {
    Logger.log("=== 入金締切通知処理を開始 ===");
    const today = new Date();
    const todayStr = formatDateJST(today, "yyyy-MM-dd");

    // 1. データ取得
    const paymentItems = SheetService.fetchPaymentApplyItems(todayStr, today);

    // 該当なしの場合は通知せずログ出力して終了
    if (!paymentItems || paymentItems.length === 0) {
      Logger.log("本日入金締切のチケットはありませんでした。処理を終了します。");
      return;
    }

    // 2. メッセージ生成 & 3. Discord送信（フッターなし）
    DiscordService.sendPaymentRemindNotification(paymentItems);

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
    // 1. 未同期イベントのデータ取得
    const unsyncedEvents = SheetService.getUnsyncedMasterEvents();

    if (unsyncedEvents.length === 0) {
      Logger.log("新しく登録するカレンダーイベントはありませんでした。");
      return;
    }

    const registeredEventsLog = [];

    // 2. カレンダー登録（DTOパターン）およびスプレッドシート更新
    for (const ev of unsyncedEvents) {
      const title = DiscordService.formatBrandEventTitle(ev.brand, ev.eventName);
      const calId = CalendarService.createAllDayEvent({
        title: title,
        startDate: ev.startDateRaw,
        endDate: ev.endDateRaw,
        location: ev.location,
        summary: ev.summary
      });

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

    // 3. Discordへ同期完了通知を送信
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
