/**
 * Wikipedia wikitext 游戏发售数据解析器
 * 将维基百科的 wikitext 格式解析为 CalendarEvent 数组
 *
 * 目标 wikitext 格式示例：
 * |-
 * | {{dts|January 5}}
 * | ''[[Game Title]]''
 * | WIN, PS5, NS
 * | ...
 *
 * 解析器需要处理：
 * - 日期：{{dts|Month Day}} 格式
 * - 游戏名：''[[Title]]'' 或 ''[[Title|Display Name]]'' 格式
 * - 平台：WIN, PS5, PS4, NS, XBX, XBO 等标识
 */

import type { CalendarEvent } from '../types';

/** 平台标识映射：Wikipedia 标识 → 项目平台标识 */
const PLATFORM_MAP: Record<string, string> = {
  WIN: 'pc',
  PC: 'pc',
  STEAM: 'pc',
  LINUX: 'pc',
  MAC: 'pc',
  PS5: 'ps5',
  PS4: 'ps4',
  PS3: 'ps3',
  NS: 'switch',
  NSW: 'switch',
  NS2: 'switch2',
  NSW2: 'switch2',
  XBX: 'xbox_series',
  XBSX: 'xbox_series',
  XBO: 'xbox_one',
  XONE: 'xbox_one',
  AND: 'mobile',
  IOS: 'mobile',
  MOBI: 'mobile',
};

/**
 * 月份名称到数字的映射
 */
const MONTH_NAME_TO_NUM: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
};

/**
 * 从 {{dts|Month Day}} 模板中提取日期
 * @param text 包含 dts 模板的文本
 * @param year 年份
 * @returns YYYYMMDD 格式日期，或 null
 */
function extractDate(text: string, year: number): string | null {
  // 匹配 {{dts|Month Day}} 或 {{dts|Month Day|...}}
  const match = text.match(/\{\{dts\|(\w+)\s+(\d+)/i);
  if (!match) return null;

  const monthName = match[1].toLowerCase();
  const day = match[2].padStart(2, '0');
  const monthNum = MONTH_NAME_TO_NUM[monthName];

  if (!monthNum) return null;

  return `${year}${monthNum}${day}`;
}

/**
 * 从 ''[[Title]]'' 或 ''[[Title|Display]]'' 中提取游戏名称
 * @param text 包含 wikilink 的文本
 * @returns 游戏名称，或 null
 */
function extractGameName(text: string): string | null {
  // 匹配 ''[[Title]]'' 或 ''[[Title|Display Name]]''
  const match = text.match(/'{2,}\[\[([^\]|]+)(?:\|([^\]]+))?\]\]'{2,}/);
  if (!match) return null;

  // 优先使用 Display Name（管道符后的部分）
  const name = (match[2] ?? match[1]).trim();
  return name || null;
}

/**
 * 从平台标识文本中提取平台列表
 * @param text 平台标识文本（如 "WIN, PS5, NS"）
 * @returns 项目平台标识数组
 */
function extractPlatforms(text: string): string[] {
  const platforms: string[] = [];
  // 分割并清理平台标识
  const tokens = text.split(/[,\s/]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);

  for (const token of tokens) {
    // 移除可能的括号内容（如 "PS5 (digital)" → "PS5"）
    const cleanToken = token.replace(/\(.*\)/, '').trim();
    const mapped = PLATFORM_MAP[cleanToken];
    if (mapped && !platforms.includes(mapped)) {
      platforms.push(mapped);
    }
  }

  return platforms;
}

/**
 * 生成事件 UID
 * @param year 年份
 * @param dateStr YYYYMMDD 格式日期
 * @param gameName 游戏名称
 * @returns UID 字符串
 */
function generateUid(year: number, dateStr: string, gameName: string): string {
  // 将游戏名转为安全的标识符
  const safeName = gameName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);

  return `wiki-${year}-${dateStr}-${safeName}@game-calendar-cn`;
}

/**
 * 解析单行 wikitext 表格行，提取游戏信息
 * @param cells 表格行的单元格内容数组
 * @param year 年份
 * @returns CalendarEvent 数组（一个游戏可能对应多个平台）
 */
function parseTableRow(cells: string[], year: number): CalendarEvent[] {
  // 需要至少 3 列：日期、游戏名、平台
  if (cells.length < 3) return [];

  const dateStr = extractDate(cells[0], year);
  if (!dateStr) return [];

  const gameName = extractGameName(cells[1]);
  if (!gameName) return [];

  // 过滤掉非游戏条目（如 "TBA", "Cancelled" 等）
  const lowerName = gameName.toLowerCase();
  if (lowerName.includes('tba') || lowerName.includes('cancelled')) return [];

  const platforms = extractPlatforms(cells[2]);
  const uid = generateUid(year, dateStr, gameName);

  // 为每个平台创建一个事件
  const events: CalendarEvent[] = [];

  if (platforms.length === 0) {
    // 无平台信息，创建一个通用事件
    events.push({
      uid,
      summary: gameName,
      dtstart: dateStr,
    });
  } else {
    for (const platform of platforms) {
      events.push({
        uid: `${uid}-${platform}`,
        summary: gameName,
        dtstart: dateStr,
        description: `Platform: ${platform}`,
      });
    }
  }

  return events;
}

/**
 * 将 wikitext 内容解析为 CalendarEvent 数组
 * @param wikitext Wikipedia wikitext 内容
 * @param year 年份
 * @returns 解析后的事件数组
 */
export function parseWikitextToEvents(wikitext: string, year: number): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const lines = wikitext.split('\n');

  let currentCells: string[] = [];
  let inTableRow = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // 表格行分隔符：|-
    if (trimmed === '|-' || trimmed.startsWith('|-')) {
      // 处理前一行的数据
      if (currentCells.length >= 3) {
        const rowEvents = parseTableRow(currentCells, year);
        events.push(...rowEvents);
      }
      currentCells = [];
      inTableRow = true;
      continue;
    }

    // 表格单元格：| content 或 ! content（表头）
    if (trimmed.startsWith('|') && !trimmed.startsWith('||')) {
      const cellContent = trimmed.substring(1).trim();

      // 跳过表格样式行（如 | class="..." | ）
      if (cellContent.includes('class=') || cellContent.includes('style=')) {
        continue;
      }

      // 跳过表头行（以 ! 开头的行在前面已过滤）
      if (cellContent.startsWith('!')) continue;

      // 跳过空单元格
      if (!cellContent || cellContent === '&nbsp;') continue;

      currentCells.push(cellContent);
    }
  }

  // 处理最后一行
  if (currentCells.length >= 3) {
    const rowEvents = parseTableRow(currentCells, year);
    events.push(...rowEvents);
  }

  console.log(`[WikiParser] 解析完成: 共 ${events.length} 个事件（${year} 年）`);
  return events;
}

/**
 * 从 CalendarEvent 数组中提取所有唯一的游戏名称
 * @param events 事件数组
 * @returns 去重后的游戏名称数组
 */
export function extractUniqueGameNamesFromEvents(events: CalendarEvent[]): string[] {
  const names = new Set<string>();
  for (const event of events) {
    if (event.summary) {
      names.add(event.summary);
    }
  }
  return Array.from(names);
}

export { PLATFORM_MAP };
