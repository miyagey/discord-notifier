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

    const footerMessage = config.withFooter
      ? `📝 イベント・申込の確認＆登録は${WEBAPP_URL ? `[Webアプリ](<${WEBAPP_URL}>)` : "Webアプリ"}から`
      : "";

    // 1. 対象アイテムが 0 件の場合の処理
    if (!items || items.length === 0) {
      if (config.emptyMessage) {
        const content = [config.emptyMessage, footerMessage].filter(Boolean).join("\n");
        this.sendNotification(config.webhookUrl, content);
      } else if (config.emptyLog) {
        Logger.log(config.emptyLog);
      }
      return;
    }

    // 2. アイテムを Embed カード配列に変換
    const embeds = items.map(item => this.formatRemindEmbed(item, {
      timeLabel: config.timeLabel,
      timeStr: config.getTimeStr(item),
      color: config.color
    })).filter(Boolean);

    // 3. Discord の仕様（1メッセージ最大10 Embeds）に合わせて分割送信
    this.sendEmbedsNotification(config.webhookUrl, {
      headerTitle: config.headerTitle,
      subTitle: footerMessage,
      embeds
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
   * @param {EventDto[]} events - 登録成功したイベントDTO配列
   */
  notifyNewCalendarEvent(events) {
    if (!WEBHOOK_CALENDAR || !events || events.length === 0) return;

    const embeds = events
      .map(event => this.formatCalendarEventEmbed(event))
      .filter(Boolean);

    this.sendEmbedsNotification(WEBHOOK_CALENDAR, {
      headerTitle: "## 🆕 Googleカレンダーに新しいイベントを登録したよ！",
      embeds
    });
  },

  /**
   * 明日の予定一覧通知を送信
   * @param {EventDto[]} [events] - 予定イベントDTO配列
   */
  notifyTomorrowEvents(events) {
    if (!WEBHOOK_CALENDAR) return;

    if (!events) {
      Logger.log("明日のカレンダー予定の取得結果がありませんでした。");
      return;
    }

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
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
    const eventName = event.eventName || '';

    // 開催日時の表記フォーマット化（formatDateRange を活用）
    const dateStr = formatDateRange(event.startDate, event.endDate) || event.startDate || "未定";

    const venue = event.location || '未定';
    const description = event.description || '特記事項なし';

    // 2. チャンネル名の生成とサニタイズ (例: 学マス-live-tour-標)
    const brand = event.brand || '';
    const rawName = brand ? `${brand}-${eventName}` : eventName;
    const sanitizedName = this.sanitizeChannelName(rawName);

    // 3. トピック (チャンネル説明) テキストの構築
    const topicText = [
      `公演名: ${eventName}`,
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
      eventName: eventName,
      dateStr: dateStr,
      location: venue,
      description: description
    });

    return channelId;
  },

  /**
   * 新規作成チャンネルへ初回イベント詳細メッセージ (Embed) を投稿する
   * @param {string} channelId - Discord チャンネルID
   * @param {EventDto} event - イベントDTO
   */
  sendFirstMessageToChannel(channelId, event) {
    if (!channelId || !DISCORD_BOT_TOKEN) return;

    const eventName = event.eventName || event.displayName || "未定";
    // ブランドに応じた枠線カラーの判定
    const embedColor = typeof getBrandColor === 'function' ? getBrandColor(event.brand) : 0x3498db;

    const embed = {
      title: `🎉 ${eventName}`,
      color: embedColor,
      fields: [
        { name: "公演名", value: eventName, inline: false },
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
        headerTitle: "## 🔔 本日締切のチケット申込があります！",
        color: 0xe67e22, // 鮮やかなオレンジ
        emptyMessage: "## 🔔 本日締切のチケット申込はありません！\n漏れがあれば教えてね！",
        withFooter: true,
        timeLabel: "締切時刻",
        getTimeStr: (item) => {
          const time = item.endDatetime || item.timeStr || "";
          return time && !time.includes("まで") ? `${time}まで` : time;
        }
      },
      FIRST_COME: {
        webhookUrl: WEBHOOK_APPLY,
        headerTitle: "## 🏃 明日から先着受付が始まります！忘れずに！",
        color: 0x3498db, // 爽やかなブルー
        withFooter: false,
        timeLabel: "開始日時",
        getTimeStr: (item) => {
          const time = item.startDatetime || item.timeStr || "";
          return time && !time.includes("から") ? `${time}から` : time;
        }
      },
      RESALE: {
        webhookUrl: WEBHOOK_APPLY,
        headerTitle: "## 🔄 受付中のリセールがあります！",
        color: 0x2ecc71, // エメラルドグリーン
        withFooter: false,
        timeLabel: "締切日時",
        getTimeStr: (item) => {
          const time = item.endDatetime || item.deadlineStr || item.timeStr || "";
          return time && !time.includes("まで") ? `${time}まで` : time;
        }
      },
      PAYMENT: {
        webhookUrl: WEBHOOK_PAYMENT,
        headerTitle: "## 💸 本日入金締切のチケットがあります！",
        color: 0xf1c40f, // 明るいイエローゴールド
        emptyLog: "本日入金締切のチケットはありませんでした。",
        withFooter: false,
        timeLabel: "入金締切",
        getTimeStr: (item) => {
          const time = item.payEndDatetime || item.timeStr || "";
          return time && !time.includes("まで") ? `${time}まで` : time;
        }
      }
    };
  },

  /**
   * 申込アイテムを独立した Embed カードオブジェクトに変換
   * @param {ApplicationDto} item - 申込アイテムDTO
   * @param {Object} options - フォーマットオプション
   * @param {string} options.timeLabel - 時間ラベル（例: "締切時刻"）
   * @param {string} options.timeStr - 時間文字列（例: "23:59まで"）
   * @param {number} [options.color=0x3498db] - フォールバックの枠線カラー
   * @returns {Object|null} Discord Embed オブジェクト
   */
  formatRemindEmbed(item, { timeLabel, timeStr, color = 0x3498db }) {
    if (!item) return null;
    const title = formatBrandEventTitle(item.brand, item.eventName || item.name || "");
    const applyName = item.applyName || "未指定";
    const method = item.method || item.applyMethod || "";
    const embedColor = (typeof getBrandColor === 'function' ? getBrandColor(item.brand) : null) || color;

    const fields = [
      { name: "受付区分", value: applyName, inline: true },
      { name: timeLabel, value: `**${timeStr}**`, inline: true }
    ];

    let url = undefined;
    if (method) {
      const trimmed = String(method).trim();
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        url = trimmed;
        fields.push({
          name: "申込方法",
          value: `[チケットページを開く](<${trimmed}>)`,
          inline: false
        });
      } else {
        fields.push({
          name: "申込方法",
          value: trimmed,
          inline: false
        });
      }
    }

    const embed = {
      title: `📅 ${title}`,
      color: embedColor,
      fields: fields
    };

    if (url) {
      embed.url = url;
    }

    return embed;
  },

  /**
   * カレンダー登録イベントを独立した Embed カードオブジェクトに変換
   * @param {EventDto} event - イベントDTO
   * @returns {Object|null} Discord Embed オブジェクト
   */
  formatCalendarEventEmbed(event) {
    if (!event) return null;

    const brandEventTitle = formatBrandEventTitle(event.brand, event.eventName || "");
    const dateStr = formatDateRange(event.startDate, event.endDate);
    const location = event.location || "";
    const description = event.description || "";
    const embedColor = (typeof getBrandColor === 'function' ? getBrandColor(event.brand) : null) || 0x3498db;

    const fields = [
      { name: "期間", value: `${dateStr} [終日]`, inline: true }
    ];

    if (location) {
      fields.push({ name: "会場", value: location, inline: true });
    }

    if (description) {
      const trimmed = String(description).trim();
      if (trimmed) {
        fields.push({ name: "概要", value: trimmed, inline: false });
      }
    }

    return {
      title: `📅 ${brandEventTitle}`,
      color: embedColor,
      fields: fields
    };
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

  // ==================================================
  // 4. 低レベル通信・インフラメソッド群
  // ==================================================

  /**
   * Embed 配列を Discord の仕様（1メッセージ最大10件）に合わせて分割送信する
   * @param {string} webhookUrl - 送信先 Webhook URL
   * @param {Object} options - 送信オプション
   * @param {string} options.headerTitle - 初回メッセージの見出しタイトル
   * @param {string} [options.subTitle] - 初回メッセージの補足テキスト
   * @param {Object[]} options.embeds - 送信する Embed オブジェクト配列
   */
  sendEmbedsNotification(webhookUrl, { headerTitle, subTitle, embeds }) {
    if (!webhookUrl || !embeds || embeds.length === 0) return;

    const MAX_EMBEDS_PER_MESSAGE = 10;
    for (let i = 0; i < embeds.length; i += MAX_EMBEDS_PER_MESSAGE) {
      const chunk = embeds.slice(i, i + MAX_EMBEDS_PER_MESSAGE);
      const content = i === 0
        ? [headerTitle, subTitle].filter(Boolean).join("\n")
        : `${headerTitle} (続き)`;

      this.sendNotification(webhookUrl, { content, embeds: chunk });

      if (i + MAX_EMBEDS_PER_MESSAGE < embeds.length) {
        Utilities.sleep(500);
      }
    }
  },


  /**
   * Discord（プロキシ経由）へメッセージを送信する
   * @param {string} webhookUrl - 送信先の Discord Webhook URL
   * @param {string|Object} payloadOrMessage - 送信するメッセージ（Markdown文字列またはJSONペイロードオブジェクト）
   */
  sendNotification(webhookUrl, payloadOrMessage) {
    try {
      Logger.log("--- Discordへのメッセージ送信を開始 ---");

      if (!webhookUrl) {
        throw new Error("Webhook URLが設定されていません。");
      }

      const targetUrl = this.resolveProxyUrl(webhookUrl);

      let payload;
      if (typeof payloadOrMessage === 'object' && payloadOrMessage !== null) {
        payload = payloadOrMessage;
      } else {
        payload = { "content": String(payloadOrMessage || "") };
      }

      const options = {
        "method": "post",
        "contentType": "application/json",
        "payload": JSON.stringify(payload),
        "muteHttpExceptions": true
      };

      const MAX_RETRIES = 3;
      let isSuccess = false;

      for (let i = 0; i < MAX_RETRIES; i++) {
        const response = UrlFetchApp.fetch(targetUrl, options);
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

    const rawUrl = endpoint.startsWith('http')
      ? endpoint
      : `https://discord.com/api/v10${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const url = this.resolveProxyUrl(rawUrl);

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
  },

  /**
   * PROXY_BASE_URL が設定されている場合、URLのホストをプロキシ先に置換する
   * @param {string} url - 対象URL
   * @returns {string} 解決されたURL
   */
  resolveProxyUrl(url) {
    if (PROXY_BASE_URL && url && url.includes("https://discord.com")) {
      return url.replace("https://discord.com", PROXY_BASE_URL);
    }
    return url;
  }
};
