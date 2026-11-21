# 设计决策日志（从 cordis.patch.yml 1~179 行注释原样迁出，2026-11-21）

> 迁移理由：patch 文件 38 KB 里近一半是历史注释，与 CHANGELOG 重复；运行时零成本，但每次评审要烧 token（本轮仅读注释 ≈9k tok）。
> 现行决策只看 patch 头部 8 行 + CHANGELOG；要查"为什么这么改"再来本文件。

# dsh-wishcoder-devteam v0.0.203 — 单入口（DevTeam-20 + 许愿模式）
#
# 顶层只有一个 preset 行：devteam（order 20）。v0.0.1 的第二个预设 wishcoder(21)
# 已折叠掉——它 0.0.1 发布后 6.5 小时内 0 次被选（385 个会话头统计：devteam 246 /
# standard 92 / optimizer 29 / cordis 10 / miniprogram 6 / wishcoder 0），
# 依据与对比见 D:\agent\.research\preset-merge-decision-2026-11-20.md。
#
# 折叠方式（只合入口、不合 persona）：
#   1. 用户只看到 devteam 一个预设；许愿式交付由 persona 的「许愿：」路由行触发，
#      细则全部在 skills/wish-loop + skills/verify-harness（技能正文不进前缀缓存）。
#   2. 不把两套规则塞进一段 persona：两者在同触发（>3 文件或 >50 行）下要求相反动作
#      （devteam「先问是否扩大范围」 vs wishcoder「先落 SPEC 不提问」），硬合并会
#      重演 .research/opt-wishcoder-2026-11-20.md 的 P0-2 自相矛盾。
#   3. 许愿模式的低层规则（不提问 + 三个红线开关 / 验收先行 / 全绿 / 三振 / 清理 /
#      子代理断点续）仍在 skills/wish-loop 正文，persona 只留触发与覆盖。
#
# 卸载本 bundle 即移除该预设。技能目录是绝对路径：换安装位置需改 customSkillDirs，然后 node validate.cjs。

