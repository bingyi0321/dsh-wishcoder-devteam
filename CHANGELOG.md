# Changelog

本项目的版本号跟随仓库 tag（`v0.0.1` 起）。

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
