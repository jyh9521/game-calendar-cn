/**
 * 全局类型定义
 * 定义项目中所有核心数据结构和接口
 */

// ============================================================
// 日历数据源
// ============================================================

/** 上游 .ics 日历源配置 */
export interface CalendarSource {
  /** 数据源类型标识 */
  type: 'ics';
  /** 数据源显示名称 */
  name: string;
  /** .ics 文件 URL */
  url: string;
  /** 关联的游戏平台 */
  platform: string;
}

/** Wikipedia 数据源配置 */
export interface WikipediaSourceConfig {
  /** 数据源类型标识 */
  type: 'wikipedia';
  /** 年份 */
  year: number;
  /** Wikipedia 页面标题（如 "List_of_video_games_released_in_2026"） */
  pageTitle: string;
}

/** 数据源联合类型 */
export type DataSource = CalendarSource | WikipediaSourceConfig;

// ============================================================
// 日历事件
// ============================================================

/** 解析后的日历事件 */
export interface CalendarEvent {
  /** 事件唯一标识 */
  uid: string;
  /** 事件标题（游戏名称） */
  summary: string;
  /** 开始日期/时间（ISO 8601 或 ICS DATE 格式） */
  dtstart: string;
  /** 结束日期/时间（可选） */
  dtend?: string;
  /** 事件描述（可选） */
  description?: string;
}

// ============================================================
// 翻译相关
// ============================================================

/** 翻译结果 */
export interface TranslationResult {
  /** 原始英文名 */
  original: string;
  /** 翻译后的中文名 */
  translated: string;
  /** 翻译来源 */
  source: 'local' | 'wikipedia' | 'deepseek' | 'cache';
}

// ============================================================
// Cloudflare Workers 环境变量
// ============================================================

/** Cloudflare Workers 环境变量接口 */
export interface Env {
  /** 翻译缓存 KV 命名空间 */
  TRANSLATION_KV: KVNamespace;
  /** 日历文件存储 KV 命名空间 */
  CALENDAR_KV: KVNamespace;
  /** DeepSeek API 密钥（通过 wrangler secret 设置） */
  DEEPSEEK_API_KEY: string;
  /** Wikipedia API User-Agent */
  WIKIPEDIA_USER_AGENT: string;
}

// 注：Worker 入口类型使用 CF 内置的 ExportedHandler<Env>，
// Scheduled handler 参数类型使用 CF 内置的 ScheduledController，
// 无需自定义类型，详见 index.ts。
