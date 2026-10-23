// ==================================================
// 【Discord操作 & メッセージ生成】
// DiscordへのWebhook送信・テキスト整形・通知テンプレートの管理
// ==================================================

/**
 * Discord通知サービスオブジェクト
 */
const DiscordService = {

  // ==================================================
  // 1. 公開通知 API（オーケストレーション層から呼び出されるメインメソッド群）
  // ==================================================

  /**
   * リマインド種別に応じた通知を送信 (完全集約型)
   * @param {RemindType} type - リマインド種別 ('APPLY' | 'FIRST_COME' | 'RESALE' | 'PAYMENT')
   * @param {ApplicationDto[]} items - 申込アイテム配列
   */
  sendRemindNotification(type, items) {
    const config = this.REMIND_CONFIGS[type];
    if (!config) {
      throw new Error(`未定義のリマインド種別です: ${type}`);
    }

    if (!items || items.length === 0) {
      if (config.emptyMessage) {
        const message = config.emptyMessage + (config.withFooter ? this.getRegistrationFooterMessage() : "");
        this.sendNotification(config.webhookUrl, message);
      } else if (config.emptyLog) {
        Logger.log(config.emptyLog);
      }
      return;
    }

    const footer = config.withFooter ? "\n" + this.getRegistrationFooterMessage() : undefined;
    this.sendItemListNotification({
      webhookUrl: config.webhookUrl,
      headerTitle: config.headerTitle,
      items: items,
      formatItemFunc: (item) => this.formatRemindItem(item, {
        timeLabel: config.timeLabel,
        timeStr: config.getTimeStr(item)
      }),
      footer: footer
    });
  },

  /**
   * Webアプリ経由で登録された新着チケット申込をDiscordへ通知
   * @param {ApplicationDto} application - 申込情報DTO
   */
  notifyNewApplication(application) {
    if (!WEBHOOK_APPLY || !application) return;

    const brandEventTitle = formatBrandEventTitle(application.brand, application.eventName || "");
    const applyName = application.applyName || "未指定";
    const endDatetime = application.endDatetime;
    const payEndDatetime = application.payEndDatetime;
    const method = application.method || "";

    const lines = [
      "🆕 **新しいチケット申込が登録されたよ！**\n",
      `📅 **${brandEventTitle}**`,
      ` └ 受付区分: ${applyName}`
    ];

    if (endDatetime) lines.push(` └ 申込締切: **${endDatetime}まで**`);
    if (payEndDatetime) lines.push(` └ 入金締切: **${payEndDatetime}まで**`);
    if (method) lines.push(this.formatApplyMethodBlock(method).trimEnd());

    this.sendNotification(WEBHOOK_APPLY, lines.join('\n'));
  },

  /**
   * Googleカレンダー登録完了のDiscord通知を送信
   * @param {EventDto} event - イベントDTO
   */
  notifyNewCalendarEvent(event) {
    if (!WEBHOOK_CALENDAR || !event) return;

    const brandEventTitle = formatBrandEventTitle(event.brand, event.eventName || "");
    const dateStr = formatDateRange(event.startDate, event.endDate);
    const location = event.location || "";
    const description = event.description || "";

    const lines = [
      "🆕 **Googleカレンダーに新しいイベントを登録したよ！**\n",
      `📅 **${brandEventTitle}**`,
      ` └ 期間: **${dateStr} [終日]**`
    ];

    if (location) lines.push(` └ 会場: ${location}`);
    if (description) {
      const trimmed = String(description).trim();
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
   * カレンダー未登録イベントの一括同期完了通知を送信
   * @param {EventDto[]} events - 登録成功したイベントDTO配列
   */
  notifyBatchCalendarEvents(events) {
    if (!events || events.length === 0 || !WEBHOOK_CALENDAR) return;

    const messageLines = ["🆕 **Googleカレンダーに新しいイベントを登録したよ！**\n"];
    events.forEach(event => {
      const brandEventTitle = formatBrandEventTitle(event.brand, event.eventName || "");
      const dateStr = formatDateRange(event.startDate, event.endDate);
      const location = event.location || "";
      const description = event.description || "";

      messageLines.push(`📅 **${brandEventTitle}**`);
      messageLines.push(` └ 期間: **${dateStr} [終日]**`);
      if (location) messageLines.push(` └ 会場: ${location}`);
      if (description) {
        const trimmed = String(description).trim();
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
   * @param {EventDto[]} [events] - 予定イベントDTO配列
   * @param {Date} [targetDate] - 対象日（省略時は明日）
   */
  notifyTomorrowEvents(events, targetDate) {
    if (!WEBHOOK_CALENDAR) return;

    if (!events) {
      Logger.log("明日のカレンダー予定の取得結果がありませんでした。");
      return;
    }

    const tomorrow = targetDate ? new Date(targetDate) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dateTitle = formatDateJST(tomorrow, "MM/dd(E)");
    const messageLines = [`## 📅 明日 ${dateTitle} の予定リスト`];

    if (events.length === 0) {
      messageLines.push("明日の予定はありません。");
    } else {
      events.forEach(event => {
        const title = event.title || formatBrandEventTitle(event.brand, event.eventName);
        const timeStr = formatEventTimeRange(event);
        messageLines.push(`### 📌 ${title}`, `⏰ ${timeStr}`);
        if (event.location) messageLines.push(`📍 場所: ${event.location}`);
        if (event.description) messageLines.push(`📝 説明:\n> ${event.description.replace(/\n/g, '\n> ')}`);
        messageLines.push("\n---\n");
      });
    }

    this.sendNotification(WEBHOOK_CALENDAR, messageLines.join('\n'));
  },

  // ==================================================
  // 2. Discord Bot API チャンネル作成（ライフサイクル管理）
  // ==================================================

  /**
   * イベント用 Discord テキストチャンネルを作成し、概要設定および初回メッセージの投稿を行う
   * @param {EventDto} event - イベントDTO
   * @returns {string|null} 作成された Discord チャンネルID（失敗時は null）
   */
  createEventChannel(event) {
    if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
      Logger.log("Discord Bot Token または Guild ID が設定されていないため、スキップします。");
      return null;
    }

    if (!event) return null;

    // 1. 公演名
    const displayName = event.eventName || '';

    // 開催日時の表記フォーマット化（formatDateRange を活用）
    const dateStr = formatDateRange(event.startDate, event.endDate) || event.startDate || "未定";

    const venue = event.location || '未定';
    const description = event.description || '特記事項なし';

    // 2. チャンネル名の生成とサニタイズ (例: 学マス-live-tour-標)
    const brand = event.brand || '';
    const rawName = brand ? `${brand}-${displayName}` : displayName;
    const sanitizedName = this.sanitizeChannelName(rawName);

    // 3. トピック (チャンネル説明) テキストの構築
    const topicText = [
      `公演名: ${displayName}`,
      `開催日時: ${dateStr}`,
      `会場: ${venue}`,
      `概要: ${description}`
    ].join('\n').substring(0, 1024);

    const payload = {
      name: sanitizedName,
      type: 0, // ギルドテキストチャンネル
      parent_id: DISCORD_CATEGORY_ID || undefined,
      topic: topicText
    };

    const res = this.fetchDiscordApi(`/guilds/${DISCORD_GUILD_ID}/channels`, {
      method: 'post',
      payload: payload
    });

    if (!res || !res.success || !res.data) {
      Logger.log("Discord チャンネル作成に失敗しました。");
      return null;
    }

    const channelId = res.data.id;
    Logger.log(`Discord チャンネルを作成しました: ${res.data.name} (ID: ${channelId})`);

    // 4. 作成されたチャンネルへ初回イベント詳細メッセージを投稿
    this.sendFirstMessageToChannel(channelId, {
      ...event,
      displayName: displayName,
      dateStr: dateStr,
      location: venue,
      description: description
    });

    return channelId;
  },

  // ==================================================
  // 3. テンプレート・フォーマッター・設定
  // ==================================================

  /**
   * リマインド種別ごとの設定マップ
   * @type {Object.<RemindType, RemindConfigDto>}
   */
  get REMIND_CONFIGS() {
    return {
      APPLY: {
        webhookUrl: WEBHOOK_APPLY,
        headerTitle: "🔔 **本日締切のチケット申込があります！**",
        emptyMessage: "🔔 **本日締切のチケット申込はありません！**\n\n漏れがあれば教えてね！\n\n",
        withFooter: true,
        timeLabel: "締切時刻",
        getTimeStr: (item) => item.timeStr || (item.endDatetime ? `${item.endDatetime}まで` : "")
      },
      FIRST_COME: {
        webhookUrl: WEBHOOK_APPLY,
        headerTitle: "🏃 **明日から先着受付が始まります！忘れずに！**",
        withFooter: false,
        timeLabel: "開始日時",
        getTimeStr: (item) => {
          const timeStr = item.timeStr || (item.startDatetime ? `${item.startDatetime}から` : "");
          return timeStr.includes("から") ? timeStr : `${timeStr}から`;
        }
      },
      RESALE: {
        webhookUrl: WEBHOOK_APPLY,
        headerTitle: "🔄 **受付中のリセールがあります！**",
        withFooter: false,
        timeLabel: "締切日時",
        getTimeStr: (item) => {
          const deadlineStr = item.deadlineStr || (item.endDatetime ? `${item.endDatetime}まで` : "");
          return deadlineStr.includes("まで") ? deadlineStr : `${deadlineStr}まで`;
        }
      },
      PAYMENT: {
        webhookUrl: WEBHOOK_PAYMENT,
        headerTitle: "💸 **本日入金締切のチケットがあります！**",
        emptyLog: "本日入金締切のチケットはありませんでした。",
        withFooter: false,
        timeLabel: "入金締切",
        getTimeStr: (item) => item.timeStr || (item.payEndDatetime ? `${item.payEndDatetime}` : "")
      }
    };
  },

  /**
   * リマインドアイテムの各文字列をフォーマット
   * @param {ApplicationDto} item - 申込アイテムDTO
   * @param {Object} options - フォーマットオプション
   * @param {string} options.timeLabel - 時間ラベル
   * @param {string} options.timeStr - 時間文字列
   * @returns {string}
   */
  formatRemindItem(item, { timeLabel, timeStr }) {
    if (!item) return "";
    const eventName = item.eventName || item.name || "";
    const brandEvent = item.brandEvent || formatBrandEventTitle(item.brand, eventName);
    const applyName = item.applyName || "未指定";
    const method = item.method || item.applyMethod || "";

    let str = `\n📅 **${brandEvent}**\n └ 受付区分: ${applyName}\n └ ${timeLabel}: **${timeStr}**\n`;
    if (method) str += this.formatApplyMethodBlock(method);
    return str;
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
    if (!WEBAPP_URL) return "";

    return [
      "----------------------------------------",
      "📝 **イベント・申込の確認＆登録はこちら**",
      `・【Webアプリ (一覧・登録)】: ${WEBAPP_URL}`
    ].join("\n");
  },

  /**
   * Discord チャンネル名用の文字列をサニタイズする
   * @param {string} rawName - サニタイズ前の文字列
   * @returns {string} サニタイズ後のチャンネル名
   */
  sanitizeChannelName(rawName) {
    if (!rawName) return "event-channel";
    const sanitized = String(rawName)
      .toLowerCase()
      .replace(/[\s\/\_]+/g, '-')
      .replace(/[【】\[\]\(\)\!\?「」『』]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 99);
    return sanitized || "event-channel";
  },

  /**
   * 新規作成チャンネルへ初回イベント詳細メッセージ (Embed) を投稿する
   * @param {string} channelId - Discord チャンネルID
   * @param {EventDto} event - イベントDTO
   */
  sendFirstMessageToChannel(channelId, event) {
    if (!channelId || !DISCORD_BOT_TOKEN) return;

    // ブランドに応じた枠線カラーの判定
    const embedColor = typeof getBrandColor === 'function' ? getBrandColor(event.brand) : 0x3498db;

    const embed = {
      title: `🎉 ${event.displayName}`,
      color: embedColor,
      fields: [
        { name: "公演名", value: event.displayName || "未定", inline: false },
        { name: "開催日時", value: event.dateStr || "未定", inline: true },
        { name: "会場", value: event.location || "未定", inline: true },
        { name: "概要", value: event.description || "特記事項なし", inline: false }
      ],
      footer: { text: `Event ID: ${event.id || 'NEW'}` }
    };

    const res = this.fetchDiscordApi(`/channels/${channelId}/messages`, {
      method: 'post',
      payload: { embeds: [embed] }
    });

    if (res && res.success) {
      Logger.log(`チャンネル (${channelId}) へ初回メッセージを投稿しました。`);
    }
  },

  // ==================================================
  // 4. 低レベル通信・インフラメソッド群
  // ==================================================

  /**
   * アイテムリストを上限文字数(2000字)を超えないよう安全に分割組み立てしてDiscordへ送信する (DTOパターン)
   * @param {Object} params - パラメータオブジェクト
   * @param {string} params.webhookUrl - 送信先の Discord Webhook URL
   * @param {string} params.headerTitle - メッセージ冒頭のタイトル
   * @param {Array<object>} params.items - 通知対象のアイテム配列
   * @param {function(object): string} params.formatItemFunc - 各アイテムを文字列に変換するフォーマット関数
   * @param {string} [params.footer] - 最終メッセージに付与するフッター文字列（省略可）
   */
  sendItemListNotification({ webhookUrl, headerTitle, items, formatItemFunc, footer }) {
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
   * Discord REST API (Bot Token認証) を呼び出す汎用クライアントメソッド
   * @param {string} endpoint - APIエンドポイント (例: `/guilds/${guildId}/channels`) または完全なURL
   * @param {Object} [options] - リクエストオプション
   * @param {'get'|'post'|'patch'|'put'|'delete'} [options.method='get'] - HTTPメソッド (小文字/大文字不問)
   * @param {Object} [options.payload=null] - 送信するJSONペイロードオブジェクト
   * @returns {{ success: boolean, status: number, data: any }|null} レスポンスオブジェクト（Token未設定時は null）
   */
  fetchDiscordApi(endpoint, { method = 'get', payload = null } = {}) {
    if (!DISCORD_BOT_TOKEN) {
      Logger.log("DISCORD_BOT_TOKEN が設定されていないため、Discord API 呼び出しをスキップします。");
      return null;
    }

    let url = endpoint.startsWith('http')
      ? endpoint
      : `https://discord.com/api/v10${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    if (PROXY_BASE_URL && url.includes("https://discord.com")) {
      url = url.replace("https://discord.com", PROXY_BASE_URL);
    }

    const requestOptions = {
      method: method.toLowerCase(),
      contentType: "application/json",
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        "User-Agent": "DiscordBot (https://github.com/miyagey/discord-notifier, 1.0.0)"
      },
      muteHttpExceptions: true
    };

    if (payload !== null && payload !== undefined) {
      requestOptions.payload = JSON.stringify(payload);
    }

    try {
      const response = UrlFetchApp.fetch(url, requestOptions);
      const status = response.getResponseCode();
      const contentText = response.getContentText();

      let data = null;
      if (contentText) {
        try {
          data = JSON.parse(contentText);
        } catch (_) {
          data = contentText;
        }
      }

      const success = status >= 200 && status < 300;
      if (!success) {
        Logger.log(`Discord API エラー (${status}) [${method.toUpperCase()} ${endpoint}]: ${contentText}`);
      }

      return { success, status, data };
    } catch (e) {
      Logger.log(`Discord API 呼び出し中に例外が発生しました [${method.toUpperCase()} ${endpoint}]: ${e.toString()}`);
      return { success: false, status: 0, error: e };
    }
  }
};
