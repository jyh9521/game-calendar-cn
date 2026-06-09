/**
 * 数据源配置
 * 支持两种数据源类型：
 * 1. 'ics' — 上游 .ics 日历源（直接抓取 .ics 文件）
 * 2. 'wikipedia' — Wikipedia 游戏发售日列表（抓取 wikitext 后解析）
 */

import type { DataSource, CalendarSource, WikipediaSourceConfig } from '../types';

/**
 * 数据源列表
 * 当前使用 Wikipedia 作为主要数据源
 *
 * 如需添加 .ics 数据源，格式如下：
 * { type: 'ics', name: '...', url: 'https://...', platform: 'ps5' }
 */
export const DATA_SOURCES: DataSource[] = [
  {
    type: 'wikipedia',
    year: 2026,
    pageTitle: 'List_of_video_games_released_in_2026',
  },
];

/**
 * 获取所有 ICS 类型的数据源
 */
export function getIcsSources(): CalendarSource[] {
  return DATA_SOURCES.filter((s): s is CalendarSource => s.type === 'ics');
}

/**
 * 获取所有 Wikipedia 类型的数据源
 */
export function getWikipediaSources(): WikipediaSourceConfig[] {
  return DATA_SOURCES.filter((s): s is WikipediaSourceConfig => s.type === 'wikipedia');
}

/**
 * 获取所有已配置的平台标识列表（仅 ICS 源）
 */
export function getAllPlatforms(): string[] {
  return getIcsSources().map((s) => s.platform);
}

/**
 * 根据平台标识获取 ICS 数据源
 * @param platform 平台标识（如 'ps5'、'switch'）
 * @returns 匹配的数据源，未找到返回 undefined
 */
export function getSourceByPlatform(platform: string): CalendarSource | undefined {
  return getIcsSources().find((s) => s.platform === platform);
}
