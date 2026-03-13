# TIA Studio

[English](./README.md)

<p align="center">
  <img src="claws.png" alt="TIA Studio Claw 概览" width="800">
</p>

<div align="center">

[![][github-release-shield]][github-release-link]
[![][github-contributors-shield]][github-contributors-link]

</div>

## 两步认领你的 Claw

1. 创建或选择一个 assistant。
2. 连接一个 channel，开始本地运行。

只需几分钟，就能在你的电脑上跑起一个 local claw —— 同时获得一款功能完整的桌面 AI 助手工作区，用于构建、对话和运营 AI assistants、teams 与 channels。

## TIA Studio 是什么？

TIA（“This Is AI”的缩写）Studio 是一款基于 Electron 的桌面应用，目标是让本地运行 claw 变得简单直接。把一个 assistant 连接到真实世界的 channel 后，它就会变成一个受 OpenClaw 启发的本地操作代理，运行在你的电脑上，贴近你的工具、文件和工作流。

同时，TIA Studio 也是一款功能完整的助手应用。你可以和单个 assistant 对话、协同多个 assistants 组成 team、管理 threaded work，并在一个 local-first 的桌面工作区里统一管理 channels。

目前，TIA Studio 已支持 Lark、Telegram、WhatsApp 和企业微信 channels，后续还会继续扩展更多 channels。

### Channel 支持情况

| Channel | 私聊 | 群聊 | 群聊触发方式 |
| ------- | ---- | ---- | ------------ |
| Lark | ✅ | ✅ | 默认只有在 `@` 提及 bot 时才会回复 |
| Telegram | ✅ | 🚫 | 当前暂不支持群聊 |
| WhatsApp | ✅ | ✅ | 默认只有在 `@` 提及 bot 时才会回复 |
| 企业微信 | ✅ | ✅ | 默认只有在 `@` 提及 bot 时才会回复 |

更多说明可查看 [CHANNEL.md](./CHANNEL.md)。

## 完整的助手工作区

如果你需要的不只是 channel-connected automation，TIA Studio 也提供完整的桌面工作区，用于管理 assistants、teams、threads 和日常运营。

<p align="center">
  <img src="tia-studio.png" alt="TIA Studio 助手工作区" width="800">
</p>

## 架构

TIA Studio 基于一套经过精心选择的技术栈构建，重点强调开发体验与可维护性：

