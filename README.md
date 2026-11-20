# dsh-wishcoder-devteam · v0.0.1

> **DevTeam-20 + WishCoder 合并发布包。** 一个 DSH bundle，两个独立预设：一个资深融合开发团队，一个许愿式交付闭环。装一次，两个都能选。

- 包名：`dsh-wishcoder-devteam`
- 版本：`0.0.1`
- 类型：DSH agent preset bundle（`dsh.bundle.patch` → `cordis.patch.yml`）
- 许可：MIT

---

## 这是什么

DSH（DeepSeek Harness）的预设（preset）决定一个会话的：persona、挂哪些工具、压哪些行、用哪些技能。本项目把原来分开发布的两个预设合并成一个安装单元：

| preset id | 显示名 | order | 取向 | 技能 |
| --- | --- | --- | --- | --- |
| `devteam` | DevTeam-20 · 资深融合开发团队 | 20 | 最短路径改现有代码：最小 diff、最少 token、最快出结果 | `devteam-flow` `web-platform` `android-app` `embedded-firmware` `debug-research` `win-desktop` |
| `wishcoder` | WishCoder · 许愿式交付 | 21 | 一句话即规格：自己拍默认值、先写可执行验收、循环到全绿才交付 | `wish-loop` `verify-harness` |

两者是**并列**关系，不是二选一的继承：选会话时挑一个即可，互不影响。合并只做三件事——同一个包、同一份 `skills\`、一份自检门禁；两个预设的 persona、工具行、压缩参数**各自保持原样**。

## 为什么能合

1. **技能不冲突**：8 个技能目录名互不重复，可以共用一个 `skills\` 根；`skill-filesystem.customSkillDirs` 各预设各写一行，指同一个目录。
2. **不共享内核级服务行**：`permission` / `permissionPresets` 是内核级服务，写进 preset 作用域会得到
   `Error: service "permissionPresets" has been registered at <PermissionPresetService>` → **预设组装失败 → 新建会话直接失败**。本包两个预设都不含这两行，权限档位一律由 profile 层决定。
3. **persona 各留各的**：devteam 要"不解释、只报改动"，wishcoder 要"先写会失败的检查、全绿才算完"——两种语气塞进一个 persona 会互相打架，所以保持两个预设。

## 目录

```
dsh-wishcoder-devteam\
├─ package.json         # name/version 0.0.1 + dsh.bundle.patch → cordis.patch.yml
├─ cordis.patch.yml     # 唯一入口：一个 - insert:，两个 preset 行（devteam 20 / wishcoder 21）
├─ validate.cjs         # 自检门禁（改完必跑）
├─ roles.json           # DevTeam 角色注册表（6 个 active 角色，硬门禁）
├─ skills\              # 8 个技能，两个预设共用
│  ├─ devteam-flow\  web-platform\  android-app\
│  ├─ embedded-firmware\  debug-research\  win-desktop\
│  └─ wish-loop\  verify-harness\
├─ CHANGELOG.md
└─ README.md
```

`cordis.patch.yml` 里保留了合并前两份源文件的**全部文件头注释**（devteam 的 v4→v22 改动理由与实测数据、wishcoder 的设计取向），出问题时先读那里。

## 安装

### 1. 放进 profile 的 bundle 列表

在 DSH profile（如 `C:\Users\Administrator\.dsh\profiles\desktop`）的 `package.json` 里两处各加一行：

```jsonc
{
  "dependencies": { "dsh-wishcoder-devteam": "file:D:\\agent\\dsh-wishcoder-devteam" },
  "dsh": { "profile": { "bundles": ["dsh-wishcoder-devteam"] } }
}
```

改完**重启 DSH**（bundle 重新组装预设时才生效）。

### 2. 确认技能目录路径

`cordis.patch.yml` 里两处 `customSkillDirs` 是**绝对路径**，默认写死为本机安装位置：

```yaml
customSkillDirs:
  - 'D:\agent\dsh-wishcoder-devteam\skills'
