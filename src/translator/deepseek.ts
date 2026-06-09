/**
 * 第三层翻译：DeepSeek LLM API
 * 使用 DeepSeek Chat API 进行游戏名称的智能翻译
 * 支持批量处理（每批最多 20 个）
 */

import { DEEPSEEK_API_ENDPOINT, DEEPSEEK_MODEL, DEEPSEEK_BATCH_SIZE, DEEPSEEK_BATCH_DELAY_MS } from '../config';

/** DeepSeek 翻译的 System Prompt */
const SYSTEM_PROMPT = `你是一个专业的电子游戏名称翻译专家。你的任务是将英文游戏名称翻译为中文。

规则：
1. 优先使用中国大陆玩家社区广泛接受的官方中文译名
2. 如果游戏有官方中文名，必须使用官方中文名
3. 如果没有官方中文名，使用中国大陆主流游戏媒体（如游民星空、3DM、游侠网）通用的译名
4. 保持专有名词的一致性（如 "Zelda" → "塞尔达"，"Mario" → "马里奥"）
5. 系列作品保持命名风格一致
6. 如果确实无法确定中文名，保留英文原名
7. 输出必须为严格的 JSON 格式`;

/**
 * 构建翻译请求的 User Prompt
 * @param names 一批英文游戏名
 * @returns 格式化的 Prompt 字符串
 */
function buildTranslationPrompt(names: string[]): string {
  const list = names.map((n, i) => `${i + 1}. ${n}`).join('\n');
  return `请将以下英文游戏名称翻译为中文，返回 JSON 格式：
{
  "translations": [
    {"english": "英文名", "chinese": "中文名"}
  ]
}

游戏列表：
${list}`;
}

/**
 * 解析 DeepSeek API 响应
 * @param data API 响应数据
 * @returns 英文名 → 中文名的映射
 */
function parseDeepSeekResponse(data: any): Map<string, string> {
  const results = new Map<string, string>();

  try {
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return results;

    // 尝试解析 JSON 响应
    const parsed = JSON.parse(content);
    const translations = parsed.translations || parsed;

    if (Array.isArray(translations)) {
      for (const item of translations) {
        const english = item.english || item.en || item.original;
        const chinese = item.chinese || item.zh || item.translated;
        if (english && chinese) {
          results.set(english.trim(), chinese.trim());
        }
      }
    }
  } catch (error) {
    console.error('[DeepSeek] 响应解析失败:', error);
  }

  return results;
}

/**
 * 使用 DeepSeek API 翻译游戏名称
 * @param names 英文游戏名列表
 * @param apiKey DeepSeek API 密钥
 * @returns 英文名 → 中文名的映射
 */
export async function translateWithDeepSeek(
  names: string[],
  apiKey: string
): Promise<Map<string, string>> {
  const allResults = new Map<string, string>();

  if (names.length === 0) return allResults;

  // 按批次处理
  for (let i = 0; i < names.length; i += DEEPSEEK_BATCH_SIZE) {
    const batch = names.slice(i, i + DEEPSEEK_BATCH_SIZE);

    try {
      const batchResults = await translateBatch(batch, apiKey);
      for (const [key, value] of batchResults) {
        allResults.set(key, value);
      }
    } catch (error) {
      console.error(`[DeepSeek] 批次翻译失败 (batch ${Math.floor(i / DEEPSEEK_BATCH_SIZE)}):`, error);
    }

    // 批次间延迟（避免触发速率限制）
    if (i + DEEPSEEK_BATCH_SIZE < names.length) {
      await new Promise((resolve) => setTimeout(resolve, DEEPSEEK_BATCH_DELAY_MS));
    }
  }

  console.log(`[DeepSeek] 翻译完成: ${allResults.size}/${names.length} 成功`);
  return allResults;
}

/**
 * 翻译单批次
 * @param names 一批英文游戏名（最多 20 个）
 * @param apiKey DeepSeek API 密钥
 * @returns 英文名 → 中文名的映射
 */
async function translateBatch(
  names: string[],
  apiKey: string
): Promise<Map<string, string>> {
  const prompt = buildTranslationPrompt(names);

  const response = await fetch(DEEPSEEK_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1, // 低温度确保翻译一致性
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[DeepSeek] HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json() as any;
  return parseDeepSeekResponse(data);
}
