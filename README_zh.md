# TIA Studio

[English](./README.md)

TIA Studio 是一款 local-first Electron 工作区，用于在本地文件和工具上运行 Pi Coding Agent 会话。桌面聊天、外部 channel，以及未来由应用拥有的自动化入口，共用同一套运行时协议。

## 运行时架构

- **内嵌 Pi SDK** — Electron main 在自身的 Node.js host 中导入 `@earendil-works/pi-coding-agent`，并通过 `ModelRuntime`、`SessionManager` 与 `createAgentSession` 创建会话。
- **应用自有 API** — renderer 只与本地 HTTP/SSE 边界通信；Pi SDK 对象和凭据不会进入 renderer。
- **Assistant UI** — 使用官方 assistant-ui thread 渲染流式文本、推理、工具调用、审批、附件和空会话。
- **本地持久化** — SQLite 保存应用会话元数据和标准化事件；Pi session 文件负责 SDK 的重启恢复。
- **唯一的本地执行路径** — 桌面聊天和 channel 投递共用内嵌运行时，不存在第二套 agent harness 或外部执行服务。

v3 从空白 Pi 历史开始。TIA Studio 不会向 workspace 预加载身份、灵魂、记忆或 prompt 文件。用户选择的 workspace 会直接交给 Pi；没有选择 workspace 的聊天使用一个空白的应用管理目录。

## 聊天能力

- 会话列表，以及创建、重命名、删除和重启恢复
- 流式文本、推理、工具调用、工具结果和错误
- 图片附件
- 系统或浏览器引擎支持时启用原生语音输入
- Standard Access 对高风险操作进行审批
- 每个会话可独立开启 Full Access，并清晰显示跳过审批的状态；凭据文件仍然禁止访问
- 运行中的 steering、follow-up queue 与取消

## Channels

TIA Studio 支持 Discord、Lark、Telegram、WhatsApp、企业微信和微信客服。远端会话会直接映射到应用 session，并通过桌面聊天使用的同一个 Pi runtime 投递。

各 channel 的设置方法见 [CHANNEL.md](./CHANNEL.md)。

## 开发

需要 Node.js 20+ 与 pnpm。

```bash
pnpm install
pnpm run dev
```

浏览器标注模式会继续由 Electron main 承担 API 与 Pi host：

```bash
pnpm run dev:annotate
```

端到端测试必须使用带保护的启动器：

```bash
pnpm run e2e:guarded:annotate
pnpm run e2e:guarded
```

如果出现重复创建 session、重复 5xx、持续过高 CPU 或超时，保护器会终止整个进程树。

## 验证与构建

```bash
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
pnpm run build:mac:arm64
```

迁移决策和当前架构见 [PI_MIGRATION.md](./PI_MIGRATION.md)、[TASKS.md](./TASKS.md) 与 [docs/pi-migration/CURRENT_ARCHITECTURE.md](./docs/pi-migration/CURRENT_ARCHITECTURE.md)。

## 技术栈

- Electron 39、React 19、TypeScript、Vite
- `@earendil-works/pi-coding-agent`
- assistant-ui 与 Radix UI
- Hono 与 LibSQL/SQLite

## License

MIT