# ─────────────────────────────────────────────────────────────
# 以下两段是两份源文件各自的文件头注释，原样保留（含 v4→v22 的改动理由与实测数据）。
# ─────────────────────────────────────────────────────────────
# @@ devteam-agent/cordis.patch.yml 文件头
# DevTeam-20 — 资深融合开发团队 DSH 预设（v4 · 精简/提速/省 token）。
#
# 只 insert 一行 preset 声明，不改动任何已有行；卸载 bundle 即移除预设。
# v4 相对 v3 的改动（每请求固定开销 ↓、流程步骤 ↓）：
#   1. persona 换成「默认快路径」版（766 → 510 字符）：默认直接改代码，只在 3 种明确触发下才走完整流程；
#      去掉「先对齐/契约先行/并行/结论先行」等长清单，改为 3 行硬底线。
#   2. 技能目录 9 → 5（见 skills/），description 压到 ≤50 字符，正文精简约一半。
#   3. 删除 command-goal / tool-goal（少 1824 字符 schema）与 subagent_fork provider
#      （少 ~1200 字符 schema，且 fork 会继承父会话全量上下文，最费 token）。
#      需要 /goal 或 fork 时按 README「一行恢复」加回。
#   4. 搜索输出封顶：globMaxResults 40、grepMaxMatches 120（溢出内容仍可从 artifact 取回）。
#   5. agent-instructions 上限 65536 → 32768 字节；pruner 6144/2048/512（原 6144/3072/768）。
#   6. tool-skill.catalogDescriptionMaxLength 80：技能目录是持久消息、每请求重发，描述超长就是纯浪费。
#   7. web 只留搜索：fetch: false（模型看不到 web_fetch，网页全文永不进上下文），searchMaxQueries 2、
#      searchMaxResults 3——检索结果只有 markdown 链接 + 摘要；联网只在本地查不到时用，且只取最近 3 个月内最多 3 条
#      （见 skills/debug-research）。连带省掉 web_fetch 的 schema 与一段 guidance 文本。
#   8. time-context.refreshIntervalMs 3600000：时间事实每小时注入一次即可。
#   9. plan-mode 指引从 825 字压到 448 字（只在计划模式注入，不影响常态请求）。
#
# v7（成本治理，依据 23 个真实会话 + bili 逐请求台账实测；报告见 D:\agent\.research\blindspots-v7.md）：
#   1. tool-fs 封口：readLimit 800 / readMaxLineLength 800 / readMaxBytes 24576（原 2000/2000/51200）。
#      实测 261 条 >6144 字符的结果（最大 53k）几乎都来自 read/pwsh，单次 read 最多吃 12.8k token。
#   2. pruner 4096/1536/384（原 6144/2048/512）：只在压缩触发时生效，trim 更早 = 压缩待重写体积更小。
#   3. compaction-basic maxTokens 16384（默认 = headroomTokens 65536）：摘要输出（含推理）不该这么大。
#   4. skill-filesystem watch: false：技能目录变动会整条重发目录消息 = 前缀缓存断点。
#   5. tool-subagent modelSelectionSettings: false：省 3 个可选参数 + list_subagent_models 工具。
#   6. persona 增补读取纪律 / 环境事实沉淀（项目根 AGENTS.md）/ 成本纪律（不用 Auto 权限、不中途换模型）。
#      实测依据：同一路径重复读 337 次 = 363k token；Auto 审阅税占会话输入 24%。
# v8（步数经济 / 错误步治理；依据 57 个真实会话 4480 次工具调用，报告见 D:\agent\.research\blindspots-v8.md）：
#   1. persona 把「读法」升级为「步数经济」：同一步并发发起互不依赖的 read/grep/pwsh（2~4 个）、
#      成功的命令不重跑、edit 前先读且 old_string 取唯一片段。理由：一个「步」= 22 s + 58,828 input tok，
#      80% 的步只有一个工具调用（r=0.804 的 token↔墙钟相关来自步数），压提示词字节只动 1.9%。
#   2. 新增 repeat-tool-reminder：完全相同的工具调用第 2 次就提醒（默认 3），阈值前零成本。
#      实测 15 次同会话完全重复命令、5.7% 工具错误。
#   3. persona 收尾从「追加 NOTES」改为「必答新结论写进哪个文件」：记忆实际执行率 29/45，最贵两个会话没读过。
#      为守住 560 字符上限，同步压缩了升级条件、硬底线、成本三行的措辞。
# v9（环境自愈 / 失败步治理；依据 life_window 最近两会话 97e87454、d13d2f46 逐事件复盘）：
#   1. persona 增三行：失败即换法（报错先读错误行→换参/换路径一次，同一失败命令不重发，权限/沙箱错误按记忆直接做）、
#      环境（动工先读工程根 AGENTS.md；gradlew 报 JAVA_HOME 无效就显式设 JDK；E: 盘项目沙箱授权必失败→danger-full-access）、
#      压缩提示（出现先压缩，之后按摘要继续不整文件重读）。
#      实测依据：d13d2f46 用 5 次探路步才确认沙箱 ACL 问题（6 次 ACL 失败、11 次审批、122 s 审批等待），
#      97e87454 第 23 步被 bili 压缩提示触发后整文件重读 3 次，第 24~31 步非缓存输入 43,313 token（占全会话 30%）。
#   2. 环境事实落盘：life_window 项目根新增 AGENTS.md（构建命令/JAVA_HOME/ACL 坑），用户级 JAVA_HOME 修正为 manual-jdks/jdk-17；
#      android-app 技能「开工前确认」补 Windows 构建入口 + 项目 AGENTS.md 优先。
#   3. 记忆闭环：NOTES/MEMORY 记录 ACL 不可自修与正确 JDK 路径——d13d2f46 与 97e87454 各自花 3~4 步重新发现 JAVA_HOME。
#   4. 验收口径从 4 个数扩到 6 个数：步数/错误步/人工干预(审批+手改权限)/活跃墙钟(排除人类空闲)，
#      工具 .research/tools/session-friction.cjs（--json 可进 scoreboard）。
# v10（写/验纪律 / 设计还原成本；依据 life_window 最近三会话 711e6152、1b40c8a6、303449dd，报告见 D:\agent\.research\blindspots-v10.md）：
#   1. 实测结构：活跃墙钟 60% 是模型生成（711e6152 工具 769 s / 活跃 3852 s），单次工具耗时不是瓶颈；
#      工具参数输出里 write 占 57%（49 次、avg 2526 字符，PictureUploadDialog.java 同文件整写 13 次），
#      同等改造用 edit 为主的会话只花 30,455 字符 → 整文件重发是最大单项成本。
#      步相位：verify（构建/装/截/量）43%、explore 27~42%、impl 20%。
#   2. persona 加「写入」「验证」两行 + 升级条件补「新页面或弹窗」+ 环境行改「E: 盘首答就请用户切 danger-full-access」
#      （实测 711e6152 起手 40 s 内 4 次同理由提权审批、17 s 等待；303449dd 先切则 0 错误步 0 审批）。
#   3. android-app 技能新增「设计还原验证回路」：构建批处理、批量截图裁切一次读图、uiautomator dump 取 bounds、
#      edit EIO 1175 兜底、源码禁用 pwsh 写、验证探针代替临时改源码（实测 711e6152 有七步 UTF-8 自伤）。
#   4. E:\Android project\life_window\AGENTS.md 重建并纳入 git（v9 建的那份已丢失，导致每会话重探 JAVA_HOME）。
# v12（缓存与压缩经济 / 记分口径；依据 1e1ae006 完整会话 315 步逐请求取证，报告见 D:\agent\.research\blindspots-v12.md）：
#   1. 记分口径修正：pwsh 里 `cmd; echo "EXIT=$LASTEXITCODE"` 把进程退出码洗成 0，构建/单测失败在日志里
#      isError=false → .research/tools/session-friction.cjs 增加 shell 类工具的文本复核（BUILD FAILED / EXIT=n /
#      tests failed），本会话错误步 10(3.2%) → 19(6.0%)，81 会话基线 5.7% → 6.2%。改前报的错误率系统性偏低。
#   2. 冷前缀实测 683,591 未命中 input = 全会话 62%：其中 system prompt（persona）在 turn 边界被改占 327,593(30%)，
#      低 ROI 压缩（折掉 5%）占 152,286(14%)。本轮只改技能正文（不进前缀）+ 本文件注释，persona 一个字不动——
#      在活跃会话里改 persona 会让下一轮整条重付。原文"编辑本文件后需新会话（或重装 bundle）才生效"已按实测更正。
#   3. 技能补三条硬规则：构建输出落盘再 grep（别用 Last 20 截掉报错）/ JVM 探针用 System.out.println 打 3~5 字段 /
#      弹窗被键盘顶起先 dumpsys window 拿 insets 再改（实测 7 轮盲试 ≈ 25 步）。
# v14（新增桌面角色；2026-10-25 用户要求「Windows 桌面控件软件资深工程师」）：
#   1. 新增第 6 个技能 skills/win-desktop/SKILL.md（6,274 字符，多栈：.NET WPF/WinUI/WinForms、MFC/Win32/Qt、WebView 壳）：
#      栈探测与构建 → 模糊需求转可测判据 → 控件/消息循环/自绘 → PerMonitorV2 与多屏 → dump/ETW/UMDH 取证 →
#      六指标内存斜率与十条泄漏清单 → 启动/帧率 → MSIX/签名/回滚 → 五步验证回路。
#   2. persona 技能行加 win-desktop（+12 字符）。为守 620 上限同步微调（实测 623 过线，别按估算改）：
#      删「代码」「用」、"uiautomator dump"→"uidump"、"request/ask 不用 Auto"→"request/ask，不用 Auto"，620→613。
#      注意：改 persona 会让当前活跃会话的下一轮整条前缀冷启（≈当前 input 全量重付），改前挑没会话在跑的时候。
#   3. skills/ 目录 6 个 = validate.cjs 的硬上限（>6 报错）；再加角色必须先合并现有技能或先改上限。
# v15（记忆按项目分域；2026-10-26 用户要求「代码地图和坑按项目划分」）：
#   1. memory/CODE-MAP.md、NOTES.md 拆成 memory/projects/<项目>/{CODE-MAP,NOTES}.md：
#      devteam（预设/技能/工具链/成本口径）、life_window、cpu-mem-widget（D:\AI_driver\CpuMemWidget）；
#      顶层两个文件改为 3 行存根。理由：life_window 条目占 NOTES 2/3，非该项目会话按需读整份必带无关项目。
#   2. MEMORY.md 只留「项目索引 + 用户偏好 + 决策与原因 + 读法」，项目/设备环境事实归各项目 NOTES；
#      validate.cjs 改为校验 projects/<项目>/*.md 存在、顶层文件必须 ≤400 字符（存根）。
#   3. persona 记忆行改「MEMORY.md→按项目 CODE-MAP.md（代码地图）/NOTES.md」，实测 613→618 字符（上限 620）；devteam-flow 收尾沉淀同步。
# v16（角色注册 + 步数/审批纪律；2026-10-26 用户要求「后续创建角色都需要注册，加进 devteam 必须经我同意」）：
#   1. 角色注册成硬门禁：新增 devteam-agent/roles.json（每角色一条 active + approvedBy:"user" + 用户原话）
#      + ROLES.md（流程/步骤/上限），.research/validate.cjs 双向校验（有目录无登记、有登记无目录都报错）。
#      persona 技能行加「新角色须用户批准并注册」，618→614 字符：为腾地方做了 5 处等义缩写
#      （「记忆 D:\agent\…」→「记忆 …\…」、「收尾报新结论落哪文件」→「收尾报落哪文件」、「盘首答就请切」→「盘首答即切」、
#      「未过半不主动压缩」→「未过半不压缩」、「并发互不依赖的」→「并发独立的」）。
#   2. devteam-flow 收尾沉淀改硬门禁：记忆写入用 1 条 pwsh 合并（append + 回读，显式 UTF-8 无 BOM），禁逐文件 edit
#      （s3 实测两轮 9 次审批 / 140 s 等待 / 13 步）；工程外写入首次调用就带提权（s3 两次先撞 file access denied 再提权）。
#   3. devteam-flow 补三条：grep 先圈范围（s1 一条无 include 的 grep = 49,931 字符 / 99 条无关命中，上下文 13k→76k）、
#      同文件第 3 次 edit 改脚本批改、压缩后第一次 edit 当未读（s3 折叠后 old_string was not found）。
#      该技能为守住 8000 字符预算同步压缩了旧条目（证据保留一句，长推导留在 .research 报告里）。
#   4. win-desktop 补 .tmp-verify\run.ps1 脚手架（建一次复用）+ 无 git 项目先 git init/.gitignore；
#      validate.cjs 加记忆漂移探针（项目根路径不存在、绝对 文件:行号 越界 → WARN，加 --strict 才算失败）。
#   5. 未做：关 team_task_* / spawn_teammate 那 9 个工具——它们来自 host 的 dsh-experimental-tool-agent-team，
#      不在本 preset 里，而 patch 只有 insert 一种操作，从 bundle 侧关不掉。
# v18（两会话逐事件复盘后的定点修；依据 session-aaf5884e（149 请求/7 张设计稿）与 session-a6bf91e3（103 请求/1 张），
#      取证报告 D:\agent\.research\tmp\opt-2026-10-26\forensics.md、image-cost.md）：
#   1. 压缩改成「先算再折 + 折后不重读」（persona 成本行 + android-app:10，删掉 devteam-flow:91 那条逃生门）：
#      s77 在 15% 占用（138,209/934,464）折掉 94% 上下文 → bili `[warn: degenerate-fold]`、cached 135,296→10,496，
#      随后 s78–s85 七步全花在重列目录、重读自己 s35/s42/s43 刚写的文件上。**注意口径，别读成「不该折」**：
#      按 v13 的 X≥50% 判据这次折是划算的（尾部 72 个请求上下文降到 1/4.7，缓存读只值 0.1×，折的代价只有
#      s78 的 12,080 未命中 + 7 个死步 ≈ 2.6 min）；真正的缺陷是**折前没把改动文件/签名/todo 留在摘要里**。
#      旧 devteam-flow:91「只有接近上限或系统明确提示时才考虑」既与 75（X<50% 不压）冲突，又给「nudge/占用读数
#      算不算系统提示」留了自证空间 → 删除，判定式只保留 X 算式（75 已有，persona 加一句常驻）。
#   2. 沙箱 ACL 换成错误签名触发（persona）：原「E: 盘首答即切 danger-full-access」只认盘符，
#      a6bf91e3（cwd 同为 E:\Android project\life_window）仍连发 2 条 pwsh 全失败、用户 step 6 才手切
#      （2 死步 + 1 次人工干预）；改为「报 SetNamedSecurityInfoW=沙箱无权，首答即请切（重试无用）」。
#   3. persona 620→660 字符（validate.cjs 同源注释）：现值 633，净 +24 字符 ≈ +10 tok/请求，
#      换掉的是「2 死步 + 1 干预」这类整步事故，以及「规则两处留逃生门」的歧义。
#   4. android-app 把「编译错误只取错误行」并入构建模板（省 47 字符给上面腾位），
#      模板 Select-String 加 `错误:`——s56 的 javac 报错是中文「错误: 找不到符号」，只过滤 error:|e: 会漏。
#   5. 未改（有证据但收益不明或需换层）：read_image 一屏一读（aaf s71/73/75，各 1 步，属顺序验证而非违规）；
#      a6bf91e3 的 19 步白走步里 7 步即错误步、其余为环境探测与 logcat/measure 脚本重复；
#      token meter 图片低估 19×（61~62 tok/图 vs 实测 1,193）在 host 的 pi-ai 适配器，bundle 改不到。

