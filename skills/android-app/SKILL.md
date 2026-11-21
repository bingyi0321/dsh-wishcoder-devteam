---
name: android-app
description: "Android MVVM/设计稿还原/界面布局、Gradle 构建、ANR崩溃。改安卓App或按设计稿改界面时加载。"
---

## 何时加载
Android 页面/MVVM 分层与数据层改造、Gradle 构建失败、真机调试、ANR/崩溃、权限、性能、发版上架。纯后端/Web 不加载。

## 八条硬门禁 + MVVM 契约（细则见下文各节）
- **`compress` 先算再折**：调前写出 `X = 可折叠 tok ÷ input tok`，**X<50% 不压**；图片折不掉；交付阶段不压。折前把「正在改 + 还要照抄（模板/接口签名）」的文件路径与关键片段写进 todo，**折后不整读回来**，按 offset 精读（实测 7 步重读）。
- **构建预算**：整任务 `assembleDebug` ≤5 次；改 1~2 行不构建；第 3 次失败前先静态核对（grep 新引用的类/资源名、import、`binding.` 字段）。**同一改动不构建两次**：`-q` 吞错误摘要、管道把 `$LASTEXITCODE` 改写成 0（见 §单测排障）。实测最多 10 次（18678dc9 两次是重跑）。
- **自写文件不回读**：自己 write 的大文件（>3k 字符）不整读、不分段读回；验证靠编译/`uidump`。实测回读 89k。
- **路径不猜**：`read`/`grep` 前先 `glob` 拿真实路径，`read` 前先 `grep -n`，整读 >8k 改 offset/limit（NOTES/CODE-MAP 可 >15k）；多路径一次查时逐条判存在。python 一次性脚本写 `files/<name>.py` 再跑，**不用 heredoc**（pwsh 无 `<<`）。
- **截图无变化先取 bounds 再怀疑构建**：`uidump` 比目标控件 bounds——变了=生效但视觉 no-op（收工），没变才查 `packaged_res`/APK 时间戳。静态页两次截图可字节全同（`sha1` 一致 ≠ 没生效，实测烧 8 步）。坐标只来自 `uidump`，同路径不重复读图。
- **页面态验证不过源码**：页面已读 intent extra 就用 `am start --es`；`exported="false"` 的在 `app/src/debug/AndroidManifest.xml` 覆写 `android:exported="true"` + `tools:replace`（只影响 debug 包），别把状态硬编码进产品源码再回滚（`run-as am start` 在 Android 14 静默无效；实测 4 次编辑 + 2 次构建 + 2 次回滚）。
- **沉淀一条命令**：项目 `.tmp-verify\v.ps1`（模板 `assets/verify.ps1`）一次完成 build→install→force-stop→启动→点击→截图→uidump，回一行 `V name=… build=… sha1=… same_as_prev=…`；参数照抄：`-Name`(必填) `-State empty|saving` `-Tap x,y` `-Bounds <id或文本>` `-NoBuild` `-NoInstall` `-NoRestart` `-Keep 20`——**别整读脚本学参数**。
- **物理现象只验到契约**：音频/人脸/振动感知不到，一次 probe 确认 API 写入或回调即收工，交付标「需真人/真机手测」；别拿 dumpsys 路由或等人入镜当证据。

## 开工前确认
- 读 `build.gradle(.kts)` 与 `libs.versions.toml`：minSdk/targetSdk/compileSdk、Kotlin、AGP、Compose BOM；三者版本必须匹配。
- 工程根 `AGENTS.md` 由 agent-instructions 自动注入，别重读；其构建命令/环境坑/交付自检优先于本技能。
- Windows 先确认入口：项目根 `gradlew.bat`；报 "JAVA_HOME is set to an invalid directory" 就显式覆盖 `$env:JAVA_HOME='<可用 JDK>'`（查 `gradle/gradle-daemon-jvm.properties` toolchain 版本或 Android Studio 自带 jbr），别逐层探测目录；每条 pwsh 是独立进程，工作目录用参数传，不靠 `cd`。
- 跑绿基线：`./gradlew assembleDebug`、`testDebugUnitTest`、`lintDebug`；确认 flavor 矩阵与 CI 产物 `bundleRelease`。
- 签名走 `signingConfigs` + 环境变量，keystore 与口令不提交；改依赖只动版本目录。

