# TIA Studio 竞品研究、自评与发布前路线图

日期：2026-08-08
范围：TIA Studio 当前工作区实现；WorkBuddy（腾讯）；PyCharm、Spyder、Thonny、JupyterLab。
方法：优先查看各产品官方产品页/文档，再用当前仓库的路由、服务、共享类型和测试做反向核对。竞品页面是“官方明确展示的能力”，没有展示的能力不推断为绝对不存在。

## 结论先行

TIA Studio 已经不是一个只有聊天框的 Agent 壳：它有本机工作区边界、Pi 运行时、审批/权限、MCP/Skills、集成终端、Git Review、Python 检查、自动化、Artifacts、Command Center、Browser Preview、Memory Vault 和 Diagnostics。

但产品定位仍然夹在两类产品之间：

1. 相比 WorkBuddy，TIA 的本机开发控制面更扎实，但缺少“专家团队并行交付”、多渠道办公入口、直接研究报告/PPT/多模态交付的上层工作流。
2. 相比 PyCharm/Spyder/Thonny/JupyterLab，TIA 更擅长“让 Agent 在安全边界内完成任务”，但还不是完整的 Python IDE、科学计算工作台、教学 IDE 或 Notebook 平台。
3. 最应该守住的差异化是：local-first、provider-neutral、可解释审批、工作区隔离和可复核产物；最应该补的不是更多按钮，而是把 Agent 交付、Python 工程质量和团队协作串成一条可验收链路。

## 1→16 执行证据矩阵

下面的“已有”只表示当前仓库已经有实现和路由/组件证据；它不把尚未做的商业级能力包装成已完成。工作区边界、线程边界和不自动执行外部副作用仍然优先于功能数量。

| # | 当前交付面 | 当前实现证据 | 当前验证/边界 |
| --- | --- | --- | --- |
| 1 | Artifact / Result Center | `src/main/agents/deliverable-tool.ts`、`src/main/persistence/repos/artifacts-repo.ts`、Artifact rail；只有 Agent 明确发布的 deliverable 才进入面板，文件下载按 session + workspace realpath 校验，默认 attachment | repository、deliverable tool、agent route 测试；不开放任意路径读取，不做文件分享/版本链 |
| 2 | 集成 Terminal | `src/main/terminal/terminal-service.ts`、session-scoped stop/SSE route、Terminal rail | terminal route/service 测试；cwd 只能来自 session workspace，仍不是 PTY/多机终端 |
| 3 | Git Review | `src/main/git/git-review-service.ts`、Git rail；diff、分支、stage/unstage | Git service/route 测试；不自动 commit、push、删除或创建 PR |
| 4 | Python tooling | `src/main/python/python-tooling-service.ts`、Python route/rail；解释器发现、compile、pytest | Python focused tests；仍缺 LSP、断点调试、Profiler、Notebook |
| 5 | Agent Command Center | Command Center route/page；跨线程运行、审批、错误、取消入口 | renderer/agent route 测试；取消不会绕过审批，审批仍需打开对应线程处理 |
| 6 | Browser Preview | Browser rail；仅允许 `http`/`https`，sandbox iframe，可外部打开 | UI 代码证据；不等于浏览器自动化或真实 provider 预览环境 |
| 7 | Integrations Center | 已按 IA 复核移除；MCP 健康与配置留在 Skills & MCP，消息频道留在 Settings > Channels | 原页面只是重复汇总，没有独立操作闭环 |
| 8 | Automation review queue | RRULE 服务、运行记录、`needs-review` 状态、显式 `PATCH .../review` | automation route/repository/service 测试；时区、退避、幂等、通知和保留策略仍待补 |
| 9 | Memory Vault | memories migration/repository/route/page；全局/工作区、启用/删除、明确控制 | memory tests；当前不会自动把记忆注入每个线程，尚无线程级附加预览 |
| 10 | Command Palette | 全局快捷键、导航和搜索 workspace/thread 的 palette | app shell/router focused tests；搜索索引仍是本机 UI 导航，不是全局动作编排器 |
| 11 | Workspace administration | workspace root/name 管理、绝对路径标准化、目录检查、内置 Chats 保护 | workspace route/repository tests；已有线程时拒绝迁移 root，避免 live/persisted cwd 不一致 |
| 12 | Permissions Center | allow once/session/workspace、规则筛选/撤销、硬阻断 | permission tests；尚无团队审计或远程策略同步 |
| 13 | Skills lifecycle | marketplace/catalog、install/update/remove、runtime onboarding | skills tests；供应链签名、来源 diff、权限声明仍待补 |
| 14 | Diagnostics / reliability | local health snapshot + provider/MCP/channel dependency signals；不返回凭据/会话内容 | health tests；provider signal 表示已配置，不主动证明网络可达 |
| 15 | i18n / accessibility detail | locale sync、中文核心页面、语义 aria-live、图标按钮 label、键盘入口 | typecheck/lint + renderer focused tests；其他语言新增词条默认回退英文，仍需目标平台人工验收 |
| 16 | 竞品研究与自评 | 本文功能矩阵、WorkBuddy/PyCharm/Spyder/Thonny/JupyterLab 对比、16 条改进路线 | 来源链接和仓库证据；竞品页面是截至 2026-08-08 的官方页面快照，不代表永久不变 |

