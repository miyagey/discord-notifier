// ==================================================
// 【カレンダー操作】
// Google カレンダーへの終日イベント登録・予定取得処理
// ==================================================

/**
 * カレンダーサービスオブジェクト
 */
const CalendarService = {

  /**
   * 未登録イベントを Google カレンダーへ登録し、スプレッドシートへIDを書き戻す（一括同期処理）
   * @param {EventDto[]} unregisteredEvents - 未登録イベントDTO配列
   * @returns {number} 登録成功件数
   */
  syncEventsToSheet(unregisteredEvents) {
    if (!unregisteredEvents || unregisteredEvents.length === 0) {
      Logger.log("新しく登録するカレンダーイベントはありませんでした。");
      return 0;
    }

    const registeredEvents = [];
    let registeredCount = 0;

    for (const ev of unregisteredEvents) {
      const calId = this.createAllDayEvent(ev);

      if (calId) {
        SheetService.updateMasterCalendarId(ev.rowIndex, calId);
        registeredCount++;
        registeredEvents.push(ev);
      }
    }

    if (registeredEvents.length > 0) {
      DiscordService.notifyBatchCalendarEvents(registeredEvents);
      Logger.log(`Discordへ ${registeredEvents.length} 件のカレンダー登録完了通知を送信しました。`);
    }

    return registeredCount;
  },

  /**
   * 終日イベントを Google カレンダーに登録する
   * @param {EventDto} event - イベントDTO
   * @returns {string|null} 登録されたイベントID、失敗時は null
   */
  createAllDayEvent(event) {
    const calendar = this.getCalendar();
    if (!calendar || !event) return null;

    const title = event.title || formatBrandEventTitle(event.brand, event.name || event.eventName);
    const startDate = event.startDate || event.startDateRaw;
    const endDate = event.endDate || event.endDateRaw;
    const location = event.location || event.venue || "";
    const summary = event.summary || event.description || "";

    const startD = (startDate instanceof Date) ? new Date(startDate) : new Date(startDate);
    const endRaw = endDate || startDate;
    let endD = (endRaw instanceof Date) ? new Date(endRaw) : new Date(endRaw);

    // Googleカレンダーの仕様上、終日イベントの終了日は翌日0:00を指定する
    endD.setDate(endD.getDate() + 1);

    const options = {};
    if (location) options.location = location;
    if (summary) options.description = summary;

    const calEvent = calendar.createAllDayEvent(title, startD, endD, options);
    const eventId = calEvent.getId();
    Logger.log(`カレンダー登録成功: ${title} (ID: ${eventId})`);
    return eventId;
  },

  /**
   * 明日の予定イベントを取得して整形する
   * @param {Date} [baseDate] - 基準日 (省略時は現在日時)
   * @returns {TomorrowEventsDto|null}
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
  },

  /**
   * カレンダーインスタンスを取得する（内部ヘルパー）
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
  }
};
