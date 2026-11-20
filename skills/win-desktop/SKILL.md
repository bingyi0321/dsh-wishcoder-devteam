---
name: win-desktop
description: "Windows 桌面：WPF/WinForms/MFC/Qt、控件自绘、DPI多屏、内存泄漏。做桌面软件时加载。"
---

## 何时加载
写/改 Windows 桌面程序（WPF、WinUI 3、WinForms、MFC/Win32、Qt、WebView 壳）：自定义控件与自绘、窗口/托盘/热键、内存与句柄增长、DPI 与多屏适配、卡顿与崩溃、安装打包。纯网页/移动端/嵌入式固件不加载。

## 开工前勘察
```powershell
Get-ChildItem -Recurse -Depth 2 *.sln,*.csproj,*.vcxproj,CMakeLists.txt,*.pro,*.manifest | Select-Object FullName
Select-String -Path *.csproj -Pattern 'TargetFramework|UseWPF|UseWindowsForms|RuntimeIdentifier|PlatformTarget|Nullable'
```
记录：栈与版本（.NET 6/8/9、C++ v143、Qt 5/6、WebView2）、目标 OS 与架构（x64/x86/ARM64）、UI 框架与既有自绘控件、构建命令、配置/日志/崩溃上报、安装形态、最小可运行入口。沿用现有栈，不引第二套 UI 框架；新依赖先看体积与是否打断单文件部署。

## 需求澄清（模糊到什么程度都能接）
- 先给 3 行理解再动手：谁用 / 什么场景 / 成功长什么样；只问阻塞项，一次 ≤3 个：①运行环境（OS 版本、机器、是否管理员）②数据来源（接口/文件/设备）③验收怎么算过（点几下、指标阈值）。能从代码、日志、既有数据表查到的绝不问。
- 模糊词转可测：好看=对齐设计稿某页；流畅=交互响应 <100ms、滚动 60fps；不卡=UI 线程无 >200ms 阻塞；稳定=驻留 8h 内存斜率 <5MB/h、句柄不涨。
- 缺字段/接口不臆造：先 grep 客户端模型、抓一次真实响应或看 Swagger；拿不到就标 TODO + 影响范围，不编造字段名。
- 不接受「就像某软件那样」的模糊对标：要一张图或一次录屏，否则给 2 个可选项让用户挑。

## 控件与窗口实现
- 自绘先双缓冲：WinForms `SetStyle(OptimizedDoubleBuffer|AllPaintingInWmPaint|UserPaint, true)`；MFC 内存 DC `CreateCompatibleDC`；WPF 用 DrawingVisual/CompositionTarget，避免每帧新建 Pen/Brush。
- WPF：公共控件做成 `Control` + `ControlTemplate` + 依赖属性（UserControl 只做页面）；大集合用 VirtualizingStackPanel + `VirtualizationMode=Recycling`；所有 Brush/ImageSource 调 `Freeze()`，跨线程才安全；`BitmapImage.DecodePixelWidth` 按显示尺寸解码。
- WinForms：大网格 `VirtualMode=true`；跨线程只 `BeginInvoke`；`Dispose` 顺序 components→base；`FormClosing` 里别做长任务。
- WinUI 3 / WPF async：`await` 默认回 UI 线程，`ConfigureAwait(false)` 只用在无 UI 依赖处；`async void` 仅限事件处理器且必须 try/catch。
- MFC/Win32：`ON_MESSAGE` + 自定义消息；子类化用 `SetWindowSubclass`（不要 `SetWindowLongPtr(GWLP_WNDPROC)`，会丢其他挂钩）；销毁窗口前解绑挂钩与定时器；无边框窗口靠 `WM_NCHITTEST` 返 `HTCAPTION/HTLEFT…` 实现拖动与边缘缩放，别自己算鼠标位移（会与 DPI 缩放打架）。
- Qt：`paintEvent` + `QPainter` 抗锯齿；QML 用 `Loader` 懒加载；跨线程信号槽用 `Qt::QueuedConnection`；QSS 别在 paint 里重建。

## 桌面环境适配（真机矩阵，不是推断）
- DPI：清单 `PerMonitorV2`（app.manifest `<dpiAwareness>PerMonitorV2</dpiAwareness>`）；WinForms 另设 `Application.SetHighDpiMode(HighDpiMode.PerMonitorV2)`；WPF 需 .NET Core 3+/4.6.2+。验证 100/150/200% 三档 + 跨屏拖动（DPI 变化会重发 `WM_DPICHANGED`，布局按逻辑单位重算，别缓存像素值）。
- 多屏/远程桌面：用 `Screen.AllScreens`/`EnumDisplayMonitors`+`GetMonitorInfo`，禁止硬编码坐标；RDP 连接会改 DPI 与工作区。
- 主题与可访问性：暗色跟随 `HKCU\…\Themes\Personalize\AppsUseLightTheme` + `SystemEvents.UserPreferenceChanged`；高对比度看 `SystemParameters.HighContrast`；控件要有 AutomationProperties.Name（UIA/读屏），Tab 顺序可走通。
- 输入法：中文 IME 组合期间别改文本（`WM_IME_COMPOSITION`）；不要 IME 的输入框设 `ImeMode.NoControl` 或 `InputMethod.IsInputMethodEnabled=false`；候选窗跟随光标。
- 托盘/单实例：`NotifyIcon` 图标从 exe 资源取并在退出时 `Dispose`；单实例 `Mutex(@"Local\AppName")` + 命名事件/`RegisterWindowMessage` 把已有窗口激活到前台（`SetForegroundWindow` 前 `AllowSetForegroundWindow`）。
- 开机自启：需最高权限用任务计划（`schtasks /create /rl highest`），普通自启用 `HKCU\…\Run`；自启后等 shell 就绪（Anders 技巧：`CreateTimerQueueTimer` 轮询 `GetShellWindow`）再显示托盘，别抢前台。
- 全局热键：`RegisterHotKey` 返回 false 说明被占用，要 fallback 提示并给替代键；注销在退出路径。

