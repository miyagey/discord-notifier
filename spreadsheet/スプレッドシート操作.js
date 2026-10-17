// ==================================================
// 【スプレッドシート操作】
// イベントマスター・申し込み管理シートのデータ読み書き・クエリ処理
// ==================================================
// ==================================================
// 【シート列インデックス定義（データアクセス層内部に隠蔽）】
// ==================================================

/** 「イベントマスター」シートの列インデックス（0始まり） */
const MASTER_COL = {
  ID: 0,         // A列: イベントID
  BRAND: 1,      // B列: ブランド名
  EVENT_NAME: 2, // C列: イベント名
  START_DATE: 3, // D列: 開始日
  END_DATE: 4,   // E列: 終了日
  LOCATION: 5,   // F列: 会場
  SUMMARY: 6,    // G列: イベント概要
  CAL_ID: 7      // H列: カレンダー登録ID
};

/** 「申し込み管理」シートの列インデックス（0始まり） */
const APPLY_COL = {
  APPLY_ID: 0,       // A列: 申し込みID
  EVENT_ID: 1,       // B列: イベントID
  BRAND: 2,          // C列: ブランド名
  EVENT_NAME_ALT: 3, // D列: 代替イベント名
  APPLY_NAME: 4,     // E列: 受付区分/申し込み名称
  START_DATE: 5,     // F列: 申込開始日時
  APPLY_END_DATE: 6, // G列: 申込締切日時
  APPLY_METHOD: 7,   // H列: 申込方法
  URL: 7,            // H列: 互換用エイリアス
  RESULT_DATE: 8,    // I列: 当落発表日時
  PAY_END_DATE: 9,   // J列: 入金締切日時
  STATUS: 10         // K列: ステータス
};

/**
 * スプレッドシート操作サービスオブジェクト（SheetService）
 */
