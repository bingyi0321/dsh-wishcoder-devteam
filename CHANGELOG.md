# Changelog

本项目的版本号跟随仓库 tag（`v0.0.1` 起）。

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
