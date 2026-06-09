/**
 * Cron 定时任务主编排函数
 * 完整流程：获取源 → 解析 → 提取游戏名 → 翻译 → 生成中文 .ics → 存入 KV
 *
 * 支持两种数据源：
 * 1. ICS 源：抓取上游 .ics 文件 → 解析 VEVENT → CalendarEvent[]
 * 2. Wikipedia 源：抓取 MediaWiki API wikitext → 解析表格 → CalendarEvent[]
 */

import type { Env, CalendarEvent, DataSource, CalendarSource, WikipediaSourceConfig } from '../types';
import { DATA_SOURCES } from '../calendar/sources';
import { fetchAllSources } from '../calendar/fetcher';
import { parseIcs, extractUniqueGameNames } from '../calendar/parser';
import { fetchWikipediaGameReleases } from '../calendar/wiki-fetcher';
import { parseWikitextToEvents, extractUniqueGameNamesFromEvents } from '../calendar/wiki-parser';
import { translateGameNamesFast } from '../translator/engine';
import { translateWithDeepSeek } from '../translator/deepseek';
import { generateIcs, generatePlatformIcs } from '../calendar/generator';
import { ICS_KEY_PREFIX, ICS_FILE_TTL } from '../config';

/**
 * 处理 ICS 类型的数据源
 * @param sources ICS 数据源列表
 * @returns 按平台分组的事件 Map + 全部事件数组
 */
async function processIcsSources(
  sources: CalendarSource[],
): Promise<{ platformEvents: Map<string, CalendarEvent[]>; allEvents: CalendarEvent[] }> {
  const platformEvents = new Map<string, CalendarEvent[]>();
  const allEvents: CalendarEvent[] = [];

  if (sources.length === 0) {
    return { platformEvents, allEvents };
  }

  const sourceContents = await fetchAllSources(sources);

  for (const source of sources) {
    const content = sourceContents.get(source.name);
    if (!content) continue;

    const events = parseIcs(content);
    platformEvents.set(source.platform, events);
    allEvents.push(...events);
  }

  return { platformEvents, allEvents };
}

/**
 * 处理 Wikipedia 类型的数据源
 * @param sources Wikipedia 数据源配置列表
 * @param env 环境变量
 * @returns 按平台分组的事件 Map + 全部事件数组
 */
async function processWikipediaSources(
  sources: WikipediaSourceConfig[],
  env: Env,
): Promise<{ platformEvents: Map<string, CalendarEvent[]>; allEvents: CalendarEvent[] }> {
  const platformEvents = new Map<string, CalendarEvent[]>();
  const allEvents: CalendarEvent[] = [];

  for (const source of sources) {
    console.log(`[UpdateCalendar] 处理 Wikipedia 源: ${source.pageTitle}`);

    // 获取各月份的 wikitext
    const monthWikitexts = await fetchWikipediaGameReleases(source.year, env);

    if (monthWikitexts.size === 0) {
      console.warn(`[UpdateCalendar] Wikipedia 源 ${source.pageTitle} 未获取到数据`);
      continue;
    }

    // 解析每个月份的 wikitext
    for (const [_month, wikitext] of monthWikitexts) {
      const events = parseWikitextToEvents(wikitext, source.year);
      allEvents.push(...events);

      // 按平台分组
      for (const event of events) {
        // 从 description 中提取平台信息
        const platformMatch = event.description?.match(/Platform:\s*(\w+)/);
        const platform = platformMatch ? platformMatch[1] : 'all';

        if (!platformEvents.has(platform)) {
          platformEvents.set(platform, []);
        }
        platformEvents.get(platform)!.push(event);
      }
    }
  }

  // 清除事件中的平台描述信息（不需要出现在 .ics 中）
  for (const events of platformEvents.values()) {
    for (const event of events) {
      event.description = undefined;
    }
  }

  return { platformEvents, allEvents };
}

/**
 * 更新日历的主编排函数
 * 由 Cron Trigger 每 12 小时触发一次
 *
 * 流程：
 * 1. 按数据源类型分别获取和解析数据
 * 2. 提取所有唯一游戏名称
 * 3. 通过翻译引擎批量翻译
 * 4. 用翻译结果替换事件标题
 * 5. 生成中文 .ics 文件（按平台 + 全平台合并）
 * 6. 写入 CALENDAR_KV
 *
 * @param env Cloudflare Workers 环境变量
 */