const SheetService = {

  /**
   * 共通スプレッドシートオブジェクトを取得
   * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet|null}
   */
  getSpreadsheet() {
    try {
      if (COMMON_SHEET_URL) {
        return SpreadsheetApp.openByUrl(COMMON_SHEET_URL);
      }
      return SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {
      logError("SheetService.getSpreadsheet", e);
      return null;
    }
  },

  /**
   * 「イベントマスター」シートを取得
   * @returns {GoogleAppsScript.Spreadsheet.Sheet|null}
   */
  getMasterSheet() {
    const ss = this.getSpreadsheet();
    return ss ? ss.getSheetByName("イベントマスター") : null;
  },

  /**
   * 「申し込み管理」シートを取得
   * @returns {GoogleAppsScript.Spreadsheet.Sheet|null}
   */
  getApplySheet() {
    const ss = this.getSpreadsheet();
    return ss ? ss.getSheetByName("申し込み管理") : null;
  },

  /**
   * イベントマスターシートのデータ配列から eventId をキーとした情報マップを生成
   * @param {Array<Array<any>>} masterData - イベントマスターの全行データ
   * @returns {Object<string, {brand: string, eventName: string}>}
   */
  getMasterEventMap(masterData) {
    const masterMap = {};
    if (!masterData || masterData.length <= 1) return masterMap;

    for (let i = 1; i < masterData.length; i++) {
      const eventId = masterData[i][MASTER_COL.ID];
      if (eventId) {
        masterMap[eventId] = {
          brand: masterData[i][MASTER_COL.BRAND],
          eventName: masterData[i][MASTER_COL.EVENT_NAME]
        };
      }
    }
    return masterMap;
  },

  /**
   * イベント名またはブランド名込みのタイトルからイベントマスター情報を逆引き検索する
   * @param {Array<Array<any>>} masterData 
   * @param {string} rawTitle 
   * @returns {{eventId: string, brand: string, eventName: string}|null}
   */
  findMasterEventByTitle(masterData, rawTitle) {
    if (!masterData || masterData.length <= 1 || !rawTitle) return null;
    const cleanRaw = String(rawTitle).trim();

    for (let i = 1; i < masterData.length; i++) {
      const eventId = masterData[i][MASTER_COL.ID];
      const brand = masterData[i][MASTER_COL.BRAND] || "";
      const eventName = masterData[i][MASTER_COL.EVENT_NAME] || "";
      const fullTitleWithBrand = brand ? `【${brand}】${eventName}` : eventName;

      if (
        cleanRaw === fullTitleWithBrand ||
        cleanRaw === eventName ||
        (eventName && cleanRaw.includes(eventName)) ||
        (fullTitleWithBrand && cleanRaw.includes(fullTitleWithBrand))
      ) {
        return { eventId, brand, eventName };
      }
    }
    return null;
  },

  /**
   * イベントマスターシートからWebアプリ用のイベント一覧オブジェクト配列を生成
   * @param {GoogleAppsScript.Spreadsheet.Sheet} masterSheet 
   * @returns {Array<Object>}
   */
  fetchEvents(masterSheet) {
    const sheet = masterSheet || this.getMasterSheet();
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    const events = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const id = String(row[MASTER_COL.ID] || '').trim();
      if (!id) continue;

      const startDateRaw = row[MASTER_COL.START_DATE];
      const endDateRaw = row[MASTER_COL.END_DATE];
      const sheetStatus = String(row[8] || '').trim();

      const startDate = startDateRaw ? formatDateJST(startDateRaw, 'yyyy-MM-dd') : '';
      const endDate = endDateRaw ? formatDateJST(endDateRaw, 'yyyy-MM-dd') : startDate;
      const status = calculateEventStatus(startDateRaw, endDateRaw, sheetStatus);

      events.push({
        id: id,
        brand: String(row[MASTER_COL.BRAND] || '').trim(),
        name: String(row[MASTER_COL.EVENT_NAME] || '').trim(),
        startDate: startDate,
        endDate: endDate,
        location: String(row[MASTER_COL.LOCATION] || '').trim(),
        summary: String(row[MASTER_COL.SUMMARY] || '').trim(),
        calId: String(row[MASTER_COL.CAL_ID] || '').trim(),
        status: status
      });
    }

    return events;
  },

  /**
   * 申し込み管理シートからWebアプリ用の申し込み一覧オブジェクト配列を生成
   * @param {GoogleAppsScript.Spreadsheet.Sheet} applySheet 
   * @param {Array<Object>} events 
   * @returns {Array<Object>}
   */
  fetchApplications(applySheet, events) {
    const sheet = applySheet || this.getApplySheet();
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    const eventMap = {};
    (events || this.fetchEvents()).forEach(ev => { eventMap[ev.id] = ev; });

    const applications = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const applyId = String(row[APPLY_COL.APPLY_ID] || '').trim();
      if (!applyId) continue;

      const eventId = String(row[APPLY_COL.EVENT_ID] || '').trim();
      const parentEvent = eventMap[eventId] || null;

      const brand = String(row[APPLY_COL.BRAND] || (parentEvent ? parentEvent.brand : '')).trim();
      const eventName = String(row[APPLY_COL.EVENT_NAME_ALT] || (parentEvent ? parentEvent.name : '')).trim();

      const startRaw = row[APPLY_COL.START_DATE];
      const endRaw = row[APPLY_COL.APPLY_END_DATE];
      const resultRaw = row[APPLY_COL.RESULT_DATE];
      const payEndRaw = row[APPLY_COL.PAY_END_DATE];
      const sheetStatus = String(row[APPLY_COL.STATUS] || '').trim();

      const calculatedStatus = calculateApplicationStatus(
        startRaw, endRaw, resultRaw, payEndRaw, sheetStatus
      );

      applications.push({
        id: applyId,
        eventId: eventId,
        brand: brand,
        eventName: eventName,
        applyName: String(row[APPLY_COL.APPLY_NAME] || '').trim(),
        startDatetime: startRaw ? formatDateJST(startRaw, 'yyyy-MM-dd HH:mm') : '',
        endDatetime: endRaw ? formatDateJST(endRaw, 'yyyy-MM-dd HH:mm') : '',
        resultDatetime: resultRaw ? formatDateJST(resultRaw, 'yyyy-MM-dd HH:mm') : '',
        payEndDatetime: payEndRaw ? formatDateJST(payEndRaw, 'yyyy-MM-dd HH:mm') : '',
        method: String(row[APPLY_COL.APPLY_METHOD] || '').trim(),
        status: calculatedStatus,
        parentEvent: parentEvent ? {
          startDate: parentEvent.startDate,
          endDate: parentEvent.endDate,
          location: parentEvent.location,
          status: parentEvent.status
        } : null
      });
    }

    return applications;
  },

  /**
   * 本日締切の通常申込アイテム（先着・リセール以外）を抽出
   * @param {string} [targetDate] - 対象日付文字列 ("yyyy-MM-dd", 省略時は本日JST)
   * @param {Date} [targetNow] - 基準時刻（時刻考慮用, 省略時は現在日時）
   * @returns {Array<{brandEvent: string, applyName: string, timeStr: string, method: string}>}
   */
  fetchDeadlineApplyItems(targetDate, targetNow) {
    const now = targetNow || new Date();
    const todayStr = targetDate || formatDateJST(now, "yyyy-MM-dd");

    const items = [];
    const ss = this.getSpreadsheet();
    if (!ss) return items;

    const masterSheet = ss.getSheetByName("イベントマスター");
    const applySheet = ss.getSheetByName("申し込み管理");
    if (!masterSheet || !applySheet) return items;

    const masterData = masterSheet.getDataRange().getValues();
    const applyData = applySheet.getDataRange().getValues();
    const masterMap = this.getMasterEventMap(masterData);

    for (let i = 1; i < applyData.length; i++) {
      const row = applyData[i];
      const applyId = row[APPLY_COL.APPLY_ID];
      const eventId = row[APPLY_COL.EVENT_ID];
      const applyEndDateRaw = row[APPLY_COL.APPLY_END_DATE];
      const applyName = row[APPLY_COL.APPLY_NAME] || "";

      if (!applyId || !applyEndDateRaw) continue;
      if (applyName.includes("先着") || applyName.includes("リセール")) continue;

      const applyEndStr = formatDateJST(applyEndDateRaw, "yyyy-MM-dd");
      if (applyEndStr !== todayStr) continue;

      // 締切時刻が現在時刻より過去の場合はスキップ（時刻考慮）
      if (new Date(applyEndDateRaw) <= now) continue;

      const masterInfo = masterMap[eventId] || {};
      const eventName = masterInfo.eventName || row[APPLY_COL.EVENT_NAME_ALT];
      const brandEventTitle = DiscordService.formatBrandEventTitle(masterInfo.brand, eventName);
      const applyMethod = row[APPLY_COL.APPLY_METHOD] || row[APPLY_COL.URL] || "";
      const formattedTime = formatDateJST(applyEndDateRaw, "HH:mm");

      items.push({
        brandEvent: brandEventTitle,
        applyName: applyName,
        timeStr: `${formattedTime}まで`,
        method: applyMethod
      });
    }

    return items;
  },

  /**
   * 明日開始の先着受付アイテムを抽出
   * @param {string} [targetDate] - 対象日付文字列 ("yyyy-MM-dd", 省略時は明日JST)
   * @returns {Array<{brandEvent: string, applyName: string, timeStr: string, method: string}>}
   */
  fetchFirstComeApplyItems(targetDate) {
    let tomorrowStr = targetDate;
    if (!tomorrowStr) {
      const tom = new Date();
      tom.setDate(tom.getDate() + 1);
      tomorrowStr = formatDateJST(tom, "yyyy-MM-dd");
    }

    const items = [];
    const ss = this.getSpreadsheet();
    if (!ss) return items;

    const masterSheet = ss.getSheetByName("イベントマスター");
    const applySheet = ss.getSheetByName("申し込み管理");
    if (!masterSheet || !applySheet) return items;

    const masterData = masterSheet.getDataRange().getValues();
    const applyData = applySheet.getDataRange().getValues();
    const masterMap = this.getMasterEventMap(masterData);

    for (let i = 1; i < applyData.length; i++) {
      const row = applyData[i];
      const applyId = row[APPLY_COL.APPLY_ID];
      const eventId = row[APPLY_COL.EVENT_ID];
      const applyName = row[APPLY_COL.APPLY_NAME] || "";
      const applyStartDateRaw = row[APPLY_COL.START_DATE];

      if (!applyId || !applyName.includes("先着") || !applyStartDateRaw) continue;

      const applyStartStr = formatDateJST(applyStartDateRaw, "yyyy-MM-dd");
      if (applyStartStr !== tomorrowStr) continue;

      const masterInfo = masterMap[eventId] || {};
      const eventName = masterInfo.eventName || row[APPLY_COL.EVENT_NAME_ALT];
      const brandEventTitle = DiscordService.formatBrandEventTitle(masterInfo.brand, eventName);
      const formattedTime = formatDateJST(applyStartDateRaw, "HH:mm");
      const applyMethod = row[APPLY_COL.APPLY_METHOD] || row[APPLY_COL.URL] || "";

      items.push({
        brandEvent: brandEventTitle,
        applyName: applyName,
        timeStr: formattedTime,
        method: applyMethod
      });
    }

    return items;
  },

  /**
   * 現在受付期間中のリセールアイテムを抽出
   * @param {string} [targetDate] - 判定基準日 ("yyyy-MM-dd", 省略時は本日JST)
   * @returns {Array<{brandEvent: string, applyName: string, deadlineStr: string, method: string}>}
   */
  fetchResaleApplyItems(targetDate) {
    const todayStr = targetDate || formatDateJST(new Date(), "yyyy-MM-dd");

    const items = [];
    const ss = this.getSpreadsheet();
    if (!ss) return items;

    const masterSheet = ss.getSheetByName("イベントマスター");
    const applySheet = ss.getSheetByName("申し込み管理");
    if (!masterSheet || !applySheet) return items;

    const masterData = masterSheet.getDataRange().getValues();
    const applyData = applySheet.getDataRange().getValues();
    const masterMap = this.getMasterEventMap(masterData);

    for (let i = 1; i < applyData.length; i++) {
      const row = applyData[i];
      const applyId = row[APPLY_COL.APPLY_ID];
      const eventId = row[APPLY_COL.EVENT_ID];
      const applyName = row[APPLY_COL.APPLY_NAME] || "";
      const applyStartDateRaw = row[APPLY_COL.START_DATE];
      const applyEndDateRaw = row[APPLY_COL.APPLY_END_DATE];

      if (!applyId || !applyName.includes("リセール") || !applyStartDateRaw || !applyEndDateRaw) continue;

      const applyStartStr = formatDateJST(applyStartDateRaw, "yyyy-MM-dd");
      const applyEndStr = formatDateJST(applyEndDateRaw, "yyyy-MM-dd");

      // 受付期間中（開始日 <= 本日 <= 終了日）
      if (todayStr >= applyStartStr && todayStr <= applyEndStr) {
        const masterInfo = masterMap[eventId] || {};
        const eventName = masterInfo.eventName || row[APPLY_COL.EVENT_NAME_ALT];
        const brandEventTitle = DiscordService.formatBrandEventTitle(masterInfo.brand, eventName);
        const formattedEndTime = formatDateJST(applyEndDateRaw, "yyyy-MM-dd HH:mm");
        const applyMethod = row[APPLY_COL.APPLY_METHOD] || row[APPLY_COL.URL] || "";

        items.push({
          brandEvent: brandEventTitle,
          applyName: applyName,
          deadlineStr: formattedEndTime,
          method: applyMethod
        });
      }
    }

    return items;
  },

  /**
   * 本日締切の入金アイテムを抽出
   * @param {string} [targetDate] - 対象日付文字列 ("yyyy-MM-dd", 省略時は本日JST)
   * @param {Date} [targetNow] - 基準時刻（時刻考慮用, 省略時は現在日時）
   * @returns {Array<{brandEvent: string, applyName: string, timeStr: string, method: string}>}
   */
  fetchPaymentApplyItems(targetDate, targetNow) {
    const now = targetNow || new Date();
    const todayStr = targetDate || formatDateJST(now, "yyyy-MM-dd");

    const items = [];
    const ss = this.getSpreadsheet();
    if (!ss) return items;

    const masterSheet = ss.getSheetByName("イベントマスター");
    const applySheet = ss.getSheetByName("申し込み管理");
    if (!masterSheet || !applySheet) return items;

    const masterData = masterSheet.getDataRange().getValues();
    const applyData = applySheet.getDataRange().getValues();
    const masterMap = this.getMasterEventMap(masterData);

    for (let i = 1; i < applyData.length; i++) {
      const row = applyData[i];
      const applyId = row[APPLY_COL.APPLY_ID];
      const eventId = row[APPLY_COL.EVENT_ID];
      const payEndDateRaw = row[APPLY_COL.PAY_END_DATE];
      const applyName = row[APPLY_COL.APPLY_NAME] || "";

      if (!applyId || !payEndDateRaw) continue;

      const payEndStr = formatDateJST(payEndDateRaw, "yyyy-MM-dd");
      if (payEndStr !== todayStr) continue;

      // 締切時刻が現在時刻より過去の場合はスキップ（時刻考慮）
      if (new Date(payEndDateRaw) <= now) continue;

      const masterInfo = masterMap[eventId] || {};
      const eventName = masterInfo.eventName || row[APPLY_COL.EVENT_NAME_ALT];
      const brandEventTitle = DiscordService.formatBrandEventTitle(masterInfo.brand, eventName);
      const formattedTime = formatDateJST(payEndDateRaw, "HH:mm");
      const applyMethod = row[APPLY_COL.APPLY_METHOD] || row[APPLY_COL.URL] || "";

      items.push({
        brandEvent: brandEventTitle,
        applyName: applyName,
        timeStr: `${formattedTime}まで`,
        method: applyMethod
      });
    }

    return items;
  },

  /**
   * カレンダー未登録のイベントマスター行を取得
   * @returns {Array<{rowIndex: number, brand: string, eventName: string, startDateRaw: any, endDateRaw: any, location: string, summary: string}>}
   */
  fetchUnregisteredCalendarEvents() {
    const masterSheet = this.getMasterSheet();
    if (!masterSheet) return [];

    const data = masterSheet.getDataRange().getValues();
    const results = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const calId = row[MASTER_COL.CAL_ID];
      const startDateRaw = row[MASTER_COL.START_DATE];

      if (calId || !startDateRaw) continue;

      results.push({
        rowIndex: i + 1, // 1始まりの行番号
        brand: row[MASTER_COL.BRAND],
        eventName: row[MASTER_COL.EVENT_NAME],
        startDateRaw: startDateRaw,
        endDateRaw: row[MASTER_COL.END_DATE],
        location: row[MASTER_COL.LOCATION],
        summary: row[MASTER_COL.SUMMARY]
      });
    }

    return results;
  },

  /**
   * イベントマスターの指定行にカレンダーIDを保存する
   * @param {number} rowIndex - 1始まりの行番号
   * @param {string} calId - カレンダーイベントID
   */
  updateMasterCalendarId(rowIndex, calId) {
    const masterSheet = this.getMasterSheet();
    if (masterSheet && rowIndex > 1) {
      masterSheet.getRange(rowIndex, MASTER_COL.CAL_ID + 1).setValue(calId);
    }
  },

  /**
   * イベントの新規追記（採番・数式設定含む）
   * @param {Object} data - { brand, name, startDate, endDate, location, summary }
   * @param {string} [calId] - 連携カレンダーID
   * @returns {string} 発行されたイベントID (EV-xxx)
   */
  insertEvent(data, calId) {
    const sheet = this.getMasterSheet();
    if (!sheet) throw new Error("「イベントマスター」シートが見つかりません。");

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

    const eventId = 'EV-' + String(maxIdNum + 1).padStart(3, '0');
    const nextRow = sheet.getLastRow() + 1;

    const masterIfsFormula = `=IFS(
      ISBLANK(D${nextRow}), "未設定",
      TODAY() < INT(D${nextRow}), "開催前",
      TODAY() <= INT(IF(ISBLANK(E${nextRow}), D${nextRow}, E${nextRow})), "開催期間",
      TRUE, "開催終了"
    )`;

    const startDate = data.startDate || '';
    const endDate = data.endDate || startDate;

    sheet.appendRow([
      eventId,
      data.brand || '',
      data.name,
      startDate,
      endDate,
      data.location || '',
      data.summary || '',
      calId || '',
      masterIfsFormula
    ]);

    return eventId;
  },

  /**
   * イベント行の更新
   * @param {Object} data - { id, brand, name, startDate, endDate, location, summary }
   */
  updateEventRow(data) {
    const ss = this.getSpreadsheet();
    if (!ss) throw new Error("スプレッドシートを開けません。");
    const masterSheet = ss.getSheetByName('イベントマスター');
    if (!masterSheet) throw new Error("「イベントマスター」シートが見つかりません。");

    const values = masterSheet.getDataRange().getValues();
    let targetRow = -1;

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][MASTER_COL.ID]) === String(data.id)) {
        targetRow = i + 1;
        break;
      }
    }

    if (targetRow === -1) {
      throw new Error(`イベントID「${data.id}」の行が見つかりません。`);
    }

    const startDate = data.startDate || '';
    const endDate = data.endDate || startDate;

    masterSheet.getRange(targetRow, MASTER_COL.BRAND + 1).setValue(data.brand || '');
    masterSheet.getRange(targetRow, MASTER_COL.EVENT_NAME + 1).setValue(data.name || '');
    masterSheet.getRange(targetRow, MASTER_COL.START_DATE + 1).setValue(startDate);
    masterSheet.getRange(targetRow, MASTER_COL.END_DATE + 1).setValue(endDate);
    masterSheet.getRange(targetRow, MASTER_COL.LOCATION + 1).setValue(data.location || '');
    masterSheet.getRange(targetRow, MASTER_COL.SUMMARY + 1).setValue(data.summary || '');

    // 申し込み管理シート側のブランド・イベント名も同期更新
    const applySheet = ss.getSheetByName('申し込み管理');
    if (applySheet) {
      const applyValues = applySheet.getDataRange().getValues();
      for (let j = 1; j < applyValues.length; j++) {
        if (String(applyValues[j][APPLY_COL.EVENT_ID]) === String(data.id)) {
          applySheet.getRange(j + 1, APPLY_COL.BRAND + 1).setValue(data.brand || '');
          applySheet.getRange(j + 1, APPLY_COL.EVENT_NAME_ALT + 1).setValue(data.name || '');
        }
      }
    }
  },

  /**
   * 申し込み情報の新規追記
   * @param {Object} data - { eventId, brand, eventName, applyName, startDatetime, endDatetime, resultDatetime, payEndDatetime, method }
   * @returns {string} 発行された申し込みID (AP-xxx)
   */
  insertApplication(data) {
    const ss = this.getSpreadsheet();
    if (!ss) throw new Error("スプレッドシートを開けません。");
    const applySheet = ss.getSheetByName('申し込み管理');
    if (!applySheet) throw new Error("「申し込み管理」シートが見つかりません。");

    let eventId = data.eventId || '';
    let brand = data.brand || '';
    let eventName = data.eventName || '';

    // イベントマスターから補完
    if (eventId && (!brand || !eventName)) {
      const masterSheet = ss.getSheetByName('イベントマスター');
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

    const applyId = 'AP-' + String(maxIdNum + 1).padStart(3, '0');
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

    return applyId;
  },

  /**
   * 申し込み行の更新
   * @param {Object} data - { id, eventId, brand, eventName, applyName, startDatetime, endDatetime, resultDatetime, payEndDatetime, method }
   */
  updateApplicationRow(data) {
    const ss = this.getSpreadsheet();
    if (!ss) throw new Error("スプレッドシートを開けません。");
    const applySheet = ss.getSheetByName('申し込み管理');
    if (!applySheet) throw new Error("「申し込み管理」シートが見つかりません。");

    const values = applySheet.getDataRange().getValues();
    let targetRow = -1;

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][APPLY_COL.APPLY_ID]) === String(data.id)) {
        targetRow = i + 1;
        break;
      }
    }

    if (targetRow === -1) {
      throw new Error(`申し込みID「${data.id}」の行が見つかりません。`);
    }

    let brand = data.brand || '';
    let eventName = data.eventName || '';

    if (data.eventId && (!brand || !eventName)) {
      const masterSheet = ss.getSheetByName('イベントマスター');
      if (masterSheet) {
        const mValues = masterSheet.getDataRange().getValues();
        for (let i = 1; i < mValues.length; i++) {
          if (String(mValues[i][MASTER_COL.ID]) === String(data.eventId)) {
            brand = brand || String(mValues[i][MASTER_COL.BRAND] || '');
            eventName = eventName || String(mValues[i][MASTER_COL.EVENT_NAME] || '');
            break;
          }
        }
      }
    }

    applySheet.getRange(targetRow, APPLY_COL.EVENT_ID + 1).setValue(data.eventId || '');
    if (brand) applySheet.getRange(targetRow, APPLY_COL.BRAND + 1).setValue(brand);
    if (eventName) applySheet.getRange(targetRow, APPLY_COL.EVENT_NAME_ALT + 1).setValue(eventName);
    applySheet.getRange(targetRow, APPLY_COL.APPLY_NAME + 1).setValue(data.applyName || '');
    applySheet.getRange(targetRow, APPLY_COL.START_DATE + 1).setValue(data.startDatetime || '');
    applySheet.getRange(targetRow, APPLY_COL.APPLY_END_DATE + 1).setValue(data.endDatetime || '');
    applySheet.getRange(targetRow, APPLY_COL.APPLY_METHOD + 1).setValue(data.method || '');
    applySheet.getRange(targetRow, APPLY_COL.RESULT_DATE + 1).setValue(data.resultDatetime || '');
    applySheet.getRange(targetRow, APPLY_COL.PAY_END_DATE + 1).setValue(data.payEndDatetime || '');
  }
};
