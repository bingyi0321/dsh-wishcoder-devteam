---
name: verify-harness
description: 造可执行验收：判据分级、脚本模板、退出码陷阱
---

# verify-harness · 把「做对了」变成一条命令

许愿式交付唯一靠得住的东西是**会失败的检查**。本技能解决：没有测试框架、测试跑不动、跑绿了但是假的。

## 1. 判据分级（从便宜到贵，能用上层就别用下层）

| 级别 | 判据 | 成本 | 什么时候够 |
|---|---|---|---|
| L1 语法/类型 | `tsc --noEmit`、`node --check`、`javac`、`cargo check` | 秒级 | 只改了类型/接口 |
| L2 单测 | `vitest run`、`pytest -q`、`go test ./...` | 秒~分 | 纯逻辑 |
| L3 契约/集成 | 真实 HTTP 请求打本地服务、DB 迁移 + 查询 | 十秒~分 | 有边界（API/DB/文件格式） |
| L4 端到端 | Playwright 点页面、`adb`/`uiautomator`、截图比对 | 分~十秒/次 | 用户能看见的界面 |
| L5 人/真机 | 声音、振动、人脸、真实网络 | — | 只能标「需手测」，别假装验过 |

规矩：**每一级都要有出口**。L4 跑不了就退到 L3 + 截图；L5 一律写进「残留」。

## 2. 脚本骨架（PowerShell，Windows 首选）

`scripts/verify.ps1`：

```powershell
$ErrorActionPreference = 'Stop'
# Log lives OUTSIDE the repo (wish-loop stage 5.5): no cleanup, never committed.
# If TEMP is outside the write sandbox (workspace-write), fall back to <root>\.wish\verify.log.
$root = if ((Split-Path -Leaf $PSScriptRoot) -eq 'scripts') { Split-Path -Parent $PSScriptRoot } else { $PSScriptRoot }
$log = $null
try {
  $logDir = Join-Path $env:TEMP 'wish-verify'
  $null = New-Item -ItemType Directory -Force -Path $logDir -ErrorAction Stop
  $log = Join-Path $logDir ((Split-Path -Leaf $root) + '.log')
  "=== verify $(Get-Date -Format o) ===" | Out-File $log -Encoding utf8 -ErrorAction Stop
} catch {
  $log = Join-Path $root '.wish\verify.log'
  $null = New-Item -ItemType Directory -Force -Path (Split-Path -Parent $log)
  "=== verify $(Get-Date -Format o) === TEMP unwritable: $($_.Exception.Message)" | Out-File $log -Encoding utf8
}
"=== verify $(Get-Date -Format o) ===" | Out-File $log -Encoding utf8
# Keep this file pure ASCII: builder failure markers plus CJK keywords written as
# regex escapes (\u9519\u8bef matches the Chinese word for "error"; .NET regex in
# Select-String honours \uXXXX -- verified on PS 5.1). Any real CJK char in a .ps1
# needs a UTF-8 BOM, see below.
$FAILPAT = 'BUILD FAILED|BUILD FAILURE|\[ERROR\]|Exception:|\u9519\u8bef'

function Step($name, $block) {
  "--- $name" | Out-File $log -Append -Encoding utf8
  $out  = & $block 2>&1              # capture first: $LASTEXITCODE survives
  $code = $LASTEXITCODE
  $out | ForEach-Object { "$_" } | Out-File $log -Append -Encoding utf8   # plain UTF-8, greppable
  $hit = @($out | Select-String -Pattern $FAILPAT -CaseSensitive)
  if ($code -ne 0 -or $hit.Count) {
    "FAIL $name (exit $code, textHit $($hit.Count))" | Write-Host
    $hit | Select-Object -First 5 | ForEach-Object { "  $_" | Write-Host }
    exit 1
  }
  "OK $name" | Write-Host
}

Step 'build'   { npm run build }
Step 'unit'    { npx vitest run --reporter=dot }
Step 'smoke'   { node scripts/smoke.mjs }

Write-Host 'OK'      # fixed last line, greppable
exit 0
```

