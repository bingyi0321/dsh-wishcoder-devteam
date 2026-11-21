# dsh-wishcoder-devteam

> 一个 DSH bundle、**一个**预设：`devteam`（DevTeam-20 · 资深融合开发团队），内置「许愿：」模式。
> 装一次，改代码和「从零做一个东西」走同一个入口，不用在新建会话时二选一。

- 版本：`0.0.204`
- 类型：DSH agent preset bundle（`dsh.bundle.patch` → `cordis.patch.yml`）
- 许可：MIT
- 仓库：`github.com/bingyi0321/dsh-wishcoder-devteam`

---

## 1. 这是什么

DSH（DeepSeek Harness）的预设（preset）决定一个会话的 persona、挂哪些工具、怎么压缩上下文、能加载哪些技能。本包只提供一个预设：

| preset id | 显示名 | order | 取向 | 技能 |
| --- | --- | --- | --- | --- |
| `devteam`（`cordis.patch.yml` 里的行 id 是 `preset-devteam`） | DevTeam-20 · 资深融合开发团队 | 20 | 改现有代码走最短路径（最小 diff、最少 token、最快出结果）；许愿式任务走「许愿：」模式 | 8 个，见 §5 |

同一份 persona 里用一行路由把两种跑法分开：

- **日常改代码**（默认）：`grep -n` 定位唯一最小改动点 → 改 → 跑一条自测 → 报「改了哪个文件 + 一行理由」。
- **许愿**（用户以「许愿：」开头，或要整页/整功能/从零做）：加载 `wish-loop`，走五段流水线——需求转译（`requirement-translator` 出需求卡/SPEC/分派表）→ 按写域派领域子智能体实现（任务书要求先回 ≤8 行规划，派后锁写域不追加需求）→ **派一个只读验收子代理**（加载 `acceptance-verifier`）逐条 AC 核对并跑 verify、落项目根 `TEST-REPORT.md` → 功能测试一轮 → 清过程件，两关全绿才报完成；此时 persona 里「>3 文件先问是否扩大范围」**不适用**。

- **沉淀按三档**（v0.0.207）：常驻档（项目根 `AGENTS.md`）整份注入、**每请求重付**，所以「记下来」≠「写进常驻」。草稿（会话内/`.wish/`，清理时删）→ 候选（`NOTES-YYYY-MM.md`，append-only 按月轮转，grep 命中才读）→ 常驻（回放用例验证过 + 带 `verified:` 才晋升，硬预算 ≤60 行 / ≤8 KB，`validate.cjs` 断言）。条目必须带 `ev:<命令或 文件:行>`，无证据不进候选；纠正写 `superseded-by:` 不删原条目。读侧是动作：任务开始按技术栈/模块名/报错词 grep，只读命中行 ±3。

本包的前身是两个并列预设（`devteam` + `wishcoder`，v0.0.1）。第二个入口在发布后 6.5 小时的 385 个会话里被选了 **0 次**，且两段 persona 在同一触发条件下要求相反动作，因此 v0.0.101 起折叠成一个入口——**只合入口，不合 persona**。

## 2. 为什么是单入口

1. **没被选用**：全量扫 385 个会话头的 `agentPreset` → devteam 246（63.9%）/ standard 92 / optimizer 29 / cordis 10 / miniprogram 6 / (none) 2 / **wishcoder 0**。
2. **不能真合并**：两套规则在「>3 文件或 >50 行」上动作相反（`先问「是否确认扩大改动范围？」` vs `先落 SPEC 再动，不提问`）。硬塞进一段会重演已知的自相矛盾缺陷。
3. **合并省不到 token**：未选中的预设不组装、不进请求，两个定义并存对每请求成本为 0。真实成本只有「建会话时二选一、选错只能重开」——预设是**会话级绑定**，中途换不了。
4. 所以只把**选择面**收成一个：许愿能力由 `wish-loop` / `verify-harness` 两个技能承载（技能正文不进前缀缓存，随改随生效），触发词写在 persona，规则细节留在技能里。

