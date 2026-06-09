/**
 * 第一层翻译：本地高频词库
 * 从 KV 中查询种子词库（key 格式：dict:{lowercase_name}）
 * 支持精确匹配和大小写不敏感匹配
 */

/**
 * 从本地词库查询游戏中文名
 * @param name 英文游戏名
 * @param kv TRANSLATION_KV 命名空间
 * @returns 中文译名，未找到返回 null
 */
export async function lookupLocalDict(
  name: string,
  kv: KVNamespace
): Promise<string | null> {
  const normalizedName = name.toLowerCase().trim();

  // 1. 精确匹配（小写后的 key）
  const exact = await kv.get(`dict:${normalizedName}`);
  if (exact) {
    return exact;
  }

  // 2. 去除副标题后匹配（如 "Game Name: Subtitle" → "game name"）
  const colonIndex = normalizedName.indexOf(':');
  if (colonIndex > 0) {
    const baseName = normalizedName.substring(0, colonIndex).trim();
    const baseResult = await kv.get(`dict:${baseName}`);
    if (baseResult) {
      return baseResult;
    }
  }

  // 3. 去除括号后缀后匹配（如 "Game Name (2024)" → "game name"）
  const parenIndex = normalizedName.indexOf(' (');
  if (parenIndex > 0) {
    const baseName = normalizedName.substring(0, parenIndex).trim();
    const baseResult = await kv.get(`dict:${baseName}`);
    if (baseResult) {
      return baseResult;
    }
  }

  return null;
}

/**
 * 批量查询本地词库
 * @param names 英文游戏名列表
 * @param kv TRANSLATION_KV 命名空间
 * @returns 命中的翻译结果 Map（原始名 → 中文名）
 */
export async function batchLookupLocalDict(
  names: string[],
  kv: KVNamespace
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  // 并发查询所有名称
  const lookups = await Promise.all(
    names.map(async (name) => {
      const result = await lookupLocalDict(name, kv);
      return { name, result };
    })
  );

  for (const { name, result } of lookups) {
    if (result !== null) {
      results.set(name, result);
    }
  }

  console.log(`[LocalDict] 本地词库查询: ${results.size}/${names.length} 命中`);
  return results;
}
