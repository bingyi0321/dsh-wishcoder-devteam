# Changelog

本项目的版本号跟随仓库 tag（`v0.0.1` 起）。

## 0.0.201 — 2026-11-21

**发布 v0.0.201**：把 0.0.103→0.0.106 的累积改动连同版本号一起推到远端，README 版本号对齐。

### 改动
1. `package.json` / `validate.cjs`：版本 0.0.106 → 0.0.201。
2. `README.md`：两处版本号 `0.0.105` → `0.0.201`（此前 README 落后于 package.json）。
3. `docs/wishcoder-guide.md`：适用版本 0.0.106 → 0.0.201。
4. `cordis.patch.yml` 文件头注释：v0.0.102 → v0.0.201。
5. 打 tag `v0.0.201` 并推送（此前 origin 停在 v0.0.1，0.0.101~0.0.106 均未推送）。

### 已验
- `node dsh-wishcoder-devteam/validate.cjs`：全绿。

## 0.0.106 — 2026-11-21

**v0.0.105 的两处错判修掉**：设置页搬出 bundle 成独立包，白名单写者搬到 profile 层。

### 事实（日志原文）
1. `C:\Users\Administrator\.dsh\logs\desktop-next.log` 2026-11-20T16:42:27.060Z：
   ```
   [error] Error: service "subagentModelSelection" has been registered at <SubagentModelSelectionConfig>
   ```
   同一时间 `agent-preset-registry` 打出 `agent preset devteam: subagent-model-selection-settings … service "subagentModelSelection" has been registered`。**preset 的 plugins 随实例化重复装载，服务名是全局的** → 该行放在 preset 里每次启动都报错，`subagent-model-selection` 命名空间因此没被正常 serve，设置页的 `whileServed` 永远不触发 —— 这是"页面没出现"的根因，不是 slot 名字。
2. `@deepseek-ai/dsh-client-modules/lib/index.js:783` `resolveMeta` → `locatePkgJson` → 读**包**的 `package.json`：`dsh.client` 必须落在被 Loader 行解析到的那只包上。v0.0.105 拿 preset bundle 根包（`name: 'dsh-wishcoder-devteam'`）当 client 宿主，而 bundle 根包被 Loader 当 bundle 展开，形态不在模板覆盖范围内。

### 改动
1. 新建独立插件包 `D:\agent\dsh-devteam-settings`（`settings-page.js` 空 apply + `client.js` + `cordis.patch.yml` + `locale/{zh,en}.json` + `icon.svg` + `USAGE.md`），已 `install_bundle` 装进 profile（`dsh-devteam-settings@0.1.0`，`application: applied`）。
2. 页面注册点从 `plugins.item` 改为 `plugins.bundle.config`（key=`dsh-devteam-settings`）与 `plugins.row.config`（key=`dsh-devteam-settings#devteam-settings`）：slot 契约明确 `plugins.item` 由官方设置页占用，bundle 自己的配置属于前两者。
3. **去掉 `whileServed` 前置条件**：命名空间没 serve 时页面仍出现，自己显示"Host 没有提供这个命名空间"。一次踩空之后，宁可页面常在可诊断，也不要页面静默消失。
4. `cordis.patch.yml`：删掉 `subagent-model-selection-settings` 行（搬走）与 `devteam-settings` 行（搬走）；`package.json` 去掉 `dsh.client` 与 `exports["."]`/`"./client"]`，`client.js`/`settings-page.js` 文件保留但不再装配。
5. profile `C:\Users\Administrator\.dsh\profiles\desktop\cordis.patch.yml` 末尾新增 `subagent-model-selection-settings` 行（`enabled: true` + `allowedModels` 两条）；备份 `cordis.patch.yml.bak-v292-*`。YAML 解析验证：20 条 entry，最后一条 `id: subagent-model-selection-settings`、`allowedModels` 两条。
6. **命名空间名修正（同日第二次）**：页面出现后正文红字 `Host 没有提供这个命名空间（未安装 model-selection-settings 行）`。原因是命名空间带 `-settings` 后缀——官方客户端 `@deepseek-ai/dsh-client-ui-settings-subagent/lib/client.js` 里 `const SUBAGENT_MODEL_SELECTION_NS='subagent-model-selection-settings'`，而 `dsh-devteam-settings/client.js:19` 写的是 `'subagent-model-selection'`，`configForms.get()` 因此返回 `unavailable`。**命名空间名不来自任何声明，而是 `.volatile()` 字段所属那行的行 id**，也就是 `subagent-model-selection-settings`。已改 `client.js:19`（另三处注释同步）、单测 `NAMESPACE`、以及 `AGENTS.md`／`README.md`／两个 `USAGE.md`／`package.json` 的同名表述。
7. 缓存策略已确认不需要额外处理：`dsh-client-modules` 的 combo URL 形如 `??<id>/client.js&rev=<12 位内容 hash>`（`HASH_REVISION_LENGTH = 12`），内容变了 rev 就变，`IMMUTABLE_CACHE` 只作用在带 hash 的 URL 上。