取证与三段对比：`D:\agent\.research\preset-merge-decision-2026-11-20.md`。

## 3. 安装

### 3.1 放进 profile 的 bundle 列表

在 DSH profile（例如 `C:\Users\Administrator\.dsh\profiles\desktop`）的 `package.json` 里两处各加一行：

```jsonc
{
  "dependencies": { "dsh-wishcoder-devteam": "link:D:\\agent\\dsh-wishcoder-devteam" },
  "dsh": { "profile": { "bundles": ["dsh-wishcoder-devteam"] } }
}
```

改完**重启 DSH**。"什么算生效"的标准是：新建会话的会话头里 `agentPreset` 是 `devteam`。

### 3.2 确认技能目录

`cordis.patch.yml` 里 `customSkillDirs` 是绝对路径，默认指向本机安装位置：

```yaml
customSkillDirs:
  - 'D:\agent\dsh-wishcoder-devteam\skills'
```

换机器/换目录只改这一处，然后跑门禁（§7）：

```
node D:\agent\dsh-wishcoder-devteam\validate.cjs
```

### 3.3 选预设

- **单个会话**：新建会话 → 预设选择器选「DevTeam-20 · 资深融合开发团队」。
- **设为默认**：设置 → 通用 → 默认预设；或 profile 层 `agent-preset-registry.default` / `selectedDefault`。
  注意 `agent-preset-registry.config` 是整段替换、不是深合并——改 `selectedDefault` 时要把 `default` 一起保留。

### 3.4 卸载

profile `package.json` 删掉那两行 → 重启。预设与技能随 bundle 一起消失，不写别的目录。

## 4. 怎么用

### 4.1 日常改代码（默认模式）

```
把这个接口的分页参数从 page 改成 cursor，别动其他调用点。
```

预期动作：定位唯一最小改动点 → 改 → 一条自测 → 一句「改了哪个文件 + 为什么」。

```
重构支付模块，把三个回调合成一个状态机。
```

跨文件的活走 `devteam-flow`：需求澄清 → 契约拆分 → 并行实现 → 评审放行；写域不重叠的块用子代理扇出。

### 4.2 许愿（加前缀）

```
许愿：做个能把手机截图批量裁成 1080x1920 并加圆角的小工具，双击能跑。
```

预期动作：需求转译（需求卡 + SPEC + 分派表）→ 写 `scripts/verify.ps1` → 跑红 → 按写域派子智能体实现 → 跑绿 → 验收专家逐条核对 → 功能测试一轮 → 报三行（改动 / 验证 / 残留）。

从 0.0.203 起，这条路径按**五段**跑：

| 段 | 谁 | 做什么 |
|---|---|---|
| 1 | 主会话（`requirement-translator`） | 把短句转成需求卡 / SPEC / 分派表（写域·AC·blocked_by），写会失败的验收并记 sha256 指纹 |
| 2 | 每个写域一个领域 agent 子智能体（深度 1；域内 ≥2 个互不相交文件块**可**再下派一层，深度 2 到顶、不可再派） | 只读 SPEC/验收，把自己写域改到跑绿；不改判据；切不切由它自判，须回报 `SPLIT=` / `DEPTH2=` |
| 3 | 派一个**只读验收子代理**（加载 `acceptance-verifier`；单文件小改可主会话自验，须先写死预期输出） | 指纹核对 + 逐条 AC 证据表 + 越界核对；给放行 / 打回；落项目根 `TEST-REPORT.md`（改动 / 测试 / 过 / 没过 / 未覆盖）。独立性靠换上下文，不靠自觉——同一个会话里自审不构成隔离 |
| 4 | 主会话 | 功能测试一轮：构建 → 启动 → 3~5 条主路径（含一条错误路径） |
| 5 | 主会话 | 三振接管（改验收 / 换路线 / 亲自写关键 20%）；清过程件（阶段 5.5 硬门禁）；两关全绿才交付三行 |