## 功能矩阵

标记：✅ 已有/官方明确；◐ 部分具备或需要组合使用；— 不是核心能力/当前没有证据；？需要单独验证。

| 能力 | TIA Studio 当前 | WorkBuddy | PyCharm | Spyder | Thonny | JupyterLab |
| --- | --- | --- | --- | --- | --- | --- |
| 一句话 Agent 执行任务 | ✅ Pi 会话、工具调用、SSE、线程恢复 | ✅ 官方定位为“一人指挥、专家执行” | ◐ AI/Junie 入口存在，但核心仍是 IDE | ◐ 以交互式 Python 为主 | — | ◐ Notebook 单元格交互，不是同类 Agent 工作台 |
| 多专家/多 Agent 并行 | ◐ 有跨线程 Command Center，无专家 DAG/协作编排 | ✅ 官方写明 100+ 领域专家、多专家并行 | ◐ 可借助 AI/插件，未作为页面主能力 | — | — | — |
| MCP 与 Skills 扩展 | ✅ MCP 健康、OAuth/认证、Skills 安装/更新/卸载 | ✅ 官方页明确 MCP 生态 + 自定义 Skills | ◐ 插件/AI 生态，但不是 TIA 的同一 MCP/Skills 模型 | ◐ 插件/扩展生态 | ◐ 简单插件基础设施 | ✅ 模块化扩展/丰富生态 |
| 消息渠道/办公入口 | ✅ Discord、Telegram、微信/企业微信、Lark、WhatsApp 等代码路径 | ✅ 官方展示桌面、微信、企业微信、QQ、飞书、钉钉、小程序 | — | — | — | ◐ 可通过 JupyterHub/分享生态接入 |
| 工作区隔离 | ✅ workspace path 校验、线程/终端/权限按工作区 | ◐ 官方强调办公场景，未核验同等本地目录权限模型 | ✅ 项目模型成熟 | ✅ 项目/科学工作流成熟 | ◐ 单机项目简单 | ✅ 工作区/文件浏览器模型 |
| Python 解释器/虚拟环境 | ◐ 发现解释器/venv、compile/pytest 检查、uv 管理 | ？官方页未展开 IDE 级解释器能力 | ✅ 专业解释器、环境、包管理 | ✅ Conda/PyData 工作流 | ✅ 内置 Python，也可用外部安装 | ◐ Kernel 管理 |
| Python 代码编辑/补全/重构 | — 当前不是 LSP IDE | ✅/◐ 以 Agent 代做为主，非传统 IDE 核心 | ✅ 补全、类型提示、文档、自动导入、重构 | ✅ Editor、代码分析、搜索 | ✅ 基础补全、语法错误提示 | ◐ 编辑器 + Notebook |
| 运行、终端、测试 | ✅ 工作区安全终端、停止、实时输出；pytest/compile 检查 | ◐ Agent 执行和办公自动化 | ✅ 运行配置、测试、终端 | ✅ 交互执行 | ✅ 初学者系统 Shell、pip GUI | ✅ Kernel 执行 |
| 调试/Profiler | — 尚无断点调试/Profiler UI | ？未在官方 WorkBuddy 页核验 | ✅ Debugging、Python Profiler | ◐ 交互式探索，重点不是传统 Debugger | ✅ 单步调试、表达式求值、调用帧 | ◐ Kernel/调试扩展可组合 |
| 科学计算/变量探索 | — 无 Variable Explorer/Notebook | ◐ 数据表格/日志洞察是官方场景 | ◐ Data/SQL 与科学插件生态 | ✅ Variable Explorer、Matplotlib/Pandas/NumPy/Conda/SymPy | ◐ 变量表，教学导向 | ✅ 富输出、widgets、Spark/Pandas/TensorFlow 生态 |
| Notebook/富输出/分享 | ◐ Artifacts 预览、Browser Preview，无 Notebook | ✅ 官方强调报告、PPT、多模态内容交付 | ◐ Notebook/插件可用 | ◐ 交互式编辑 | — | ✅ Notebook、富 MIME 输出、分享、JupyterHub |
| 报告/PPT/多模态交付 | ◐ Artifact Center 可收集文件/URL/工具输出 | ✅ 官方明确调研报告、完整 PPT、图文/视频/剪辑 | ◐ 依赖插件/AI | ◐ 研究复用与数据分析 | — | ◐ Notebook/Voilà 可分享结果 |
| 自动化/计划任务 | ✅ RRULE、运行记录、needs-review/failed 队列 | ✅ 官方业务数据自动化响应场景 | ◐ 外部任务/插件 | — | — | ◐ JupyterHub/外部调度 |
| Git Review | ✅ 分支状态、变更文件、unified diff、stage/unstage | ◐ Agent 可做开发，但官方页未展示同等 Review 控制台 | ✅ Git/代码审查生态成熟 | ◐ 插件/外部 Git | ◐ 插件基础设施 | ◐ Git 扩展 |
| 审批/安全策略 | ✅ allow once/session/workspace、硬阻断、可撤销规则 | ？官方页未展开本地命令安全模型 | ✅ IDE 权限/安全能力成熟但模型不同 | ◐ 依赖本机环境 | ◐ 简单学习场景 | ◐ Hub 身份/权限可组合 |
| Memory/上下文管理 | ✅ 显式、可编辑、可删除、全局/工作区 Memory Vault | ◐ 专家团可能依赖上下文，但官方页未展示用户可编辑 Memory Vault | ◐ 项目索引/设置，不是同一显式记忆模型 | — | — | ◐ Notebook 本身承载上下文 |
| 连接健康/诊断 | ✅ MCP health + Diagnostics + SSE 状态；按域分布在 Skills & MCP、Channels、Diagnostics | ◐ 多渠道入口明确，内部诊断未在页面核验 | ✅ IDE/插件诊断成熟 | ◐ 生态工具成熟 | ✅ 简化安装/运行 | ✅ Hub/Kernel/服务生态成熟 |
| 本机优先/凭据边界 | ✅ SQLite、本机 API、工作区内路径限制、凭据不进诊断快照 | ？官方页强调免部署/全平台，数据边界需另查 | ◐ 桌面 IDE，云能力因配置而异 | ✅ 本地开源应用 | ✅ 本地开源应用 | ◐ 可本地或 Hub 部署 |
| 团队协作/成员/邀请 | — 当前明确标注 local-only，暂无远程成员目录 | ◐ 小团队/企业场景定位强，具体协作模型需单独核验 | ✅ Team/企业生态 | ◐ 社区驱动 | ◐ 插件/社区 | ✅ JupyterHub 面向公司、课堂、研究组 |

