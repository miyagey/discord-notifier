// ==================================================
// 【共通型定義 (JSDoc Type Definitions)】
// システム全体で共有される DTO (Data Transfer Object) の型スキーマ
// ==================================================

/**
 * イベント情報 DTO
 * @typedef {Object} EventDto
 * @property {string} [id] - イベントマスターID (例: "EV-202611-001")
 * @property {string} [brand] - ブランド名 (例: "シャニ", "学マス", "デレ")
 * @property {string} eventName - イベント名
 * @property {string} startDate - 開始日 (yyyy-MM-dd)
 * @property {string} [endDate] - 終了日 (yyyy-MM-dd)
 * @property {string} [location] - 会場名
 * @property {string} [description] - 概要・特記事項
 * @property {string} [calendarEventId] - GoogleカレンダーイベントID
 * @property {string} [discordChannelId] - DiscordチャンネルID
 * @property {string} [status] - 開催ステータス ('開催前' | '開催期間' | '開催終了')
 * @property {number} [rowIndex] - スプレッドシート上の行番号 (カレンダー同期用)
 */

/**
 * チケット申込情報 DTO
 * @typedef {Object} ApplicationDto
 * @property {string} [id] - 申込管理ID (例: "AP-202611-001")
 * @property {string} [eventId] - 紐づくイベントID (EV-xxx)
 * @property {string} [brand] - ブランド名
 * @property {string} [eventName] - イベント名
 * @property {string} applyName - 受付区分名 (例: "CD先行抽選", "一般発売", "リセール")
 * @property {string} [startDatetime] - 受付開始日時 (yyyy-MM-dd HH:mm)
 * @property {string} [endDatetime] - 申込締切日時 (yyyy-MM-dd HH:mm)
 * @property {string} [resultDatetime] - 当落発表日時 (yyyy-MM-dd HH:mm)
 * @property {string} [payEndDatetime] - 入金締切日時 (yyyy-MM-dd HH:mm)
 * @property {string} [method] - 申込方法 / 案内URL
 * @property {string} [status] - 申込ステータス
 */

/**
 * カレンダー予定アイテム DTO
 * @typedef {Object} CalendarEventItemDto
 * @property {string} title - イベントタイトル
 * @property {string} timeStr - 時間帯文字列 (例: "[終日]", "18:00 〜 20:00")
 * @property {string} [location] - 会場名
 * @property {string} [description] - 概要説明
 */

/**
 * 明日の予定一覧 DTO
 * @typedef {Object} TomorrowEventsDto
 * @property {string} dateTitle - 日付タイトル (例: "11/07(土)")
 * @property {CalendarEventItemDto[]} events - 予定イベント配列
 */

/**
 * リマインド通知種別の列挙型
 * @typedef {'APPLY' | 'FIRST_COME' | 'RESALE' | 'PAYMENT'} RemindType
 */

/**
 * リマインド設定 DTO
 * @typedef {Object} RemindConfigDto
 * @property {string} webhookUrl - 送信先 Webhook URL
 * @property {string} headerTitle - メッセージ見出しタイトル
 * @property {string} [emptyMessage] - 0件時の通知メッセージ（指定時は送信）
 * @property {string} [emptyLog] - 0件時のログメッセージ（指定時はログ出力）
 * @property {boolean} [withFooter] - 登録フッターを含めるかどうか
 * @property {string} timeLabel - 時間表示ラベル（例: "締切時刻", "開始日時"）
 * @property {function(ApplicationDto): string} getTimeStr - アイテムから時間文字列を抽出する関数
 */