**实测（2026-11-21，两档夹具）**：段 2 的切分能力已证——被要求下派时深度 2 子代理正常写码并回报 `DEPTH2=是`；切分**意愿**为零——4 文件 5~8 行、6 文件 ~170 行两档，领域 agent 都自判「任务书成本 > 写码成本」自己全写（`SPLIT=自己全写`、`DEPTH2=否`），且算式成立（每层 ≈58k 冷前缀）。所以「各 agent 开子智能体」在小域不会自发发生：`maxDepth: 2` 是**上限**不是配额，别把它读成必须切。

理由与价目见 [CHANGELOG.md](CHANGELOG.md) 的 0.0.103 段；准则是「省钱省在实现段，准在不可逆的判愿与验收上」。省钱有两条路：换整场路由（profile 的 `agent-default-model`），或在 spawn 里显式传 `provider`/`model`。后者受 Session 的 `subagent/model-selection-policy` 约束——**0.0.106 起由官方 `subagent-model-selection-settings` 行写入，而这一行挂在 profile 层**（`profiles/desktop/cordis.patch.yml` 末尾，白名单 `dsh-opencode-go/deepseek-v4-pro` + `dsh-opencode-go/deepseek-v4.1-flash`），没有该记录的会话只允许派等于父路由的子代理。放 preset 会随每条会话重复注册全局服务 `subagentModelSelection`，启动即报错、命名空间 serve 不出来——0.0.105 就是这么"页面不出现"的。`subagent` 行的 `modelSelection` 因此保持 `true`（不开时请求先被 `child model selection is disabled for this tool instance` 挡掉）。但这条路**每请求多约 60 tok 的声明开销，跨路由到 flash 端到端没有实测收益**——日常最稳是**不传** `provider`/`model`（子代理沿用父路由），要整场省钱就换 `agent-default-model`。

**改白名单不用改文件**：侧栏 → Plugins → **dsh-devteam-settings** 的页面（独立插件包 [`../dsh-devteam-settings`](../dsh-devteam-settings)，`client.js` 注册进 `plugins.bundle.config` / `plugins.row.config`，不用 `plugins.item`——那个 slot 归官方设置页）。页内上半是用法说明、下半是开关与路由表，保存写入 Host 设置文档的 `subagent-model-selection-settings` 命名空间。`cordis.patch.yml` 里那份 `config` 只是出厂默认值。说明见 [`../dsh-devteam-settings/USAGE.md`](../dsh-devteam-settings/USAGE.md)。

不满意就补一句（「圆角要 24px」），它把这条加进验收再跑一遍——**验收是唯一的口径**，不靠自我感觉。

已经聊了很多轮的会话里也能直接许愿：许愿不是预设，是 persona 的一行路由，不用新开会话。区别是这时它得先记**基线**（当前哪些验收是绿的，写进 SPEC），否则「先写验收、确认它红」会一开跑就是绿的——那是假绿，不是做对了。

### 4.3 带约束许愿（最省返工）

```
许愿：<一句话说清要做什么>
验收：<怎么算做对了，能给命令最好>
不许动：<目录 / 接口 / 依赖>
预算：<几轮内、别超多少改动>
```

### 4.4 触发词

| 说法 | 进哪个模式 |
| --- | --- |
| 「改一下 / 修一下 / 加个字段 / 怎么报错了」 | 日常改（最小 diff） |
| 「许愿：…」 | 许愿（`wish-loop`） |
| 「做个…/从零/整页/整功能/端到端」 | 许愿（persona 路由行；拿不准就自己加「许愿：」，最省事） |
| 「这个文件重构一下」 | `devteam-flow`（跨文件编排） |

**给最终用户看的完整说明**（触发、写法、例子、成本、排障）在 [`docs/wishcoder-guide.md`](docs/wishcoder-guide.md)；下面是技术视图。

### 4.5 子代理配置（跨路由派发）

`subagent` 默认派**和父会话同模型**的子代理；要派不同模型（比如 Pro 主会话派 flash 做实现段），得先给会话写一张**白名单**。

