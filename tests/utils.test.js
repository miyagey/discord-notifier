import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let formatDateJST;
let formatDateRange;
let formatBrandEventTitle;
let formatEventTimeRange;
let calculateEventStatus;
let calculateApplicationStatus;

beforeAll(() => {
  const context = {
    Logger: {
      log: () => {}
    },
    console: console,
    Date: Date,
    String: String,
    isNaN: isNaN,
    Utilities: {
      formatDate(date, timeZone, formatStr) {
        if (!date || isNaN(new Date(date).getTime())) return '';
        const d = new Date(date);
        const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
        const jstOffset = 9 * 60 * 60000;
        const jstDate = new Date(utc + jstOffset);

        const year = jstDate.getFullYear();
        const month = String(jstDate.getMonth() + 1).padStart(2, '0');
        const day = String(jstDate.getDate()).padStart(2, '0');
        const hours = String(jstDate.getHours()).padStart(2, '0');
        const minutes = String(jstDate.getMinutes()).padStart(2, '0');
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        const dayOfWeek = days[jstDate.getDay()];

        return formatStr
          .replace(/yyyy/g, String(year))
          .replace(/MM/g, month)
          .replace(/dd/g, day)
          .replace(/HH/g, hours)
          .replace(/mm/g, minutes)
          .replace(/E/g, dayOfWeek);
      }
    }
  };

  const commonJsPath = path.resolve(__dirname, '../spreadsheet/共通関数.js');
  const commonJsContent = fs.readFileSync(commonJsPath, 'utf8');

  vm.createContext(context);
  vm.runInContext(commonJsContent, context);

  formatDateJST = context.formatDateJST;
  formatDateRange = context.formatDateRange;
  formatBrandEventTitle = context.formatBrandEventTitle;
  formatEventTimeRange = context.formatEventTimeRange;
  calculateEventStatus = context.calculateEventStatus;
  calculateApplicationStatus = context.calculateApplicationStatus;
});

