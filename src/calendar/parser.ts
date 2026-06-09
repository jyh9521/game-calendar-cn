/**
 * 轻量 ICS 解析器
 * 自研实现，不依赖外部库
 * 支持解析 VEVENT 组件，提取 UID、SUMMARY、DTSTART、DTEND、DESCRIPTION
 * 处理 ICS 的行折叠（line folding）和转义字符
 */

import type { CalendarEvent } from '../types';

/**
 * 处理 ICS 行折叠（RFC 5545 §3.1）
 * 折叠规则：长行在 CRLF 后紧跟一个空格或制表符
 * @param content 原始 ICS 内容
 * @returns 展开后的行数组
 */
function unfoldLines(content: string): string[] {
  // 将 CRLF 和 LF 统一为 LF，然后展开折叠行
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // 展开折叠：以空格或 TAB 开头的行是前一行的延续
  const unfolded = normalized.replace(/\n[ \t]/g, '');
  return unfolded.split('\n');
}

/**
 * 反转义 ICS 文本中的特殊字符（RFC 5545 §3.3.11）
 * \\ → \
 * \; → ;
 * \, → ,
 * \N → \n（换行）
 * @param text 已转义的 ICS 文本
 * @returns 反转义后的文本
 */
function unescapeIcs(text: string): string {
  // RFC 5545 §3.3.11 仅定义以下转义序列
  return text
    .replace(/\\\\/g, '\\')
    .replace(/\\;/g, ';')
    .replace(/\\,/g, ',')
    .replace(/\\[Nn]/g, '\n');
}

/**
 * 解析 ICS 属性行
 * 格式：PROPERTYNAME;PARAMS:VALUE
 * @param line 单行 ICS 内容
 * @returns { name, value } 或 null
 */
function parseProperty(line: string): { name: string; value: string } | null {
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) return null;

  const namePart = line.substring(0, colonIndex);
  const value = line.substring(colonIndex + 1);

  // 属性名可能包含参数（如 DTSTART;VALUE=DATE:20240101），取分号前的部分
  const name = namePart.split(';')[0].trim().toUpperCase();

  return { name, value };
}

/**
 * 从 ICS 文本中提取所有 VEVENT 块
 * @param content ICS 文件内容
 * @returns VEVENT 块的行内容数组
 */
function extractVEventBlocks(content: string): string[][] {
  const lines = unfoldLines(content);
  const blocks: string[][] = [];
  let currentBlock: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      currentBlock = [];
    } else if (trimmed === 'END:VEVENT') {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
    } else if (currentBlock !== null) {
      currentBlock.push(trimmed);
    }
  }

  return blocks;
}

/**
 * 解析单个 VEVENT 块为 CalendarEvent 对象
 * @param block VEVENT 块的行内容
 * @returns CalendarEvent 对象
 */
function parseVEventBlock(block: string[]): CalendarEvent | null {
  let uid = '';
  let summary = '';
  let dtstart = '';
  let dtend: string | undefined;
  let description: string | undefined;

  for (const line of block) {
    const prop = parseProperty(line);
    if (!prop) continue;

    switch (prop.name) {
      case 'UID':
        uid = prop.value.trim();
        break;
      case 'SUMMARY':
        summary = unescapeIcs(prop.value.trim());
        break;
      case 'DTSTART':
        dtstart = prop.value.trim();
        break;
      case 'DTEND':
        dtend = prop.value.trim();
        break;
      case 'DESCRIPTION':
        description = unescapeIcs(prop.value.trim());
        break;
    }
  }

  // UID 和 SUMMARY 是必需字段
  if (!uid || !summary || !dtstart) {
    return null;
  }

  return { uid, summary, dtstart, dtend, description };
}

/**
 * 解析 ICS 内容为 CalendarEvent 数组
 * @param content ICS 文件的文本内容
 * @returns 解析后的事件数组
 */
export function parseIcs(content: string): CalendarEvent[] {
  const blocks = extractVEventBlocks(content);
  const events: CalendarEvent[] = [];

  for (const block of blocks) {
    const event = parseVEventBlock(block);
    if (event) {
      events.push(event);
    }
  }

  console.log(`[Parser] 解析完成: 共 ${events.length} 个事件（${blocks.length} 个 VEVENT 块）`);
  return events;
}

/**
 * 从事件列表中提取去重的游戏名称
 * @param events 事件列表
 * @returns 去重后的游戏名称数组
 */
export function extractUniqueGameNames(events: CalendarEvent[]): string[] {
  const names = new Set<string>();
  for (const event of events) {
    const name = event.summary.trim();
    if (name) {
      names.add(name);
    }
  }
  return Array.from(names);
}