**机制**：派发前读会话级投影 `subagentModelSelectionPolicy`，白名单来自会话日志里的一条 `subagent/model-selection-policy` 事件（`allowedModels: [{provider, model}]`），由官方写者 `@deepseek-ai/dsh-tool-subagent/model-selection-settings` 在新顶层会话创建时写入，子代理会话继承父会话。没有白名单时，显式 `provider`/`model` 必须等于父路由，否则被拒。

**两个改法**（改的是同一份数据）：

| 方式 | 入口 | 生效 |
| --- | --- | --- |
| 设置页（推荐） | 侧栏 → Plugins → 子代理模型白名单 | 之后新建的会话 |
| 配置文件 | profile `cordis.patch.yml` 的 `subagent-model-selection-settings` 行 `config` | 出厂默认，用户层可覆盖 |

出厂默认样例（profile 层，如 `profiles/desktop/cordis.patch.yml` 末尾）：

```yaml
- id: subagent-model-selection-settings
  name: '@deepseek-ai/dsh-tool-subagent/model-selection-settings'
  config:
    enabled: true
    allowedModels:
      - provider: dsh-opencode-go
        model: deepseek-v4-pro
      - provider: dsh-opencode-go
        model: deepseek-v4.1-flash
```

**两个坑**：

1. **这一行只能挂 profile 层，不能放 preset**——放 preset 会随每条会话重复注册全局服务 `subagentModelSelection`，启动即报 `service "subagentModelSelection" has been registered`，命名空间 serve 不出来、设置页静默消失（0.0.105 的"页面不出现"就是这么来的）。
2. **配套开关**：`tool-subagent` 行的 `modelSelection` 必须为 `true`，否则调用里传 `provider`/`model` 直接报 `child model selection is disabled for this tool instance`，走不到白名单。

**怎么调用**：`subagent` 时成对传 `provider` + `model`（三样都不传 = 继承父路由，默认）：

```json
{ "provider": "dsh-opencode-go", "model": "deepseek-v4.1-flash" }
```

`enabled: true` 而 `allowedModels` 为空会被 Host 拒绝；改完跑 `node dsh-wishcoder-devteam/validate.cjs` 并**开新会话**生效（老会话保留创建时拿到的白名单，改配置对老会话无效）。

完整说明（调用规则 / 验证命令 / 排错表）见 [`../dsh-devteam-settings/USAGE.md`](../dsh-devteam-settings/USAGE.md)。

## 5. 技能（10 个）

`skills/` 下 10 个目录，一次性全部可发现（`includeDefaultRoots: false`，只有本包的技能）：

| 技能 | 什么时候用 |
| --- | --- |
| `devteam-flow` | 多文件改动、重构、需求→契约→并行实现→评审 |
| `requirement-translator` | 许愿短句转明确需求：需求卡 / SPEC / 分派表（流水线段 1） |
| `acceptance-verifier` | 验收与功能测试：只读、指纹核对、放行/打回（流水线段 3/4） |
| `web-platform` | 前端/Node 服务：路由、状态、构建、接口联调 |
| `android-app` | 改安卓工程、构建、真机验证（adb/logcat/uidump） |
| `embedded-firmware` | 固件、串口、板级调试 |
| `debug-research` | 现象→假设→最小复现的排障，别盲调 |
| `win-desktop` | Windows 桌面程序、注册表、服务、打包 |
| `wish-loop` | 许愿闭环：五段流水线（转译 → 分派实现 → 验收 → 功能测试 → 三振收尾）、验收先行、交付前三行 |
| `verify-harness` | 写可执行的验收脚本（`scripts/verify.ps1`），全绿判定 |

前 8 个是**开发角色**（进 `roles.json` 注册表，新增须批准登记）；`wish-loop` / `verify-harness` 是**许愿闭环**，走 `validate.cjs` 的 `NON_ROLE_SKILLS` 白名单，不占角色名额。

## 6. 预设置里挂了什么（18 行）

