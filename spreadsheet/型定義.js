// ==================================================
// 【共通型定義 (JSDoc Type Definitions)】
// システム全体で共有される DTO (Data Transfer Object) の型スキーマ
// ==================================================

/**
 * イベント情報 DTO
 * @typedef {Object} EventDto
 * @property {string} [eventId] - イベントマスターID (例: "EV-202611-001")
 * @property {string} [brand] - ブランド名 (例: "シャニ", "学マス", "デレ")
 * @property {string} [eventName] - イベント名
 * @property {string} [name] - イベント名 (代替プロパティ)
 * @property {string} [rawEventName] - ブランド名抜きの公演名
 * @property {string} [displayName] - 表示用イベント名
 * @property {string} [title] - 整形済みタイトル
 * @property {string} [brandEventTitle] - ブランドプレフィックス付きタイトル
 * @property {Date|string} [startDate] - 開始日 (yyyy-MM-dd 等)
 * @property {Date|string} [startDateRaw] - 開始日 (シート生データ)
 * @property {Date|string} [endDate] - 終了日
 * @property {Date|string} [endDateRaw] - 終了日 (シート生データ)
 * @property {string} [date] - 期間文字列
 * @property {string} [dateStr] - 期間文字列
 * @property {string} [location] - 会場名
 * @property {string} [venue] - 会場名 (代替プロパティ)
 * @property {string} [summary] - 概要・説明
 * @property {string} [description] - 概要・説明 (代替プロパティ)
 * @property {string} [calendarEventId] - GoogleカレンダーイベントID
 * @property {string} [discordChannelId] - DiscordチャンネルID
 * @property {number} [rowIndex] - スプレッドシート上の行番号
 */

/**
 * チケット申込情報 DTO
 * @typedef {Object} ApplicationDto
 * @property {string} [applyId] - 申込管理ID (例: "AP-202611-001")
 * @property {string} [eventId] - 紐づくイベントID
 * @property {string} [brand] - ブランド名
 * @property {string} [eventName] - イベント名
 * @property {string} [name] - イベント名 (代替プロパティ)
 * @property {string} [brandEvent] - ブランド付き整形タイトル (代替プロパティ)
 * @property {string} [brandEventTitle] - ブランド付き整形タイトル
 * @property {string} [applyName] - 受付区分名 (例: "CD先行抽選", "一般発売", "リセール")
 * @property {Date|string} [startDate] - 受付開始日時
 * @property {Date|string} [startDatetime] - 受付開始日時
 * @property {Date|string} [endDatetime] - 申込締切日時
 * @property {Date|string} [applyEndDate] - 申込締切日時 (代替プロパティ)
 * @property {Date|string} [resultDatetime] - 当落発表日時
 * @property {Date|string} [payEndDatetime] - 入金締切日時
 * @property {Date|string} [payEndDate] - 入金締切日時 (代替プロパティ)
 * @property {string} [method] - 申込方法 / 案内URL
 * @property {string} [applyMethod] - 申込方法 (代替プロパティ)
 * @property {string} [status] - 申込ステータス
 * @property {string} [timeStr] - 整形済み時刻文字列 (例: "23:59まで")
 * @property {string} [deadlineStr] - 整形済み締切文字列
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

