/**
 * イベントマスターシートからカレンダー未登録のイベントを抽出し、自動登録する関数
 */
function registerEventsToCalendar() {
  try {
    Logger.log("=== カレンダー自動登録処理を開始 ===");

    // 共通設定ファイルからURLを取得してシートを開く
    const ss = SpreadsheetApp.openByUrl(COMMON_SHEET_URL);
    const masterSheet = ss.getSheetByName("イベントマスター");

    if (!masterSheet) {
      Logger.log("「イベントマスター」シートが見つかりません。処理を中断します。");
      return;
    }

    // カレンダーの取得
    const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!calendar) {
      Logger.log("指定されたカレンダーIDが見つかりません。Configファイルを確認してください。");
      return;
    }

    // シートの全データを一括取得（2行目以降を処理）
    const masterData = masterSheet.getDataRange().getValues();
    const registeredEventsLog = []; // Discord通知用のログを溜める配列

    // 2行目（インデックス1）から最終行までループ処理
    for (let i = 1; i < masterData.length; i++) {
      const rowData = masterData[i];
      const calendarId = rowData[MASTER_COL.CAL_ID];
      const startDateRaw = rowData[MASTER_COL.START_DATE];

      // すでにカレンダーIDがある場合、または開始日が空欄の場合はスキップ
      if (calendarId || !startDateRaw) {
        continue;
      }

      // データの整形
      const brand = rowData[MASTER_COL.BRAND];
      const eventName = rowData[MASTER_COL.EVENT_NAME];
      const location = rowData[MASTER_COL.LOCATION];
      const summary = rowData[MASTER_COL.SUMMARY];

      // タイトルの組み立て
      const title = formatBrandEventTitle(brand, eventName);

      // 日付の処理（終日イベント用）
      const startDate = new Date(startDateRaw);
      let endDate;

      if (rowData[MASTER_COL.END_DATE]) {
        endDate = new Date(rowData[MASTER_COL.END_DATE]);
        // Googleカレンダーの仕様上、終日イベントの終了日は「その日の24:00（＝翌日0:00）」を指定する必要があるため+1日する
        endDate.setDate(endDate.getDate() + 1);
      } else {
        // 終了日がない場合は開始日と同じ（1日間のみの終日イベント）とするため、開始日の翌日を指定
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
      }

      // オプション（場所と説明文）の組み立て
      const options = {};
      if (location) options.location = location;
      if (summary) options.description = summary;

      // --- Googleカレンダーへ終日イベントを登録 ---
      const newEvent = calendar.createAllDayEvent(title, startDate, endDate, options);
      const newEventId = newEvent.getId();

      // --- スプレッドシートのH列（i+1行目の 8列目 = MASTER_COL.CAL_ID + 1）にカレンダーIDを書き戻す ---
      masterSheet.getRange(i + 1, MASTER_COL.CAL_ID + 1).setValue(newEventId);
      Logger.log(`カレンダー登録成功: ${title} (ID: ${newEventId})`);

      // Discord通知用のオブジェクトを追加
      let dateStr = formatDateJST(startDate, "yyyy-MM-dd");
      if (rowData[MASTER_COL.END_DATE] && rowData[MASTER_COL.END_DATE] !== startDateRaw) {
        const actualEnd = new Date(rowData[MASTER_COL.END_DATE]);
        dateStr += ` 〜 ${formatDateJST(actualEnd, "yyyy-MM-dd")}`;
      }

      registeredEventsLog.push({
        title: title,
        date: dateStr,
        location: location,
        summary: summary
      });
    }

    // --- 新しく登録されたイベントがあればDiscordへ一括通知 ---
    if (registeredEventsLog.length > 0) {
      const messageLines = ["🆕 **Googleカレンダーに新しいイベントを登録したよ！**\n"];

      registeredEventsLog.forEach(event => {
        messageLines.push(`📅 **${event.title}**`);
        messageLines.push(` └ 期間: **${event.date} [終日]**`);
        if (event.location) messageLines.push(` └ 会場: ${event.location}`);
        if (event.summary) {
          const trimmed = String(event.summary).trim();
          if (trimmed.includes("\n")) {
            const quoted = trimmed.split("\n").map(l => `> ${l}`).join("\n");
            messageLines.push(` └ 概要:\n${quoted}`);
          } else {
            messageLines.push(` └ 概要: ${trimmed}`);
          }
        }
        messageLines.push("");
      });

      // カレンダー用のWebhook（WEBHOOK_CALENDAR）へ通知を送信
      sendNotification(WEBHOOK_CALENDAR, messageLines.join('\n').trimEnd());
      Logger.log("Discordへカレンダー登録完了通知を送信しました。");
    } else {
      Logger.log("新しく登録するカレンダーイベントはありませんでした。");
    }

    Logger.log("=== カレンダー自動登録処理を正常終了 ===");
  } catch (e) {
    logError("registerEventsToCalendar", e);
  }
}