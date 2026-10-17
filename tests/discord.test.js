import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let DiscordService;
let testContext;

beforeAll(() => {
  testContext = {
    REGISTRATION_FORM_URL: 'https://forms.gle/VcErZhtVcUHtL6ET8',
    WEBAPP_URL: 'https://ticket.example.com',
    WEBHOOK_APPLY: 'https://discord.com/api/webhooks/test-apply',
    WEBHOOK_PAYMENT: 'https://discord.com/api/webhooks/test-payment',
    WEBHOOK_CALENDAR: 'https://discord.com/api/webhooks/test-calendar',
    PROXY_BASE_URL: '',
    DISCORD_BOT_TOKEN: 'mock-bot-token',
    DISCORD_GUILD_ID: 'mock-guild-id',
    DISCORD_CATEGORY_ID: 'mock-category-id',
    UrlFetchApp: {
      fetch: () => {}
    },
    Logger: {
      log: () => {}
    },
    console: console,
    String: String,
    JSON: JSON
  };

  const discordJsPath = path.resolve(__dirname, '../spreadsheet/Discord操作.js');
  const discordJsContent = fs.readFileSync(discordJsPath, 'utf8');

  vm.createContext(testContext);
  DiscordService = vm.runInContext(`${discordJsContent};\nDiscordService;`, testContext);
});

