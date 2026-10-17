// ==================================================
// 【定期通知バッチ処理】
// 時間主導型トリガーによって定期実行されるメイン関数群
// （オーケストレーション層：データ取得・メッセージ生成・送信のフロー制御に専念）
// ==================================================

/**
 * 申込通知バッチ処理（メイン関数）
 */
function remindEndDate() {
  Logger.log("=== 申込通知処理を開始 ===");
  try {
    // 1. 通常申込（先着・リセール以外）の本日締切通知
    const regularItems = SheetService.fetchDeadlineApplyItems();
    DiscordService.sendApplyRemindNotification(regularItems);

    Utilities.sleep(500);

    // 2. 翌日開始の先着受付通知
    const firstComeItems = SheetService.fetchFirstComeApplyItems();
    DiscordService.sendFirstComeRemindNotification(firstComeItems);

    Utilities.sleep(500);
    
    // 3. 受付期間中のリセール通知
    const resaleItems = SheetService.fetchResaleApplyItems();
    DiscordService.sendResaleRemindNotification(resaleItems);

  } catch (e) {
    Logger.log("申込通知処理でエラーが発生しました: " + e.toString());
  }
  Logger.log("=== 申込通知処理が正常終了しました ===");
}

/**
 * 入金締切の通知を送信する（バッチメイン関数）
 */
function remindPaymentEndDate() {
  Logger.log("=== 入金締切通知処理を開始 ===");
  try {
    // 1. 本日が入金締切の対象アイテム一覧を取得（日付引数は不要）
    const items = SheetService.fetchPaymentApplyItems();

    // 2. Discordへ通知（0件時のログ判定・Embed構築はDiscordService側に委譲）
    DiscordService.sendPaymentRemindNotification(items);

  } catch (e) {
    Logger.log("入金締切処理でエラーが発生しました: " + e.toString());
  }
  Logger.log("=== 入金締切通知処理が正常終了しました ===");
}

/**
 * 明日の Google カレンダー予定を通知する（バッチメイン関数）
 */
function notifyTomorrowEvents() {
  Logger.log("=== 明日のカレンダー予定通知処理を開始 ===");
  try {
    // 1. カレンダーから明日の予定一覧（DTO配列）を取得
    const events = CalendarService.getTomorrowEvents();

    // 2. Discordへ通知（0件時の判定・ログ出力・Embed構築はDiscordService側に委譲）
    DiscordService.notifyTomorrowEvents(events);

  } catch (e) {
    Logger.log("明日のカレンダー予定通知処理でエラーが発生しました: " + e.toString());
  }
  Logger.log("=== 明日のカレンダー予定通知処理が正常終了しました ===");
}

/**
 * イベントマスターの未登録イベントを Google カレンダーへ自動同期する（バッチメイン関数）
 */
function registerEventsToCalendar() {
  Logger.log("=== カレンダー自動登録処理を開始 ===");
  try {
    // 1. 未登録イベント一覧を取得
    const unregisteredEvents = SheetService.fetchUnregisteredCalendarEvents();

    // 2. カレンダー登録およびスプレッドシートへのID書き戻しを一貫実行（同期処理）
    const registeredCount = CalendarService.syncEventsToSheet(unregisteredEvents);

    Logger.log(`カレンダー同期処理が完了しました（登録件数: ${registeredCount}件）`);
  } catch (e) {
    Logger.log("カレンダー自動登録処理でエラーが発生しました: " + e.toString());
  }
  Logger.log("=== カレンダー自動登録処理が正常終了しました ===");
}
