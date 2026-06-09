/**
 * KV 翻译缓存读写封装
 * 管理翻译结果在 KV 中的存取，使用 trans:{lowercase_name} 作为 key
 */

import type { TranslationResult } from '../types';
import { TRANSLATION_KEY_PREFIX, TRANSLATION_CACHE_TTL } from '../config';

/**
 * 构建翻译缓存的 KV key
 * @param name 英文游戏名
 * @returns KV key（如 "trans:elden ring"）
 */
function buildKey(name: string): string {
  return `${TRANSLATION_KEY_PREFIX}${name.toLowerCase().trim()}`;
}

/**
 * 批量获取翻译缓存
 * @param names 需要查询的英文游戏名列表
 * @param kv TRANSLATION_KV 命名空间
 * @returns 已缓存的翻译结果 Map（英文名 → 中文名）
 */
export async function getTranslations(
  names: string[],
  kv: KVNamespace
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  if (names.length === 0) return results;

  // 并发读取所有 key
  const keys = names.map((name) => buildKey(name));
  const values = await Promise.all(keys.map((key) => kv.get(key)));

  for (let i = 0; i < names.length; i++) {
    if (values[i] !== null) {
      results.set(names[i], values[i]!);
    }
  }

  console.log(`[Cache] 缓存查询: ${results.size}/${names.length} 命中`);
  return results;
}

/**
 * 批量写入翻译缓存
 * @param translations 翻译结果列表
 * @param kv TRANSLATION_KV 命名空间
 */
export async function setTranslations(
  translations: TranslationResult[],
  kv: KVNamespace
): Promise<void> {
  if (translations.length === 0) return;

  // 并发写入所有 key
  await Promise.all(
    translations.map((t) =>
      kv.put(buildKey(t.original), t.translated, {
        expirationTtl: TRANSLATION_CACHE_TTL,
      })
    )
  );

  console.log(`[Cache] 缓存写入: ${translations.length} 条`);
}

/**
 * 从缓存中获取翻译结果并转为 TranslationResult 格式
 * @param names 需要查询的英文游戏名列表
 * @param kv TRANSLATION_KV 命名空间
 * @returns 缓存命中的翻译结果数组
 */
export async function getCachedTranslations(
  names: string[],
  kv: KVNamespace
): Promise<TranslationResult[]> {
  const cached = await getTranslations(names, kv);
  const results: TranslationResult[] = [];

  for (const [original, translated] of cached) {
    results.push({
      original,
      translated,
      source: 'cache',
    });
  }

  return results;
}