要点：
- **日志写仓库外**：`$env:TEMP\wish-verify\<工程目录名>.log`。写回 `$PSScriptRoot` 就等于每跑一次往用户仓库塞一个过程文件，交付时还得清（wish-loop 阶段 5.5）；仓库外则天然干净、也不进 git。日志每次运行开头截断，不会无限长。脚本放 `scripts\` 或工程根都认（`$root` 那两行按 `$PSScriptRoot` 的目录名判断）。**必须有 catch 回落**：沙箱档位是 `workspace-write` 时 TEMP 在写域之外，`Out-File` 会抛 `Could not find a part of the path`/拒绝访问 —— 没兜住就变成"功能没做"的假红。回落目标固定 `<工程根>\.wish\verify.log`，首行写明回落原因，交付时随 `.wish/` 一起清。
- **`*>> $log` 不要用于需要复核的日志**：PS 5.1 下它是重定向运算符，原生命令输出按 UTF-16LE 落盘，首行 `Out-File -Encoding utf8` 却是 UTF-8 → 同一文件混编码，`Select-String`/`grep`/`findstr` 全部 0 命中，文本复核形同虚设（2026-11-20 实测）。改成 `$out = & $block 2>&1` 捕获再 `Out-File -Append -Encoding utf8`。
- **退出码必须透传**：捕获输出后立刻取 `$LASTEXITCODE`，再判。
- **复核模式必须先验不误报**：写完后先在自己已知的绿路径上跑一次，确认 `$FAILPAT` 命中 0。裸 `FAILED` 会把 `Tests: 0 failed` 判红（假红比假绿更伤——会让人去修没坏的东西）；宁可只用 `BUILD FAILED|\[ERROR\]|错误:`，测试结果交给退出码。
- 最后一行固定 `OK` / `FAIL <step>`，便于机器判定与人工扫读。
- 终端只留一行：**别用 `| Select-Object -Last 20`** —— 报错往往在前 20 行。
- **`.ps1` 文件在这台机器必须带 `-ExecutionPolicy Bypass` 才能跑**（2026-11-20 实测）：ExecutionPolicy 所有 scope 都是 `Undefined`（等效禁脚本），`& script.ps1` 和 `powershell.exe -File` 都会被拒（`禁止运行脚本` / `running scripts is disabled`）。正确跑法**固定用** `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\verify.ps1`。inline 命令（直接写进 tool-pwsh 的 command）不受此限，只有 `.ps1` 脚本文件受限。交付给用户的可粘贴命令也写这一整串，别只写文件名。
- **本机没有 `pwsh`（PowerShell 7）**，`where.exe pwsh` 无结果，只有 `powershell.exe` = 5.1（`$PSVersionTable.PSVersion` = 5.1.26100.9818）。所有"跑 verify"的命令一律用 `powershell.exe`，别写 `pwsh`——写了对用户/对自己都是 `CommandNotFoundException`。
- **`.ps1` 含中文就必须带 UTF-8 BOM**（2026-11-20 实测）：`write` 工具产出的是无 BOM 的 UTF-8，Windows PowerShell 5.1 会按 ANSI/GBK 解码，中文注释把 CRLF 吞掉 → 下一行赋值被并进注释 → 变量为 `$null` → `Select-String : Pattern is null`，**整条验收脚本假红且看不出原因**。三个出口，优先第一个：
  1. 脚本正文**保持纯 ASCII**（照抄上面的骨架），中文只以 `\uXXXX` 出现在正则里——PS 5.1 的 .NET 正则认这个（实测 `'错误: boom' | Select-String '\u9519\u8bef'` 命中）；
  2. 生成后补 BOM：`$p='scripts/verify.ps1'; [IO.File]::WriteAllText($p,(Get-Content $p -Raw -Encoding utf8),[Text.UTF8Encoding]::new($true))`；
  3. 用 `pwsh` 7 跑（7 默认 UTF-8 无 BOM 也能读中文）——本机没有（`where.exe pwsh` 无结果），前两个出口才是正路。
- **红必须是「功能没做」**：脚本写好先在空实现上跑一次，认它打印的是断言失败 / 非 0 退出；出现 `Pattern is null`、`CommandNotFoundException`、`不是内部或外部命令`、乱码即脚本自身坏了，先修脚本（BOM、路径、引号），别当成"验收红了"继续往下写实现。
- **Step 里的 `build`/`unit`/`smoke` 是 Node 例子**：换成目标栈的对应命令——Python `pytest -q`、Java `mvn -q test`、Go `go test ./...`、纯脚本/文档用输入→输出断言（见 §4）。命令名与退出码语义因栈而异，但 Step 骨架（捕获 → 退出码 → 文本复核）不变，别照抄 `npm run build`。
- **内容断言别用 PowerShell `-eq`/`-ne`**（2026-11-20 回放实测假绿）：`-eq`/`-ceq`/`-ne` 会忽略 U+FEFF（BOM 字符）——`[Text.Encoding]::UTF8` 写文件自带 BOM（前 3 字节 EF BB BF），Node `fs.readFileSync(f,'utf8')` 把它当 U+FEFF 字符保留，反转/处理进输出后 `$got -ne $expected` 判相等 → 假绿（实际内容错了但断言通过）。修法：测试输入用 `New-Object System.Text.UTF8Encoding($false)`（无 BOM）写；内容断言用 `[String]::Equals($got, $expected, [StringComparison]::Ordinal)`（只有 Ordinal 才检出 U+FEFF 差异，实测 `"cba\nfed" -eq "cba\uFEFF\nfed"` = True 而 Ordinal = False）。

## 3. 退出码陷阱（实测踩过）

| 写法 | 问题 |
|---|---|
| `cmd; echo "EXIT=$LASTEXITCODE"` | 命令失败后 `echo` 成功，整条退出码变 0 → 失败被洗成成功 |
| `npm test \| Tee-Object` | 管道后 `$LASTEXITCODE` 是 Tee 的，不是 npm 的 |
| `cmd \| Select-String error` | 无匹配时退出码可能非 0，误判失败 |
| `cmd > log 2>&1` 后不查 `$?` | 看不出失败 |

正确姿势：

```powershell
$out  = npm run build 2>&1        # 别写 *> build.log：PS 5.1 落盘是 UTF-16，grep/Select-String 读不到
$code = $LASTEXITCODE
$out | Out-File build.log -Encoding utf8
if ($code -ne 0) { $out | Select-String -Pattern 'error|错误|BUILD FAILED' -CaseSensitive | Select-Object -First 10; exit 1 }
```

并且**文本复核**兜底：构建工具失败时不一定非 0 退出（尤其在中文 locale 或被包了一层）。用**白名单 + 大小写敏感**：`BUILD FAILED`、`BUILD FAILURE`、`[ERROR]`、`错误:`、`Exception:`。**不要**把裸 `FAILED`/`tests failed` 塞进模式——`Tests: 0 failed`、`0 tests failed` 会被判红。模式定下来先在自己已知的绿路径跑一次确认 0 命中（见 §2）。

## 4. 没有测试框架时怎么造判据

用「输入 → 期望输出」的最小断言脚本，不要引入框架：

```js
// scripts/smoke.mjs
import assert from 'node:assert/strict'
import { convert } from '../src/convert.js'

