/**
 * Wikipedia 游戏发售日数据抓取器
 * 从英文维基百科的年度游戏发售列表页面获取 wikitext 内容
 *
 * 数据源页面格式：List_of_video_games_released_in_{year}
 * 例如：https://en.wikipedia.org/wiki/List_of_video_games_released_in_2026
 */

import { WIKIPEDIA_API_ENDPOINT } from '../config';
import type { Env } from '../types';

/** 抓取超时时间（毫秒） */
const FETCH_TIMEOUT_MS = 15_000;

/** 月份名称到数字的映射 */
const MONTH_MAP: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
};

/**
 * Wikipedia API 分区信息
 */
interface WikiSection {
  index: string;
  line: string;
  number: string;
  level: string;
}

/**
 * 获取 Wikipedia 页面的分区列表
 * @param pageTitle 页面标题
 * @param userAgent User-Agent 字符串
 * @returns 分区列表
 */
async function fetchSections(pageTitle: string, userAgent: string): Promise<WikiSection[]> {
  const params = new URLSearchParams({
    action: 'parse',
    page: pageTitle,
    prop: 'sections',
    format: 'json',
  });

  const url = `${WIKIPEDIA_API_ENDPOINT}?${params.toString()}`;
  console.log(`[WikiFetcher] 获取分区列表: ${pageTitle}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`[WikiFetcher] HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as {
      parse?: { sections?: WikiSection[] };
      error?: { code: string; info: string };
    };

    if (data.error) {
      throw new Error(`[WikiFetcher] API 错误: ${data.error.info}`);
    }

    const sections = data.parse?.sections ?? [];
    console.log(`[WikiFetcher] 获取到 ${sections.length} 个分区`);
    return sections;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 获取指定分区的 wikitext 内容
 * @param pageTitle 页面标题
 * @param sectionIndex 分区索引
 * @param userAgent User-Agent 字符串
 * @returns wikitext 内容
 */
async function fetchSectionWikitext(
  pageTitle: string,
  sectionIndex: string,
  userAgent: string,
): Promise<string> {
  const params = new URLSearchParams({
    action: 'parse',
    page: pageTitle,
    prop: 'wikitext',
    section: sectionIndex,
    format: 'json',
  });

  const url = `${WIKIPEDIA_API_ENDPOINT}?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`[WikiFetcher] HTTP ${response.status} 获取分区 ${sectionIndex}`);
    }

    const data = await response.json() as {
      parse?: { wikitext?: { '*'?: string } };
      error?: { code: string; info: string };
    };

    if (data.error) {
      throw new Error(`[WikiFetcher] API 错误: ${data.error.info}`);
    }

    return data.parse?.wikitext?.['*'] ?? '';
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 判断分区标题是否为月份名称（如 "January", "February" 等）
 * @param sectionTitle 分区标题
 * @returns 是否为月份
 */
function isMonthSection(sectionTitle: string): boolean {
  const normalized = sectionTitle.trim().toLowerCase();
  return Object.keys(MONTH_MAP).includes(normalized);
}

/**
 * 获取指定月份对应的 section index 列表
 * 维基百科的分区结构通常是：
 * - Section 0: 主体内容（跳过）
 * - Section 1-4: 非游戏数据（如 "See also", "References" 等，或 Jan-Mar 等季度分区）
 * - 每个季度分区可能包含月份子分区
 *
 * @param sections 分区列表
 * @returns 月份分区索引数组 { month: string, index: string }[]
 */
function extractMonthSections(sections: WikiSection[]): Array<{ month: string; index: string }> {
  const result: Array<{ month: string; index: string }> = [];

  for (const section of sections) {
    // 检查是否为月份分区（level 2 或 3）
    if (isMonthSection(section.line)) {
      const monthNum = MONTH_MAP[section.line.trim().toLowerCase()];
      if (monthNum) {
        result.push({ month: monthNum, index: section.index });
      }
    }
  }

  return result;
}

/**
 * 抓取指定年份的游戏发售日数据
 * 从 Wikipedia 的 "List_of_video_games_released_in_{year}" 页面获取所有月份的 wikitext
 *
 * @param year 年份
 * @param env 环境变量（用于获取 User-Agent）
 * @returns 按月份分组的 wikitext 内容 Map（月份数字 → wikitext）
 */
export async function fetchWikipediaGameReleases(
  year: number,
  env: Env,
): Promise<Map<string, string>> {
  const pageTitle = `List_of_video_games_released_in_${year}`;
  const userAgent = env.WIKIPEDIA_USER_AGENT || 'game-calendar-cn/1.0';

  console.log(`[WikiFetcher] 开始抓取 ${year} 年游戏发售数据: ${pageTitle}`);

  // 获取页面分区列表
  const sections = await fetchSections(pageTitle, userAgent);

  if (sections.length === 0) {
    console.warn(`[WikiFetcher] 页面 ${pageTitle} 没有找到任何分区`);
    return new Map();
  }

  // 提取月份分区
  const monthSections = extractMonthSections(sections);

  if (monthSections.length === 0) {
    // 如果没有找到月份分区，尝试直接获取整个页面
    console.warn(`[WikiFetcher] 未找到月份分区，尝试获取完整页面`);
    const fullWikitext = await fetchSectionWikitext(pageTitle, '0', userAgent);
    if (fullWikitext) {
      // 将完整内容作为 "00" 返回，由解析器处理
      return new Map([['00', fullWikitext]]);
    }
    return new Map();
  }

  console.log(
    `[WikiFetcher] 找到 ${monthSections.length} 个月份分区: ${monthSections.map((m) => m.month).join(', ')}`,
  );

  // 并发获取各月份的 wikitext
  const results = new Map<string, string>();
  const settled = await Promise.allSettled(
    monthSections.map(async ({ month, index }) => {
      const wikitext = await fetchSectionWikitext(pageTitle, index, userAgent);
      return { month, wikitext };
    }),
  );

  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value.wikitext) {
      results.set(result.value.month, result.value.wikitext);
    } else if (result.status === 'rejected') {
      console.error(`[WikiFetcher] 获取月份数据失败:`, result.reason);
    }
  }

  console.log(`[WikiFetcher] 抓取完成: 成功获取 ${results.size} 个月份的数据`);
  return results;
}

export { MONTH_MAP };
