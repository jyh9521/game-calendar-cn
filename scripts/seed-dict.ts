/**
 * 种子词库导入脚本
 * 读取 data/game-dict-seed.json 并写入 TRANSLATION_KV
 *
 * 使用方式：
 *   npx tsx scripts/seed-dict.ts
 *
 * 前置条件：
 *   1. 确保 wrangler.toml 中已配置 TRANSLATION_KV 的 id
 *   2. 已通过 `wrangler login` 登录 Cloudflare 账户
 *
 * 注意：此脚本使用 wrangler CLI 的 KV bulk put 命令
 * 也可以手动通过 Cloudflare Dashboard 导入
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/** 种子词库文件路径 */
const SEED_DICT_PATH = join(__dirname, '..', 'data', 'game-dict-seed.json');

/** KV key 前缀 */
const DICT_KEY_PREFIX = 'dict:';

interface SeedEntry {
  key: string;
  value: string;
}

/**
 * 读取种子词库 JSON 文件
 * @returns 英文名 → 中文名的映射
 */
function loadSeedDict(): Record<string, string> {
  console.log(`[Seed] 读取种子词库: ${SEED_DICT_PATH}`);
  const content = readFileSync(SEED_DICT_PATH, 'utf-8');
  const dict = JSON.parse(content) as Record<string, string>;
  console.log(`[Seed] 读取到 ${Object.keys(dict).length} 条词条`);
  return dict;
}

/**
 * 将词库转换为 Wrangler KV bulk put 格式
 * @param dict 英文名 → 中文名的映射
 * @returns KV bulk put 格式的条目数组
 */
function toBulkEntries(dict: Record<string, string>): SeedEntry[] {
  const entries: SeedEntry[] = [];

  for (const [englishName, chineseName] of Object.entries(dict)) {
    // key 格式：dict:{lowercase_english_name}
    const key = `${DICT_KEY_PREFIX}${englishName.toLowerCase().trim()}`;
    entries.push({ key, value: chineseName.trim() });
  }

  return entries;
}

/**
 * 生成 Wrangler KV bulk put 的 JSON 文件
 * 然后通过 wrangler 命令行导入
 */
async function main(): Promise<void> {
  console.log('========================================');
  console.log('  种子词库导入工具');
  console.log('========================================');
  console.log();

  // 1. 读取种子词库
  const dict = loadSeedDict();

  // 2. 转换为 bulk 格式
  const entries = toBulkEntries(dict);
  console.log(`[Seed] 生成 ${entries.length} 条 KV 条目`);

  // 3. 写入临时 JSON 文件供 wrangler 使用
  const tmpPath = join(__dirname, '..', '.tmp', 'seed-entries.json');
  try {
    mkdirSync(join(__dirname, '..', '.tmp'), { recursive: true });
  } catch {
    // 目录可能已存在，忽略错误
  }
  writeFileSync(tmpPath, JSON.stringify(entries, null, 2), 'utf-8');
  console.log(`[Seed] 已生成 bulk 文件: ${tmpPath}`);

  // 4. 输出导入命令
  console.log();
  console.log('请执行以下命令导入词库到 KV：');
  console.log();
  console.log(`  npx wrangler kv:bulk put --binding=TRANSLATION_KV .tmp/seed-entries.json`);
  console.log();
  console.log('或者使用 preview 命令先验证：');
  console.log();
  console.log(`  npx wrangler kv:bulk put --binding=TRANSLATION_KV --preview .tmp/seed-entries.json`);
  console.log();
  console.log('导入完成后可以删除 .tmp 目录');
}

main().catch((error) => {
  console.error('[Seed] 导入失败:', error);
  process.exit(1);
});
