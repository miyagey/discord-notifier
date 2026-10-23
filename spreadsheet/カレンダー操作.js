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

    for (const ev of unregisteredEvents) {
      const calId = this.createAllDayEvent(ev);

      if (calId) {
        ev.calendarEventId = calId;
        SheetService.updateMasterCalendarId(ev.rowIndex, calId);
        registeredEvents.push(ev);
      }
    }

    if (registeredEvents.length > 0) {
      DiscordService.notifyBatchCalendarEvents(registeredEvents);
      Logger.log(`Discordへ ${registeredEvents.length} 件のカレンダー登録完了通知を送信しました。`);
    }

    return registeredEvents.length;
  },

  /**
   * 終日イベントを Google カレンダーに登録する
   * @param {EventDto} event - イベントDTO
   * @returns {string|null} 登録されたイベントID、失敗時は null
   */
  createAllDayEvent(event) {
    const calendar = this.getCalendar();
    if (!calendar || !event) return null;

    const title = formatBrandEventTitle(event.brand, event.eventName);
    const startDate = new Date(event.startDate);
    const endDate = new Date(event.endDate || event.startDate);

    // Googleカレンダーの仕様上、終日イベントの終了日は翌日0:00を指定する
    endDate.setDate(endDate.getDate() + 1);

    const options = {};
    if (event.location) options.location = event.location;
    if (event.description) options.description = event.description;

    const calEvent = calendar.createAllDayEvent(title, startDate, endDate, options);
    const eventId = calEvent.getId();
    Logger.log(`カレンダー登録成功: ${title} (ID: ${eventId})`);
    return eventId;
  },

  /**
   * 明日の予定イベント一覧を取得する
   * @param {Date} [baseDate] - 基準日 (省略時は現在日時)
   * @returns {EventDto[]} イベントDTO配列
   */
  getTomorrowEvents(baseDate) {
    const calendar = this.getCalendar();
    if (!calendar) return [];

    const today = baseDate ? new Date(baseDate) : new Date();

    const tomorrowStart = new Date(today);
    tomorrowStart.setDate(today.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const calEvents = calendar.getEvents(tomorrowStart, tomorrowEnd);

    return calEvents.map(event => {
      const fullTitle = event.getTitle();
      const brandMatch = fullTitle.match(/^【(.*?)】(.*)$/);
      const brand = brandMatch ? brandMatch[1] : "";
      const eventName = brandMatch ? brandMatch[2].trim() : fullTitle;
      const start = event.getStartTime();
      const end = event.getEndTime();

      return {
        title: fullTitle,
        brand: brand,
        eventName: eventName,
        startDate: formatDateJST(start, "yyyy-MM-dd"),
        endDate: formatDateJST(end, "yyyy-MM-dd"),
        startTime: start,
        endTime: end,
        isAllDay: event.isAllDayEvent(),
        location: event.getLocation() || "",
        description: event.getDescription() || "",
        calendarEventId: event.getId()
      };
    });
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
