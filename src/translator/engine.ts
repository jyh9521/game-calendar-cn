/**
 * 翻译引擎调度器
 * 实现四层短路翻译逻辑：缓存 → 本地词库 → Wikipedia → DeepSeek
 * 批量处理，减少 API 调用次数
 * 每层独立 try-catch，确保单层失败不影响后续层
 */

import type { TranslationResult, Env } from '../types';
import { getCachedTranslations, setTranslations } from './cache';
import { batchLookupLocalDict } from './local-dict';
import { queryWikipedia } from './wikipedia';
import { translateWithDeepSeek } from './deepseek';

/**
 * 批量翻译游戏名称
 * 四层短路逻辑：对每个名称依次尝试以下来源，命中即停止：
 * 1. KV 缓存（trans:{name}）
 * 2. 本地种子词库（dict:{name}）
 * 3. Wikipedia 中文 langlink 查询
 * 4. DeepSeek LLM 翻译
 *
 * 每层翻译成功的结果会立即写入 KV 缓存，供下次查询使用。
 * 某一层失败不会阻塞后续层的执行。
 *
 * @param names 需要翻译的英文游戏名列表
 * @param env Cloudflare Workers 环境变量
 * @returns 翻译结果数组
 */
export async function translateGameNames(
  names: string[],
  env: Env
): Promise<TranslationResult[]> {
  if (names.length === 0) return [];

  const allResults: TranslationResult[] = [];
  const remaining = [...names];

  // ============================================================
  // 第零层：KV 缓存查询
  // ============================================================
  let cached: TranslationResult[] = [];
  try {
    cached = await getCachedTranslations(remaining, env.TRANSLATION_KV);
    if (cached.length > 0) {
      allResults.push(...cached);
      const cachedNames = new Set(cached.map((c) => c.original));
      remaining.splice(0, remaining.length, ...remaining.filter((n) => !cachedNames.has(n)));
    }
  } catch (error) {
    console.error('[Engine] 缓存查询失败，跳过缓存层:', error);
  }

  if (remaining.length === 0) {
    console.log('[Engine] 所有名称均命中缓存');
    return allResults;
  }

  console.log(`[Engine] 缓存后剩余 ${remaining.length} 个需要翻译`);

  // ============================================================
  // 第一层：本地词库查询
  // ============================================================
  let localDictResults = new Map<string, string>();
  try {
    localDictResults = await batchLookupLocalDict(remaining, env.TRANSLATION_KV);
    if (localDictResults.size > 0) {
      for (const [original, translated] of localDictResults) {
        allResults.push({ original, translated, source: 'local' });
      }
      remaining.splice(
        0,
        remaining.length,
        ...remaining.filter((n) => !localDictResults.has(n))
      );

      // 立即缓存本地词库结果
      await setTranslations(
        allResults.filter((r) => r.source === 'local'),
        env.TRANSLATION_KV
      );
    }
  } catch (error) {
    console.error('[Engine] 本地词库查询失败，跳过本地词库层:', error);
  }

  if (remaining.length === 0) {
    console.log('[Engine] 所有名称均在本地词库中找到');
    return allResults;
  }

  console.log(`[Engine] 本地词库后剩余 ${remaining.length} 个需要翻译`);

  // ============================================================
  // 第二层：Wikipedia 中文 langlink 查询
  // ============================================================
  let wikiResults = new Map<string, string>();
  try {
    wikiResults = await queryWikipedia(remaining, env.WIKIPEDIA_USER_AGENT);
    if (wikiResults.size > 0) {
      for (const [original, translated] of wikiResults) {
        allResults.push({ original, translated, source: 'wikipedia' });
      }
      remaining.splice(
        0,
        remaining.length,
        ...remaining.filter((n) => !wikiResults.has(n))
      );

      // 立即缓存 Wikipedia 结果
      await setTranslations(
        allResults.filter((r) => r.source === 'wikipedia'),
        env.TRANSLATION_KV
      );
    }
  } catch (error) {
    console.error('[Engine] Wikipedia 查询失败，跳过 Wikipedia 层:', error);
  }

  if (remaining.length === 0) {
    console.log('[Engine] 所有名称均通过 Wikipedia 找到');
    return allResults;
  }

  console.log(`[Engine] Wikipedia 后剩余 ${remaining.length} 个需要 DeepSeek 翻译`);

  // ============================================================
  // 第三层：DeepSeek LLM 翻译
  // ============================================================
  let deepseekResults = new Map<string, string>();
  try {
    deepseekResults = await translateWithDeepSeek(remaining, env.DEEPSEEK_API_KEY);
    if (deepseekResults.size > 0) {
      for (const [original, translated] of deepseekResults) {
        allResults.push({ original, translated, source: 'deepseek' });
      }

      // 立即缓存 DeepSeek 翻译结果
      await setTranslations(
        allResults.filter((r) => r.source === 'deepseek'),
        env.TRANSLATION_KV
      );

      // 更新 remaining
      remaining.splice(
        0,
        remaining.length,
        ...remaining.filter((n) => !deepseekResults.has(n))
      );
    }
  } catch (error) {
    console.error('[Engine] DeepSeek 翻译失败:', error);
  }

  // ============================================================
  // 处理仍未翻译的名称：保留英文原名
  // ============================================================
  for (const name of remaining) {
    allResults.push({
      original: name,
      translated: name, // 保留英文原名
      source: 'local', // 标记为本地（未翻译）
    });
  }

  console.log(
    `[Engine] 翻译完成: 缓存 ${cached.length}, 本地 ${localDictResults.size}, ` +
    `Wikipedia ${wikiResults.size}, DeepSeek ${deepseekResults.size}, ` +
    `未翻译 ${remaining.length}`
  );

  return allResults;
}
