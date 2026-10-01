// ==================================================
// 【カレンダー操作】
// Google カレンダーへの終日イベント登録・予定取得処理
// ==================================================

/**
 * カレンダーサービスオブジェクト
 */
const CalendarService = {

  /**
   * カレンダーインスタンスを取得する
   * @returns {GoogleAppsScript.Calendar.Calendar|null}
   */
  getCalendar() {
    if (!CALENDAR_ID) {
      Logger.log("CALENDAR_ID が設定されていません。");
      return null;
    }
    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) {
      Logger.log(`カレンダーID「${CALENDAR_ID}」が見つかりません。`);
      return null;
    }
    return cal;
  },

  /**
   * 終日イベントを Google カレンダーに登録する
   * @param {string} title - イベントタイトル
   * @param {Date|string} startDate - 開始日
   * @param {Date|string} [endDate] - 終了日 (省略時は開始日当日)
   * @param {string} [location] - 会場
   * @param {string} [summary] - 概要
   * @returns {string|null} 登録されたイベントID、失敗時は null
   */
  createAllDayEvent(title, startDate, endDate, location, summary) {
    const calendar = this.getCalendar();
    if (!calendar) return null;

    const startD = (startDate instanceof Date) ? new Date(startDate) : new Date(startDate);
    const endRaw = endDate || startDate;
    let endD = (endRaw instanceof Date) ? new Date(endRaw) : new Date(endRaw);

    // Googleカレンダーの仕様上、終日イベントの終了日は翌日0:00を指定する
    endD.setDate(endD.getDate() + 1);

    const options = {};
    if (location) options.location = location;
    if (summary) options.description = summary;

    const event = calendar.createAllDayEvent(title, startD, endD, options);
    const eventId = event.getId();
    Logger.log(`カレンダー登録成功: ${title} (ID: ${eventId})`);
    return eventId;
  },

  /**
   * 明日の予定イベントを取得して整形する
   * @param {Date} [baseDate] - 基準日 (省略時は現在日時)
   * @returns {{dateTitle: string, events: Array<{title: string, timeStr: string, location: string, description: string}>}|null}
   */
  getTomorrowEvents(baseDate) {
    const calendar = this.getCalendar();
    if (!calendar) return null;

    const today = baseDate ? new Date(baseDate) : new Date();

    const tomorrowStart = new Date(today);
    tomorrowStart.setDate(today.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date(today);
    tomorrowEnd.setDate(today.getDate() + 1);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const calEvents = calendar.getEvents(tomorrowStart, tomorrowEnd);
    const dateTitle = formatDateJST(tomorrowStart, "MM/dd(E)");

    const formattedEvents = calEvents.map(event => {
      const title = event.getTitle();
      const location = event.getLocation() || "";
      const description = event.getDescription() || "";
      const start = event.getStartTime();
      const end = event.getEndTime();
      let timeStr = "";

      if (event.isAllDayEvent()) {
        const startDateStr = formatDateJST(start, "MM/dd");
        const actualEnd = new Date(end.getTime() - 1);
        const endDateStr = formatDateJST(actualEnd, "MM/dd");
        timeStr = (startDateStr === endDateStr) ? "[終日]" : `${startDateStr} 〜 ${endDateStr} [連日終日]`;
      } else {
        timeStr = `${formatDateJST(start, "HH:mm")} 〜 ${formatDateJST(end, "HH:mm")}`;
      }

      return {
        title,
        timeStr,
        location,
        description
      };
    });

    return {
      dateTitle,
      events: formattedEvents
    };
  }
};