### 已验
- `node dsh-wishcoder-devteam/validate.cjs`：5 项全绿。
- `node .research/tmp/test-devteam-settings.mjs`：**22 项通过**（独立包 client.js；两个注册点、key 形状、无 whileServed、locale、summary、设置面渲染）。
- profile patch YAML 可解析，最后一条即新增行。
- 16:46 启动日志里 `service "subagentModelSelection" has been registered` 已消失；剩余 9 条 `patch: entry "<id>" not found` 属别的插件（redteam-*、dafeiyu、plugin-market、vision-router、comfyui、agents-anywhere-bridge-next），与本次无关。
- 页面本体确认渲染：图标、标题「DevTeam 子代理模型白名单 v0.1.0」、描述、用法四步、启用开关、路由表、保存/还原、底部「包含的组件 1 个 · 1 运行中」。

### 未验
- 需**重启 DSH** 后看页面是否出现（profile patch 只在启动时组合）。
- 重启后确认启动日志不再出现 `service "subagentModelSelection" has been registered`。
- 新会话里 `subagent/model-selection-policy` 是否带上两条路由；仍未跑过一次真实的跨路由派发。

## 0.0.105 — 2026-11-21

**白名单改用官方写者，并给了一个带用法说明的设置页**。0.0.104 的自写 `route-policy` 是重复造轮子：官方 `@deepseek-ai/dsh-tool-subagent/model-selection-settings` 早就是同一个能力的实现，而且多三点。

### 事实
- `@deepseek-ai/dsh-tool-subagent/src/model-selection-settings.ts`：Service `subagentModelSelection`，`static inject = ['sessionProjections','sessions']`；`Service.init` 里 `ctx.on('agent/created', …)`，对**新顶层会话**（`firstLiveSeq === 0` 且首事件不是 `session/end-seed`）写入 `subagent/model-selection-policy`，`allowedModels` 取 `enabled ? allowedModels : undefined`；子代理会话（`header.origin === 'subagent'`）继承父会话的 policy。
- 它的 `Config`：`enabled: z.boolean().default(false).volatile()`、`allowedModels: z.array(AllowedModelRouteSchema).default([]).volatile()` —— `.volatile()` 即存 Host 设置文档的 `subagent-model-selection` 命名空间，客户端设置页直接编辑它。
- 官方设置页已存在：`@deepseek-ai/dsh-client-ui-settings-subagent`，注册进 Plugins 页的 `plugins.item`（`id: 'subagent'`、`order: 10`），经 `ctx.configForms.whileServed(['subagent','subagent-model-selection'], …)` 出现。
- 比自写版多三点：`agent/created` 早于首个请求（不靠 `session/created` 的微任务窗口）、子代理会话继承父会话、`assertAllowedModelRoutes` 在写入与读取两端校验。

