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
 * @returns {Object} { success: boolean, events: Array<Object>, applications: Array<Object>, brands: Array<string>, updatedAt: string }
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

/**
 * イベントの新規登録（カレンダー同期 & Discord通知付き）
 * @param {Object} data - { brand, name, startDate, endDate, location, summary }
 * @returns {Object} { success: boolean, eventId?: string, error?: string }
 */
function createEvent(data) {
  try {
    if (!data || !data.name || !data.startDate) {
      throw new Error('イベント名と開始日は必須項目です。');
    }

    const spreadsheet = getSpreadsheet();
    const sheet = spreadsheet.getSheetByName('イベントマスター');
    if (!sheet) throw new Error('「イベントマスター」シートが見つかりません。');

    const values = sheet.getDataRange().getValues();
    let maxIdNum = 0;

    for (let i = 1; i < values.length; i++) {
      const idStr = String(values[i][MASTER_COL.ID] || '');
      const match = idStr.match(/^EV-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxIdNum) maxIdNum = num;
      }
    }

    const newIdNum = maxIdNum + 1;
    const eventId = 'EV-' + String(newIdNum).padStart(3, '0');
    const nextRow = sheet.getLastRow() + 1;

    const masterIfsFormula = `=IFS(
      ISBLANK(D${nextRow}), "未設定",
      TODAY() < INT(D${nextRow}), "開催前",
      TODAY() <= INT(IF(ISBLANK(E${nextRow}), D${nextRow}, E${nextRow})), "開催期間",
      TRUE, "開催終了"
    )`;

    const startDate = data.startDate || '';
    const endDate = data.endDate || startDate;

    // --- Google カレンダーへの自動追加 & Discord予定通知 ---
    let calId = '';
    try {
      if (CALENDAR_ID) {
        const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
        if (calendar) {
          const title = formatBrandEventTitle(data.brand, data.name);
          const startD = new Date(startDate);
          let endD = new Date(endDate);
          // 終日イベント用の終了日は翌日を指定
          endD.setDate(endD.getDate() + 1);

          const options = {};
          if (data.location) options.location = data.location;
          if (data.summary) options.description = data.summary;

          const calEvent = calendar.createAllDayEvent(title, startD, endD, options);
          calId = calEvent.getId();
          Logger.log(`カレンダー登録成功: ${title} (ID: ${calId})`);

          // WEBHOOK_CALENDAR へ通知を送信
          if (WEBHOOK_CALENDAR) {
            let dateStr = formatDateJST(startD, "MM/dd");
            if (data.endDate && data.endDate !== data.startDate) {
              dateStr += ` 〜 ${formatDateJST(new Date(data.endDate), "MM/dd")}`;
            }
            const messageLines = [
              "## 🆕 カレンダーに新しいイベントを登録したよ！",
              `### 📌 ${title}`,
              `⏰ 期間: ${dateStr} [終日]`
            ];
            if (data.location) messageLines.push(`📍 場所: ${data.location}`);
            if (data.summary) messageLines.push(`📝 概要:\n> ${data.summary.replace(/\n/g, '\n> ')}`);
            messageLines.push("\n" + getRegistrationFooterMessage());

            sendNotification(WEBHOOK_CALENDAR, messageLines.join('\n'));
          }
        }
      }
    } catch (calErr) {
      logError('createEvent.calendarSync', calErr);
    }

    sheet.appendRow([
      eventId,
      data.brand || '',
      data.name,
      startDate,
      endDate,
      data.location || '',
      data.summary || '',
      calId,
      masterIfsFormula
    ]);

    return { success: true, eventId: eventId };
  } catch (error) {
    logError('createEvent', error);
    return { success: false, error: error.message };
  }
}

/**
 * イベント情報の更新
 * @param {Object} data - { id, brand, name, startDate, endDate, location, summary }
 * @returns {Object} { success: boolean, error?: string }
 */