assert.equal(convert('1,5'), 1.5)
assert.deepEqual(convert(['a', 'b']), { a: 0, b: 1 })
console.log('OK')
```

- 一个脚本 5~10 条断言，覆盖：正常路径 1 条、边界 2 条、错误路径 1 条。
- 报错信息写成「期望 X，实际 Y」，否则失败的输出自己都看不懂。

## 5. 界面类验收

- Web：Playwright 一条命令跑断言 + 截图；断言优先用文本/角色选择器（`getByRole`），少用 CSS 路径。
- 截图只当证据，不当判据（像素比对脆）。判据是「元素存在 / 文本等于 / 请求 200」。
- Android/桌面：`uiautomator dump` / UI Automation 取元素树 → 断言文本与 bounds；截图一次批量读，别一屏一读。
- 视觉还原类：先给设计稿的关键色值/间距写成断言表，再截图人工比对残差。

## 6. 反模式

- **先写实现再补测试**：补出来的测试是照着实现写的，永远绿。
- **验收里断言实现细节**（内部函数名、私有字段）：重构就红，红得没意义。
- **只验 happy path**：交付当天就炸在空值上。
- **验收脚本依赖网络/时钟/随机**：不可复现 = 不可判定。需要时注入固定种子与固定时间。
- **用「肉眼看了没问题」当验收**：写进「残留：需手测」，别写成已验证。
- **把过程件留在仓库里**：`verify.log`、调试脚本、截图 dump、`*.bak` 不是交付物。日志写 `$env:TEMP`，其余交付前按 wish-loop 阶段 5.5 清掉——留着会让用户第一步就面对一堆不知道能不能删的文件。

## 7. 交付时的三行

```
改动：<文件:行> — <≤10 字理由> ｜清理：删 N 留 M（<留下的判据资产>）
验证：powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\verify.ps1 → OK（build/unit/smoke 三关全绿）
残留：<L5 类没验到的 / 已知限制>
```

清理列只在真删过东西时写；一个都没删就省掉（见 wish-loop 阶段 5.5，含「删完要重跑一次验收」）。

跑不动就说跑不动，附上失败那一行原文。**假绿比不绿更贵** —— 用户会按你的「已完成」去用。

## 8. 分段下的所有权：验收脚本只属于段 1

五段流水线（wish-loop）里，`scripts/verify.ps1` 与 `.wish/<slug>.md` 是**段 1（需求转译）的资产**：段 2（子智能体实现）只读，段 3（验收专家）只读不改，只有 lead 在改验收时重算指纹。

- 实现段要"调整判据"才能过 → 不是判据问题，是它没做到。让它把原话回报（哪条断言、期望 vs 实际），由父改。
- 父改判据的唯一合法理由：判据本身错了（断言实现细节、依赖网络/时钟/随机、假红）。改完必须重算指纹，并**重跑一次确认它还会红**（绿着改等于自己给自己出题）。
- 交付前父侧重算一次，与 SPEC 里记的前 16 位比对：

```powershell
(Get-FileHash scripts\verify.ps1 -Algorithm SHA256).Hash.Substring(0,16)
```

对不上 = 实现段动过验收，本段作废：回段 1 重写判据，从红再跑一遍，不是"改天再说"。

最常见的三种越界：在 `verify.ps1` 里加 `try/catch` 吞掉失败、把 `exit 1` 改成 `exit 0`、删掉一条过不了的断言。**代码评审看不出来，指纹能。** 验收被改过，绿就一点意义都没有。