### 改动
1. `cordis.patch.yml` 末尾：删除 `subagent-route-policy` 行，改为官方 `subagent-model-selection-settings` 行，`config = {enabled: true, allowedModels: [{pro},{flash}]}`。两个写者会争"第一条 policy"（投影 `apply` 在 `policy !== null` 时忽略后续事件），所以只能留一个。
2. 新增 `settings-page.js`（host 半，空 `apply`）与 `client.js`（浏览器半）：注册 `plugins.item` 页 `id: 'devteam-model-allow-list'`、`order: 11`，页内既有**三段式用法说明**，也能改 `enabled` 与路由列表，保存走 `form.mutate([{op:'set',path:['enabled'],…},{op:'set',path:['allowedModels'],…}], snapshot.revision)`。
3. `package.json`：`exports["."] → ./settings-page.js`、`exports["./client"] → ./client.js`、`dsh.client = {platform:'web', immediately:true, inject:[ui-settings, ui-plugin-manager, client-locale]}`；版本 0.0.105。
4. `cordis.patch.yml` 新增 `devteam-settings` 行（`name: 'dsh-wishcoder-devteam'`）：client bundle 由 Loader 的 active entry 派生，没有这行浏览器拿不到包。
5. `route-policy/USAGE.md` 重写为完整使用说明（设置页入口 / 调用规则 / 出厂默认 / 验证命令 / 限制 / 排错表）；`route-policy/` 代码保留但不再装配。
6. `validate.cjs` 的 `VERSION` 提到 0.0.105。

### 已验
- `node dsh-wishcoder-devteam/validate.cjs`：5 项全绿（`plugins=20`、persona 989 字符）。
- `node .research/tmp/test-settings-page.mjs`：**24 项通过** —— bundle id = 包名、`inject` 三项、`configForms.get('subagent-model-selection')`、`whileServed` 命名空间、`plugins.item` 注册的 name/id/order/label、locale 注册与绑定、summary 面文案、设置面渲染（开关/保存/已存路由/用法说明都在树里）。
- 路径解析：`dsh-wishcoder-devteam` → `settings-page.js`；`dsh-wishcoder-devteam/client` → `client.js`。

### 未验
- 浏览器侧真实加载：需要新会话（Loader 重读 patch）后刷新页面，看 Plugins 里是否出现「子代理模型白名单」，以及保存是否落进 Host 文档。
- 设置页保存后的端到端派发（跨路由）仍未跑过一次真实的 `subagent` 调用。
- 页面样式只用 `--dsw-alias-*` 变量 + fallback；未在浅色/深色两种主题下目视核对。

## 0.0.104 — 2026-11-20

**给 `subagent/model-selection-policy` 补上写者，跨路由派发可用**。0.0.103 的「跨模型」被运行时拒绝（v26.1 已推翻），根因不是开关写错，而是 DSH 只有读者没有写者。

### 事实
- 读者：`@deepseek-ai/dsh-tool-subagent/lib/index.js:128` 的投影 `subagentModelSelectionPolicy`（`stateVersion: 1`、`init: () => null`、`apply` 只在 `policy === null` 时接受 `subagent/model-selection-policy` 的 `data.allowedModels`）；判定点在同一文件 `:85` `assertAllowedModelSelection`。
- 事件类型已注册（persistence schema 有 digest、`surface: false`），所以追加它不是"新类型"，不会让会话拒绝重开。
- 写者位置：新会话 `session/created` 的同步 dispatch 里 Session 只读（"remains read-only throughout synchronous dispatch; successful completion enables appends"），故推迟一个微任务再 `append`。