| # | 行 | 作用 |
| --- | --- | --- |
| 1 | `persona` | 1000 字符的团队意志（输出/范围/许愿/验收/底线/步数/改动/验证/环境/记忆/成本/技能） |
| 2 | `agent-instructions` | 注入工作区 `AGENTS.md`（限字节，避免把大文件塞进前缀） |
| 3 | `time-context` | 当前时间 |
| 4–5 | `tool-bash` / `tool-pwsh` | shell；本机只有 `powershell.exe` 5.1，没有 `pwsh` |
| 6–7 | `tool-fs` / `tool-fs-search` | 读写与 `grep`/`glob`（限额收紧，防止一次 `--full` 灌爆上下文） |
| 8 | `repeat-tool-reminder` | 同一调用重复时提醒换参数 |
| 9 | `tool-jobs` | 后台任务 |
| 10 | `skill-filesystem` | 技能根：本包 `skills/`，`watch: false`（技能改动不冲前缀缓存） |
| 11 | `tool-skill` | 加载技能正文 |
| 12–14 | `planning` / `compaction` / `delegation` | 计划、压缩、子代理（`maxDepth: 2`：领域子智能体可再下派一层，深度 2 到顶；`modelSelection: true`——能否跨路由由会话的 `subagent/model-selection-policy` 决定，白名单没覆盖到的组合照样被拒；`modelDiscovery` 关） |
| 15 | `tool-ask-user` | 问用户 |
| 16 | `tool-todo` | 待办板 |
| 17 | `tool-web` | **`disabled: true`**（无 `DEEPSEEK_API_KEY` 时联网必失败；要用先配 key 再删那行 disabled） |
| 18 | `present` | 交付文件（图片/Office/文档卡片） |

**不声明** `permission` / `permissionPresets`：那是内核级服务，preset 作用域再挂一次会让预设组装失败、新会话直接建不出来（历史事故，见 `cordis.patch.yml` 文件头注释）。

## 7. 自检门禁

```
node D:\agent\dsh-wishcoder-devteam\validate.cjs        # 正向：11 类断言
node D:\agent\dsh-wishcoder-devteam\validate.selftest.cjs  # 负向：5 个探针，证明门禁还能抓到东西
```

覆盖：

