function notifyTomorrowEvents() {
  try {
    Logger.log("=== 明日の予定通知処理を開始 ===");
    const today = new Date();
    
    const tomorrowStart = new Date(today);
    tomorrowStart.setDate(today.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);
    
    const tomorrowEnd = new Date(today);
    tomorrowEnd.setDate(today.getDate() + 1);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!calendar) {
      Logger.log("指定されたカレンダーIDが見つかりません。");
      return;
    }

    const events = calendar.getEvents(tomorrowStart, tomorrowEnd);
    let messageLines = [];
    const dateTitle = Utilities.formatDate(tomorrowStart, "JST", "MM/dd(E)");
    
    messageLines.push(`## 📅 明日 ${dateTitle} の予定リスト`);

    if (events.length === 0) {
      messageLines.push("明日の予定はありません。");
    } else {
      events.forEach(event => {
        const title = event.getTitle();
        const location = event.getLocation();
        const description = event.getDescription();
        const start = event.getStartTime();
        const end = event.getEndTime();
        let timeStr = "";
        
        if (event.isAllDayEvent()) {
          const startDateStr = Utilities.formatDate(start, "JST", "MM/dd");
          const actualEnd = new Date(end.getTime() - 1);
          const endDateStr = Utilities.formatDate(actualEnd, "JST", "MM/dd");
          timeStr = (startDateStr === endDateStr) ? `[終日]` : `${startDateStr} 〜 ${endDateStr} [連日終日]`;
        } else {
          timeStr = `${Utilities.formatDate(start, "JST", "HH:mm")} 〜 ${Utilities.formatDate(end, "JST", "HH:mm")}`;
        }

        messageLines.push(`### 📌 ${title}`, `⏰ ${timeStr}`);
        if (location) messageLines.push(`📍 場所: ${location}`);
        if (description) messageLines.push(`📝 説明:\n> ${description.replace(/\n/g, '\n> ')}`);
        messageLines.push("\n---\n");
      });
    }

    sendNotification(WEBHOOK_CALENDAR, messageLines.join('\n'));
    Logger.log("=== 明日の予定通知処理が完了 ===");
  } catch (e) {
    Logger.log("明日の予定通知処理でエラー: " + e.toString());
  }
}