### 改动
1. 本 bundle 新增子路径插件 `route-policy`（`dsh-wishcoder-devteam/route-policy`；v28 把独立包 `dsh-subagent-route-policy` 并进来并从 profile 卸载）：`session/created` 后一个微任务追加 `subagent/model-selection-policy`，`allowedModels = deepseek-v4-pro + deepseek-v4.1-flash`；已有该事件的会话跳过（`snapshotEvents` 是全量同步读法，已废弃但仍是唯一手段）；载入时对已存在的会话补写一次（旧会话永远等不到 `session/created`）。
2. `cordis.patch.yml:358` `modelSelection: false` → **true**（不开时请求先被 `child model selection is disabled for this tool instance` 挡掉，走不到 policy）。
3. `skills/wish-loop/SKILL.md`：阶段 3「执行者」与任务书第 7 项从"别点菜"改为"可显式传 `provider`+`model`，前提是会话有白名单"；锚点段补一句"跨路由实测成本未跑过"。
4. `README.md` §4.2 同口径改写。

### 已验
- 子代理会话 `ff2a0299`（装插件后创建）`seq 4` 即带 `{"type":"subagent/model-selection-policy","data":{"allowedModels":[…pro, …flash]}}`。
- 同一会话的 `request/header` 里 `subagent` 工具 description 已含 "Omit `provider`…"，即 `modelSelection: true` 已被 loader 重读。

### 未验
- 真正一次「Pro 主会话派 flash 子代理」的端到端成本（前缀是否仍要重付、子代理缓存命中如何）。当前主会话创建于装插件之前，其 log 里没有 policy，需新会话。
- 插件只声明白名单，不校验 model id 是否存在；写错要到 `llm.resolveCallConfig` 才失败。

## 0.0.103 — 2026-11-20

**许愿闭环按模型能力重新分段**：判愿/SPEC/验收交给主会话，实现交给子代理，三振不绿由主会话接管。

> **v26.1 已推翻其中"跨模型"部分**：跨路由派发被运行时禁止（见本节末「v26.1 修正」），现行规则是"同路由分段"。

### 为什么
原 persona 写的是「不换模型」，等于默认「一个模型干完全程」。但本机价目（opencode-go 目录，$/1M）里 Pro 与 flash 的差不是均匀的：

| | input | cache read | output |
|---|---|---|---|
| Pro | 0.66 | 0.022 | 1.98 |
| flash | 0.15 | 0.003 | 0.6 |

- **规划段**只 1~3 步、输出几百 token → 谁做都只差几分钱；
- **实现段**每步重读全前缀、大量输出，30 步 Pro 比 flash 多花约 4 倍。

所以「省」要省在实现段，「准」要准在不可逆的判愿与验收上。原来的「Flash 规划 + Pro 实现」正好反过来：省的是最便宜的一段，贵的是最长的一段，而且弱 SPEC 会让强实现高质量地做错事。

### 改动
- `cordis.patch.yml` persona 1000 → 994 字符：许愿行加「三段：本人(Pro)判愿/SPEC/验收→flash 实现→三振不绿本人接管」；成本行「不换模型」→「仅三段换模型」（原意是防无谓冷前缀重付，三段是唯一有意的换模点）；压缩 输出/范围/步数/改动/记忆/技能 六行腾字符。
- `cordis.patch.yml` `tool-subagent.modelSelection` false → true：否则 spawn 时无法指定实现模型（不传就继承父路由 Pro，实现段按 4.4×/7.3×/3.3× 计费）。代价约 +220 字符 schema（≈ +60 tok/请求）。`modelDiscovery` 仍 false，模型 id 写死在技能正文。
- `skills/wish-loop/SKILL.md`：
  - 新增「三段分工」：四段表 + 四条铁律（段 1 不派子代理 / 段 2 不改验收 / 段 3 不许 flash 续命 / 一次规划多次实现）+ 价目依据。
  - SPEC 模板加 `实现者 / 段位 / 验收指纹`（sha256 前 16 位）。
  - 阶段 3.5 任务书 6 → 7 项：模型写在调用参数里（`provider: dsh-opencode-go`、`model: deepseek-v4.1-flash`），不写进任务书。**（v26.1 推翻：不传 provider/model，继承父路由；显式传非父路由会被运行时拒绝）**
  - 新增阶段 4.6：三振后人话回报格式；父只做「改验收 / 换路线 / 亲自写 20%」三选一；二次三振停手交付。
  - 退化表 +2 行（实现段改验收、判愿就派出去）；自检清单 +2 条。