# v23（输出/范围纪律常驻化；2026-10-30 用户要求「用最少 token、最小 diff、最快完成」）：
#   1. persona 新增三行「输出 / 范围 / 验收」：只报改动文件+一行理由（≤10 字）、不解释不总结不贴代码不复述工具结果；
#      先定位唯一最小改动点、禁整文件重写/无关格式化/顺手优化、架构只动接口与调用；>3 文件或 >50 行 diff 先问
#      「是否确认扩大改动范围？」；动手前内部定 A→B，说不清只问一个最短问题。
#   2. 原「升级」触发从「≥6 文件」改为只留「新页面/弹窗、契约变更」——文件数判据已由范围行接管，避免两套阈值打架。
#   3. 「底线」删「自测给命令与结果」→「自测必跑，成功不贴结果」（与输出行一致；证据落到收尾命令与记忆，不进回复）。
#   4. 代价：persona 651 → 见 validate.cjs 实报（上限 660 → 900，≈+60 tok/请求）；换的是输出 token 与白走步，
#      output 实测占生成 56~72%，每步省下的生成远大于固定开销。改 persona 会让活跃会话下一轮整条前缀冷启。
#   5. 配套：devteam-flow 交付格式/自检回路同步改为「路径+一行理由」，取数四数不贴入回复。
# v24（技能路由修正 + 物理验证边界；依据 life_window 两会话 2defde7f/709ebda7 复盘，取证 session-friction + assistant 原文）：
#   1. persona 技能行 android-app（界面）→（改安卓/构建/真机）：2defde7f 任务「实现亮度/音量的实际功能」属真机验证型，
#      被「（界面）」判成纯 UI 而全程 skill=0（对比 709ebda7 skill=2），丢了 android-app 的 edit-before-read（pwsh Get-Content 不算 read）/
#      构建预算/收尾硬门禁全部规则 → 1 错误步 + 17 步音量路由兔子洞 + 收尾漏跑 session-friction 取数。persona 858→865 字符（上限 900）。
#   2. android-app 加第 8 条硬门禁「物理现象只验到契约」：音频/人脸/振动这类远程感知不到的，一次 probe 确认 API 写入或回调即收工，
#      交付标「需真人/真机手测」，别拿 dumpsys 路由或等人入镜当证据（实测 2defde7f 17 步、709ebda7 3 步+60 s 干等）。
#      为守 9600 字符上限同步删 toLowerCase/Locale.ROOT 一条（泛用 lint 项，lint 本身可查）。
# v25（宿主升级 dsh 0.2.2-rc.1 / DSH NEXT 2.0.22-next 兼容修；2026-11-07）：
#   1. 删除 `tool-subagent-list-agents`（@deepseek-ai/dsh-tool-subagent-control/list-agents）。
#      新版包 exports 只剩 "."、"./src/*"、"./package.json"、"./locale/*.json"，旧子路径不存在，
#      报 `ERR_PACKAGE_PATH_NOT_EXPORTED ... './list-agents'` → preset devteam 组装失败 →
#      新建会话报 `Unknown agent preset: devteam`。主入口 lib/index.js:154 已自带注册
#      list_agents/send_message/interrupt_agent，保留 tool-subagent-control 即够。
#   2. tool-subagent 的 `modelSelectionSettings` → `modelSelection`（0.2.2 Config schema 已换键，
#      旧键被 zod 静默丢弃，行为默认相同，但显式写对避免误导）。
#   3. 安装层同批被宿主升级改写（不在本文件、不在 bundle 范围）：desktop profile 的
#      package.json `dsh.profile.bundles` 丢了 dsh-devteam-preset，profile cordis.patch.yml 给
#      preset-devteam 加了 disabled: true 且 selectedDefault 改回 standard —— 恢复后预设才注册。
# 技能目录是绝对路径，该目录需保持在原位。技能正文（skills/*/SKILL.md）随改随生效且不进前缀缓存；
# 本文件由 bundle 安装副本加载，实测改完在**同一会话的下一轮**即生效（1e1ae006 10:27 改、10:31 的 turn 4 已用新版），
# 代价是该轮整条前缀冷启（≈ 当前 input 全量重付）。改 persona 请挑没有在跑会话的时候。
# @@ 已折叠：wishcoder-agent/cordis.patch.yml（v1，2026-11-20）
# 原来这里是第二个 preset 行（wishcoder order 21）。v0.0.101 把它并进 devteam 入口：
#   - 用户面上的选择项从 2 变 1，persona 只多一行「许愿：」路由；
#   - wish-loop / verify-harness 两个技能整份保留，触发词命中后加载；
#   - 折叠后 includeDefaultRoots 沿用 devteam 的 false（省约 1.2k 字符/请求）。
#     代价：许愿对象若是文档/视频，宿主的 office/hyperframes 技能不在目录里——
#     需要时把本包该行改 true 并跑 validate（接受那 1.2k）。
#   - 不挂 goal 四件套、不加 workflow/ptc-runtime、声明里不出现 permission：
#     三条理由与 v1 相同（base 层服务重复声明会 service already registered；schema 成本）。
#
# persona 改动代价：正在跑的会话下一轮整条前缀冷启（≈ 当前 input 全量重付），挑没人跑的时候改。

