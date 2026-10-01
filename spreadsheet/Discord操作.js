// ==================================================
// 【Discord操作 & メッセージ生成】
// DiscordへのWebhook送信・テキスト整形・通知テンプレートの管理
// ==================================================

/**
 * Discord通知サービスオブジェクト
 */
const DiscordService = {

  /**
   * ブランド名とイベント名からタイトル文字列を生成する（二重付与防止）
   * @param {string} brand - ブランド名 (例: "デレ")
   * @param {string} eventName - イベント名 (例: "THE IDOLM@STER...", "【デレ】THE IDOLM@STER...")
   * @returns {string} 整形されたタイトル文字列
   */
  formatBrandEventTitle(brand, eventName) {
    const name = eventName ? String(eventName).trim() : "";
    if (!name) return brand ? `【${brand}】` : "";
    if (name.startsWith("【")) return name;
    const brandStr = brand ? `【${brand}】` : "";
    return `${brandStr}${name}`;
  },

  /**
   * 申込方法（URLまたは複数行テキスト）をDiscord用に整形する
   * @param {string} methodText - 申込方法の文字列
   * @returns {string} 整形された申込方法行
   */
  formatApplyMethodBlock(methodText) {
    if (!methodText) return "";
    const trimmed = String(methodText).trim();
    if (!trimmed) return "";

    if (trimmed.includes("\n")) {
      const quoted = trimmed.split("\n").map(line => `> ${line}`).join("\n");
      return ` └ 申込方法:\n${quoted}\n`;
    } else {
      return ` └ 申込方法: ${trimmed}\n`;
    }
  },

  /**
   * 締切リマインド等の登録・閲覧案内メッセージフッターを生成
   * @returns {string} 登録案内メッセージフッター
   */
  getRegistrationFooterMessage() {
    const lines = [
      "----------------------------------------",
      "📝 **イベント・申込の確認＆登録はこちら**",
      `・【フォーム (登録)】: ${REGISTRATION_FORM_URL}`
    ];
    if (WEBAPP_URL) {
      lines.push(`・【Webアプリ (一覧・カンバン)】: ${WEBAPP_URL}`);
    }
    return lines.join("\n");
  },

  /**
   * Discord（プロキシ経由）へメッセージを送信する
   * @param {string} webhookUrl - 送信先の Discord Webhook URL
   * @param {string} message - 送信するメッセージ（Markdown形式可）
   */
  sendNotification(webhookUrl, message) {
    try {
      Logger.log("--- Discordへのメッセージ送信を開始 ---");

      if (!webhookUrl) {
        throw new Error("Webhook URLが設定されていません。");
      }

      // URLが「discord.com」だった場合、自動で自分専用プロキシに書き換える
      if (PROXY_BASE_URL && webhookUrl.includes("https://discord.com")) {
        webhookUrl = webhookUrl.replace("https://discord.com", PROXY_BASE_URL);
      }

      const payload = { "content": message };
      const options = {
        "method": "post",
        "contentType": "application/json",
        "payload": JSON.stringify(payload),
        "muteHttpExceptions": true
      };

      const MAX_RETRIES = 3;
      let isSuccess = false;

      for (let i = 0; i < MAX_RETRIES; i++) {
        const response = UrlFetchApp.fetch(webhookUrl, options);
        const responseCode = response.getResponseCode();

        if (responseCode === 200 || responseCode === 204) {
          Logger.log(`送信成功 (試行回数: ${i + 1}回目)`);
          isSuccess = true;
          break;
        }

        if (responseCode === 429) {
          const responseText = response.getContentText();
          let waitTime = 5000;

          try {
            const json = JSON.parse(responseText);
            if (json.retry_after) {
              waitTime = json.retry_after < 1000 ? json.retry_after * 1000 : json.retry_after;
            }
          } catch (e) {
            const headers = response.getHeaders();
            if (headers["Retry-After"]) {
              waitTime = parseInt(headers["Retry-After"]) * 1000;
            }
          }

          console.warn(`429エラー: ${waitTime} ms 待機して再試行します。`);
          Utilities.sleep(waitTime + 500);
        } else {
          console.error(`送信エラー ステータスコード: ${responseCode}`);
          break;
        }
      }

      if (!isSuccess) {
        throw new Error("Discordへの送信に完全に失敗しました。");
      }

      Logger.log("--- Discordへのメッセージ送信を正常終了 ---");
    } catch (e) {
      logError("DiscordService.sendNotification", e);
      throw e;
    }
  },

  /**
   * アイテムリストを上限文字数(2000字)を超えないよう安全に分割組み立てしてDiscordへ送信する
   * @param {string} webhookUrl - 送信先の Discord Webhook URL
   * @param {string} headerTitle - メッセージ冒頭のタイトル
   * @param {Array<object>} items - 通知対象のアイテム配列
   * @param {function(object): string} formatItemFunc - 各アイテムを文字列に変換するフォーマット関数
   * @param {string} [footer] - 最終メッセージに付与するフッター文字列（省略可）
   */
  sendItemListNotification(webhookUrl, headerTitle, items, formatItemFunc, footer) {
    const DISCORD_MAX_LENGTH = 2000;
    const footerText = footer || "";
    const footerLength = footerText.length;

    if (!items || items.length === 0) return;

    let currentMessage = headerTitle + "\n";

    for (let i = 0; i < items.length; i++) {
      const itemText = formatItemFunc(items[i]);

      if ((currentMessage + itemText + footerLength).length > DISCORD_MAX_LENGTH) {
        this.sendNotification(webhookUrl, currentMessage);
        Utilities.sleep(500);
        currentMessage = headerTitle + "\n" + itemText;
      } else {
        currentMessage += itemText;
      }
    }

    currentMessage += footerText;
    this.sendNotification(webhookUrl, currentMessage);
  },

  /**
   * Googleカレンダー登録完了のDiscord通知を送信（新規登録時はフッターなし）
   * @param {string} brandEventTitle - イベントタイトル
   * @param {string} dateStr - 期間文字列
   * @param {string} location - 会場
   * @param {string} summary - 概要
   */
  notifyNewCalendarEvent(brandEventTitle, dateStr, location, summary) {
    if (!WEBHOOK_CALENDAR) return;

    const lines = [
      "🆕 **Googleカレンダーに新しいイベントを登録したよ！**\n",
      `📅 **${brandEventTitle}**`,
      ` └ 期間: **${dateStr} [終日]**`
    ];

    if (location) lines.push(` └ 会場: ${location}`);
    if (summary) {
      const trimmed = String(summary).trim();
      if (trimmed.includes("\n")) {
        const quoted = trimmed.split("\n").map(l => `> ${l}`).join("\n");
        lines.push(` └ 概要:\n${quoted}`);
      } else {
        lines.push(` └ 概要: ${trimmed}`);
      }
    }

    this.sendNotification(WEBHOOK_CALENDAR, lines.join('\n'));
  },

  /**
   * Webアプリ経由で登録された新着チケット申込をDiscordへ通知
   * @param {string} brand - ブランド名
   * @param {string} eventName - イベント名
   * @param {string} applyName - 受付名
   * @param {string} endDatetime - 締切日時
   * @param {string} payEndDatetime - 入金締切日時
   * @param {string} method - 申込方法
   */
  notifyNewApplication(brand, eventName, applyName, endDatetime, payEndDatetime, method) {
    if (!WEBHOOK_APPLY) return;

    const brandEventTitle = this.formatBrandEventTitle(brand, eventName);
    const lines = [
      "🆕 **新しいチケット申込が登録されたよ！**\n",
      `📅 **${brandEventTitle}**`,
      ` └ 受付区分: ${applyName || "未指定"}`
    ];

    if (endDatetime) lines.push(` └ 申込締切: **${endDatetime}まで**`);
    if (payEndDatetime) lines.push(` └ 入金締切: **${payEndDatetime}まで**`);
    if (method) lines.push(this.formatApplyMethodBlock(method).trimEnd());

    this.sendNotification(WEBHOOK_APPLY, lines.join('\n'));
  },

  /**
   * カレンダー未登録イベントの一括同期完了通知を送信
   * @param {Array<{title: string, date: string, location: string, summary: string}>} registeredEventsLog 
   */
  notifyBatchCalendarEvents(registeredEventsLog) {
    if (!registeredEventsLog || registeredEventsLog.length === 0 || !WEBHOOK_CALENDAR) return;

    const messageLines = ["🆕 **Googleカレンダーに新しいイベントを登録したよ！**\n"];
    registeredEventsLog.forEach(event => {
      messageLines.push(`📅 **${event.title}**`);
      messageLines.push(` └ 期間: **${event.date} [終日]**`);
      if (event.location) messageLines.push(` └ 会場: ${event.location}`);
      if (event.summary) {
        const trimmed = String(event.summary).trim();
        if (trimmed.includes("\n")) {
          const quoted = trimmed.split("\n").map(l => `> ${l}`).join("\n");
          messageLines.push(` └ 概要:\n${quoted}`);
        } else {
          messageLines.push(` └ 概要: ${trimmed}`);
        }
      }
      messageLines.push("");
    });

    this.sendNotification(WEBHOOK_CALENDAR, messageLines.join('\n').trimEnd());
  },

  /**
   * 明日の予定一覧通知を送信
   * @param {string} dateTitle - 日付タイトル (例: "10/02(金)")
   * @param {Array<{title: string, timeStr: string, location?: string, description?: string}>} events 
   */
  notifyTomorrowEvents(dateTitle, events) {
    if (!WEBHOOK_CALENDAR) return;

    const messageLines = [`## 📅 明日 ${dateTitle} の予定リスト`];

    if (!events || events.length === 0) {
      messageLines.push("明日の予定はありません。");
    } else {
      events.forEach(event => {
        messageLines.push(`### 📌 ${event.title}`, `⏰ ${event.timeStr}`);
        if (event.location) messageLines.push(`📍 場所: ${event.location}`);
        if (event.description) messageLines.push(`📝 説明:\n> ${event.description.replace(/\n/g, '\n> ')}`);
        messageLines.push("\n---\n");
      });
    }

    this.sendNotification(WEBHOOK_CALENDAR, messageLines.join('\n'));
  }
};

// ==================================================
// 後方互換用グローバル関数エイリアス
// ==================================================
function formatBrandEventTitle(brand, eventName) {
  return DiscordService.formatBrandEventTitle(brand, eventName);
}
function formatApplyMethodBlock(methodText) {
  return DiscordService.formatApplyMethodBlock(methodText);
}
function getRegistrationFooterMessage() {
  return DiscordService.getRegistrationFooterMessage();
}
function sendNotification(webhookUrl, message) {
  return DiscordService.sendNotification(webhookUrl, message);
}
function sendItemListNotification(webhookUrl, headerTitle, items, formatItemFunc, footer) {
  return DiscordService.sendItemListNotification(webhookUrl, headerTitle, items, formatItemFunc, footer);
}
function notifyDiscordNewCalendarEvent(brandEventTitle, dateStr, location, summary) {
  return DiscordService.notifyNewCalendarEvent(brandEventTitle, dateStr, location, summary);
}