```

换机器/换目录就改这两处，然后跑门禁：

```
node D:\agent\dsh-wishcoder-devteam\validate.cjs
```

### 3. 选预设

- **单个会话**：新建会话 → 预设选择器里选「DevTeam-20 · 资深融合开发团队」或「WishCoder · 许愿式交付」。
- **设为默认**：设置 → 通用 → 默认预设（或 profile 层 `agent-preset-registry.default: devteam|wishcoder`）。
  注意 `agent-preset-registry.config` 是整段替换不是深合并，改 `default` 时要把 `selectedDefault` 一起保留。

### 卸载

profile `package.json` 里删掉那两行 → 重启。两个预设一起消失，因为它们同属一个 bundle。

## 怎么用

### DevTeam-20（`devteam`）

默认姿势是"直接改"，只有在三种明确触发下才走完整流程（新页面/弹窗、契约变更、>3 文件或 >50 行）。

```
把这个接口的分页参数从 page 改成 cursor，别动其他调用点。
```

它该做的：`grep -n` 定位唯一最小改动点 → 改 → 跑一条自测 → 报「改了哪个文件 + 一行理由」。

```
重构支付模块，把三个回调合成一个状态机。
```

跨文件的活它会走 `devteam-flow`：需求澄清 → 契约拆分 → 并行实现 → 评审放行，并用 `subagent` 扇出写域不重叠的块。

### WishCoder（`wishcoder`）

```
做个能把手机截图批量裁成 1080x1920 并加圆角的小工具，双击能跑。
```

它该做的：写 SPEC → 写 `scripts/verify.ps1` → 跑红 → 实现 → 跑绿 → 报三行（改动 / 验证 / 残留）。
不满意的点直接说「圆角要 24px」，它把这条加进验收再跑一遍。

带约束许愿（省一轮返工）：

```
愿望：<一句话>
验收：<怎么算做对了，能给命令最好>
不许动：<目录/接口/依赖>
预算：<几轮内、别超多少改动>
```

## 两个预设各自的关键约定

**DevTeam-20**（persona 865 字符）

- 输出：只报改动文件 + 一行理由（≤10 字），不解释不复述。
- 范围：禁整文件重写与无关格式化；>3 文件或 >50 行先问「是否确认扩大改动范围」。
- 步数：同一步并发 2~4 个 `read`/`grep`/`pwsh`；`grep -n` 先定位再局部读。
- 记忆：`MEMORY.md` → 项目 `CODE-MAP.md`（代码地图）/ `NOTES.md`，先 grep 再读。
- 新角色：往 `skills\` 加目录必须先在 `roles.json` 登记（`approvedBy: user`），否则门禁失败。

**WishCoder**（persona 720 字符）

- 五条铁律：不提问（只有三红线）/ 验收先行 / 全绿才算完成 / 同一失败三振换法（>40 步或 >15 min 未见绿就停手交状态）/ 交付前清理过程文件。
- 判据资产留（`scripts\verify.ps1`、`.wish\<slug>.md`），纯过程件删；删完必须重跑一次验收。
- 子代理：≥2 块写域不重叠才派；中断先 `send_message` 续跑不重派；子代理自报绿不算绿，合并后自己跑总验收。

## 自检门禁

```
node D:\agent\dsh-wishcoder-devteam\validate.cjs
```

覆盖：包清单与版本 → 顶层只有一个 `- insert:` 且恰好两个 preset 行（id/order 唯一）→ 无内核级服务行 → persona 长度区间与关键词 → `customSkillDirs` 指向本包 → 每个技能有 `SKILL.md` 且 front-matter `name` 与目录一致 → `roles.json` 双向登记（登记了必须存在，存在必须登记）→ 无 U+FFFD/零宽字符/BOM。

退出 0 = 通过，1 = 失败（逐条打到 stderr）。**改完任何文件都要跑。**

## 版本

`0.0.1` 是首次合并发布：两个预设均可独立工作，合并层只做了包结构与技能根的统一。后续改动记 `CHANGELOG.md`。

## 已知限制

- 技能目录是绝对路径，跨机器安装需要改 `cordis.patch.yml` 两处（DSH 的 `customSkillDirs` 只吃绝对路径，不认包内相对路径）。
- 两个预设共用同一个 `skills\` 根：技能**目录名**不能重名，新增技能前先查重。
- devteam 的 `tool-web` 行默认 `disabled: true`（宿主无 `DEEPSEEK_API_KEY` 时 `web_search` 必失败）。要开搜索：先配 key，再删那一行 `disabled`。