## cordis.patch.yml v26~v29 变更记录（原样迁出）

          # v26（2026-11-20，三段式）：persona 1000 → 989，守 1000 上限（validate.cjs 同源）。
          # 许愿行加「三段：本会话判愿/SPEC/验收→子代理(同路由)或自写实现→三振接管」；
          # 成本行「不换模型」→「子代理只能同路由，别传异地 model」。
          # v26.1 修正（T6 r3 实测）：原写法「本人(Pro)…→flash 实现」诱导跨路由派发，必被运行时拒绝——
          # dsh-tool-subagent/lib/index.js:85 assertAllowedModelSelection：无 Session policy 时显式选择只允许等于父路由，
          # policy 为会话级持久状态（stateVersion 1，init null，经 subagent/model-selection-policy 事件写入），本机未记录。
          # 故 persona 不再出现模型名，规则写成「同路由」。细则在 skills/wish-loop「五段流水线」与 verify-harness §8，不进前缀。
          # v27（2026-11-21，五段流水线）：许愿路由改成 需求转译→按写域派领域子智能体→验收专家→功能测试→全绿才报；
          # 新增角色技能 requirement-translator / acceptance-verifier（roles.json 登记，maxSkills 6→8）；persona 981→952 字符。
          # v28（2026-11-21，用户四项改动）：①派发后守注意力（wish-loop「派发后守注意力」：派后不追加需求/不换写域、
          # 收活核越界、走偏四信号、两次纠偏不动就接手；devteam-flow「派后锁范围」）；②验收必出测试报告
          # （项目根 TEST-REPORT.md 五段：改动/测试/过/没过/未覆盖；格式唯一权威在 acceptance-verifier，wish-loop 只引用）；
          # ③任务书加第 8 项「开工规划」（≤8 行：做什么/工具/是否再派/改与新增/取舍与缺点/自检），
          # 阶段 3 加「少 AI 味」条（注释只写为什么、不复述代码、不留占位与演示数据）；
          # ④清理过程件改成硬门禁（阶段 5.5 已存在，补「不清不算完成」+ 报告属判据资产保留）。
          # persona 953→982 字符（前 ≤1000）；开头「较小 diff」到 1000 的余量只剩 18，下次加字先压缩。
          # v29（2026-11-21，v0.0.206 评审修复）：输出行加「技能要求的规划/测试报告/纠偏包例外」（常驻 persona
          # 权重高于技能，冲突时 persona 赢，必须显式开例外）；删「spawn 须≥2 写域」（与 wish-loop 阶段 3.5 判据表对撞）；
          # 验证/环境/成本三行压缩腾空间（persona → 955）；tool-web 的 disabled 死 config 一并清掉。