## 设计还原与真机验证回路
- 探索期取证用批量命令，别逐个 `read`：`Get-ChildItem app\src\main\res\drawable -Filter 'bg_*.xml' | % { "$($_.BaseName) " + ((Get-Content $_.FullName -Raw) -replace '\s+',' ') }` 一步拿全部形状/色值（串行要 5 步）。
- 设计稿参数一次列清（颜色 hex、圆角、字号 sp、间距 dp、宽高），必要时落 `files/<feature>-tokens.md`；同屏多状态用合成图，别一屏一张。
- **复用台账（用户说"可复用的不新建"时必做）**：新建 res 前 `grep -rl "<形态词>" app\src\main\res\drawable app\src\main\res\values`（`bg_`/`card`/`item_`/`ic_`）查既有同形；spec 与最终汇报各一行「复用 X / 新建 Y 因 Z」。实测一步新建 19 个资源、零逐项判定，用户约束无从核对。
- **脚本固定套路**：`.ps1` 用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File x.ps1`（本机 PATH 无 `pwsh`，`where.exe pwsh` 实测为空、`$PSVersionTable` = 5.1.26100；别写 `pwsh` 也别指望 `-Command` 里塞长脚本）；5.1 把无 BOM UTF-8 当 GBK → 中文串乱码、点不中（实测 4 步）；dot-source 外部脚本会被 `analysis.dynamic-shell-source` 拦。脚本里只比 ASCII，或先 `chcp 65001`。
- **既有行为先探针**："返回键回哪""这个 Activity 怎么起"这类假设先读该类 `onBackPressed`/`finish`，或一条 `dumpsys activity activities | Select-String topResumedActivity` 确认，别用截图试（实测返回键假设错连试 10 步）。
- 构建批处理：同一轮跑 `lintDebug`/`testDebugUnitTest`；禁止「改一处→构建→装→截→改下一处」；同布局视觉微调最多 2 轮 build+install，第 3 轮起先 `uiautomator dump` 拿 bounds 证明偏移再改（实测盲调 4 轮 159 s）。
- 取证一条命令出：`adb shell screencap -p /sdcard/s.png` + `adb pull`（`exec-out` 重定向会写坏 PNG）；多屏用 `System.Drawing` 裁切拼成一张对照图，一次 `read_image` 看完；**动作序列串进同一条 pwsh**（`input tap …; Start-Sleep 1; input text …; keyevent 4; screencap`），别一动作一步（实测 10+ 步）。
- 判对齐/间距与"操作是否生效"走门禁的 `.tmp-verify\v.ps1 -Bounds <id>`（一次拿到 bounds，可复核）；像素只用于取色与圆角，别肉眼量包围盒。
- 弹窗/底部面板被键盘顶起属 **insets 契约**问题：一次 `adb shell dumpsys window windows` 过滤 `<pkg>|softInput|mFrame|adjustResize|adjustPan` 拿窗口与 IME frame，再决定改 layout（`fitsSystemWindows`/`android:windowSoftInputMode`）还是 `WindowInsets` 监听；改完同一条 dumpsys 断言（输入框底边 ≥ IME 顶边）。实测盲试 7 轮 ≈ 25 步。
- 定时/闹钟类验证把触发时间设在当前 +1~2 分钟再等，别对齐整点干等（实测干等 6 分钟墙钟）；设计稿与截图在同一步并行发多个 `read_image`。
- `edit` 报 `ReplaceFileW EIO (Win32 1175)` = 该文件不支持原子替换 → 直接 `write` 整文件一次，不要再重试 edit。
- 源码禁用 pwsh `Set-Content`（PS 5.1 `-Encoding UTF8` **必带 BOM** → javac 报「非法字符: '\ufeff'」，也按 ANSI 写坏中文）；批量替换用一次性 node 脚本或 `[System.IO.File]::WriteAllText($p,$t,(New-Object System.Text.UTF8Encoding($false)))`。
- 验证性临时代码别改产品源码再回滚：在 `files/` 放探针文件由 `adb` 触发，验完删探针，避免"改源码→构建→回滚→再构建"；页面态走门禁里的 debug manifest 覆写。
- 布局易错：`android:clipToOutline` 是 API 31+（minSdk 低用 Java `setClipToOutline(true)`）；ImageView 用 `app:tint` 不用 `android:tint`（lint Error）；RelativeLayout 的 wrap_content 标题配 `layout_alignParentStart` + `layout_toStartOf`；`Context.getDrawable`→`ContextCompat.getDrawable`。

## 单测/编译失败排障（别把 Gradle 当 REPL）
- 失败先读证据：一次 `.\gradlew.bat :app:testDebugUnitTest --tests <Class> --offline 2>&1 | Select-String 'FAILED|expected|AssertionError|error:'`；同一步并行读测试方法与生产方法里的常量/分支/边界。
- 禁止「加 println/AssertionError → 重编 → 再跑」当调试器：实测为掩码 bug 连跑 19 次 gradlew ≈ 40 步。要看中间值就把表达式抄进 PowerShell 算，或只加一条断言，最多重编一次。
- 确实要在 JVM 里取中间值：用 `System.out.println`（**一次打 3~5 个字段**：入参、位序 vs 掩码、期望 vs 实际），跑完从 `app/build/test-results/testDebugUnitTest/TEST-*.xml` 的 `<system-out>` 读；**别用 `throw new AssertionError` 当 printf**（触发 unreachable statement，实测 4 次自伤编译）。
- 构建结果一次拿全（模板照抄）：`.\gradlew.bat :app:assembleDebug :app:testDebugUnitTest --offline *> build.log; $c=$LASTEXITCODE; "EXIT=$c"; if($c -ne 0){ Select-String -Path build.log -Pattern 'error:|e: |错误:|FAILED|AssertionError' -Context 0,2 | Select-Object -First 25 }`。别用 `Select-Object -Last` 收口（中段错误被截，实测 6 次）；别二次构建确认。
- 首写整文件后改用 `edit` 增量；同一文件第 3 次修改若还在改结构，停下来整写一次重估（实测单文件最多改 11 次）；测试文件调试用小 edit，别整写覆盖。
- `edit` 报 `file has not been read`：read 追踪只认 `read` 工具，`Get-Content/Select-String` 看过无效（实测 7/11 错误步）；`compress`/跨轮后先 `read`。报 `file changed since it was read`：**同一文件一步内发 2+ 个 edit 必触发**（改一处一步），外部改动则重读后重发。`old_string` 先 `Select-String` 断言命中 1 处，未命中重取原文别原样重试。改 Java/XML 禁用 `[System.IO.File]::WriteAllText` 字符串手术（实测 4 次）。
- 反面（实测洗码）：`.\gradlew.bat ... 2>&1 | Select-Object -Last 60; "EXIT=$LASTEXITCODE"` 报 `EXIT=0`，实际含 `2 个错误 / FAILURE`——`$LASTEXITCODE` 已被管道末端 `Select-Object` 改写成 0。判失败只认紧贴 gradlew 之后的 `$c=$LASTEXITCODE`，或 `Select-String 'BUILD FAILED|错误:|FAILED'`。
- 别加 `-q`（吞掉错误摘要，只剩 `Compilation failed`）；失败详情从 `app/build/test-results/…/TEST-*.xml` 的 `<failure message=…>` 取。

## MVVM 硬规范（页面只管页面，数据全在 ViewModel；违反即返工）
- **单向依赖**：`data`(DTO/Entity/Mapper/Repository) → `domain`(可选 UseCase) → `ui`(Screen+ViewModel)，按 feature 分包；`ui` 不 import 网络/Room/JSON 类型。
- **页面只管页面**：Composable/Activity/Fragment 只做三件：按 `UiState` 渲染、把意图包成 `Event` 上抛、导航；禁调 Repository/网络/DB、禁写业务判断、业务数据不进 `remember`、不持业务 Context。
- **ViewModel 管数据**：构造器注入 Repository，对外只暴露 `StateFlow<UiState>` + `onEvent(Event)`；不持 View/Context/Composable，不自己 Toast/导航（发一次性事件）。
- **数据层**：网络 DTO / Room Entity / UI Model 三分离，转换放 `data/mapper`；Repository 是唯一数据入口，返回 `Result<T>`/`Flow<T>`，UI 不见 `Response`/`Cursor`；写路径「网络→落 DB→读 DB 回 UI」，DB 为唯一真源。
- **状态不可变**：`data class UiState` + `copy()`，sealed interface 分 Loading/Error/Success/Empty；禁布尔 flag 拼态、禁持可变集合；一次性事件用 `SharedFlow(replay=0)`/`Channel`，不进 UiState（防旋转重放）。
- **机械自检**：`grep -rn "Repository\|Dao\|OkHttp" .../ui` 与 `grep -rn "Toast\|startActivity\|Context" .../viewmodel` 均须为空；ViewModel 单测用 `StandardTestDispatcher` 断状态序列。
- DI：中小项目手动构造器注入即可，跨模块多环境再上 Hilt。

## 协程与生命周期
- ViewModel 用 `viewModelScope`，纯 UI 动效用 `rememberCoroutineScope`，禁止 `GlobalScope`。
- 收集必须生命周期安全：Composable 用 `collectAsStateWithLifecycle()`；Activity/Fragment 用 `repeatOnLifecycle(STARTED)`。
- Flow 冷热：`flow{}` 每次收集重跑；共享用 `stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), initial)`；IO `Dispatchers.IO`，CPU 密集 `Dispatchers.Default`。
- `runCatching` 不得吞 `CancellationException`；子协程用 `supervisorScope` 隔离；监听在 `onDestroyView` 反注册。

## 权限与后台限制
- 权限用 `rememberLauncherForActivityResult(RequestPermission())`；拒绝后给 rationale 文案与降级路径。
- 定位默认 `ACCESS_COARSE_LOCATION`，确需导航再申请 `ACCESS_FINE_LOCATION`；后台定位单列用途，避免 Play 驳回。
- 通知：Android 13+ 需 `POST_NOTIFICATIONS`；`NotificationChannel` 建一次，重要度不可上调。
- 长任务 `ForegroundService` + `foregroundServiceType`(location/dataSync/mediaPlayback)；可延迟用 WorkManager；勿依赖后台常驻（Doze）；Android 12+ 禁后台起前台服务；敏感权限需 Play 政策声明。

## 网络与离线
- OkHttp 连接 10s / 读 20s / 写 20s；仅幂等请求开 `retryOnConnectionFailure(true)`，写操作禁止自动重试。
- 错误映射：`IOException`=不可达，`HttpException` 读 body 取业务码，统一成领域错误给 UI。
- HTTP 层用 OkHttp `Cache`；数据单一真源见 MVVM 节。
- 同步用 WorkManager + `ExistingWorkPolicy.KEEP`，失败 `Result.retry()` 指数退避；冲突用 last-write-wins 或字段级 patch；删除用软删+墓碑；离线优先先渲染缓存并标 stale。

## 性能与稳定性
- 启动：`adb shell am start -W -n <pkg>/.<Activity>` 看 TotalTime，冷启动 <1s，首帧前不做重 IO，SDK 按需初始化。
- Jank：`adb shell dumpsys gfxinfo <pkg> framestats`；Compose 用 Layout Inspector 看重组次数；状态下推到最小 Composable，列表加 `key()`。
- ANR：查 `adb shell dumpsys activity processes` 与 `/data/anr/traces.txt`；主线程禁止文件/DB/网络/大 JSON。
- 内存：Debug 接 LeakCanary；`dumpsys meminfo <pkg>` 看 PSS；`generateBaselineProfile` 提升启动与滚动帧率。

## 崩溃排障
1. `adb logcat -v time -s AndroidRuntime:E ActivityManager:E *:S`；按进程 `adb logcat --pid=$(adb shell pidof -s <pkg>)`。
2. 原生崩溃看 tombstone：`adb shell ls /data/tombstones`；或 `adb bugreport <dir>` 解包查 `tombstone_*`；混淆用对应版本 `mapping.txt` 跑 `retrace`。
3. 最小复现与回归测试方法见 debug-research；修前先写失败用例，回归同一路径。

## 测试与发布
- `runTest` + Turbine 断言 Flow/状态序列（口径见 MVVM 节）；Compose UI 用 `createAndroidComposeRule` + `testTag` 断言语义节点而非像素；Espresso 测跨 Activity。
- 设备矩阵：minSdk 老机、旗舰、折叠/平板各一台；API 33/34 必测权限与前台服务。
- 混淆：release 开 `isMinifyEnabled` + `isShrinkResources`，反射/序列化类加 `@Keep`；签名由 CI 从密钥库读取，`apksigner verify` 校验，上传 AAB。
- 轨道：内部→封闭→开放→分阶段发布(5%→20%→50%→100%)，盯崩溃率与 ANR；回滚先暂停发布再发 hotfix，DB 迁移向前兼容。

## 交付自检
- [ ] `assembleDebug`、单测、lint 全绿；新增代码有测试
- [ ] 状态覆盖 Loading/Error/Empty；旋转与进程重建不丢状态（`SavedStateHandle`）
- [ ] 权限拒绝路径可达；无主线程 IO、无 Context 泄漏、无硬编码文本
- [ ] 每条 `input tap` 的坐标能指到一次 `uiautomator dump` 或设计稿标注；截图数与 dump 数能对上（截图只用于取色与最终验收）
- [ ] 崩溃/ANR 修复已回归；release 混淆后真机跑通主流程；版本号/CHANGELOG/mapping.txt 已归档
- [ ] 自检回路：按 `devteam-flow`「收尾沉淀」的那条合并命令（写记忆 + 回读 + `session-friction.cjs` 取数）一次跑完 → 交付里写 errorSteps/exitNZ/dupCalls/approvals；四列（单文件小改两列）