function updateEvent(data) {
  try {
    if (!data || !data.id) {
      throw new Error('イベントIDが指定されていません。');
    }

    const spreadsheet = getSpreadsheet();
    const masterSheet = spreadsheet.getSheetByName('イベントマスター');
    if (!masterSheet) throw new Error('「イベントマスター」シートが見つかりません。');

    const values = masterSheet.getDataRange().getValues();
    let targetRow = -1;

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][MASTER_COL.ID]) === String(data.id)) {
        targetRow = i + 1; // 1始まりの行番号
        break;
      }
    }

    if (targetRow === -1) {
      throw new Error(`イベントID「${data.id}」の行が見つかりません。`);
    }

    const startDate = data.startDate || '';
    const endDate = data.endDate || startDate;

    // B列〜G列 (ブランド, イベント名, 開始日, 終了日, 会場, 概要) を更新
    masterSheet.getRange(targetRow, MASTER_COL.BRAND + 1).setValue(data.brand || '');
    masterSheet.getRange(targetRow, MASTER_COL.EVENT_NAME + 1).setValue(data.name || '');
    masterSheet.getRange(targetRow, MASTER_COL.START_DATE + 1).setValue(startDate);
    masterSheet.getRange(targetRow, MASTER_COL.END_DATE + 1).setValue(endDate);
    masterSheet.getRange(targetRow, MASTER_COL.LOCATION + 1).setValue(data.location || '');
    masterSheet.getRange(targetRow, MASTER_COL.SUMMARY + 1).setValue(data.summary || '');

    // 申し込み管理シート側のブランド・イベント名も同期更新
    const applySheet = spreadsheet.getSheetByName('申し込み管理');
    if (applySheet) {
      const applyValues = applySheet.getDataRange().getValues();
      for (let j = 1; j < applyValues.length; j++) {
        if (String(applyValues[j][APPLY_COL.EVENT_ID]) === String(data.id)) {
          applySheet.getRange(j + 1, 3).setValue(data.brand || ''); // C列: ブランド
          applySheet.getRange(j + 1, APPLY_COL.EVENT_NAME_ALT + 1).setValue(data.name || ''); // D列: イベント名
        }
      }
    }

    return { success: true };
  } catch (error) {
    logError('updateEvent', error);
    return { success: false, error: error.message };
  }
}

/**
 * 申し込み情報の新規登録（Discord通知付き）
 * @param {Object} data - { eventId, brand, eventName, applyName, startDatetime, endDatetime, resultDatetime, payEndDatetime, method }
 * @returns {Object} { success: boolean, applyId?: string, error?: string }
 */