- `skills/verify-harness/SKILL.md` 新增 §8：验收脚本与 SPEC 属于段 1，实现段只读；交付前父侧 `Get-FileHash ... SHA256` 前 16 位比对；列出三种最常见越界（try/catch 吞失败、exit 1 → exit 0、删断言）。
- 例外条款按实测修正（T6 两次重放）：`阶段 3 执行者` 与 `三段式例外` 里的「单文件 <30 行」判据改为「**预估试错轮次 ≤1 且判据体量 ≥ 实现体量**」，并补「**必须派**（跨 ≥3 写域或预计 ≥2 轮试错）」；跳过行数门槛的理由是 T6 实测——130 行实现、101 行判据、一次绿，派 flash ≈ $0.010 / 8 请求，本会话自写 ≈ $0.0039 / 4 步，差 2.6×。
- 版本 0.0.102 → 0.0.103（package.json / validate.cjs / README / cordis.patch.yml 注释）。

### 已验
- 三段式已跑真实样本两遍（`.research/probes/T6-three-segment.md`）：r1 派 `deepseek-v4.1-flash` 一次绿（子代理 8 请求，`PASS 16/16`）；r2 按修正后的例外条款本会话自写，4 步一次绿。两版 `verify.mjs` 指纹均未被动过。
- 首次重放就抓到段 1 自己的判据 bug（A4.3 期望值算错，夹具两行不同 status 却断言 `landed===2`），修正发生在段 1、指纹 `6d04f6b8…` → `884a50ba94bfd4d4`，实现者未越界——正是「判据只属段 1」要防的那类动作。
- `modelSelection` 是本机 profile 已验证可用的键（0.2.2 schema），但**它只决定"能否显式传参"**：r1 能派 flash 是因为父就是 flash（同路由），r3 在 Pro 父会话里派 flash 被拒。已按 v26.1 改回 `false`。

### 仍未验
- 「Pro 规划 vs flash 规划」已部分回答：r3 把主会话真放到 Pro 上（`firstRequestHeader.model = deepseek-v4-pro` 核实），段 1 判据首版一次判绿（r1 那次 flash 多花 3 步修自己的判据 bug）；但**「Pro 规划 + flash 实现」这个组合被运行时禁止**，所以省不到钱——r3 全程 ≈$0.168/21 步 vs r2 ≈$0.0039/4 步。
- 大任务（≥3 写域、需多轮试错）下三段式的收益仍未测：T6 只证明了它的下限（小活不该派），没证明上限。
- 白名单口径仍限于本机：`list_subagent_models` 只放出 flash，其他机器若开了 pro 给子代理，任务书里的 `model:` 值要按现场核对。

### v26.1 修正（同日，T6 r3 实测后）

**「Pro 规划 + flash 实现」不成立，改写全部相关表述。**

事实依据（读运行时，不是猜）：`@deepseek-ai/dsh-tool-subagent/lib/index.js:85` `assertAllowedModelSelection(policy, parentOptions, route)` —— 没有 Session 的 `subagentModelSelectionPolicy` 时，**显式指定的 provider/model 必须与父路由完全相同**，否则抛 `child LLM route "…" is not allowed for this Session; without a recorded model-selection policy, explicit selection is limited to the parent route`。该 policy 是会话级持久状态（`stateVersion 1`、`init: () => null`，经 `subagent/model-selection-policy` 事件写入，`allowedModels` 必须非空），本机没有写入入口。`tool-subagent.modelSelection` 只决定"能否显式传参"，不是解禁开关。

