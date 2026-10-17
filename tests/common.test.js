import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let formatDateJST;
let formatDateRange;
let formatBrandEventTitle;

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
  formatDateRange = context.formatDateRange;
  formatBrandEventTitle = context.formatBrandEventTitle;
});

describe('共通関数.js (ユーティリティ・フォーマッター) の単体テスト', () => {
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
});