1. `package.json` 可解析、版本与 bundle 声明一致（`PROFILE` 由 `DSH_HOME`/`USERPROFILE` 派生，不写死用户目录）；
2. 顶层**只有一个** `- insert:`、**恰好一个** preset 行、单 preset 18 插件行、order 无碰撞；
3. 无内核级服务行（`permission` / `permissionPresets`）；
4. persona 500~1000 字符、含「最小 diff / 底线 / 许愿： / wish-loop / 需求转译 / 验收专家 / 功能测试」，且**不得出现实现层词**（`.ps1` / `uidump` / `JDK` / `PATH 无` / `memory\`）——常驻层只放契约；
5. `customSkillDirs` 指向本包、每个技能有 `SKILL.md` 且 front-matter `name` 与目录名一致；正文 ≥400 字符且 **≤上限**（`wish-loop` 19 KB、其余 13 KB）；
6. `roles.json` 与 `skills/` 双向登记（`active` 角色全在、技能不 stray、许愿技能走白名单）；
7. 文本卫生：无 U+FFFD、无零宽字符、无 BOM；
8. 五段流水线断言（`需求转译`/`阶段 4.7`/`阶段 4.8`/`阶段 5.5`/`深度 2`/`开工规划`/`派发后守注意力`/`TEST-REPORT.md`/`记忆三档`/`≤60 行 / ≤8 KB`），关键词只在注释里不算；
9. 常驻预算：项目根 `AGENTS.md` ≤8192 B / ≤60 行；
10. `wish-loop` 阶段号必须等于白名单 `0/1/2/3/3.5/4/4.5/4.6/4.7/4.8/5/5.5/6` 且唯一（重排不会静默断掉跨技能引用）；
11. `CHANGELOG.md` 首条版本节 == `package.json` version；skills 里出现旧副本 `memory\projects` 直接 FAIL。

退出 `0` = 通过，`1` = 失败（逐条打到 stderr）。**改完任何文件都要跑。**

## 8. 目录

```
dsh-wishcoder-devteam/
├─ package.json            # name/version + dsh.bundle.patch
├─ cordis.patch.yml        # 唯一入口：一个 - insert:，一个 preset 行（devteam order 20）；只留现行决策
├─ validate.cjs            # 门禁（正向 11 类断言）
├─ validate.selftest.cjs   # 门禁的负向自测（5 个探针，跑完自动还原）
├─ roles.json              # 开发角色注册表（8 个 active，maxSkills 8）
├─ skills/                 # 10 个技能（8 开发角色 + wish-loop / verify-harness 闭环）
├─ docs/design-notes.md    # v4~v29 的设计决策与实测数据（原 patch 头注释）
├─ CHANGELOG.md
├─ LICENSE
└─ README.md
```

`cordis.patch.yml` 的文件头只留 5 条现行决策；v4~v29 的改动理由、实测数据与回滚方式全在 `docs/design-notes.md`。**出问题先读那里**，比读本文档快。

## 9. 版本与发布

- 版本号走 `0.0.x`（tag `v0.0.101`），与仓库 tag 一一对应。
- 发版三步：改 `package.json` / `validate.cjs` 里的版本（两处必须同值，门禁第 11 项会拿 `CHANGELOG.md` 首条来对） → `CHANGELOG.md` 记「为什么 / 改动 / 已验 / **未做**」 → 跑门禁 + `validate.selftest.cjs` → `git tag v0.0.x` 并推送。
- 宿主装载以**重启**为准：bundle 列表与预设定义在进程启动时读，改完不重启，新建会话仍用旧定义。

当前版本 `0.0.204` 的变更见 [CHANGELOG.md](CHANGELOG.md)。

## 10. 已知限制与排障

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 新建会话失败 / 预设列表里没有 DevTeam | 预设组装报错（多为内核级服务行重复、或 YAML 语法） | 看 `C:\Users\Administrator\.dsh\logs\desktop-next.log` 尾部的 `host.kernel.*` 报错；跑 validate |
| 技能不出现 | `customSkillDirs` 是绝对路径且指错机器 | 改 §3.2 那一处，重跑 validate，重启 |
| 许愿模式没被触发 | 没加「许愿：」，或任务描述不含"整页/整功能/从零" | 自己加前缀，最稳 |
| 宿主的 `office` / `hyperframes` 技能不见了 | `includeDefaultRoots: false`（沿用 devteam，省约 1.2k 字符/请求） | 要文档/视频能力就把该行改 `true` 并跑 validate |
| persona 改不动了 | 已顶 1000 字符上限 | 先删一条旧规则再加（护栏，不是 bug） |
| 联网工具报错 | `tool-web` 默认 disabled | 配 `DEEPSEEK_API_KEY` 后删 `disabled: true` 那行 |
| 子代理派成别的模型被拒 | 路由不在白名单，或会话没 policy（非 devteam 预设 / 未启用模型选择） | 设置页加这条路由；或关「启用模型选择」后不传 `provider`/`model`（继承父路由） |
| 跑绿了但结论不对 | 实现段改过 `verify.ps1` | 交付前 `(Get-FileHash scripts\verify.ps1 -Algorithm SHA256).Hash.Substring(0,16)` 与 SPEC 指纹比对；对不上回段 1 重写判据 |
| 领域子智能体没再下派（`DEPTH2=否`） | 段 2 的切分是**自判**：小域（几文件、纯函数）里任务书成本高于写码成本，它自己全写才对 | 不是 bug。要它必切就把 wish-loop 段 2 的「可」改成「必」并加预估阈值；否则看 `SPLIT=` 的切分理由是否成立 |
| 老会话报 preset 不存在 | 该会话记录的 `agentPreset` 是已删的 `wishcoder` | 新建会话；实测这类会话数为 0 |

## 11. 许可

MIT，见 [LICENSE](LICENSE)。