改动：
- `cordis.patch.yml`：`modelSelection` 改回 **false**（跨路由用不上，开着只多 3 个可选参数 ≈+220 字符 schema ≈+60 tok/请求）；persona 许愿行与成本行删掉"Pro/flash"字样，改成"子代理(同路由,禁换模型)"；两处注释块改为上述事实 + 引用行号。
- `skills/wish-loop/SKILL.md`：三段分工表与「为什么这么分」重写——段 2 是**同一模型**，派发买到的是"判据解释权被隔离 + 干净上下文"，不是省钱；阶段 3 执行者、任务书第 7 项（改为"不传 provider/model"）、实测锚点段（补 r3）同步改。
- `skills/verify-harness/SKILL.md` §8：段 1/段 2 不再写 Pro/flash，写"本会话 / 子代理或自写实现"。
- `README.md`：三段表、§5 技能描述、§10 排障行（"实现子代理比主会话还贵"→"子代理派成别的模型被拒"）。
- profile `C:\Users\Administrator\.dsh\profiles\desktop\cordis.patch.yml:14`：默认模型 pro → 回滚 flash，注释写明"换模型的唯一位置是整场路由"与 r3 成本对照。

仍未验：
- 记录 policy 的入口是否存在（GUI/命令/工具都没找到；若将来有，`modelSelection` 才值得开回 true）。
- 同模型分段（派子代理 vs 自写）在**大任务**上的净收益——T6 只覆盖了小任务。

## 0.0.102 — 2026-11-20

**修掉许愿模式在「已有上下文」下会失灵的三个点**（0.0.101 只合了入口，没做规则收口）。

### 为什么
0.0.101 把许愿折叠成 persona 的一行路由后，出现两处**同一触发、相反动作**的内部矛盾（与上午在 wishcoder 里修掉的 P0-2 同类）：
- 第 3 行「只报改动文件+一行理由」 vs 第 7 行「三行收尾」——交付报告两义。
- 第 9 行「说不清只问一个最短问题」 vs 第 7 行「不提问」——问不问两义。

另有两条只在长会话里才暴露的缺口：
- 判据是「用户消息以「许愿：」开头」，而压缩会把那条消息折成摘要 → 长会话里「这一轮是许愿」的证据可能丢。
- 「先写验收、确认它红」假设改动前是红的；接手已有改动的会话一跑就绿 → 假绿放行。

### 改动
- `cordis.patch.yml` persona（仍 1000 字符）：输出行补「许愿按三行」；验收行改「非许愿才问一个最短问题」；删「唯一」「别轮询」腾字符。
- `skills/wish-loop/SKILL.md` 阶段 2：新增一条——接手已有改动时先跑验收记**基线**，判据必须能区分「我改出来的」与「本来就绿的」。
- 版本 0.0.101 → 0.0.102（package.json / validate.cjs / README / cordis.patch.yml 文件头）。

### 仍未验
- 许愿路径的真实使用样本仍为 0（387 个会话，无 user 消息含「许愿」，无 `skill(wish-loop)` 调用）。本版改的是「冲突与缺口」，不是「已验证的行为」。

## 0.0.101 — 2026-11-20

**单入口**：删掉 `preset-wishcoder`，许愿式交付折叠成 devteam 入口下的「许愿：」模式。只合入口、不合 persona。

> 版本号沿 `0.0.x` 递增（上一版 `v0.0.1`）。中间的 `0.1.0` 是未发布、未打 tag 的内部草稿，本次发版直接并入 `0.0.101`。

### 为什么
- 0.0.1 发布后 6.5 小时，wishcoder 0 次被选（全量 385 个会话头：devteam 246 / standard 92 / optimizer 29 / cordis 10 / miniprogram 6 / wishcoder 0）——第二个并列入口没有被选用的证据。
- 两段 persona 在同一触发（>3 文件或 >50 行）下要求相反动作（`先问「是否确认扩大改动范围？」` vs `先落 SPEC 再动，不提问`），硬合并会重演 `opt-wishcoder-2026-11-20.md` 的 P0-2。
- 未选中的 preset 不进请求，合并省不到 token；唯一真实成本是「建会话时二选一、选错只能重开」。

