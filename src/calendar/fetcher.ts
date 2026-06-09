/**
 * 上游 .ics 数据源抓取器
 * 使用 Workers 原生 fetch 获取上游 .ics 文件内容
 */

import type { CalendarSource } from '../types';

/** 抓取超时时间（毫秒） */
const FETCH_TIMEOUT_MS = 15_000;

/**
 * 抓取单个上游 .ics 数据源
 * @param source 数据源配置
 * @returns .ics 文件的文本内容
 * @throws 抓取失败或超时时抛出错误
 */
export async function fetchIcsSource(source: CalendarSource): Promise<string> {
  console.log(`[Fetcher] 开始抓取: ${source.name} (${source.url})`);

  // 使用 AbortController 实现超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(source.url, {
      method: 'GET',
      headers: {
        'User-Agent': 'game-calendar-cn/1.0',
        'Accept': 'text/calendar, text/plain, */*',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `[Fetcher] HTTP ${response.status}: ${response.statusText} — ${source.url}`
      );
    }

    const content = await response.text();

    if (!content || content.trim().length === 0) {
      throw new Error(`[Fetcher] 数据源返回空内容: ${source.url}`);
    }

    // 基本校验：内容应包含 VCALENDAR 标记
    if (!content.includes('BEGIN:VCALENDAR')) {
      throw new Error(`[Fetcher] 返回内容不是有效的 ICS 格式: ${source.url}`);
    }

    console.log(`[Fetcher] 抓取成功: ${source.name}，内容大小 ${content.length} 字符`);
    return content;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`[Fetcher] 抓取超时（${FETCH_TIMEOUT_MS}ms）: ${source.url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 并发抓取多个数据源
 * @param sources 数据源列表
 * @returns 成功抓取的结果 Map（source.name → 内容），失败的源会被跳过并记录日志
 */
export async function fetchAllSources(
  sources: CalendarSource[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  // 使用 Promise.allSettled 确保单个源失败不影响其他源
  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      const content = await fetchIcsSource(source);
      return { name: source.name, content };
    })
  );

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results.set(result.value.name, result.value.content);
    } else {
      console.error(`[Fetcher] 抓取失败:`, result.reason);
    }
  }

  console.log(
    `[Fetcher] 全部抓取完成: 成功 ${results.size}/${sources.length}`
  );
  return results;
}
