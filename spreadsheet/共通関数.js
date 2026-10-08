// ==================================================
// 【共通ユーティリティ関数】
// 日付フォーマット、エラーハンドリング、ステータス計算等の純粋関数群
// ==================================================

/**
 * 日本標準時 (JST) で指定のフォーマットに日付文字列を変換
 * @param {Date|string} date - 対象の日付オブジェクトまたは文字列
 * @param {string} formatStr - フォーマット文字列 (例: "yyyy-MM-dd", "HH:mm", "MM/dd")
 * @returns {string} フォーマットされた日付文字列
 */
function formatDateJST(date, formatStr) {
  if (!date) return "";
  const d = (date instanceof Date) ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  return Utilities.formatDate(d, "JST", formatStr);
}

/**
 * エラーログを統一形式で出力する
 * @param {string} context - エラーが発生した処理・関数名
 * @param {Error|any} error - キャッチされたエラーオブジェクト
 */
function logError(context, error) {
  const message = (error && error.toString) ? error.toString() : String(error);
  console.error(`[ERROR] ${context} でエラーが発生しました: ${message}`);
  Logger.log(`[ERROR] ${context}: ${message}`);
}

/**
 * イベントの開催期間と現在時刻からステータスを計算する
 * @param {Date|string} start - 開始日
 * @param {Date|string} end - 終了日
 * @param {string} sheetStatus - スプレッドシート数式側の計算値（フォールバック用）
 * @returns {string} '開催前' | '開催期間' | '開催終了'
 */
function calculateEventStatus(start, end, sheetStatus) {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // 日付単位で比較

  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : startDate;

  if (startDate && !isNaN(startDate.getTime())) {
    startDate.setHours(0, 0, 0, 0);
    if (now < startDate) return '開催前';
  }

  if (endDate && !isNaN(endDate.getTime())) {
    endDate.setHours(23, 59, 59, 999);
    if (now <= endDate) return '開催期間';
    return '開催終了';
  }

  if (sheetStatus && ['開催前', '開催期間', '開催終了'].includes(sheetStatus)) {
    return sheetStatus;
  }

  return '開催終了';
}

/**
 * チケット申込の日程からステータスを計算する
 * @param {Date|string} start - 申込開始日時
 * @param {Date|string} end - 申込締切日時
 * @param {Date|string} result - 当落発表日時
 * @param {Date|string} payEnd - 入金締切日時
 * @param {string} sheetStatus - スプレッドシート数式側の計算値（フォールバック用）
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