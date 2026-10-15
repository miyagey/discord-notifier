import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let formatDateJST;
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

        return formatStr
          .replace(/yyyy/g, String(year))
          .replace(/MM/g, month)
          .replace(/dd/g, day)
          .replace(/HH/g, hours)
          .replace(/mm/g, minutes);
      }
    }
  };

  const commonJsPath = path.resolve(__dirname, '../spreadsheet/共通関数.js');
  const commonJsContent = fs.readFileSync(commonJsPath, 'utf8');

  vm.createContext(context);
  vm.runInContext(commonJsContent, context);

  formatDateJST = context.formatDateJST;
  calculateEventStatus = context.calculateEventStatus;
  calculateApplicationStatus = context.calculateApplicationStatus;
});

describe('共通関数.js の単体テスト', () => {
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
