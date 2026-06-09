# 🎮 Game Calendar CN - 中文游戏发售日历

> 自动追踪全球游戏发售日期，提供中文翻译的 .ics 日历订阅服务

基于 [ical-videogames](https://github.com/ical-videogames) 开源项目理念，从 **Wikipedia 游戏发售列表** 抓取数据，部署在 Cloudflare Workers 上，通过四层智能翻译机制将英文游戏发售日历转化为中文版本，支持所有主流日历客户端订阅。

**🌐 前端页面：** 通过 GitHub Pages 提供交互式订阅页面，可按平台筛选并一键复制订阅链接。

---

## ✨ 功能特性

- 📡 **Wikipedia 数据源** — 从维基百科年度游戏发售列表自动抓取数据，免费、无需 API Key
- 🌐 **前端订阅页面** — GitHub Pages 托管的交互式页面，支持平台筛选和一键复制
- 🧠 **四层智能翻译** — KV 缓存 → 本地词库 → Wikipedia API → DeepSeek LLM，逐层降级，命中即停
- 💾 **翻译缓存** — 翻译结果自动缓存至 KV（30 天 TTL），避免重复 API 调用
- ⏰ **定时更新** — 每 12 小时通过 Cloudflare Cron Trigger 自动更新日历数据
- 📅 **标准 .ics 格式** — 符合 RFC 5545 标准，支持 Apple Calendar、Google Calendar、Outlook 等所有主流客户端
- 🌍 **全球边缘分发** — 部署在 Cloudflare Workers，依托全球 300+ 边缘节点实现低延迟访问
- 🏷️ **智能事件命名** — 翻译后的事件标题格式为 `[中文名] English Name`，中英对照一目了然
- 🎯 **多平台支持** — 支持按平台筛选订阅，只关注你关心的游戏平台

## 📅 支持的平台

| 平台标识 | 说明 |
|---------|------|
| `ps5` | PlayStation 5 |
| `ps4` | PlayStation 4 |
| `switch` | Nintendo Switch |
| `switch2` | Nintendo Switch 2 |
| `xbox_series` | Xbox Series X\|S |
| `xbox_one` | Xbox One |
| `pc` | PC (Steam) |

## 🔗 订阅链接格式

部署完成后，通过以下 URL 格式订阅日历：

```
# 订阅全部平台日历
https://<your-worker-domain>/calendar

# 订阅指定平台（单个）
https://<your-worker-domain>/calendar?platform=ps5

# 订阅多个平台
https://<your-worker-domain>/calendar?platform=ps5&platform=switch&platform=pc
```

**使用示例：**

```
# Cloudflare Workers 默认域名
https://game-calendar-cn.<your-subdomain>.workers.dev/calendar

# 绑定自定义域名后
https://calendar.yourdomain.com/calendar?platform=ps5&platform=switch
```

> 💡 **提示：** 将上述链接直接添加到你的日历客户端（Apple Calendar、Google Calendar、Outlook 等）即可自动同步，日历内容每 12 小时自动更新。

## 🏗️ 技术架构

本项目采用 **预生成 + 缓存分发** 架构，将耗时的翻译操作与用户请求完全解耦：

```
┌─────────────────────────────────────────────────────────┐
│                  Cron Trigger (每 12h)                    │
│                                                          │
│  1. wiki-fetcher → 从 Wikipedia API 抓取 wikitext        │
│  2. wiki-parser  → 解析 wikitext 为 CalendarEvent[]      │
│  3. translator   → 四层翻译（缓存→词库→Wikipedia→DeepSeek）│
│  4. generator    → 生成中文 .ics 文件                     │
│  5. 写入 KV（ics:{platform} + ics:all）                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  HTTP Request                             │
│                                                          │
│  GET /calendar → 从 KV 读取预生成 .ics → 返回给用户       │
│  （毫秒级响应，无需等待翻译）                              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  GitHub Pages 前端                        │
│                                                          │
│  docs/index.html → 交互式订阅页面                        │
│  支持平台筛选、URL 生成、一键复制                         │
└─────────────────────────────────────────────────────────┘
```

详细的架构设计文档请参阅 [docs/architecture.md](docs/architecture.md)。

## 🚀 快速开始

### 前置条件

- **Node.js** 18 或更高版本
- **Cloudflare 账户**（免费版即可）
- **Wrangler CLI**（Cloudflare Workers 官方部署工具）
- **DeepSeek API Key**（用于 LLM 翻译，[获取地址](https://platform.deepseek.com/)）

### 安装与部署

```bash
# 1. 克隆项目
git clone https://github.com/your-username/game-calendar-cn.git
cd game-calendar-cn

# 2. 安装依赖
npm install

# 3. 登录 Cloudflare
npx wrangler login

# 4. 创建 KV 命名空间
npx wrangler kv namespace create TRANSLATION_KV
npx wrangler kv namespace create CALENDAR_KV
# 将输出的 ID 填入 wrangler.toml 对应位置

# 5. 设置环境变量（Secrets）
npx wrangler secret put DEEPSEEK_API_KEY
# 输入你的 DeepSeek API Key

npx wrangler secret put WIKIPEDIA_USER_AGENT
# 输入你的 Wikipedia User-Agent（格式：AppName/Version (URL; email)）

# 6. 导入种子词库
npm run seed

# 7. 部署
npm run deploy
```

部署完成后，Wrangler 会输出 Worker 的访问域名，如：
```
https://game-calendar-cn.<your-subdomain>.workers.dev
```

### 本地开发

```bash
# 启动本地开发服务器
npm run dev
```

**本地开发注意事项：**

- 首次运行时，Wrangler 会提示你创建本地开发用的 KV 命名空间（`preview_id`）
- 本地开发环境使用 `wrangler.toml` 中配置的 `preview_id` 对应的 KV 命名空间
- DeepSeek API Key 和 Wikipedia User-Agent 需要在项目根目录创建 `.dev.vars` 文件：

```bash
# .dev.vars（不要提交到 Git）
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
WIKIPEDIA_USER_AGENT=game-calendar-cn/1.0 (https://your-url.com; your@email.com)
```

- 本地开发时 Cron Trigger 不会自动触发，需手动调用更新接口或使用 `wrangler dev --test-scheduled`

## 📁 项目结构

```
game-calendar-cn/
├── wrangler.toml                          # Cloudflare Workers 部署配置
├── package.json                           # 项目依赖与脚本
├── tsconfig.json                          # TypeScript 编译配置
├── .gitignore                             # Git 忽略配置
├── .dev.vars                              # 本地开发环境变量（不提交到 Git）
│
├── data/
│   └── game-dict-seed.json                # 种子词库（英文→中文游戏名映射）
│
├── docs/                                  # GitHub Pages 前端 + 文档
│   ├── index.html                         # 前端订阅页面
│   ├── static/
│   │   ├── app.css                        # 前端样式
│   │   └── app.js                         # 前端交互逻辑
│   ├── architecture.md                    # 架构设计文档
│   └── deployment.md                      # 部署详细指南
│
├── scripts/
│   └── seed-dict.ts                       # 种子词库导入脚本
│
└── src/
    ├── index.ts                           # Worker 入口（fetch + scheduled handler）
    ├── config.ts                          # 配置常量与环境变量类型
    ├── types.ts                           # 全局类型定义
    │
    ├── routes/
    │   ├── calendar.ts                    # /calendar 路由处理器
    │   └── ping.ts                        # /ping 健康检查路由
    │
    ├── tasks/
    │   └── update-calendar.ts             # Cron 定时任务主编排函数
    │
    ├── calendar/
    │   ├── sources.ts                     # 数据源配置（Wikipedia + ICS）
    │   ├── fetcher.ts                     # 上游 ICS 数据源抓取器
    │   ├── wiki-fetcher.ts               # Wikipedia 数据抓取器
    │   ├── wiki-parser.ts                # Wikipedia wikitext 解析器
    │   ├── parser.ts                      # 轻量 ICS 解析器（RFC 5545）
    │   └── generator.ts                   # 中文 .ics 文件生成器
    │
    └── translator/
        ├── engine.ts                      # 翻译引擎调度器（四层短路逻辑）
        ├── cache.ts                       # KV 翻译缓存读写封装
        ├── local-dict.ts                  # 第一层：本地词库查询
        ├── wikipedia.ts                   # 第二层：Wikipedia MediaWiki API
        └── deepseek.ts                    # 第三层：DeepSeek LLM API
```

## ⚙️ 配置说明

### wrangler.toml 配置项

```toml
name = "game-calendar-cn"          # Worker 名称
main = "src/index.ts"              # 入口文件
compatibility_date = "2024-12-01"  # Workers 兼容性日期

# KV 命名空间绑定
[[kv_namespaces]]
binding = "TRANSLATION_KV"         # 翻译缓存与种子词库
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
preview_id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"  # 本地开发用

[[kv_namespaces]]
binding = "CALENDAR_KV"            # 生成的 .ics 文件存储
id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
preview_id = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

# Cron 触发器：每 12 小时执行一次
[triggers]
crons = ["0 */12 * * *"]

# 环境变量
[vars]
WIKIPEDIA_USER_AGENT = "game-calendar-cn/1.0 (https://your-url.com; your@email.com)"
```

### 环境变量说明

| 变量名 | 设置方式 | 说明 |
|--------|---------|------|
| `DEEPSEEK_API_KEY` | `wrangler secret put` | DeepSeek API 密钥，用于 LLM 翻译 |
| `WIKIPEDIA_USER_AGENT` | `wrangler secret put` 或 `wrangler.toml` | Wikipedia API 要求的 User-Agent 标识 |

### KV Namespace 创建

```bash
# 创建翻译缓存 KV
npx wrangler kv namespace create TRANSLATION_KV
# 输出: { binding = "TRANSLATION_KV", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }

# 创建日历文件 KV
npx wrangler kv namespace create CALENDAR_KV
# 输出: { binding = "CALENDAR_KV", id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
```

将输出的 `id` 值填入 `wrangler.toml` 对应位置。如需本地开发，还需创建 preview 命名空间：

```bash
npx wrangler kv namespace create TRANSLATION_KV --preview
npx wrangler kv namespace create CALENDAR_KV --preview
```

### Cron 触发器配置

默认配置为每 12 小时执行一次（`0 */12 * * *`），可在 `wrangler.toml` 的 `[triggers]` 部分修改：

```toml
[triggers]
crons = ["0 */12 * * *"]   # 每 12 小时（00:00 和 12:00 UTC）
# crons = ["0 0 * * *"]    # 每天 UTC 00:00
# crons = ["0 */6 * * *"]  # 每 6 小时
```

> ⚠️ **注意：** Cloudflare Workers 免费版限制 Cron Trigger 每天最多触发 5 次，付费版（Workers Paid）无此限制。

## 🔧 翻译机制详解

翻译引擎采用 **四层短路策略**：对每个游戏名依次尝试以下来源，命中即停止，未命中则降级到下一层。每层独立 try-catch，确保单层失败不影响后续层。

### 第零层：KV 缓存

首先查询 KV 中已缓存的翻译结果（key 格式：`trans:{lowercase_name}`），TTL 为 30 天。缓存命中直接返回，是最快的路径。

### 第一层：本地词库

从 KV 中查询预置的种子词库（key 格式：`dict:{lowercase_name}`），支持三级匹配：

1. **精确匹配** — 直接匹配小写化后的游戏名
2. **去副标题匹配** — 如 `Game Name: Subtitle` → 匹配 `game name`
3. **去括号匹配** — 如 `Game Name (2024)` → 匹配 `game name`

词库数据来源于 Steam 官方中文名、其乐论坛、游民星空等游戏社区的高频词条。

### 第二层：Wikipedia API

通过 MediaWiki API 查询英文 Wikipedia 条目的中文 langlink：

```
GET https://en.wikipedia.org/w/api.php
  ?action=query&titles=GameName&prop=langlinks&lllang=zh&format=json
```

- 每批最多查询 50 个标题
- 自动清洗消歧义后缀（如 `(游戏)`、`(电子游戏)`、`(系列)`）
- 批次间延迟 1 秒，避免触发 MediaWiki API 速率限制

### 第三层：DeepSeek LLM

当本地词库和 Wikipedia 均无法命中时，使用 DeepSeek Chat API 进行智能翻译：

- **模型：** `deepseek-chat`
- **每批最多 20 个游戏名**
- **批次间延迟 3 秒**
- **System Prompt** 指导 LLM 优先使用官方中文名，其次使用中国大陆主流游戏媒体通用译名

翻译结果会自动写入 KV 缓存，后续相同查询将直接命中缓存层，逐步减少对 API 的依赖。

## 📝 自定义与扩展

### 修改数据源

编辑 [`src/calendar/sources.ts`](src/calendar/sources.ts)，在 `DATA_SOURCES` 数组中配置数据源：

```typescript
// Wikipedia 数据源（推荐）
{
  type: 'wikipedia',
  year: 2026,
  pageTitle: 'List_of_video_games_released_in_2026',
},

// ICS 数据源（如果有的话）
{
  type: 'ics',
  name: 'Steam Deck 游戏发售日历',
  url: 'https://example.com/calendars/steamdeck-releases.ics',
  platform: 'steamdeck',
},
```

### 扩充翻译词库

编辑 [`data/game-dict-seed.json`](data/game-dict-seed.json)，添加新的英文→中文映射：

```json
{
  "Game Name": "游戏中文名",
  "Another Game": "另一个游戏中文名"
}
```

然后重新导入：

```bash
npm run seed
```

### 更换 LLM 提供商

如需使用其他 LLM（如 OpenAI、Claude 等），修改以下文件：

1. [`src/config.ts`](src/config.ts) — 更新 API 端点和模型名称常量
2. [`src/translator/deepseek.ts`](src/translator/deepseek.ts) — 修改 API 调用逻辑和响应解析

### 自定义日历输出格式

修改 [`src/calendar/generator.ts`](src/calendar/generator.ts) 可自定义：

- 日历名称和描述（`CALENDAR_NAME`、`CALENDAR_DESCRIPTION`）
- 事件标题格式（如 `[中文名] English Name` 或纯中文名）
- 日期格式和时区处理

## 🐛 故障排除

### 常见问题

**Q: 部署后访问 `/calendar` 返回 503 "日历数据尚未生成"**

A: 这是因为 Cron Trigger 尚未首次触发。解决方法：
```bash
# 手动触发一次更新
npx wrangler cron trigger "0 */12 * * *"
```

**Q: 翻译结果不准确或使用了错误的中文名**

A: 可以在 [`data/game-dict-seed.json`](data/game-dict-seed.json) 中手动指定正确的翻译，然后重新导入种子词库。本地词库的优先级高于 Wikipedia 和 DeepSeek。

**Q: Wikipedia API 查询失败**

A: 检查 `WIKIPEDIA_USER_AGENT` 是否正确设置。Wikipedia API 要求所有请求携带有效的 User-Agent 标识。

**Q: DeepSeek API 调用失败**

A: 检查 `DEEPSEEK_API_KEY` 是否有效，账户是否有足够余额。可在 [DeepSeek 平台](https://platform.deepseek.com/) 查看 API 使用情况。

**Q: Cron Trigger 没有执行**

A: Cloudflare Workers 免费版限制 Cron Trigger 每天最多 5 次。检查 `wrangler.toml` 中的 cron 表达式是否超出限制。也可在 Cloudflare Dashboard → Workers → your worker → Settings → Triggers 中查看触发器状态。

### 日志查看

```bash
# 实时查看 Worker 日志
npx wrangler tail

# 过滤特定日志
npx wrangler tail --search "翻译"
npx wrangler tail --search "ERROR"
```

也可在 Cloudflare Dashboard → Workers → your worker → Logs 中查看实时和历史日志。

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

## 🙏 致谢

- [ical-videogames](https://github.com/ical-videogames) — 项目理念来源
- [Cloudflare Workers](https://workers.cloudflare.com/) — 边缘计算平台
- [GitHub Pages](https://pages.github.com/) — 前端静态页面托管
- [DeepSeek](https://www.deepseek.com/) — LLM 翻译能力提供者
- [Wikipedia](https://www.wikipedia.org/) — 游戏发售数据源 + 多语言词条
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) — Cloudflare Workers CLI 工具