export async function updateCalendar(env: Env): Promise<void> {
  const startTime = Date.now();
  console.log('[UpdateCalendar] 开始更新日历...');

  try {
    // ============================================================
    // 步骤 1：按类型分组数据源
    // ============================================================
    console.log('[UpdateCalendar] 步骤 1/6: 分组数据源');

    const icsSources = DATA_SOURCES.filter(
      (s): s is CalendarSource => s.type === 'ics',
    );
    const wikiSources = DATA_SOURCES.filter(
      (s): s is WikipediaSourceConfig => s.type === 'wikipedia',
    );

    console.log(
      `[UpdateCalendar] 数据源: ${icsSources.length} 个 ICS 源, ${wikiSources.length} 个 Wikipedia 源`,
    );

    // ============================================================
    // 步骤 2：获取和解析数据
    // ============================================================
    console.log('[UpdateCalendar] 步骤 2/6: 获取和解析数据');

    const platformEvents = new Map<string, CalendarEvent[]>();
    const allEvents: CalendarEvent[] = [];

    // 处理 ICS 源
    const icsResult = await processIcsSources(icsSources);
    for (const [platform, events] of icsResult.platformEvents) {
      platformEvents.set(platform, events);
    }
    allEvents.push(...icsResult.allEvents);

    // 处理 Wikipedia 源
    const wikiResult = await processWikipediaSources(wikiSources, env);
    for (const [platform, events] of wikiResult.platformEvents) {
      const existing = platformEvents.get(platform) ?? [];
      existing.push(...events);
      platformEvents.set(platform, existing);
    }
    allEvents.push(...wikiResult.allEvents);

    console.log(`[UpdateCalendar] 解析完成: 共 ${allEvents.length} 个事件`);

    if (allEvents.length === 0) {
      console.error('[UpdateCalendar] 未解析到任何事件，跳过本次更新');
      return;
    }

    // ============================================================
    // 步骤 3：提取唯一游戏名称
    // ============================================================
    console.log('[UpdateCalendar] 步骤 3/6: 提取唯一游戏名称');

    // 合并两种提取方式
    const icsNames = extractUniqueGameNames(allEvents);
    const wikiNames = extractUniqueGameNamesFromEvents(allEvents);
    const uniqueNames = Array.from(new Set([...icsNames, ...wikiNames]));

    console.log(`[UpdateCalendar] 共 ${uniqueNames.length} 个唯一游戏名称`);

    // ============================================================
    // 步骤 4：快速翻译（缓存 + 本地词库 + Wikipedia）
    // ============================================================
    console.log('[UpdateCalendar] 步骤 4/6: 快速翻译（缓存+本地词库+Wikipedia）');
    const fastTranslations = await translateGameNamesFast(uniqueNames, env);

    // 构建翻译映射表
    const translationMap = new Map<string, string>();
    for (const t of fastTranslations) {
      translationMap.set(t.original, t.translated);
    }

    console.log(`[UpdateCalendar] 快速翻译完成: ${translationMap.size}/${uniqueNames.length} 命中`);

    // ============================================================
    // 步骤 5：替换事件标题并生成 .ics 文件
    // ============================================================
    console.log('[UpdateCalendar] 步骤 5/6: 生成并存储 .ics 文件');

    /** 翻译单个事件的标题格式：[中文名] English Name */
    function translateEvent(event: CalendarEvent): CalendarEvent {
      const chineseName = translationMap.get(event.summary);
      if (chineseName && chineseName !== event.summary) {
        return {
          ...event,
          summary: `[${chineseName}] ${event.summary}`,
        };
      }
      return event;
    }

    // 翻译每个平台的事件
    const translatedPlatformEvents = new Map<string, CalendarEvent[]>();
    const translatedAllEvents: CalendarEvent[] = [];

    for (const [platform, events] of platformEvents) {
      const translated = events.map(translateEvent);
      translatedPlatformEvents.set(platform, translated);
      translatedAllEvents.push(...translated);
    }

    // 生成全平台合并 .ics 并立即写入 KV
    const allIcs = generateIcs(translatedAllEvents);
    await env.CALENDAR_KV.put(`${ICS_KEY_PREFIX}all`, allIcs, {
      expirationTtl: ICS_FILE_TTL,
    });
    console.log(`[UpdateCalendar] 已存储 ics:all (${allIcs.length} 字符)`);

    // 生成各平台 .ics
    for (const [platform, events] of translatedPlatformEvents) {
      const platformIcs = generatePlatformIcs(events, platform);
      await env.CALENDAR_KV.put(`${ICS_KEY_PREFIX}${platform}`, platformIcs, {
        expirationTtl: ICS_FILE_TTL,
      });
      console.log(
        `[UpdateCalendar] 已存储 ics:${platform} (${platformIcs.length} 字符, ${events.length} 个事件)`,
      );
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[UpdateCalendar] 更新完成！耗时 ${elapsed} 秒`);

    // ============================================================
    // 步骤 6：DeepSeek 补充翻译（尽力而为，不阻塞 ICS 生成）
    // ============================================================
    const untranslated = uniqueNames.filter((n) => !translationMap.has(n));
    if (untranslated.length > 0) {
      console.log(`[UpdateCalendar] 步骤 6/6: DeepSeek 补充翻译 (${untranslated.length} 个)`);
      try {
        const deepseekTranslations = await translateWithDeepSeek(untranslated, env.DEEPSEEK_API_KEY);
        if (deepseekTranslations.size > 0) {
          console.log(`[UpdateCalendar] DeepSeek 翻译完成: ${deepseekTranslations.size} 个`);
        }
      } catch (err) {
        console.warn('[UpdateCalendar] DeepSeek 补充翻译失败（不影响已生成的日历）:', err);
      }
    }
  } catch (error) {
    console.error('[UpdateCalendar] 更新过程中发生错误:', error);
    throw error;
  }
}
