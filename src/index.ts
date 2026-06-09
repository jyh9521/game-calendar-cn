/**
 * Worker 入口文件
 * 注册 HTTP fetch handler 和 Cron scheduled handler
 */

import type { Env } from './types';
import { handleCalendar } from './routes/calendar';
import { handlePing } from './routes/ping';
import { updateCalendar } from './tasks/update-calendar';

export default {
  /**
   * HTTP 请求处理
   * 根据 URL 路径分发到不同的路由处理器
   */
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // 健康检查路由
    if (path === '/ping') {
      return handlePing();
    }

    // 日历路由（支持 /calendar 和 /calendar/）
    if (path === '/calendar' || path === '/calendar/') {
      return handleCalendar(request, env);
    }

    // 首页：返回简单说明页
    if (path === '/' || path === '') {
      return new Response(
        [
          '# 中文游戏发售日历服务',
          '',
          '## 可用端点',
          '',
          '- `GET /calendar` — 获取全部平台的中文游戏发售日历（.ics）',
          '- `GET /calendar?platform=ps5&platform=switch` — 获取指定平台日历',
          '- `GET /ping` — 健康检查',
          '',
          '## 订阅方式',
          '',
          '将 `/calendar` 地址添加到你的日历应用（Apple Calendar、Google Calendar 等）即可自动同步。',
        ].join('\n'),
        {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }
      );
    }

    // 404
    return new Response('Not Found', { status: 404 });
  },

  /**
   * Cron 定时任务处理
   * 由 Cloudflare Cron Trigger 触发，执行日历更新流程
   */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[Cron] 触发定时任务，预定时间: ${new Date(controller.scheduledTime).toISOString()}`);
    console.log(`[Cron] Cron 表达式: ${controller.cron}`);

    // 使用 waitUntil 确保任务完成后再返回
    ctx.waitUntil(updateCalendar(env));
  },
} satisfies ExportedHandler<Env>;