## TIA 目前做得好的地方

- 将 Agent 运行时放在 Electron main，并以 HTTP/SSE 作为 renderer 边界，避免把本机能力散落在 UI 中。
- 将命令权限拆成一次、会话、工作区三个可解释范围；规则可查看、按工作区筛选和撤销。
- 终端、Python 检查、Git Review 都把 cwd 限制在工作区，且操作由用户点击触发，不自动提交、推送或删除用户仓库。
- Artifacts、自动化运行记录、审批队列、Command Center 和 Diagnostics 形成了“执行后可复核”的骨架。
- Skills 生命周期不只做安装，还具备更新、卸载和失败信息；MCP/频道有独立健康视图。
- Memory Vault 先做显式控制，而不是把不透明记忆偷偷注入所有会话；这对信任和可解释性是正确取舍。
- Workspaces 管理页对内置 Chats 做了保护，并诚实标出当前没有远程团队成员/邀请能力。

## 深度自评：至少 10 个可改进点

优先级：P0 = 影响产品可信度/核心闭环；P1 = 明显竞争差距；P2 = 产品打磨。

1. **P0：把 Memory 从“存得住”推进到“用得明白”。** 增加按线程显式附加、预览将注入的内容、来源标记、冲突提示和一键撤销；继续禁止无提示的全局注入。
2. **P0：补 Agent 任务编排 DAG。** WorkBuddy 的专家团是明显差异：TIA 需要可视化 planner → worker → reviewer，支持并行、依赖、重试、人工 gate 和最终合并，而不只是多个独立线程。
3. **P0：把可靠性指标产品化。** 对每个 Agent/自动化展示首 token 延迟、工具耗时、失败原因、重试次数、审批等待时间和最终产物状态；Diagnostics 目前只证明桥接进程健康。
4. **P1：补 Python LSP 层。** 接入解释器对应的 language server，提供类型错误、跳转、补全、重命名、导入修复和诊断面板；当前 Python tooling 仍偏“检查按钮”。
5. **P1：补 Python Debugger/Profiler。** 支持断点、变量/调用帧、异常停住、step over/into/out 和 CPU/内存 profile；这是 PyCharm、Thonny 的直接差距。
6. **P1：补 Notebook/Data Science 工作流。** 至少支持 `.ipynb` 查看/执行、kernel 选择、富输出、变量表和导出；这是 Spyder/Jupyter 的核心优势，不能只依赖 Agent 生成脚本。
7. **P1：补环境与包管理闭环。** 从“发现 Python/venv/uv”扩展到创建环境、选择解释器、安装/锁定依赖、查看冲突和复现命令；Thonny 的一键 Python/pip 体验值得借鉴。
8. **P1：把 Artifact Center 变成交付中心。** 增加产物版本、来源链、差异预览、下载/导出、分享前脱敏和报告/PPT 模板；WorkBuddy 已把调研到 PPT 作为完整场景宣传。
9. **P1：自动化需要生产级调度语义。** 增加时区、错过执行策略、指数退避、幂等键、并发上限、超时、手动重试、通知渠道和运行保留策略。
10. **P1：补团队协作，但不要破坏 local-first。** 设计可选的团队服务层：成员、角色、邀请、审计、共享 Skill/Memory、工作区锁和远程运行；本地模式继续完全可用。
11. **P1：Git Review 向安全交付推进。** 增加 commit 草稿、分支切换、冲突视图、patch 导出、PR 草稿；所有 commit/push/删除动作仍需明确用户确认。
12. **P1：Skills 要有信任和版本语义。** 展示来源仓库、版本/commit、权限声明、更新 diff、签名/完整性、撤销和 workspace/global 作用域，降低 MCP/Skill 供应链风险。
13. **P2：整合审批与运行历史。** Command Center 应能从“需要审批”直接看到命令、工作区、触发线程、规则命中和风险解释，并支持批量安全撤销，不只是跳回线程。
14. **P2：完善多渠道一致性。** 同一个线程在桌面、微信/企业微信、Telegram、Lark 等入口要能看到统一状态、附件、审批和产物，不要让渠道变成多个半独立产品。
15. **P2：完成无障碍和本地化闭环。** 为所有图标按钮提供语义 label，保证 focus/keyboard/高对比度/Reduced Motion，且不只翻译导航；表格、终端、SSE 状态要有 aria-live 策略。
16. **P2：建立 onboarding 与可量化 benchmark。** 新用户应在 3 分钟内完成 provider → workspace → first safe run → artifact；用成功率、首个产物时间、审批误拒率、自动化成功率持续回归。