### 改动
- `cordis.patch.yml`：删 `- id: preset-wishcoder` 整段（371→EOF，原 519 行）；文件头改成单入口说明；wishcoder 源文件头注释改为折叠说明（保留"不挂 goal / 不加 workflow / 不声明 permission"三条理由）。
- devteam persona 865→1000 字符：新增「许愿：」路由行（用户以「许愿：」开头，或要整页/整功能/从零 → 先 `skill wish-loop`，不提问、验收先行、全绿才交付、三行收尾；此时「>3 文件先问」不适用）；技能行补 `wish-loop/verify-harness（许愿）`；压缩 验收/环境/输出 三行腾字符。
- `skills/wish-loop/SKILL.md:203`：退化表「固定三行」字段名对齐为 改动 / 验证 / 残留（P1-5 落地时漏改这一处）。
- `validate.cjs`：`PRESETS` 只留 devteam；新增 `NON_ROLE_SKILLS = ['wish-loop','verify-harness']`（不进 roles.json 的许愿闭环）；preset 行数断言 2→1；persona 关键词加 `许愿：`、`wish-loop`。
- `package.json`：version 0.0.101，description 改单入口表述。
- `README.md`：重写为单入口版（安装/两种用法/触发词表/18 插件行/8 技能/门禁 7 项/发布流程/排障表）。
- profile（`C:\Users\Administrator\.dsh\profiles\desktop\cordis.patch.yml`）：`agent-preset-registry.selectedDefault` 从 `standard` 改为 `devteam`。

### 已知取舍
- 折叠后沿用 devteam 的 `includeDefaultRoots: false` → 宿主 `office`/`hyperframes` 等技能不在目录里。许愿对象若是文档/视频，需要把该行改 `true` 并跑 validate（接受约 1.2k 字符/请求）。
- persona 顶到 1000 字符上限：再加规则必须先删旧条，否则门禁失败（这是护栏，不是缺陷）。

## 0.0.1 — 2026-11-20

首个合并发布版本：把原先分开的两个 DSH 预设合并为一个 bundle。

### 合并内容

- 来源 `devteam-agent`（DevTeam-20 · 资深融合开发团队，preset `devteam`，order 20，persona 865 字符，18 个 plugin 行）
- 来源 `wishcoder-agent`（WishCoder · 许愿式交付，preset `wishcoder`，order 21，persona 720 字符，18 个 plugin 行）

### 结构变化

- `cordis.patch.yml`：顶层合并为**单个** `- insert:`，内含两个 preset 行；两份源文件的文件头注释原样保留（devteam v4→v22、wishcoder v1）。
- `skills\`：8 个技能目录合并到一个根（`android-app`、`debug-research`、`devteam-flow`、`embedded-firmware`、`web-platform`、`win-desktop`、`verify-harness`、`wish-loop`，目录名零冲突）。
- 两个预设的 `skill-filesystem.customSkillDirs` 从各自的源码目录改指向包内 `skills\`；`includeDefaultRoots` 各自保持原值（devteam `false` / wishcoder `true`）。
- `roles.json`：DevTeam 角色注册表随包发布（6 个 active 角色，`maxSkills: 6`），路径注释改为指向本包 `validate.cjs`。
- 新增合并版 `validate.cjs`：一次校验两个预设（结构、内核级服务行、persona、技能根、技能正文、角色登记、文本卫生）。

### 未改动

- 两个预设的 persona 文本、工具行集合、压缩与 pruner 参数、plan-mode 指引、subagent 深度限制，全部保持源版本原样。
- 不声明 `permission` / `permissionPresets`（内核级服务，preset 作用域重复声明会导致预设组装失败）。

### 已知限制

- `customSkillDirs` 为绝对路径，跨机器安装需改两处后重跑门禁。