function createApplication(data) {
  try {
    if (!data || !data.applyName) {
      throw new Error('受付名は必須項目です。');
    }

    const spreadsheet = getSpreadsheet();
    const applySheet = spreadsheet.getSheetByName('申し込み管理');
    if (!applySheet) throw new Error('「申し込み管理」シートが見つかりません。');

    // イベント情報が未完全な場合、イベントマスターから補完
    let eventId = data.eventId || '';
    let brand = data.brand || '';
    let eventName = data.eventName || '';

    if (eventId && (!brand || !eventName)) {
      const masterSheet = spreadsheet.getSheetByName('イベントマスター');
      if (masterSheet) {
        const mValues = masterSheet.getDataRange().getValues();
        for (let i = 1; i < mValues.length; i++) {
          if (String(mValues[i][MASTER_COL.ID]) === eventId) {
            brand = brand || String(mValues[i][MASTER_COL.BRAND] || '');
            eventName = eventName || String(mValues[i][MASTER_COL.EVENT_NAME] || '');
            break;
          }
        }
      }
    }

    const values = applySheet.getDataRange().getValues();
    let maxIdNum = 0;

    for (let i = 1; i < values.length; i++) {
      const idStr = String(values[i][APPLY_COL.APPLY_ID] || '');
      const match = idStr.match(/^AP-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxIdNum) maxIdNum = num;
      }
    }

    const newIdNum = maxIdNum + 1;
    const applyId = 'AP-' + String(newIdNum).padStart(3, '0');
    const nextRow = applySheet.getLastRow() + 1;

    const ifsFormula = `=IFS(
      AND(NOT(ISBLANK(F${nextRow})), NOW() < F${nextRow}), "開始前",
      AND(NOT(ISBLANK(G${nextRow})), NOW() <= G${nextRow}), "受付期間",
      AND(NOT(ISBLANK(I${nextRow})), NOW() < I${nextRow}), "抽選終了・当落確認前",
      AND(NOT(ISBLANK(J${nextRow})), NOW() <= J${nextRow}), "当落確認・入金期間",
      TRUE, "期間終了"
    )`;

    applySheet.appendRow([
      applyId,
      eventId,
      brand,
      eventName,
      data.applyName,
      data.startDatetime || '',
      data.endDatetime || '',
      data.method || '',
      data.resultDatetime || '',
      data.payEndDatetime || '',
      ifsFormula
    ]);

    // --- Discordへの新着申込通知（WEBHOOK_APPLY） ---
    try {
      if (WEBHOOK_APPLY) {
        notifyDiscordNewApplyWeb(
          brand,
          eventName,
          data.applyName,
          data.endDatetime,
          data.payEndDatetime,
          data.method
        );
      }
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
 * Webアプリ経由で登録された新着チケット申込をDiscordへ通知
 * @param {string} brand 
 * @param {string} eventName 
 * @param {string} applyName 
 * @param {string} endDatetime 
 * @param {string} payEndDatetime 
 * @param {string} method 
 */
function notifyDiscordNewApplyWeb(brand, eventName, applyName, endDatetime, payEndDatetime, method) {
  const brandEventTitle = formatBrandEventTitle(brand, eventName);

  const lines = [
    "🆕 **新しいチケット申込が登録されたよ！**\n",
    `📅 **${brandEventTitle}**`,
    ` └ 受付区分: ${applyName || "未指定"}`
  ];

  if (endDatetime) {
    lines.push(` └ 申込締切: **${endDatetime}まで**`);
  }
  if (payEndDatetime) {
    lines.push(` └ 入金締切: **${payEndDatetime}まで**`);
  }
  if (method) {
    lines.push(formatApplyMethodBlock(method).trimEnd());
  }

  lines.push("\n" + getRegistrationFooterMessage());

  sendNotification(WEBHOOK_APPLY, lines.join('\n'));
}

/**
 * 申し込み情報の更新
 * @param {Object} data - { id, eventId, brand, eventName, applyName, startDatetime, endDatetime, resultDatetime, payEndDatetime, method }
 * @returns {Object} { success: boolean, error?: string }
 */
function updateApplication(data) {
  try {
    if (!data || !data.id) {
      throw new Error('申込IDが指定されていません。');
    }

    const spreadsheet = getSpreadsheet();
    const applySheet = spreadsheet.getSheetByName('申し込み管理');
    if (!applySheet) throw new Error('「申し込み管理」シートが見つかりません。');

    const values = applySheet.getDataRange().getValues();
    let targetRow = -1;

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][APPLY_COL.APPLY_ID]) === String(data.id)) {
        targetRow = i + 1;
        break;
      }
    }

    if (targetRow === -1) {
      throw new Error(`申込ID「${data.id}」の行が見つかりません。`);
    }

    // イベント情報が未完全な場合、イベントマスターから補完
    let eventId = data.eventId || '';
    let brand = data.brand || '';
    let eventName = data.eventName || '';

    if (eventId && (!brand || !eventName)) {
      const masterSheet = spreadsheet.getSheetByName('イベントマスター');
      if (masterSheet) {
        const mValues = masterSheet.getDataRange().getValues();
        for (let i = 1; i < mValues.length; i++) {
          if (String(mValues[i][MASTER_COL.ID]) === eventId) {
            brand = brand || String(mValues[i][MASTER_COL.BRAND] || '');
            eventName = eventName || String(mValues[i][MASTER_COL.EVENT_NAME] || '');
            break;
          }
        }
      }
    }

    // B列〜J列を更新（K列の数式は維持）
    applySheet.getRange(targetRow, APPLY_COL.EVENT_ID + 1).setValue(eventId);
    applySheet.getRange(targetRow, 3).setValue(brand); // C列: ブランド
    applySheet.getRange(targetRow, APPLY_COL.EVENT_NAME_ALT + 1).setValue(eventName); // D列: イベント名
    applySheet.getRange(targetRow, APPLY_COL.APPLY_NAME + 1).setValue(data.applyName || '');
    applySheet.getRange(targetRow, 6).setValue(data.startDatetime || ''); // F列: 申込開始日時
    applySheet.getRange(targetRow, APPLY_COL.APPLY_END_DATE + 1).setValue(data.endDatetime || '');
    applySheet.getRange(targetRow, APPLY_COL.APPLY_METHOD + 1).setValue(data.method || '');
    applySheet.getRange(targetRow, 9).setValue(data.resultDatetime || ''); // I列: 当落発表日時
    applySheet.getRange(targetRow, APPLY_COL.PAY_END_DATE + 1).setValue(data.payEndDatetime || '');

    return { success: true };
  } catch (error) {
    logError('updateApplication', error);
    return { success: false, error: error.message };
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