describe('共通関数.js (ユーティリティ・フォーマッター) の単体テスト', () => {
  describe('formatDateJST', () => {
    it('有効な Date オブジェクトが yyyy-MM-dd 形式に変換されること', () => {
      const inputDate = new Date('2026-11-07T00:00:00Z');
      const result = formatDateJST(inputDate, 'yyyy-MM-dd');
      expect(result).toBe('2026-11-07');
    });

    it('日付文字列から HH:mm 形式に正しくフォーマットされること', () => {
      const inputDate = new Date('2026-11-07T12:30:00Z'); // 21:30 JST
      const result = formatDateJST(inputDate, 'HH:mm');
      expect(result).toBe('21:30');
    });

    it('null または不正な日付の場合は空文字が返ること', () => {
      expect(formatDateJST(null, 'yyyy-MM-dd')).toBe('');
      expect(formatDateJST('invalid-date', 'yyyy-MM-dd')).toBe('');
    });
  });

  describe('formatBrandEventTitle', () => {
    it('ブランド名とイベント名がある場合、プレフィックスが付与されること', () => {
      const result = formatBrandEventTitle('シャニ', 'LIVE TOUR');
      expect(result).toBe('【シャニ】LIVE TOUR');
    });

    it('ブランド名が空の場合はイベント名のみ返却すること', () => {
      const result = formatBrandEventTitle('', 'LIVE TOUR');
      expect(result).toBe('LIVE TOUR');
    });

    it('イベント名に既に【】が含まれる場合、二重付与しないこと', () => {
      const result = formatBrandEventTitle('シャニ', '【シャニ】LIVE TOUR');
      expect(result).toBe('【シャニ】LIVE TOUR');
    });

    it('イベント名が未指定でブランド名のみの場合、ブランド括弧を返すこと', () => {
      expect(formatBrandEventTitle('デレ', '')).toBe('【デレ】');
      expect(formatBrandEventTitle('デレ', null)).toBe('【デレ】');
    });

    it('両方空の場合は空文字を返すこと', () => {
      expect(formatBrandEventTitle('', '')).toBe('');
    });
  });

  describe('formatDateRange', () => {
    it('開始日と終了日が異なる場合、YYYY-MM-DD 〜 YYYY-MM-DD 形式で返却すること', () => {
      const result = formatDateRange('2026-11-07', '2026-11-08');
      expect(result).toBe('2026-11-07 〜 2026-11-08');
    });

    it('開始日と終了日が同日の場合、単一の日付を返却すること', () => {
      const result = formatDateRange('2026-11-07', '2026-11-07');
      expect(result).toBe('2026-11-07');
    });

    it('終了日が省略またはnullの場合、単一の開始日を返却すること', () => {
      expect(formatDateRange('2026-11-07', null)).toBe('2026-11-07');
      expect(formatDateRange('2026-11-07')).toBe('2026-11-07');
    });

    it('Date オブジェクトが渡された場合も正しくフォーマットされること', () => {
      const start = new Date('2026-11-07T00:00:00Z');
      const end = new Date('2026-11-08T00:00:00Z');
      expect(formatDateRange(start, end)).toBe('2026-11-07 〜 2026-11-08');
    });

    it('開始日が存在しないまたは不正な場合は空文字を返却すること', () => {
      expect(formatDateRange(null, '2026-11-08')).toBe('');
      expect(formatDateRange('', '')).toBe('');
      expect(formatDateRange('invalid-date', '2026-11-08')).toBe('');
    });
  });

  describe('formatEventTimeRange', () => {
    it('isAllDay が true で単日の場合、"[終日]" を返却すること', () => {
      const event = {
        isAllDay: true,
        startTime: new Date('2026-11-07T00:00:00+09:00'),
        endTime: new Date('2026-11-08T00:00:00+09:00')
      };
      expect(formatEventTimeRange(event)).toBe('[終日]');
    });

    it('isAllDay が true で連日の場合、"MM/dd 〜 MM/dd [連日終日]" を返却すること', () => {
      const event = {
        isAllDay: true,
        startTime: new Date('2026-11-07T00:00:00+09:00'),
        endTime: new Date('2026-11-09T00:00:00+09:00')
      };
      expect(formatEventTimeRange(event)).toBe('11/07 〜 11/08 [連日終日]');
    });

    it('時間指定イベントの場合、"HH:mm 〜 HH:mm" を返却すること', () => {
      const event = {
        isAllDay: false,
        startTime: new Date('2026-11-07T18:00:00+09:00'),
        endTime: new Date('2026-11-07T20:30:00+09:00')
      };
      expect(formatEventTimeRange(event)).toBe('18:00 〜 20:30');
    });

    it('timeStr が既に存在する場合は優先して返却すること', () => {
      expect(formatEventTimeRange({ timeStr: 'カスタム時間' })).toBe('カスタム時間');
    });

    it('event が未指定の場合は空文字を返却すること', () => {
      expect(formatEventTimeRange(null)).toBe('');
    });
  });

  describe('calculateEventStatus', () => {
    it('未来の日付の場合は「開催前」を返すこと', () => {
      const futureStart = new Date(Date.now() + 86400000 * 10);
      const futureEnd = new Date(Date.now() + 86400000 * 12);
      expect(calculateEventStatus(futureStart, futureEnd)).toBe('開催前');
    });

    it('過去の日付の場合は「開催終了」を返すこと', () => {
      const pastStart = new Date(Date.now() - 86400000 * 10);
      const pastEnd = new Date(Date.now() - 86400000 * 5);
      expect(calculateEventStatus(pastStart, pastEnd)).toBe('開催終了');
    });
  });

  describe('calculateApplicationStatus', () => {
    it('現在が申込開始前の場合は「開始前」を返すこと', () => {
      const futureStart = new Date(Date.now() + 86400000 * 2);
      const futureEnd = new Date(Date.now() + 86400000 * 5);
      expect(calculateApplicationStatus(futureStart, futureEnd)).toBe('開始前');
    });

    it('現在が受付期間中の場合は「受付期間」を返すこと', () => {
      const pastStart = new Date(Date.now() - 86400000 * 2);
      const futureEnd = new Date(Date.now() + 86400000 * 2);
      expect(calculateApplicationStatus(pastStart, futureEnd)).toBe('受付期間');
    });
  });
});
