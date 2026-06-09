/**
 * 中文 ICS 生成器
 * 将翻译后的事件列表生成符合 RFC 5545 标准的 .ics 文件
 */

import type { CalendarEvent } from '../types';
import { PROD_ID, CALENDAR_VERSION, CALENDAR_NAME, CALENDAR_DESCRIPTION } from '../config';

/**
 * 转义 ICS 文本中的特殊字符（RFC 5545 §3.3.11）
 * @param text 原始文本
 * @returns 转义后的文本
 */
function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

/**
 * 折叠长行（RFC 5545 §3.1）
 * 每行不超过 75 个八位字节，超过则在 CRLF 后加空格续行
 * @param line 单行内容
 * @returns 折叠后的行
 */
function foldLine(line: string): string {
  // RFC 5545 §3.1：每行不超过 75 个八位字节（octets）
  // 需要按 UTF-8 字节长度计数，而非字符数
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);

  if (bytes.length <= 75) {
    return line;
  }

  const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: false });
  const parts: string[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    // 找到不超过 75 字节的切分点（不能切断多字节字符）
    let end = Math.min(offset + 75, bytes.length);
    // 回退到有效的 UTF-8 字符边界：如果切在多字节序列中间，往前回退
    while (end > offset && (bytes[end] & 0xC0) === 0x80) {
      end--;
    }
    parts.push(decoder.decode(bytes.subarray(offset, end)));
    offset = end;
  }

  return parts.join('\r\n ');
}

/**
 * 格式化日期为 ICS 格式
 * @param dateStr 日期字符串（支持 ISO 8601 或 ICS DATE 格式）
 * @returns ICS 格式的日期字符串
 */
function formatDateForIcs(dateStr: string): string {
  // 如果已经是 YYYYMMDD 格式，直接返回
  if (/^\d{8}$/.test(dateStr)) {
    return dateStr;
  }

  // 处理 ICS datetime 格式：YYYYMMDDTHHmmss[Z]（RFC 5545 §3.3.5）
  // 提取日期部分即可（因为生成器使用 VALUE=DATE 全天事件）
  const icsDatetimeMatch = dateStr.match(/^(\d{4})(\d{2})(\d{2})T\d{6}Z?$/);
  if (icsDatetimeMatch) {
    return `${icsDatetimeMatch[1]}${icsDatetimeMatch[2]}${icsDatetimeMatch[3]}`;
  }

  // 尝试解析 ISO 8601 日期（如 2024-01-01 或 2024-01-01T00:00:00Z）
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    // 无法解析，原样返回
    return dateStr;
  }

  // 格式化为 YYYYMMDD
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * 生成 .ics 文件内容
 * @param events 事件列表（应包含翻译后的 summary）
 * @param calendarName 日历名称（可选，默认使用配置中的名称）
 * @returns 符合 RFC 5545 标准的 .ics 文本
 */
export function generateIcs(events: CalendarEvent[], calendarName?: string): string {
  const lines: string[] = [];

  // VCALENDAR 头部
  lines.push('BEGIN:VCALENDAR');
  lines.push(foldLine(`PRODID:${PROD_ID}`));
  lines.push(`VERSION:${CALENDAR_VERSION}`);
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(foldLine(`X-WR-CALNAME:${escapeIcs(calendarName || CALENDAR_NAME)}`));
  lines.push(foldLine(`X-WR-CALDESC:${escapeIcs(CALENDAR_DESCRIPTION)}`));

  // DTSTAMP 时间戳（所有事件共用同一个生成时间）
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  // VEVENT 组件
  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(foldLine(`UID:${event.uid}`));
    lines.push(foldLine(`DTSTAMP:${stamp}`));
    lines.push(foldLine(`DTSTART;VALUE=DATE:${formatDateForIcs(event.dtstart)}`));

    if (event.dtend) {
      lines.push(foldLine(`DTEND;VALUE=DATE:${formatDateForIcs(event.dtend)}`));
    }

    lines.push(foldLine(`SUMMARY:${escapeIcs(event.summary)}`));

    if (event.description) {
      lines.push(foldLine(`DESCRIPTION:${escapeIcs(event.description)}`));
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  // ICS 规范要求每行以 CRLF 结尾
  return lines.join('\r\n') + '\r\n';
}

/**
 * 为指定平台生成日历内容
 * @param events 该平台的事件列表
 * @param platform 平台标识
 * @returns .ics 文本
 */
export function generatePlatformIcs(events: CalendarEvent[], platform: string): string {
  const name = `${CALENDAR_NAME} — ${platform.toUpperCase()}`;
  return generateIcs(events, name);
}