## 发布前检查清单

已通过本轮验证：

- Node/Web TypeScript typecheck。
- 完整 `npm test`：75 个测试文件、284 个测试通过。
- `npm run lint`：0 errors；Prettier/既有风格告警仍存在，但不阻断检查。
- `npm run build`：Node、preload、renderer 生产构建通过。
- Memory Vault migration/repository/route tests。
- Workspaces、permissions、Skills、health、terminal focused tests。
- Command Center/Thread/App shell focused renderer tests。
- Prettier 和 i18n sync。

发布前仍应在目标平台执行：

- `npm run lint`、完整 `npm test`、`npm run build`。
- macOS/Windows 打包应用中真实打开 Memory Vault、Command Palette、Workspaces、Diagnostics。
- 真实 provider 下完成一次受审批命令、一次 terminal run、一次 pytest/compile 检查、一次 Git diff/stage、一次 automation review。
- 真实 MCP/频道连接验证健康状态和断线恢复。
- 真实 Artifact 下载路径验证（含 symlink/移动文件场景）和目标平台下载目录行为。
- 运行 `git diff --check`，确认只提交本任务改动；不自动 commit/push/release。
- 关闭本任务启动的浏览器/服务，并确认没有遗留进程或监听端口。

## 官方来源（截至 2026-08-08）

