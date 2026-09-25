// ==================================================
// 【Webアプリ エントリーポイント & API】
// ==================================================

/**
 * Webアプリ公開時のHTTP GETリクエストハンドラ
 * @param {Object} e - イベントパラメータ
 * @returns {GoogleAppsScript.HTML.HtmlOutput} HTML出力オブジェクト
 */
function doGet(e) {
  try {
    const template = HtmlService.createTemplateFromFile('index');
    
    // 初期表示を高速化するためサーバー側でデータを初期注入
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
 * Webアプリに必要なすべてのデータ（イベントマスター＋申し込み管理）を取得する
 * クライアント側の google.script.run からも呼び出し可能
 * @returns {Object} { events: Array<Object>, applications: Array<Object>, brands: Array<string>, updatedAt: string }
 */
function getAppData() {
  try {
    const spreadsheet = getSpreadsheet();
    if (!spreadsheet) {
      throw new Error('スプレッドシートの取得に失敗しました。');
    }

    const masterSheet = spreadsheet.getSheetByName('イベントマスター');
    const applySheet = spreadsheet.getSheetByName('申し込み管理');

    const events = masterSheet ? fetchEventsFromSheet(masterSheet) : [];
    const applications = applySheet ? fetchApplicationsFromSheet(applySheet, events) : [];

    // ブランド一覧を抽出（重複なし・空文字除外）
    const brandSet = new Set();
    events.forEach(ev => { if (ev.brand) brandSet.add(ev.brand); });
    applications.forEach(ap => { if (ap.brand) brandSet.add(ap.brand); });
    const brands = Array.from(brandSet);

    return {
      success: true,
      events: events,
      applications: applications,
      brands: brands,
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

// ==================================================
// 【内部ヘルパー関数】
// ==================================================

/**
 * 対象のスプレッドシートオブジェクトを取得
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getSpreadsheet() {
  if (COMMON_SHEET_URL) {
    return SpreadsheetApp.openByUrl(COMMON_SHEET_URL);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * イベントマスターシートからデータを取得・整形
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - イベントマスターシート
 * @returns {Array<Object>} イベントオブジェクト配列
 */
function fetchEventsFromSheet(sheet) {
  const data = sheet.getDataRange().getValues();
  if (!data || data.length <= 1) return [];

  const events = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const eventId = row[MASTER_COL.ID];
    const eventName = row[MASTER_COL.EVENT_NAME];

    // IDまたはイベント名が存在しない行はスキップ
    if (!eventId && !eventName) continue;

    const startDate = row[MASTER_COL.START_DATE];
    const endDate = row[MASTER_COL.END_DATE];

    events.push({
      id: String(eventId || ''),
      brand: String(row[MASTER_COL.BRAND] || ''),
      name: String(eventName || ''),
      startDate: startDate ? formatDateJST(startDate, 'yyyy-MM-dd') : '',
      endDate: endDate ? formatDateJST(endDate, 'yyyy-MM-dd') : '',
      location: String(row[MASTER_COL.LOCATION] || ''),
      summary: String(row[MASTER_COL.SUMMARY] || ''),
      calId: String(row[MASTER_COL.CAL_ID] || ''),
      status: calculateEventStatus(startDate, endDate)
    });
  }

  // 開催日が新しい順（または直近順）にソート
  events.sort((a, b) => {
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return a.startDate.localeCompare(b.startDate);
  });

  return events;
}

/**
 * 申し込み管理シートからデータを取得・整形
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 申し込み管理シート
 * @param {Array<Object>} events - 参照用イベントリスト
 * @returns {Array<Object>} 申込オブジェクト配列
 */
function fetchApplicationsFromSheet(sheet, events) {
  const data = sheet.getDataRange().getValues();
  if (!data || data.length <= 1) return [];

  const eventMap = {};
  events.forEach(ev => {
    eventMap[ev.id] = ev;
  });

  const applications = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const applyId = row[APPLY_COL.APPLY_ID];
    const applyName = row[APPLY_COL.APPLY_NAME];

    if (!applyId && !applyName) continue;

    const eventId = String(row[APPLY_COL.EVENT_ID] || '');
    const matchedEvent = eventMap[eventId] || null;

    // ブランドとイベント名はマスターを優先、無ければ申し込み管理の列を参照
    const brand = matchedEvent ? matchedEvent.brand : String(row[2] || '');
    const eventName = matchedEvent ? matchedEvent.name : String(row[APPLY_COL.EVENT_NAME_ALT] || '');

    const startDatetime = row[5]; // F列: 申込開始日時
    const endDatetime = row[APPLY_COL.APPLY_END_DATE]; // G列: 申込締切日時
    const resultDatetime = row[8]; // I列: 当落発表日時
    const payEndDatetime = row[APPLY_COL.PAY_END_DATE]; // J列: 入金締切日時
    const rawStatus = row[APPLY_COL.STATUS]; // K列: ステータス

    const calculatedStatus = calculateApplicationStatus(
      startDatetime,
      endDatetime,
      resultDatetime,
      payEndDatetime,
      rawStatus
    );

    applications.push({
      id: String(applyId || `AP-ROW-${i}`),
      eventId: eventId,
      brand: brand,
      eventName: eventName,
      applyName: String(applyName || ''),
      startDatetime: startDatetime ? formatDateJST(startDatetime, 'yyyy-MM-dd HH:mm') : '',
      endDatetime: endDatetime ? formatDateJST(endDatetime, 'yyyy-MM-dd HH:mm') : '',
      resultDatetime: resultDatetime ? formatDateJST(resultDatetime, 'yyyy-MM-dd HH:mm') : '',
      payEndDatetime: payEndDatetime ? formatDateJST(payEndDatetime, 'yyyy-MM-dd HH:mm') : '',
      method: String(row[APPLY_COL.APPLY_METHOD] || ''),
      status: calculatedStatus,
      rawStatus: String(rawStatus || '')
    });
  }

  // 締切が近い順にソート（締切なしは後ろ）
  applications.sort((a, b) => {
    if (!a.endDatetime) return 1;
    if (!b.endDatetime) return -1;
    return a.endDatetime.localeCompare(b.endDatetime);
  });

  return applications;
}

/**
 * イベントのステータスを計算（シートの数式と同じロジック）
 * @param {Date|string} startDate 
 * @param {Date|string} endDate 
 * @returns {string} '開催前' | '開催期間' | '開催終了' | '未設定'
 */
function calculateEventStatus(startDate, endDate) {
  if (!startDate) return '未設定';
  const now = new Date();
  const todayStr = formatDateJST(now, 'yyyy-MM-dd');
  const startStr = formatDateJST(startDate, 'yyyy-MM-dd');
  const endStr = endDate ? formatDateJST(endDate, 'yyyy-MM-dd') : startStr;

  if (todayStr < startStr) return '開催前';
  if (todayStr <= endStr) return '開催期間';
  return '開催終了';
}

/**
 * 申込ステータスを計算（シート数式または日時比較で算出）
 * @param {Date|string} start 
 * @param {Date|string} end 
 * @param {Date|string} result 
 * @param {Date|string} payEnd 
 * @param {string} sheetStatus 
 * @returns {string} '開始前' | '受付期間' | '当落待ち' | '入金期間' | '期間終了'
 */
function calculateApplicationStatus(start, end, result, payEnd, sheetStatus) {
  const now = new Date();

  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  const resultDate = result ? new Date(result) : null;
  const payEndDate = payEnd ? new Date(payEnd) : null;

  if (startDate && !isNaN(startDate.getTime()) && now < startDate) {
    return '開始前';
  }
  if (endDate && !isNaN(endDate.getTime()) && now <= endDate) {
    return '受付期間';
  }
  if (resultDate && !isNaN(resultDate.getTime()) && now < resultDate) {
    return '当落待ち';
  }
  if (payEndDate && !isNaN(payEndDate.getTime()) && now <= payEndDate) {
    return '入金期間';
  }
  if (endDate && !isNaN(endDate.getTime()) && now > endDate && !payEndDate) {
    return '期間終了';
  }

  // シート側の値があればマッピング
  if (sheetStatus) {
    if (sheetStatus.includes('開始前')) return '開始前';
    if (sheetStatus.includes('受付期間')) return '受付期間';
    if (sheetStatus.includes('当落')) return '当落待ち';
    if (sheetStatus.includes('入金')) return '入金期間';
    if (sheetStatus.includes('終了')) return '期間終了';
  }

  return '期間終了';
}
