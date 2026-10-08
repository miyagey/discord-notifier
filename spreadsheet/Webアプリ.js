// ==================================================
// 【Webアプリ エントリーポイント & API】
// Webアプリ公開リクエスト (doGet) および フロントエンド SPA からの RPC API
// ==================================================

/**
 * Webアプリ公開時のHTTP GETリクエストハンドラ
 * @param {Object} e - イベントパラメータ
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  try {
    const template = HtmlService.createTemplateFromFile('index');
    template.initialData = JSON.stringify(getAppData());

    return template.evaluate()
      .setTitle('Event & Ticket Hub')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    logError('doGet', error);
    return HtmlService.createHtmlOutput(`<h3>エラーが発生しました</h3><p>${error.message}</p>`);
  }
}

/**
 * Webアプリに必要な全データ（イベントマスター＋申し込み管理）を取得する
 * @returns {Object}
 */
function getAppData() {
  try {
    const events = SheetService.fetchEvents();
    const applications = SheetService.fetchApplications(null, events);

    const brandSet = new Set();
    events.forEach(ev => { if (ev.brand) brandSet.add(ev.brand); });
    applications.forEach(ap => { if (ap.brand) brandSet.add(ap.brand); });

    return {
      success: true,
      events: events,
      applications: applications,
      brands: Array.from(brandSet),
      updatedAt: formatDateJST(new Date(), 'yyyy-MM-dd HH:mm:ss')
    };
  } catch (error) {
    logError('getAppData', error);
    return {
      success: false,
      error: error.message,
      events: [],
      applications: [],
      brands: [],
      updatedAt: formatDateJST(new Date(), 'yyyy-MM-dd HH:mm:ss')
    };
  }
}

/**
 * イベントの新規登録（カレンダー同期 & Discord通知付き）
 * @param {Object} data - { brand, name, startDate, endDate, location, summary }
 * @returns {Object}
 */
function createEvent(data) {
  try {
    if (!data || !data.name || !data.startDate) {
      throw new Error('イベント名と開始日は必須項目です。');
    }

    // Google カレンダー同期 & Discord通知
    let calId = '';
    try {
      const title = DiscordService.formatBrandEventTitle(data.brand, data.name);
      calId = CalendarService.createAllDayEvent(
        title, data.startDate, data.endDate, data.location, data.summary
      ) || '';

      if (calId) {
        let dateStr = formatDateJST(new Date(data.startDate), "MM/dd");
        if (data.endDate && data.endDate !== data.startDate) {
          dateStr += ` 〜 ${formatDateJST(new Date(data.endDate), "MM/dd")}`;
        }
        DiscordService.notifyNewCalendarEvent(title, dateStr, data.location, data.summary);
      }
    } catch (calErr) {
      logError('createEvent.calendarSync', calErr);
    }

    const eventId = SheetService.insertEvent(data, calId);
    return { success: true, eventId: eventId };
  } catch (error) {
    logError('createEvent', error);
    return { success: false, error: error.message };
  }
}

/**
 * イベント情報の更新
 * @param {Object} data - { id, brand, name, startDate, endDate, location, summary }
 * @returns {Object}
 */
function updateEvent(data) {
  try {
    if (!data || !data.id) {
      throw new Error('イベントIDが指定されていません。');
    }
    SheetService.updateEventRow(data);
    return { success: true };
  } catch (error) {
    logError('updateEvent', error);
    return { success: false, error: error.message };
  }
}

/**
 * 申し込み情報の新規登録（Discord通知付き）
 * @param {Object} data - { eventId, brand, eventName, applyName, startDatetime, endDatetime, resultDatetime, payEndDatetime, method }
 * @returns {Object}
 */
function createApplication(data) {
  try {
    if (!data || !data.applyName) {
      throw new Error('受付名は必須項目です。');
    }

    const applyId = SheetService.insertApplication(data);

    // Discord通知
    try {
      DiscordService.notifyNewApplication(
        data.brand,
        data.eventName,
        data.applyName,
        data.endDatetime,
        data.payEndDatetime,
        data.method
      );
    } catch (notifyErr) {
      logError('createApplication.notifyDiscord', notifyErr);
    }

    return { success: true, applyId: applyId };
  } catch (error) {
    logError('createApplication', error);
    return { success: false, error: error.message };
  }
}

/**
 * 申し込み情報の更新
 * @param {Object} data - { id, eventId, brand, eventName, applyName, startDatetime, endDatetime, resultDatetime, payEndDatetime, method }
 * @returns {Object}
 */
function updateApplication(data) {
  try {
    if (!data || !data.id) {
      throw new Error('申し込みIDが指定されていません。');
    }
    SheetService.updateApplicationRow(data);
    return { success: true };
  } catch (error) {
    logError('updateApplication', error);
    return { success: false, error: error.message };
  }
}
