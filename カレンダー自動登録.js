/**
 * イベントマスターシートからカレンダー未登録のイベントを抽出し、自動登録する関数
 */
function registerEventsToCalendar() {
  try {
    Logger.log("=== カレンダー自動登録処理を開始 ===");

    // 共通設定ファイル(0_Config.gs)からURLを取得してシートを開く
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
    
    // 各列のインデックス定義（A=0, B=1, C=2...）
    const COL_ID         = 0; // A列: イベントID
    const COL_BRAND      = 1; // B列: ブランド名
    const COL_EVENT_NAME = 2; // C列: イベント名
    const COL_START_DATE = 3; // D列: 開始日
    const COL_END_DATE   = 4; // E列: 終了日
    const COL_LOCATION   = 5; // F列: 会場
    const COL_SUMMARY    = 6; // G列: イベント概要
    const COL_CAL_ID     = 7; // H列: カレンダー登録ID

    let registeredEventsLog = []; // Discord通知用のログを溜める配列

    // 2行目（インデックス1）から最終行までループ処理
    for (let i = 1; i < masterData.length; i++) {
      let rowData = masterData[i];
      let calendarId = rowData[COL_CAL_ID];
      let startDateRaw = rowData[COL_START_DATE];

      // すでにカレンダーIDがある場合、または開始日が空欄の場合はスキップ
      if (calendarId || !startDateRaw || startDateRaw === "") {
        continue;
      }

      // データの整形
      let brand = rowData[COL_BRAND];
      let eventName = rowData[COL_EVENT_NAME];
      let location = rowData[COL_LOCATION];
      let summary = rowData[COL_SUMMARY];
      
      // タイトルの組み立て（テスト運用メッセージを末尾に追加）
      let title = `【${brand}】${eventName} (システム登録)`;

      // 日付の処理（終日イベント用）
      let startDate = new Date(startDateRaw);
      let endDate;

      if (rowData[COL_END_DATE] && rowData[COL_END_DATE] !== "") {
        endDate = new Date(rowData[COL_END_DATE]);
        // Googleカレンダーの仕様上、終日イベントの終了日は「その日の24:00（＝翌日0:00）」を指定する必要があるため+1日する
        endDate.setDate(endDate.getDate() + 1);
      } else {
        // 終了日がない場合は開始日と同じ（1日間のみの終日イベント）とするため、開始日の翌日を指定
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
      }

      // オプション（場所と説明文）の組み立て
      let options = {};
      if (location && location !== "") options.location = location;
      if (summary && summary !== "") options.description = summary;

      // --- Googleカレンダーへ終日イベントを登録 ---
      let newEvent = calendar.createAllDayEvent(title, startDate, endDate, options);
      let newEventId = newEvent.getId();

      // --- スプレッドシートのH列（i+1行目の8列目）にカレンダーIDを書き戻す ---
      masterSheet.getRange(i + 1, COL_CAL_ID + 1).setValue(newEventId);
      Logger.log(`カレンダー登録成功: ${title} (ID: ${newEventId})`);

      // Discord通知用のオブジェクトを追加
      let dateStr = Utilities.formatDate(startDate, "JST", "MM/dd");
      if (rowData[COL_END_DATE] && rowData[COL_END_DATE] !== "") {
        let actualEnd = new Date(rowData[COL_END_DATE]);
        dateStr += ` 〜 ${Utilities.formatDate(actualEnd, "JST", "MM/dd")}`;
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
      let messageLines = [];
      messageLines.push("## 🆕 カレンダーに新しいイベントを登録したよ！");

      registeredEventsLog.forEach(event => {
        messageLines.push(`### 📌 ${event.title}`);
        messageLines.push(`⏰ 期間: ${event.date} [終日]`);
        if (event.location) messageLines.push(`📍 場所: ${event.location}`);
        if (event.summary) messageLines.push(`📝 概要:\n> ${event.summary.replace(/\n/g, '\n> ')}`);
        messageLines.push("\n---\n");
      });

      // カレンダー用のWebhook（WEBHOOK_CALENDAR）へ通知を送信
      sendNotification(WEBHOOK_CALENDAR, messageLines.join('\n'));
      Logger.log("Discordへカレンダー登録完了通知を送信しました。");
    } else {
      Logger.log("新しく登録するカレンダーイベントはありませんでした。");
    }

    Logger.log("=== カレンダー自動登録処理を正常終了 ===");
  } catch (e) {
    Logger.log("カレンダー登録処理で致命的なエラーが発生しました: " + e.toString());
  }
}