## 调试工具链
- 崩溃取证：WER LocalDumps（`HKLM\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\<exe>.exe`，`DumpType=2`）拿全 dump；挂进程用 `procdump -ma -e -w -o <exe>`；WinDbg `!analyze -v`、`.ecxr`、`k`、托管崩溃 `~* e !clrstack`。
- .NET：`dotnet-counters monitor -p <pid> System.Runtime Microsoft.AspNetCore` 看 GC/线程池；`dotnet-trace collect -p <pid> --providers Microsoft-Windows-DotNETRuntime`；`dotnet-dump collect -p <pid>` 后 `dumpheap -stat`、`gcroot <addr>`、`!dumpasync`；PerfView 看 GC 停顿与 CPU 栈。
- 原生：Process Explorer 看 Handles / GDI Objects / USER Objects；VMMap 看 Private/Commit 构成；Application Verifier 开 Basics+Handles；UMDH 两次快照 diff（`umdh -p:<pid> -f:a.log`）；WinDbg `!heap -s`、`gflags /i <exe> +ust` 后 `!htrace`。
- UI 卡死/异常：卡住时抓 dump 再 `~* e !clrstack` 找阻塞调用；WPF 绑定错误开 `PresentationTraceSources.DataBindingSource`（只在调试输出可见）；`AppDomain.FirstChanceException` + 计数定位异常潮；事件查看器「应用程序」看 .NET Runtime / 应用崩溃记录。
- 句柄上限：GDI/USER 每进程默认 10,000，>2,000 且持续上涨视为泄漏苗头。

## 内存控制（长期驻留重点）
- 六个指标：Private Bytes、Private Working Set、HandleCount、GDI/USER Objects、托管 Heap 与 Gen2/LOH、线程数。看**斜率**不看绝对值，采样 ≥30 分钟：
```powershell
while ($true) { $p=Get-Process -Name MyApp -EA SilentlyContinue; if($p){ ("{0},{1},{2},{3},{4}" -f (Get-Date -f o),$p.PrivateMemorySize64,$p.WorkingSet64,$p.HandleCount,$p.Threads.Count) | Add-Content mem.csv }; Start-Sleep 30 }
```
- 高频泄漏清单：①事件/委托订阅未退订（静态事件最狠，弱事件模式 `WeakEventManager`）②DispatcherTimer/WinForms Timer 未停且被静态引用 ③静态字典/缓存无上限（改 LRU + `WeakReference`）④Bitmap/Icon/Brush 未 `Dispose`/未 `Freeze` ⑤反复新建 HwndSource/窗口未 Close ⑥WPF Effect/动画 Timeline 未清 ⑦日志与历史集合只增不减 ⑧P/Invoke 的 `HGlobal`/文件句柄未释放（`SafeHandle`）⑨线程未设 `IsBackground` 导致退出挂起 ⑩大 byte[]/图片走 LOH 反复分配（`ArrayPool` 或复用缓冲）。
- 判定：稳定操作前后 Private Bytes 与 HandleCount 差值应为 0；持续操作时 30 分钟斜率 <1MB/10min。`GC.Collect`+`GetTotalMemory(true)` 只作证据，不当修复。
- 取舍：桌面默认工作站 GC（ServerGC 只在重计算时试）；`GCSettings.LatencyMode=SustainedLowLatency` 减卡顿但涨内存，按场景选并记录依据。

## 性能与启动
- 启动：`Process.Start` 到首窗可见，5 次取中位（目标 <1.5s 本机）；ETW/PerfView 看程序集加载与 JIT；ReadyToRun、去掉不用程序集；启动路径禁止同步网络/大文件读。
- 交互 60fps = 16.7ms/帧：先测量再改（WPF Performance Suite / Render 帧统计 / 手写 Stopwatch），大列表虚拟化 + 缩略图预解码，图片别在主线程解码。

