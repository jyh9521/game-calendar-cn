# 🚀 部署详细指南

> 本文档提供 game-calendar-cn 项目的完整部署流程，从零开始到上线运行。

---

## 目录

1. [Cloudflare 账户准备](#1-cloudflare-账户准备)
2. [KV Namespace 创建](#2-kv-namespace-创建)
3. [环境变量配置](#3-环境变量配置)
4. [配置 wrangler.toml](#4-配置-wranglertoml)
5. [数据源配置](#5-数据源配置)
6. [种子词库导入](#6-种子词库导入)
7. [部署与验证](#7-部署与验证)
8. [Cron 触发器说明](#8-cron-触发器说明)
9. [监控与日志](#9-监控与日志)
10. [自定义域名（可选）](#10-自定义域名可选)
11. [更新与维护](#11-更新与维护)

---

## 1. Cloudflare 账户准备

### 1.1 注册/登录 Cloudflare

1. 访问 [Cloudflare 官网](https://dash.cloudflare.com/sign-up) 注册账户（免费版即可）
2. 如果已有账户，直接登录

### 1.2 安装 Wrangler CLI

Wrangler 是 Cloudflare Workers 的官方命令行工具：

```bash
# 全局安装（推荐）
npm install -g wrangler

# 或在项目中作为开发依赖安装（已在 package.json 中配置）
npm install
```

### 1.3 Wrangler 登录认证

```bash
npx wrangler login
```

执行后会自动打开浏览器，授权 Wrangler 访问你的 Cloudflare 账户。登录成功后终端会显示确认信息。

验证登录状态：

```bash
npx wrangler whoami
```

---

## 2. KV Namespace 创建

本项目使用两个 KV 命名空间：

| 命名空间 | 用途 | Key 格式 |
|---------|------|---------|
| `TRANSLATION_KV` | 翻译缓存 + 种子词库 | `trans:{name}`, `dict:{name}` |
| `CALENDAR_KV` | 预生成的 .ics 文件 | `ics:{platform}`, `ics:all` |

### 2.1 创建生产环境 KV

```bash
# 创建翻译缓存 KV
npx wrangler kv namespace create TRANSLATION_KV
# 输出示例:
# { binding = "TRANSLATION_KV", id = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6" }

# 创建日历文件 KV
npx wrangler kv namespace create CALENDAR_KV
# 输出示例:
# { binding = "CALENDAR_KV", id = "p6o5n4m3l2k1j0i9h8g7f6e5d4c3b2a1" }
```

### 2.2 创建本地开发用 KV（Preview Namespace）

```bash
# 创建翻译缓存 Preview KV
npx wrangler kv namespace create TRANSLATION_KV --preview
# 输出示例:
# { binding = "TRANSLATION_KV", preview_id = "z1y2x3w4v5u6t7s8r9q0p1o2n3m4l5k6" }

# 创建日历文件 Preview KV
npx wrangler kv namespace create CALENDAR_KV --preview
# 输出示例:
# { binding = "CALENDAR_KV", preview_id = "k6l5m4n3o2p1q0r9s8t7u6v5w4x3y2z1" }
```

### 2.3 将 ID 填入 wrangler.toml

将上述命令输出的 ID 值填入 [`wrangler.toml`](../wrangler.toml) 对应位置：

```toml
[[kv_namespaces]]
binding = "TRANSLATION_KV"
id = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"        # ← 生产环境 ID
preview_id = "z1y2x3w4v5u6t7s8r9q0p1o2n3m4l5k6"  # ← 本地开发 ID

[[kv_namespaces]]
binding = "CALENDAR_KV"
id = "p6o5n4m3l2k1j0i9h8g7f6e5d4c3b2a1"          # ← 生产环境 ID
preview_id = "k6l5m4n3o2p1q0r9s8t7u6v5w4x3y2z1"   # ← 本地开发 ID
```

> ⚠️ **重要：** 不要将占位符 `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` 留在配置中，否则部署会失败。

---

## 3. 环境变量配置

### 3.1 DEEPSEEK_API_KEY

DeepSeek LLM API 密钥，用于游戏名称的智能翻译（第三层翻译）。

**获取方式：**

1. 访问 [DeepSeek 开放平台](https://platform.deepseek.com/)
2. 注册/登录账户
3. 进入「API Keys」页面，创建新的 API Key
4. 复制生成的 Key（以 `sk-` 开头）

**设置命令：**

```bash
npx wrangler secret put DEEPSEEK_API_KEY
# 提示输入时粘贴你的 API Key
```

> 💡 **提示：** `wrangler secret put` 会将密钥加密存储在 Cloudflare 服务器上，不会出现在代码或配置文件中。

### 3.2 WIKIPEDIA_USER_AGENT

Wikipedia API 要求所有请求携带有效的 User-Agent 标识。这是一个公开的标识符，用于让 Wikipedia 识别请求来源。

**格式要求：**

```
AppName/Version (ContactURL; ContactEmail)
```

**示例：**

```
game-calendar-cn/1.0 (https://game-calendar-cn.workers.dev; your@email.com)
```

**设置方式（二选一）：**

方式一：通过 Secret 设置（推荐，更安全）

```bash
npx wrangler secret put WIKIPEDIA_USER_AGENT
# 输入你的 User-Agent 字符串
```

方式二：直接写入 wrangler.toml

```toml
[vars]
WIKIPEDIA_USER_AGENT = "game-calendar-cn/1.0 (https://your-url.com; your@email.com)"
```

> ⚠️ **注意：** 如果使用方式一（Secret），则不需要在 `wrangler.toml` 中配置 `[vars]` 部分的 `WIKIPEDIA_USER_AGENT`。Secret 优先级高于 `[vars]`。

---

## 4. 配置 wrangler.toml

完整的 [`wrangler.toml`](../wrangler.toml) 配置模板：

```toml
name = "game-calendar-cn"
main = "src/index.ts"
compatibility_date = "2024-12-01"

# KV 命名空间绑定
[[kv_namespaces]]
binding = "TRANSLATION_KV"
id = "<你的 TRANSLATION_KV 生产 ID>"
preview_id = "<你的 TRANSLATION_KV 本地开发 ID>"

[[kv_namespaces]]
binding = "CALENDAR_KV"
id = "<你的 CALENDAR_KV 生产 ID>"
preview_id = "<你的 CALENDAR_KV 本地开发 ID>"

# Cron 触发器
[triggers]
crons = ["0 */12 * * *"]

# 环境变量（非敏感配置）
[vars]
WIKIPEDIA_USER_AGENT = "game-calendar-cn/1.0 (https://your-url.com; your@email.com)"
```

---

## 5. 数据源配置

### 5.1 替换占位 URL

编辑 [`src/calendar/sources.ts`](../src/calendar/sources.ts)，将 `TODO` 标记的占位 URL 替换为实际的 .ics 数据源：

```typescript
export const CALENDAR_SOURCES: CalendarSource[] = [
  {
    name: 'PlayStation 5 游戏发售日历',
    url: 'https://实际的ps5日历源地址.ics',  // ← 替换此处
    platform: 'ps5',
  },
  // ... 其他平台
];
```

### 5.2 推荐的公开游戏日历 .ics 源

以下是一些可用的游戏发售日历数据源（URL 可能随时间变化，请自行确认有效性）：

| 来源 | 说明 | 获取方式 |
|------|------|---------|
| [releases.com](https://www.releases.com/) | 综合游戏发售信息 | 网站提供 .ics 订阅链接 |
| [IGDB](https://www.igdb.com/) | 社区维护的游戏数据库 | 社区日历或 API 生成 |
| [HowLongToBeat](https://howlongtobeat.com/) | 游戏时长与发售信息 | 社区维护的 .ics 源 |
| 自建爬虫 | 从 Wikipedia/Steam 等抓取 | 自行编写爬虫生成 .ics |

### 5.3 添加自定义数据源

在 `CALENDAR_SOURCES` 数组中添加新条目即可：

```typescript
{
  name: '自定义平台日历',
  url: 'https://your-ics-source.com/platform.ics',
  platform: 'custom_platform',  // 平台标识，用于 URL 参数筛选
},
```

> 💡 **提示：** 数据源的 .ics 文件必须包含标准的 `VCALENDAR` 和 `VEVENT` 组件。每个 `VEVENT` 应包含 `UID`、`SUMMARY`（游戏名）和 `DTSTART`（发售日期）属性。

---

## 6. 种子词库导入

种子词库提供了高频游戏名称的英文→中文映射，是翻译引擎第一层（本地词库）的数据来源。

### 6.1 准备词库文件

词库文件位于 [`data/game-dict-seed.json`](../data/game-dict-seed.json)，格式为 JSON 对象：

```json
{
  "The Legend of Zelda: Tears of the Kingdom": "塞尔达传说：王国之泪",
  "Elden Ring": "艾尔登法环",
  "Cyberpunk 2077": "赛博朋克2077",
  "Red Dead Redemption 2": "荒野大镖客：救赎2"
}
```

### 6.2 执行导入

```bash
npm run seed
```

该命令会：

1. 读取 `data/game-dict-seed.json`
2. 将每个词条转换为 KV 格式（key: `dict:{lowercase_name}`, value: 中文名）
3. 生成临时 JSON 文件
4. 通过 `wrangler kv bulk put` 批量写入 `TRANSLATION_KV`

### 6.3 验证导入结果

```bash
# 通过 Wrangler CLI 查询单个词条
npx wrangler kv key get --binding=TRANSLATION_KV "dict:elden ring"
# 预期输出: 艾尔登法环

# 列出所有 dict: 前缀的 key
npx wrangler kv key list --binding=TRANSLATION_KV --prefix="dict:"
```

---

## 7. 部署与验证

### 7.1 执行部署

```bash
npm run deploy
```

部署成功后，终端会输出类似以下信息：

```
Uploaded game-calendar-cn (X.XX sec)
Published game-calendar-cn (X.XX sec)
  https://game-calendar-cn.<your-subdomain>.workers.dev
```

### 7.2 验证健康检查

```bash
curl https://game-calendar-cn.<your-subdomain>.workers.dev/ping
```

预期响应：

```json
{
  "status": "ok",
  "service": "game-calendar-cn",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

### 7.3 验证首页

```bash
curl https://game-calendar-cn.<your-subdomain>.workers.dev/
```

预期返回服务说明文本，包含可用端点和订阅方式。

### 7.4 验证日历端点

```bash
# 获取全平台日历
curl https://game-calendar-cn.<your-subdomain>.workers.dev/calendar

# 获取指定平台日历
curl "https://game-calendar-cn.<your-subdomain>.workers.dev/calendar?platform=ps5"
```

> ⚠️ **首次部署后：** 日历端点可能返回 503 错误，因为 Cron Trigger 尚未首次触发。请参阅 [8. Cron 触发器说明](#8-cron-触发器说明) 手动触发一次更新。

### 7.5 在日历客户端中添加订阅

**Apple Calendar (macOS/iOS):**

1. 打开日历应用
2. 文件 → 新建日历订阅（macOS）或 设置 → 日历 → 账户 → 添加账户 → 其他 → 添加已订阅的日历（iOS）
3. 输入订阅 URL：`https://game-calendar-cn.<your-subdomain>.workers.dev/calendar`
4. 设置刷新频率（建议「每小时」）

**Google Calendar:**

1. 打开 [Google Calendar](https://calendar.google.com/)
2. 左侧边栏点击「+」→「通过 URL 添加日历」
3. 输入订阅 URL
4. 日历会自动同步

**Microsoft Outlook:**

1. 打开 Outlook 日历
2. 添加日历 → 从 Internet 订阅
3. 输入订阅 URL

---

## 8. Cron 触发器说明

### 8.1 Workers 免费版 vs 付费版

| 特性 | 免费版 (Free) | 付费版 (Paid) |
|------|-------------|--------------|
| Cron Trigger 每天次数限制 | 5 次 | 无限制 |
| Cron 表达式最小间隔 | ~4.8 小时 | 任意 |
| Worker 执行时间限制 | 10ms CPU / 请求 | 30s CPU / 请求 |
| KV 读取次数/天 | 100,000 | 无限制 |
| KV 写入次数/天 | 1,000 | 无限制 |

默认配置 `0 */12 * * *`（每 12 小时）在免费版下完全可行。

### 8.2 手动触发更新

如果需要在 Cron 触发之外手动更新日历：

```bash
# 方法一：使用 wrangler cron trigger（推荐）
npx wrangler cron trigger "0 */12 * * *"

# 方法二：通过 Cloudflare Dashboard
# 1. 登录 Cloudflare Dashboard
# 2. 进入 Workers & Pages → game-calendar-cn
# 3. 点击 Settings → Triggers
# 4. 找到 Cron Triggers 部分，点击 "Run now"
```

### 8.3 修改 Cron 频率

编辑 `wrangler.toml` 中的 `crons` 数组：

```toml
[triggers]
crons = ["0 */12 * * *"]   # 每 12 小时（默认）
# crons = ["0 0 * * *"]    # 每天 UTC 00:00
# crons = ["0 */6 * * *"]  # 每 6 小时（需付费版）
# crons = ["0 */4 * * *"]  # 每 4 小时（需付费版）
```

修改后重新部署：

```bash
npm run deploy
```

---

## 9. 监控与日志

### 9.1 实时日志（wrangler tail）

```bash
# 查看实时日志流
npx wrangler tail

# 过滤包含特定关键词的日志
npx wrangler tail --search "翻译"
npx wrangler tail --search "ERROR"

# 过滤 HTTP 状态码
npx wrangler tail --status error

# 指定输出格式
npx wrangler tail --format json
```

### 9.2 Cloudflare Dashboard 日志

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → **game-calendar-cn**
3. 点击 **Logs** 标签页
4. 可查看实时日志流和历史日志

### 9.3 关键日志标签

项目日志使用 `[模块名]` 前缀，便于过滤和排查：

| 标签 | 说明 |
|------|------|
| `[Cron]` | Cron 触发器相关 |
| `[UpdateCalendar]` | 日历更新主编排流程 |
| `[Fetcher]` | 上游数据源抓取 |
| `[Engine]` | 翻译引擎调度 |
| `[Cache]` | KV 缓存读写 |
| `[LocalDict]` | 本地词库查询 |
| `[Wikipedia]` | Wikipedia API 查询 |
| `[DeepSeek]` | DeepSeek LLM 翻译 |
| `[Calendar]` | /calendar 路由处理 |

### 9.4 Cloudflare Analytics

在 Cloudflare Dashboard → Workers → game-calendar-cn → Analytics 中可以查看：

- 请求量趋势
- 响应时间分布
- 错误率
- CPU 使用时间
- KV 读写次数

---

## 10. 自定义域名（可选）

如果不想使用 `*.workers.dev` 域名，可以绑定自定义域名：

### 10.1 前提条件

- 拥有一个域名
- 该域名的 DNS 已托管在 Cloudflare

### 10.2 绑定步骤

1. 在 Cloudflare Dashboard 中进入你的域名
2. 进入 **Workers Routes**
3. 点击 **Add route**
4. 设置路由：`calendar.yourdomain.com/*`
5. 选择 Worker：`game-calendar-cn`
6. 保存

### 10.3 验证

```bash
curl https://calendar.yourdomain.com/ping
```

---

## 11. 更新与维护

### 11.1 更新代码

```bash
# 拉取最新代码
git pull

# 安装新依赖（如有）
npm install

# 重新部署
npm run deploy
```

### 11.2 更新种子词库

```bash
# 编辑 data/game-dict-seed.json 添加新词条
# 然后重新导入
npm run seed
```

### 11.3 查看 KV 存储使用情况

```bash
# 查看 TRANSLATION_KV 中的 key 数量
npx wrangler kv key list --binding=TRANSLATION_KV --prefix="trans:" | Measure-Object -Line
npx wrangler kv key list --binding=TRANSLATION_KV --prefix="dict:" | Measure-Object -Line

# 查看 CALENDAR_KV 中的 key
npx wrangler kv key list --binding=CALENDAR_KV
```

### 11.4 清除缓存

如果需要强制刷新翻译缓存：

```bash
# 删除所有翻译缓存（谨慎操作）
npx wrangler kv key list --binding=TRANSLATION_KV --prefix="trans:" | ForEach-Object { $_.name } | ForEach-Object { npx wrangler kv key delete --binding=TRANSLATION_KV $_ }

# 删除特定平台的缓存日历
npx wrangler kv key delete --binding=CALENDAR_KV "ics:all"
npx wrangler kv key delete --binding=CALENDAR_KV "ics:ps5"
```

### 11.5 回滚

Cloudflare Workers 支持版本管理：

1. 在 Cloudflare Dashboard → Workers → game-calendar-cn → Deployments
2. 查看历史部署版本
3. 点击某个版本的「...」→「Rollback to this deployment」

或通过 CLI：

```bash
# 列出部署历史
npx wrangler deployments list

# 回滚到指定版本
npx wrangler rollback [deployment-id]
```

---

## 🆘 获取帮助

如遇到部署问题：

1. 查阅 [Cloudflare Workers 官方文档](https://developers.cloudflare.com/workers/)
2. 查阅 [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
3. 在项目 Issues 中搜索或提交问题
4. 使用 `npx wrangler tail` 查看实时日志定位问题
