/**
 * 第二层翻译：Wikipedia MediaWiki API
 * 通过英文 Wikipedia 查询游戏条目的中文 langlink
 * 支持批量查询（每批最多 50 个标题）
 */

import { WIKIPEDIA_API_ENDPOINT, WIKIPEDIA_BATCH_SIZE, WIKIPEDIA_BATCH_DELAY_MS } from '../config';

/**
 * 解析 MediaWiki API 响应，提取中文标题
 * @param data API 响应数据
 * @returns 英文标题 → 中文标题的映射
 */
function parseWikiResponse(data: any): Map<string, string> {
  const results = new Map<string, string>();
  const pages = data?.query?.pages;

  if (!pages) return results;

  for (const page of Object.values(pages) as any[]) {
    const title: string = page.title;
    const langlinks = page.langlinks;

    if (!langlinks || !Array.isArray(langlinks)) continue;

    // 查找中文链接
    const zhLink = langlinks.find((l: any) => l.lang === 'zh');
    if (!zhLink) continue;

    // 清洗中文标题：去除消歧义后缀
    // formatversion=2 使用 `title` 字段，旧版使用 `*` 字段
    const rawTitle = zhLink['*'] ?? zhLink.title;
    if (!rawTitle || typeof rawTitle !== 'string') continue;

    let zhTitle: string = rawTitle
      .replace(/\s*\(游戏\)$/, '')
      .replace(/\s*\(电子游戏\)$/, '')
      .replace(/\s*\(游戏系列\)$/, '')
      .replace(/\s*\(系列\)$/, '')
      .trim();

    if (zhTitle) {
      results.set(title, zhTitle);
    }
  }

  return results;
}

/**
 * 批量查询 Wikipedia 中文 langlink
 * @param names 英文游戏名列表
 * @param userAgent Wikipedia API 要求的 User-Agent
 * @returns 英文名 → 中文名的映射
 */
export async function queryWikipedia(
  names: string[],
  userAgent: string
): Promise<Map<string, string>> {
  const allResults = new Map<string, string>();

  if (names.length === 0) return allResults;

  // 按批次处理
  for (let i = 0; i < names.length; i += WIKIPEDIA_BATCH_SIZE) {
    const batch = names.slice(i, i + WIKIPEDIA_BATCH_SIZE);

    try {
      const batchResults = await queryWikipediaBatch(batch, userAgent);
      for (const [key, value] of batchResults) {
        allResults.set(key, value);
      }
    } catch (error) {
      console.error(`[Wikipedia] 批次查询失败 (batch ${Math.floor(i / WIKIPEDIA_BATCH_SIZE)}):`, error);
    }

    // 批次间延迟（避免触发速率限制）
    if (i + WIKIPEDIA_BATCH_SIZE < names.length) {
      await new Promise((resolve) => setTimeout(resolve, WIKIPEDIA_BATCH_DELAY_MS));
    }
  }

  console.log(`[Wikipedia] 查询完成: ${allResults.size}/${names.length} 命中`);
  return allResults;
}

/**
 * 查询单批次 Wikipedia 中文 langlink
 * @param names 一批英文标题（最多 50 个）
 * @param userAgent User-Agent 头
 * @returns 英文标题 → 中文标题的映射
 */
async function queryWikipediaBatch(
  names: string[],
  userAgent: string
): Promise<Map<string, string>> {
  // MediaWiki API 支持用 | 分隔多个标题（最多 50 个）
  const titles = names.join('|');

  const url = new URL(WIKIPEDIA_API_ENDPOINT);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', titles);
  url.searchParams.set('prop', 'langlinks');
  url.searchParams.set('lllang', 'zh');
  url.searchParams.set('format', 'json');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('formatversion', '2');

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': userAgent,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`[Wikipedia] HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json() as any;
  return parseWikiResponse(data);
}