## 打包与发布
- 安装：MSIX（自动更新，需签名与证书信任）或 Inno Setup/WiX + 自更新；x64 与 ARM64 分发包；self-contained（免运行库、体积大）vs framework-dependent（需 .NET Desktop Runtime，安装时检测并给下载页）。
- 签名：`signtool sign /fd sha256 /tr <时间戳URL> /td sha256 <exe>`；EV 证书可压 SmartScreen 拦截，未签名首次运行会被拦，验收必须在干净机器双击装一次。
- 升级/回滚：语义版本、保留上一版安装包；升级前备份 `%LOCALAPPDATA%\<App>`；卸载要清干净（服务、注册表、计划任务、开机项）。
- 崩溃上报：本地 dump + 可选 Sentry/自建；不在上报里带用户路径与内容。

## 验证回路（每轮改动都走）
0. **先建一次脚手架，别每轮现搭**：项目内固定 `.tmp-verify\run.ps1`（进 `.gitignore`），参数 = exe / 截图输出路径 / 等窗毫秒；一条命令走完「构建 → 启动 → 等窗 → 截图 → 关闭 → 清理」，最后打印 `EXIT=$LASTEXITCODE` 与截图路径。**现成模板 `assets\verify.ps1`**（自动找构建入口/exe → 杀旧实例 → 启动 → 等窗 → 窗口截图 → 六指标 → 一行 `VW` 断言；`-SampleSec 30` 出驻留斜率、`-AssertTitle` 断言标题），复制到 `.tmp-verify\v.ps1` 改参数即可，别重写。实测每轮现搭脚手架一轮 25 步、同一个 smoke 文件写 5 次还报 2 次 `cannot write …: file no longer exists`。
1. Release 构建（`dotnet build -c Release` / `msbuild` / `cmake --build out --config Release`）记 EXIT，失败先读第一段 error。
2. 自动化到目标界面：FlaUI/WinAppDriver/`UIAutomationClient` 断言控件存在、文案、尺寸、按 DPI 缩放后的位置。
3. 内存/句柄快照：关键操作前后取六个指标，差值与斜率写进结论。
4. 截图对照：设计稿 vs 实机，一次读图批量列差异点，别逐张试。
5. 干净环境验证：无运行库、普通用户、125% DPI 下安装→启动→卸载各一次。

## 反模式
- 不臆造 Win32/托管 API（版本差异大）：查文档，`DllImport`/调用失败先读 `Marshal.GetLastWin32Error()`。
- 不用 `Thread.Sleep` 等界面就绪，用事件或带超时的轮询。
- 不改用户全局注册表/系统设置、不静默提权；需要提权就单独进程 + 明说原因。
- 整文件重写不超过一次，之后用 edit；不要用 pwsh 写源码（编码/换行会坏）。
- 临时验证工程固定放项目内 `.tmp-verify\`，**建一次反复用**；别每次换目录重建（实测 s3 建了 `.tmp-smoke`、`.tmp-smoke2`、`.tmp-smoke3` 三套）。写文件前先 `New-Item -ItemType Directory -Force` 建父目录，清理后再写会撞 `file no longer exists`。
- 跑 `run.ps1` 类验证脚本两条防坑：①先 `Set-ExecutionPolicy Bypass -Scope Process`（默认策略会直接拒脚本、`[exit code: 1]`）；②脚本内部 `Start-Process` 拉 GUI 会让执行器干等到超时 → 用 `cmd /c start "" powershell -File <run.ps1>` 脱离控制台跑，轮询日志文件等 `^EXIT=\d`（P1 重放实测：不防这两条 = 2 个失败步）。
- 项目没有 git 就先 `git init` + `.gitignore`（`.tmp*/`、`bin/`、`obj/`、`*.exe`、截图 `*.png`）。没有版本控制的单文件大改（实测 `Program.cs` 96 KB 一轮 10 次 edit）既不能回滚也不能评审 diff。
- 重构前先杀掉运行中的实例：Windows 下运行中的 exe 被锁，csc 报 `CS0016 无法写入输出文件`。验证脚本里先 `Get-Process <exe名> | Stop-Process -Force` 再构建。
- 想让程序**留在前台**（验证完继续用）时用 `cmd /c start "" <exe>` 起：直接在 pwsh 里 `Start-Process` 拉 GUI，执行器会一直等子进程、命令不返回。
- 异常不许吞：至少计数 + `Debug.WriteLine`，关键路径落日志。
- 主线程不做磁盘/网络/大图解码/数据库查询。

## 交付自检
- [ ] Release 构建 EXIT=0、无新增警告；首窗启动时间有数字
- [ ] 100/150/200% DPI、暗色、中文输入法、托盘、单实例、开机自启实测过
- [ ] 30 分钟驻留内存斜率与句柄差值有数字；重操作前后差值为 0
- [ ] 干净机器装一次、卸载无残留；崩溃有 dump 路径与复现步骤
- [ ] 需求里的模糊词都已转成可测判据并写进结论
- [ ] 自检回路：按 `devteam-flow`「收尾沉淀」的那条合并命令（写记忆 + 回读 + `session-friction.cjs` 取数）一次跑完 → 交付里写 errorSteps/exitNZ/dupCalls/approvals；四列（单文件小改两列）
