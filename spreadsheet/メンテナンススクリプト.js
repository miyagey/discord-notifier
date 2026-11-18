// ==================================================
// 【メンテナンススクリプト】
// データ移行・一括修正など、GASエディタから手動実行するメンテナンス関数群
// ==================================================

/**
 * スプレッドシート上にカレンダーIDが登録されている既存予定のタイトル末尾に
 * 「(システム登録)」を付与する（未付与のもののみ対象）
 */
function migrateCalendarEventTitles() {
  Logger.log("=== 既存カレンダー予定タイトルへの「(システム登録)」付与処理を開始 ===");
  try {
    const events = SheetService.fetchEvents();
    const result = CalendarService.appendSystemSuffixToExistingEvents(events);
    Logger.log(
      `処理完了: カレンダーID有り=${result.totalWithCalId}件, 更新=${result.updated}件, スキップ(付与済)=${result.alreadySuffixed}件, 未発見/失敗=${result.notFound}件`
    );
  } catch (e) {
    logError("migrateCalendarEventTitles (既存カレンダー予定タイトル移行)", e);
  }
  Logger.log("=== 既存カレンダー予定タイトルへの「(システム登録)」付与処理が正常終了しました ===");
}