- **[Mastra](https://mastra.ai)** - 驱动 assistant、team 和 channel 的运行时，提供连接 AI 模型与管理 agent 生命周期的清晰抽象
- **[Assistant UI](https://www.assistant-ui.com/)** - 提供聊天界面组件，负责消息渲染、流式响应与会话状态管理
- **Electron + React** - 提供桌面应用外壳与现代 React UI
- **TypeScript** - 为整个代码库提供类型安全

### 设计理念

我们有意保持架构简单：

1. **Assistants 是一等公民** - 每个 assistant（例如 TIA 或 Default Agent）都是一个 Mastra agent，拥有自己的配置、能力和 channel presence
2. **天然支持 teams 与 channels** - teams 用来协调多个 assistants，channels 则让 assistant 能在真实对话发生的地方工作
3. **以 workspace 为中心** - 对话被组织成 threads 和 team views，方便在不同任务之间切换上下文
4. **尽量少做额外抽象** - 我们直接使用 Mastra 的 primitives，而不是额外套一层自定义框架；聊天体验则交给 Assistant UI 处理，而不是自定义消息组件
5. **Local-first** - 一切都运行在你的机器上，不依赖必需的云端服务

## Claws

在 TIA Studio 中，claw 不是一个独立的运行时原语。claw 本质上就是一个绑定了 channel 的 assistant。

如果你想看更完整的架构说明，可以参考 [CLAW.md](./CLAW.md)。

这种设计让模型保持简单：

- assistant 仍然是 provider 选择、instructions、memory、workspace 和 lifecycle state 的唯一事实来源
- channel 只是传输层：把外部消息送进来，再把 assistant 的回复发回去
- claw UI 是一个聚焦的管理界面，用来创建 assistant + channel 的组合关系，而不会引入第二套身份模型

### Claw 是如何实现的

Claw 是通过组合已有的 assistant 和 channel 记录实现的，而不是引入新的数据库实体：

1. **先创建 assistant** - `POST /v1/claws` 会先创建一个普通 assistant，然后要么新建一个受支持的 channel，要么把一个尚未绑定的已有 channel 挂到这个 assistant 上
2. **通过 channel 绑定建立关系** - claw 的关系保存在 `channel.assistantId` 上，这让每个 channel 同时只会有一个激活中的 assistant owner，同时又保留了 channel 解绑定后复用的能力
3. **内置 assistants 不出现在 claw 列表里** - claws route 只暴露用户自己管理的 assistants，因此内置 agents 保持自己的生命周期，也不会显示为 claws
4. **每次 claw 变更都会重载运行时** - 在创建、更新或删除后，TIA Studio 会同时重载 channel service 和 cron scheduler，让路由与调度立刻反映最新的绑定状态
5. **一个 channel 会话对应一个 assistant thread** - 进入的 channel 消息会经过 event bus，根据远端 chat 映射到对应的 thread binding，再通过 assistant runtime 流式处理，最后由 channel adapter 把回复发送出去

### Claws、cron、heartbeat 与身份

因为 claw 底层仍然只是一个 assistant，所以 assistant 自身拥有的行为仍由 assistant 自己负责：

| 关注点               | 所有者                      | claw 中会发生什么                                                                                                                                |
| -------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity             | Assistant workspace         | `IDENTITY.md`、`SOUL.md` 和 `MEMORY.md` 会作为持久化运行上下文被加载；无论你是在应用内还是通过 channel 与它交互，使用的都是同一个 assistant 身份 |
| Heartbeat            | Assistant runtime           | 定时运行会把请求标记为 heartbeat run，只会在主动/定时执行时，在常规身份文件之上额外加入 `HEARTBEAT.md`                                           |
| Cron                 | Assistant + hidden thread   | Cron jobs 绑定在 `assistantId` 上，要求 assistant 拥有 workspace root，并通过一个 hidden thread 让定时任务历史继续附着在同一个 assistant 上      |
| Enable/disable state | Assistant + channel runtime | 当一个 claw 被禁用时，assistant 一侧也会被禁用，因此 runtime 的 channel 投递和 cron 调度都会停止，直到 assistant 重新启用                        |

这意味着把一个 assistant 适配成 claw，**不会**分叉出另一套身份：

- Channel chat 使用的仍然是和直接对话相同的 assistant instructions、provider、tools 与 workspace
- Cron jobs 依然属于 assistant，而不是 channel；它们的输出也会回写到 assistant workspace 的工作日志中
- 只有 heartbeat 相关的指导会保留在 `HEARTBEAT.md` 中，因此主动执行可以表现不同，但不会修改 assistant 的核心身份
- 未来的 claw 能力也可以继续建立在 assistant primitives 之上，而不需要引入平行的 claw-only 配置体系

## 功能特性

- 🦾 assistant 绑定 channel 后即可轻松运行本地 local claw
- 🤖 提供支持多 assistants 的完整 AI 助手工作区
- 👥 通过 teams 在一个工作区内协调多个 assistants
- 📡 使用 channels 接入真实世界中的对话
- ✅ 现在已支持 Lark、Telegram、WhatsApp 和企业微信
- 🚧 后续还有更多 channels
- 💬 基于 threads 的会话管理
- 🎨 干净、深色主题的界面
- 🔒 Local-first 架构
- ⚡ 快速、原生的桌面性能

## 快速开始

### 前置要求

- Node.js 20+
- pnpm

### 安装

```bash
pnpm install

pnpm approve-builds # 确保所有需要原生构建的包都已批准
```

### 开发

```bash
pnpm run dev
```

### 构建

```bash
# macOS（当前架构）
pnpm run build:mac

# macOS Intel
pnpm run build:mac:x64

# macOS Apple Silicon
pnpm run build:mac:arm64

# Windows
pnpm run build:win

# Linux
pnpm run build:linux
```

如果你是在 Apple Silicon 机器上构建 Intel 版 macOS 安装包，请在 Rosetta 终端里执行 `pnpm run build:mac:x64`，这样原生模块会按 `x64` 安装。

## 项目结构

如果你想看更完整的源码结构说明，可以参考 [STRUCTURE.md](./STRUCTURE.md)。

```
tia-studio/
├── src/
│   ├── main/          # Electron 主进程
│   ├── renderer/      # React UI 组件
│   └── preload/       # Electron preload 脚本
├── build/             # 构建资源（图标等）
└── resources/         # 应用资源
```

## 技术栈

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Desktop**: Electron 39
- **AI Framework**: Mastra, AI SDK
- **UI Components**: Assistant UI, Radix UI
- **Build**: Vite, electron-builder

## 开发说明

### 推荐 IDE

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

### 脚本

- `pnpm run dev` - 启动开发服务器
- `pnpm run build` - 构建生产版本
- `pnpm run lint` - 运行 ESLint
- `pnpm run format` - 使用 Prettier 格式化代码
- `pnpm test` - 运行测试

## License

MIT

<!-- Links & Images -->

[github-release-shield]: https://img.shields.io/github/v/release/ZhuXinAI/tia-studio?logo=github
[github-release-link]: https://github.com/ZhuXinAI/tia-studio/releases
[github-contributors-shield]: https://img.shields.io/github/contributors/ZhuXinAI/tia-studio?logo=github
[github-contributors-link]: https://github.com/ZhuXinAI/tia-studio/graphs/contributors
