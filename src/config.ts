/**
 * 配置常量和环境变量类型
 * 集中管理所有可调参数，便于维护
 */

// ============================================================
// KV TTL 配置（单位：秒）
// ============================================================

/** 翻译缓存 TTL：30 天 */
export const TRANSLATION_CACHE_TTL = 30 * 24 * 60 * 60;

/** 生成的 .ics 文件 TTL：14 小时（略大于 Cron 间隔 12h，避免过早过期） */
export const ICS_FILE_TTL = 14 * 60 * 60;

// ============================================================
// 批量处理配置
// ============================================================

/** Wikipedia API 每批最大查询数 */
export const WIKIPEDIA_BATCH_SIZE = 50;

/** DeepSeek API 每批最大翻译数 */
export const DEEPSEEK_BATCH_SIZE = 20;

/** Wikipedia 批次间延迟（毫秒），用于避免触发 MediaWiki API 速率限制 */
export const WIKIPEDIA_BATCH_DELAY_MS = 1000;

/** DeepSeek 批次间延迟（毫秒），用于避免触发 API 速率限制 */
export const DEEPSEEK_BATCH_DELAY_MS = 3000;

// ============================================================
// API 端点
// ============================================================

/** DeepSeek Chat API 端点 */
export const DEEPSEEK_API_ENDPOINT = 'https://api.deepseek.com/chat/completions';

/** DeepSeek 模型名称 */
export const DEEPSEEK_MODEL = 'deepseek-chat';

/** MediaWiki API 端点（英文 Wikipedia） */
export const WIKIPEDIA_API_ENDPOINT = 'https://en.wikipedia.org/w/api.php';

// ============================================================
// 日历元数据
// ============================================================

/** 生成的 .ics 日历名称 */
export const CALENDAR_NAME = '中文游戏发售日历';

/** 日历描述 */
export const CALENDAR_DESCRIPTION = '中文游戏发售日历 — 自动翻译的游戏发布日程';

/** 产品标识符 */
export const PROD_ID = '-//game-calendar-cn//CN';

/** 日历版本 */
export const CALENDAR_VERSION = '2.0';

// ============================================================
// KV Key 前缀
// ============================================================

/** 翻译缓存 KV key 前缀 */
export const TRANSLATION_KEY_PREFIX = 'trans:';

/** 种子词库 KV key 前缀 */
export const DICT_KEY_PREFIX = 'dict:';

/** 日历文件 KV key 前缀 */
export const ICS_KEY_PREFIX = 'ics:';