- [WorkBuddy / CodeBuddy 官方产品页](https://www.codebuddy.cn/work/)：AI 专家团、100+ 领域专家、多专家并行、MCP/Skills、桌面/IM/小程序、调研报告/PPT、数据洞察等页面文案。
- [PyCharm Features](https://www.jetbrains.com/pycharm/features/)：Python 编辑、类型提示、文档、自动导入、Database & SQL、Profiler、Testing、Refactoring、Debugging。
- [Spyder 官方产品页](https://www.spyder-ide.org/)：Variable Explorer、交互式编程、PyData 生态、Matplotlib/Pandas/NumPy/Conda/SymPy、代码分析/搜索。
- [Thonny 官方产品页](https://thonny.org/)：内置 Python、变量表、单步调试、表达式求值、调用帧、语法错误提示、系统 Shell、pip GUI、插件基础设施。
- [Project Jupyter 官方首页](https://jupyter.org/)：JupyterLab Notebook/代码/数据 IDE、可配置工作流、扩展、40+ 语言、富输出、分享、Big Data；JupyterHub 的认证、集中部署、容器友好和多用户定位。

## 口径说明

竞品“—”表示在本次官方页面核验中没有看到同类能力，不等于该产品绝对没有插件或第三方实现。TIA “✅”以当前仓库实现和测试为准，不等于已经完成商业级跨设备/跨团队运营。下一轮最值得投入的是 P0 的任务编排、Memory 使用闭环和可靠性指标，再补 P1 的 Python IDE 深度。
