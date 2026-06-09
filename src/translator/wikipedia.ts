/**
 * 第二层翻译：Wikipedia MediaWiki API
 * 通过英文 Wikipedia 查询游戏条目的中文 langlink
 * 策略：先查 zh-hans（简体），未命中的再查 zh（繁体）并简繁转换
 * 支持批量查询（每批最多 50 个标题）
 */

import { WIKIPEDIA_API_ENDPOINT, WIKIPEDIA_BATCH_SIZE, WIKIPEDIA_BATCH_DELAY_MS } from '../config';
import { traditionalToSimplified } from './t2s';

/**
 * 从单个 langlink 中提取原始中文标题
 */
function extractRawTitle(link: any): string | null {
  const raw = link['*'] ?? link.title;
  return (raw && typeof raw === 'string') ? raw : null;
}

/**
 * 清洗中文标题：去除消歧义后缀
 */
function cleanTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\s*\(游戏\)$/, '')
    .replace(/\s*\(电子游戏\)$/, '')
    .replace(/\s*\(游戏系列\)$/, '')
    .replace(/\s*\(系列\)$/, '')
    .replace(/\s*\(电子游戏机\)$/, '')
    .trim();
}

/**
 * 解析 MediaWiki API 响应，提取中文标题
 * @param data API 响应数据
 * @param needT2S 是否需要繁简转换（当 lllang=zh 时为 true）
 * @returns 英文标题 → 中文标题的映射
 */
function parseWikiResponse(data: any, needT2S: boolean): Map<string, string> {
  const results = new Map<string, string>();
  const pages = data?.query?.pages;

  if (!pages) return results;

  for (const page of Object.values(pages) as any[]) {
    const title: string = page.title;
    const langlinks = page.langlinks;

    if (!langlinks || !Array.isArray(langlinks)) continue;

    // 查找中文链接（可能有多个变体）
    const zhLink = langlinks.find((l: any) =>
      l.lang === 'zh-hans' || l.lang === 'zh-cn' || l.lang === 'zh'
    );
    if (!zhLink) continue;

    const rawTitle = extractRawTitle(zhLink);
    if (!rawTitle) continue;

    let zhTitle = cleanTitle(rawTitle);

    // 如果来源是繁体（zh），进行简繁转换
    if (needT2S && zhLink.lang === 'zh') {
      zhTitle = traditionalToSimplified(zhTitle);
    }

    if (zhTitle) {
      results.set(title, zhTitle);
    }
  }

  return results;
}

/**
 * 批量查询 Wikipedia 中文 langlink
 * 两步策略：
 * 1. 先查 zh-hans（简体中文）
 * 2. 未命中的再查 zh（繁体中文）并简繁转换
 *
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

  // 查询中文 Wikipedia (zh) 并自动简繁转换
  // zh-hans 在大部分页面不可用，因此直接查 zh + T2S 转换
  for (let i = 0; i < names.length; i += WIKIPEDIA_BATCH_SIZE) {
    const batch = names.slice(i, i + WIKIPEDIA_BATCH_SIZE);

    try {
      const batchResults = await queryWikipediaBatch(batch, userAgent, 'zh', true);
      for (const [key, value] of batchResults) {
        allResults.set(key, value);
      }
    } catch (error) {
      console.error(`[Wikipedia] 批次查询失败 (batch ${Math.floor(i / WIKIPEDIA_BATCH_SIZE)}):`, error);
    }

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
 * @param lang 语言代码（zh-hans 或 zh）
 * @param needT2S 是否需要繁简转换
 * @returns 英文标题 → 中文标题的映射
 */
async function queryWikipediaBatch(
  names: string[],
  userAgent: string,
  lang: string,
  needT2S: boolean
): Promise<Map<string, string>> {
  const titles = names.join('|');

  const url = new URL(WIKIPEDIA_API_ENDPOINT);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', titles);
  url.searchParams.set('prop', 'langlinks');
  url.searchParams.set('lllang', lang);
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
  return parseWikiResponse(data, needT2S);
}

