/**
 * /calendar 路由处理器
 * 从 CALENDAR_KV 读取预生成的 .ics 文件返回给客户端
 * 支持通过 ?platform= 参数过滤平台
 */

import type { Env } from '../types';
import { ICS_KEY_PREFIX } from '../config';

/**
 * 处理 /calendar 请求
 * @param request HTTP 请求对象
 * @param env Cloudflare Workers 环境变量
 * @returns 包含 .ics 内容的 HTTP 响应
 */
export async function handleCalendar(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const platforms = url.searchParams.getAll('platform');

  try {
    // 无参数时返回全平台 .ics
    if (platforms.length === 0) {
      const icsContent = await env.CALENDAR_KV.get(`${ICS_KEY_PREFIX}all`);

      if (!icsContent) {
        return new Response('日历数据尚未生成，请稍后再试。', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      return new Response(icsContent, {
        headers: buildIcsHeaders('games-zh.ics'),
      });
    }

    // 有参数时合并指定平台的 .ics
    const icsParts: string[] = [];

    for (const platform of platforms) {
      const platformIcs = await env.CALENDAR_KV.get(`${ICS_KEY_PREFIX}${platform}`);
      if (platformIcs) {
        icsParts.push(platformIcs);
      }
    }

    if (icsParts.length === 0) {
      return new Response('未找到指定平台的日历数据。', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // 如果只有一个平台，直接返回
    if (icsParts.length === 1) {
      return new Response(icsParts[0], {
        headers: buildIcsHeaders(`games-zh-${platforms[0]}.ics`),
      });
    }

    // 多个平台：合并 VEVENT 组件
    const mergedIcs = mergeIcsFiles(icsParts, '中文游戏发售日历');
    return new Response(mergedIcs, {
      headers: buildIcsHeaders('games-zh-merged.ics'),
    });
  } catch (error) {
    console.error('[Calendar] 处理请求时发生错误:', error);
    return new Response('服务器内部错误', { status: 500 });
  }
}

/**
 * 构建 ICS 响应的 Headers
 * @param filename 下载文件名
 * @returns Headers 对象
 */
function buildIcsHeaders(filename: string): HeadersInit {
  return {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `inline; filename=${filename}`,
    'Cache-Control': 'public, max-age=3600',
  };
}

/**
 * 合并多个 .ics 文件的内容
 * 保留第一个文件的 VCALENDAR 头部，合并所有 VEVENT
 * @param icsFiles .ics 文件内容数组
 * @returns 合并后的 .ics 内容
 */
function mergeIcsFiles(icsFiles: string[], calendarName?: string): string {
  if (icsFiles.length === 0) return '';
  if (icsFiles.length === 1) return icsFiles[0];

  // 提取第一个文件的 VCALENDAR 头部
  const firstFile = icsFiles[0];
  const headerEnd = firstFile.indexOf('BEGIN:VEVENT');
  const header = headerEnd > 0 ? firstFile.substring(0, headerEnd) : firstFile.split('END:VCALENDAR')[0];

  // 提取所有 VEVENT 块
  const allEvents: string[] = [];
  for (const file of icsFiles) {
    const eventBlocks = extractEventBlocks(file);
    allEvents.push(...eventBlocks);
  }

  // 合并重复事件：同一游戏+同一日期合并为一条，名称后标注平台
  // 例如 "[艾尔登法环] Elden Ring" → "[艾尔登法环] Elden Ring (PS5, Switch, PC)"
  const eventMap = new Map<string, { event: string; platforms: Set<string> }>();

  for (const event of allEvents) {
    const summaryMatch = event.match(/SUMMARY:(.+)/);
    const dtstartMatch = event.match(/DTSTART[^:]*:(.+)/);

    if (summaryMatch && dtstartMatch) {
      const summary = summaryMatch[1].trim();
      const dtstart = dtstartMatch[1].trim();
      const key = `${summary}|${dtstart}`;

      // 从 UID 中提取平台信息（格式：wiki-...@game-calendar-cn-ps5）
      const uidMatch = event.match(/UID:([^\r\n]+)/);
      let platform = '';
      if (uidMatch) {
        const uid = uidMatch[1].trim();
        // 从 UID 末尾提取平台（如 ...@game-calendar-cn-ps5）
        const platMatch = uid.match(/@game-calendar-cn-([a-z0-9_]+)$/);
        if (platMatch) {
          platform = platMatch[1].toUpperCase();
        }
      }

      const existing = eventMap.get(key);
      if (existing) {
        if (platform) existing.platforms.add(platform);
      } else {
        const platforms = new Set<string>();
        if (platform) platforms.add(platform);
        eventMap.set(key, { event, platforms });
      }
    } else {
      // 无法解析的事件直接保留
      const fallbackKey = `__fallback_${allEvents.indexOf(event)}`;
      eventMap.set(fallbackKey, { event, platforms: new Set() });
    }
  }

  // 生成最终事件列表，为多平台事件追加平台标注
  const uniqueEvents: string[] = [];
  for (const { event, platforms } of eventMap.values()) {
    if (platforms.size > 1) {
      // 多平台：在 SUMMARY 后追加平台列表
      const platformList = Array.from(platforms).sort().join(', ');
      const updatedEvent = event.replace(
        /^(SUMMARY:.+)/m,
        (line) => `${line} (${platformList})`,
      );
      uniqueEvents.push(updatedEvent);
    } else {
      uniqueEvents.push(event);
    }
  }

  // 如果指定了日历名称，替换头部中的 X-WR-CALNAME
  let mergedHeader = header;
  if (calendarName) {
    mergedHeader = header.replace(
      /X-WR-CALNAME:.*/,
      `X-WR-CALNAME:${calendarName}`,
    );
  }

  return mergedHeader + uniqueEvents.join('\r\n') + '\r\nEND:VCALENDAR\r\n';
}

/**
 * 从 .ics 内容中提取 VEVENT 块
 * @param icsContent .ics 文件内容
 * @returns VEVENT 块字符串数组（含 BEGIN/END 标记）
 */
function extractEventBlocks(icsContent: string): string[] {
  const blocks: string[] = [];
  const lines = icsContent.split(/\r?\n/);
  let currentBlock: string[] | null = null;

  for (const line of lines) {
    if (line.trim() === 'BEGIN:VEVENT') {
      currentBlock = [line];
    } else if (line.trim() === 'END:VEVENT' && currentBlock) {
      currentBlock.push(line);
      blocks.push(currentBlock.join('\r\n'));
      currentBlock = null;
    } else if (currentBlock) {
      currentBlock.push(line);
    }
  }

  return blocks;
}