describe('Discord操作.js (フォーマッター・メッセージ生成) の単体テスト', () => {
  describe('formatBrandEventTitle', () => {
    it('ブランド名とイベント名から正しくタイトルを生成すること', () => {
      const result = DiscordService.formatBrandEventTitle('学マス', '学園アイドルマスター 初星公演');
      expect(result).toBe('【学マス】学園アイドルマスター 初星公演');
    });

    it('イベント名に既に【】が含まれる場合、二重付与しないこと', () => {
      const result = DiscordService.formatBrandEventTitle('デレ', '【デレ】THE IDOLM@STER CINDERELLA GIRLS');
      expect(result).toBe('【デレ】THE IDOLM@STER CINDERELLA GIRLS');
    });

    it('ブランド名が空の場合はイベント名のみ返却すること', () => {
      const result = DiscordService.formatBrandEventTitle('', '単独イベント名');
      expect(result).toBe('単独イベント名');
    });
  });

  describe('formatApplyMethodBlock', () => {
    it('1行テキスト（URL等）の場合はインラインで整形されること', () => {
      const result = DiscordService.formatApplyMethodBlock('https://example.com/apply');
      expect(result).toBe(' └ 申込方法: https://example.com/apply\n');
    });

    it('複数行テキストの場合は引用符記法（> ）に変換されること', () => {
      const multiline = '手順1: 公式サイトにアクセス\n手順2: シリアルコードを入力';
      const result = DiscordService.formatApplyMethodBlock(multiline);
      expect(result).toContain(' └ 申込方法:\n> 手順1: 公式サイトにアクセス\n> 手順2: シリアルコードを入力\n');
    });

    it('空文字列の場合は空文字を返却すること', () => {
      expect(DiscordService.formatApplyMethodBlock('')).toBe('');
      expect(DiscordService.formatApplyMethodBlock(null)).toBe('');
    });
  });

  describe('formatApplyRemindItem', () => {
    it('申込締切アイテムが正しくフォーマットされること', () => {
      const dummyItem = {
        brandEvent: '【学マス】LIVE TOUR',
        applyName: 'アソビストア限定先行',
        timeStr: '23:59まで',
        method: 'https://asobistore.jp/ticket'
      };

      const result = DiscordService.formatApplyRemindItem(dummyItem);
      expect(result).toContain('📅 **【学マス】LIVE TOUR**');
      expect(result).toContain('└ 受付区分: アソビストア限定先行');
      expect(result).toContain('└ 締切時刻: **23:59まで**');
      expect(result).toContain('└ 申込方法: https://asobistore.jp/ticket');
    });
  });

  describe('formatPaymentRemindItem', () => {
    it('入金締切アイテムが正しくフォーマットされること', () => {
      const dummyItem = {
        brandEvent: '【デレ】7th LIVE',
        applyName: '一般先行',
        timeStr: '21:00まで',
        method: ''
      };

      const result = DiscordService.formatPaymentRemindItem(dummyItem);
      expect(result).toContain('📅 **【デレ】7th LIVE**');
      expect(result).toContain('└ 受付区分: 一般先行');
      expect(result).toContain('└ 入金締切: **21:00まで**');
    });
  });

  describe('getRegistrationFooterMessage', () => {
    it('登録フォームURLとWebアプリURLを含むフッターが生成されること', () => {
      const footer = DiscordService.getRegistrationFooterMessage();
      expect(footer).toContain('📝 **イベント・申込の確認＆登録はこちら**');
      expect(footer).toContain('https://forms.gle/VcErZhtVcUHtL6ET8');
      expect(footer).toContain('https://ticket.example.com');
    });
  });

  describe('notifyTomorrowEvents', () => {
    it('予定オブジェクトDTOを受け取り、正しくメッセージ送信を呼び出すこと', () => {
      let sentWebhook = '';
      let sentMessage = '';
      DiscordService.sendNotification = (webhook, message) => {
        sentWebhook = webhook;
        sentMessage = message;
      };

      const tomorrowData = {
        dateTitle: '10/18(日)',
        events: [
          {
            title: '【学マス】初星学園フェスティバル',
            timeStr: '[終日]',
            location: '幕張メッセ',
            description: '開場 10:00'
          }
        ]
      };

      DiscordService.notifyTomorrowEvents(tomorrowData);

      expect(sentWebhook).toBe('https://discord.com/api/webhooks/test-calendar');
      expect(sentMessage).toContain('## 📅 明日 10/18(日) の予定リスト');
      expect(sentMessage).toContain('### 📌 【学マス】初星学園フェスティバル');
      expect(sentMessage).toContain('⏰ [終日]');
      expect(sentMessage).toContain('📍 場所: 幕張メッセ');
      expect(sentMessage).toContain('📝 説明:\n> 開場 10:00');
    });

    it('予定が0件の場合は「明日の予定はありません」と送信すること', () => {
      let sentMessage = '';
      DiscordService.sendNotification = (webhook, message) => {
        sentMessage = message;
      };

      DiscordService.notifyTomorrowEvents({ dateTitle: '10/19(月)', events: [] });
      expect(sentMessage).toContain('明日の予定はありません。');
    });

    it('tomorrowEvents が null または未指定の場合は送信をスキップすること', () => {
      let called = false;
      DiscordService.sendNotification = () => {
        called = true;
      };

      DiscordService.notifyTomorrowEvents(null);
      expect(called).toBe(false);

      DiscordService.notifyTomorrowEvents();
      expect(called).toBe(false);
    });
  });

  describe('sanitizeChannelName', () => {
    it('ブランド名とイベント名から安全な小文字ハイフン区切りのチャンネル名を生成すること', () => {
      const raw = '【学マス】LIVE TOUR -標-';
      const result = DiscordService.sanitizeChannelName(raw);
      expect(result).toBe('学マス-live-tour-標');
    });

    it('スペース、スラッシュ、アンダースコアがハイフンに置換されること', () => {
      const raw = 'ミリオン 10th / Act_4';
      const result = DiscordService.sanitizeChannelName(raw);
      expect(result).toBe('ミリオン-10th-act-4');
    });

    it('記号（! ? 「」『』等）が除去・ハイフン区切りされること', () => {
      const raw = '【シャニ】春爛漫!?「夢見草」ツアー!!';
      const result = DiscordService.sanitizeChannelName(raw);
      expect(result).toBe('シャニ-春爛漫-夢見草-ツアー');
    });

    it('先頭・末尾のハイフンおよび連続ハイフンが集約・除去されること', () => {
      const raw = '---【SideM】--3rd--LIVE---';
      const result = DiscordService.sanitizeChannelName(raw);
      expect(result).toBe('sidem-3rd-live');
    });

    it('100文字を超える場合は99文字以内にトリミングされること', () => {
      const longName = 'a'.repeat(120);
      const result = DiscordService.sanitizeChannelName(longName);
      expect(result.length).toBeLessThanOrEqual(99);
    });

    it('空文字列やnullが渡された場合はデフォルトチャンネル名を返すこと', () => {
      expect(DiscordService.sanitizeChannelName('')).toBe('event-channel');
      expect(DiscordService.sanitizeChannelName(null)).toBe('event-channel');
    });
  });

  describe('fetchDiscordApi (Discord Bot API 共通クライアント)', () => {
    it('相対パスのエンドポイントにベースURLを付与し、Botトークン認証ヘッダー付きでリクエストすること', () => {
      let requestedUrl = '';
      let requestedOptions = null;

      testContext.UrlFetchApp.fetch = (url, options) => {
        requestedUrl = url;
        requestedOptions = options;
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ ok: true })
        };
      };

      const result = DiscordService.fetchDiscordApi('/users/@me', { method: 'get' });

      expect(requestedUrl).toBe('https://discord.com/api/v10/users/@me');
      expect(requestedOptions.method).toBe('get');
      expect(requestedOptions.headers.Authorization).toBe('Bot mock-bot-token');
      expect(requestedOptions.headers['User-Agent']).toBe('DiscordBot (https://github.com/miyagey/discord-notifier, 1.0.0)');
      expect(requestedOptions.contentType).toBe('application/json');
      expect(result).toEqual({ success: true, status: 200, data: { ok: true } });
    });

    it('PROXY_BASE_URL が設定されている場合、URLをプロキシベースURLに置換すること', () => {
      let requestedUrl = '';
      const originalProxy = testContext.PROXY_BASE_URL;
      testContext.PROXY_BASE_URL = 'https://my-proxy.example.com';

      testContext.UrlFetchApp.fetch = (url) => {
        requestedUrl = url;
        return {
          getResponseCode: () => 200,
          getContentText: () => '{}'
        };
      };

      DiscordService.fetchDiscordApi('/guilds/123');
      expect(requestedUrl).toBe('https://my-proxy.example.com/api/v10/guilds/123');

      testContext.PROXY_BASE_URL = originalProxy;
    });

    it('payload が渡された場合、JSON文字列化されて送信されること', () => {
      let requestedOptions = null;

      testContext.UrlFetchApp.fetch = (url, options) => {
        requestedOptions = options;
        return {
          getResponseCode: () => 200,
          getContentText: () => '{"created":true}'
        };
      };

      const res = DiscordService.fetchDiscordApi('/channels', {
        method: 'post',
        payload: { name: 'test-channel' }
      });

      expect(requestedOptions.method).toBe('post');
      expect(JSON.parse(requestedOptions.payload)).toEqual({ name: 'test-channel' });
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ created: true });
    });

    it('HTTPエラーステータス（例: 400）の場合、success: false を返すこと', () => {
      testContext.UrlFetchApp.fetch = () => ({
        getResponseCode: () => 400,
        getContentText: () => JSON.stringify({ message: 'Invalid Form Body', code: 50035 })
      });

      const res = DiscordService.fetchDiscordApi('/guilds/123/channels', { method: 'post' });

      expect(res.success).toBe(false);
      expect(res.status).toBe(400);
      expect(res.data.code).toBe(50035);
    });

    it('DISCORD_BOT_TOKEN が未設定の場合はリクエストを行わず null を返すこと', () => {
      const originalToken = testContext.DISCORD_BOT_TOKEN;
      testContext.DISCORD_BOT_TOKEN = '';

      let called = false;
      testContext.UrlFetchApp.fetch = () => {
        called = true;
      };

      const res = DiscordService.fetchDiscordApi('/users/@me');
      expect(res).toBeNull();
      expect(called).toBe(false);

      testContext.DISCORD_BOT_TOKEN = originalToken;
    });
  });

  describe('createEventChannel (トピック設定 & チャンネル作成)', () => {
    it('正しいペイロード（サニタイズされたname, topic）でDiscord APIを呼び出し、チャンネルIDを返すこと', () => {
      let requestedUrl = '';
      let requestedOptions = null;
      let firstMessagePayload = null;

      testContext.UrlFetchApp.fetch = (url, options) => {
        if (url.includes('/channels') && !url.includes('/messages')) {
          requestedUrl = url;
          requestedOptions = options;
          return {
            getResponseCode: () => 201,
            getContentText: () => JSON.stringify({ id: '987654321012345678', name: '学マス-初星公演' })
          };
        } else if (url.includes('/messages')) {
          firstMessagePayload = JSON.parse(options.payload);
          return {
            getResponseCode: () => 200,
            getContentText: () => '{}'
          };
        }
        return { getResponseCode: () => 200, getContentText: () => '{}' };
      };

      const eventObj = {
        eventId: 'EV-001',
        brand: '学マス',
        eventName: '初星公演',
        startDate: '2027-03-27',
        endDate: '2027-03-28',
        venue: 'ゼビオアリーナ仙台',
        description: '出演：浅倉 透/樋口円香/福丸 小糸/市川 雛菜'
      };

      const channelId = DiscordService.createEventChannel(eventObj);

      expect(channelId).toBe('987654321012345678');
      expect(requestedUrl).toContain('/guilds/mock-guild-id/channels');

      const payload = JSON.parse(requestedOptions.payload);
      expect(payload.name).toBe('学マス-初星公演');
      expect(payload.type).toBe(0);
      expect(payload.parent_id).toBe('mock-category-id');
      expect(payload.topic).toContain('公演名: 初星公演');
      expect(payload.topic).toContain('開催日時: 2027-03-27 〜 2027-03-28');
      expect(payload.topic).toContain('会場: ゼビオアリーナ仙台');
      expect(payload.topic).toContain('概要: 出演：浅倉 透/樋口円香/福丸 小糸/市川 雛菜');

      // 初回メッセージも送信されたこと
      expect(firstMessagePayload).not.toBeNull();
      expect(firstMessagePayload.embeds[0].title).toBe('🎉 初星公演');
    });

    it('Bot Token または Guild ID が未設定の場合はチャンネル作成をスキップして null を返すこと', () => {
      const originalToken = testContext.DISCORD_BOT_TOKEN;
      testContext.DISCORD_BOT_TOKEN = '';

      const result = DiscordService.createEventChannel({ brand: '学マス', eventName: '初星公演' });
      expect(result).toBeNull();

      testContext.DISCORD_BOT_TOKEN = originalToken;
    });
  });

  describe('sendFirstMessageToChannel (初回Embed投稿)', () => {
    it('正しいEmbedフォーマットで初回メッセージを投稿すること', () => {
      let sentUrl = '';
      let sentPayload = null;

      testContext.UrlFetchApp.fetch = (url, options) => {
        sentUrl = url;
        sentPayload = JSON.parse(options.payload);
        return { getResponseCode: () => 200, getContentText: () => '{}' };
      };

      const eventData = {
        eventId: 'EV-002',
        brand: 'シャニ',
        displayName: '283 Production LIVE',
        dateStr: '2027-04-01 〜 2027-04-02',
        venue: '幕張メッセ',
        description: '特記事項メモ'
      };

      DiscordService.sendFirstMessageToChannel('112233445566778899', eventData);

      expect(sentUrl).toContain('/channels/112233445566778899/messages');
      expect(sentPayload).not.toBeNull();
      const embed = sentPayload.embeds[0];
      expect(embed.title).toBe('🎉 283 Production LIVE');
      expect(embed.footer.text).toBe('Event ID: EV-002');

      const fieldMap = {};
      embed.fields.forEach(f => { fieldMap[f.name] = f.value; });
      expect(fieldMap['公演名']).toBe('283 Production LIVE');
      expect(fieldMap['開催日時']).toBe('2027-04-01 〜 2027-04-02');
      expect(fieldMap['会場']).toBe('幕張メッセ');
      expect(fieldMap['概要']).toBe('特記事項メモ');
    });
  });
});
