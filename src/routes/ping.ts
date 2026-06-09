/**
 * /ping 健康检查路由
 * 返回简单的健康状态响应
 */

/**
 * 处理 /ping 请求
 * @returns 健康检查响应
 */
export function handlePing(): Response {
  const body = {
    status: 'ok',
    service: 'game-calendar-cn',
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
