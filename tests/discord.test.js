import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let DiscordService;

beforeAll(() => {
  const context = {
    REGISTRATION_FORM_URL: 'https://forms.gle/VcErZhtVcUHtL6ET8',
    WEBAPP_URL: 'https://ticket.example.com',
    WEBHOOK_APPLY: 'https://discord.com/api/webhooks/test-apply',
    WEBHOOK_PAYMENT: 'https://discord.com/api/webhooks/test-payment',
    WEBHOOK_CALENDAR: 'https://discord.com/api/webhooks/test-calendar',
    PROXY_BASE_URL: '',
    Logger: {
      log: () => {}
    },
    console: console,
    String: String
  };

  const discordJsPath = path.resolve(__dirname, '../spreadsheet/Discord操作.js');
  const discordJsContent = fs.readFileSync(discordJsPath, 'utf8');

  vm.createContext(context);
  DiscordService = vm.runInContext(`${discordJsContent};\nDiscordService;`, context);
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
  });
});
