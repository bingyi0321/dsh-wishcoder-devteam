# v.ps1 - one-command Android verify checkpoint (template; copy to <project>\.tmp-verify\v.ps1)
# Purpose: replace the hand-assembled loop  build -> install -r -> force-stop -> start -> tap -> screencap -> pull -> uidump
# with a single call that prints ONE machine-checkable line (build verdict + exit code + sha1 + size + same-as-prev + dump path).
# ASCII only on purpose: PowerShell 5.1 reads BOM-less UTF-8 as GBK and mangles Chinese.
#
# usage:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .tmp-verify\v.ps1 -Name list
#   ... -Name empty -State empty
#   ... -Name detail -Tap 200,400
#   ... -Name edit -Tap 675,1210 -Bounds tv_3d_edit_words
#   ... -Name list -NoBuild -NoInstall                                 # layout/animation-only re-shot
# NOTE: script files need -ExecutionPolicy Bypass on this box; the harness shell is Windows
# PowerShell 5.1 named "pwsh", and plain `pwsh` is NOT on PATH. Keep this file ASCII-only
# (5.1 reads BOM-less UTF-8 as GBK).
#
# Exit codes: 0 ok, 1 build failed, 2 start/tap failed, 3 adb/device missing
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$State = "",                 # intent extra value; empty = normal entry
  [string]$StateExtra = "extra_3d_state",
  [string]$Tap = "",                   # "x,y" single tap after launch
  [string]$Activity = ".ui.history.Preview3DActivity",
  [string]$Pkg = "com.xiang.life_window",
  [string]$Root = "E:\Android project\life_window",
  [string]$Apk = "",
  [string]$Bounds = "",                # substring of id/text; prints all matching bounds in the dump
  [int]$SettleMs = 2000,
  [int]$Keep = 20,
  [switch]$NoBuild,
  [switch]$NoInstall,
  [switch]$NoRestart,
  [switch]$Quiet
)

$ErrorActionPreference = "Continue"   # PS 5.1 turns native stderr into a terminating error under Stop
function Step($m) { if (-not $Quiet) { Write-Host ("  .. " + $m) } }

if (-not $Apk) { $Apk = Join-Path $Root "app\build\outputs\apk\debug\app-debug.apk" }
$shots = Join-Path $Root "files\verify"
$dumps = Join-Path $Root "files\verify"
New-Item -ItemType Directory -Force -Path $shots, $dumps | Out-Null
$png = Join-Path $shots ("{0}.png" -f $Name)
$xml = Join-Path $dumps ("{0}.xml" -f $Name)
$log = Join-Path $env:TEMP ("v-{0}-build.log" -f $Name)

# ---- 0. device ----
$dev = (& adb devices 2>&1 | Select-String -Pattern "\sdevice$")
if (-not $dev) { Write-Host "V name=$Name FAIL=no-device"; exit 3 }

# ---- 1. build: never -q, never pipe (a pipe rewrites `$LASTEXITCODE`, and -q swallows the error summary) ----
$build = "skip"
if (-not $NoBuild) {
  Step "gradlew assembleDebug"
  Push-Location $Root
  try {
    $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
    # go through cmd so both streams land in the log and $LASTEXITCODE stays gradle's own code
    $null = cmd /c "gradlew.bat :app:assembleDebug --offline --console=plain > `"$log`" 2>&1"
    $code = $LASTEXITCODE
  } finally { Pop-Location }
  if ($code -ne 0) {
    $hit = Select-String -Path $log -Pattern "error:|e: |FAILED|BUILD FAILED" -Context 0,2 | Select-Object -First 12
    Write-Host "V name=$Name BUILD=FAIL EXIT=$code log=$log"
    $hit | ForEach-Object { Write-Host ("   | " + $_.Line.Trim()) }
    exit 1
  }
  $build = "ok"
}

# ---- 2. install ----
$inst = "skip"
if (-not $NoInstall) {
  Step "adb install -r -d"
  $out = (& adb install -r -d $Apk 2>&1 | Select-Object -Last 2) -join " "
  if ($out -notmatch "Success") { Write-Host "V name=$Name INSTALL=FAIL out=$out"; exit 2 }
  $inst = "ok"
}

# ---- 3. start (with optional state extra) ----
# force-stop first even with -NoInstall: otherwise `am start` just resumes the running activity and the
# shot silently keeps the PREVIOUS state (a false "no visual change" reading).
if (-not $NoRestart) { Step "force-stop"; & adb shell am force-stop $Pkg | Out-Null }
$start = "monkey"
$comp = "$Pkg/$Activity"
# NO `run-as am start` fallback: on Android 14 it is SILENTLY ineffective (no output, activity not switched), so the
# old fallback reported start=run-as + exit 0 while the png was still the PREVIOUS state = a false pass
# (blindspots-v20 §7.2: topResumedActivity stayed MainActivity). Fail loud instead: set $why and exit 2.
if ($State) {
  $s = (& adb shell am start -n $comp --es $StateExtra $State 2>&1) -join " "
  if ($s -match "Error|Exception|Permission Denial") {
    & adb shell monkey -p $Pkg -c android.intent.category.LAUNCHER 1 | Out-Null
    $start = "monkey(state-ignored)"
    $why = "state-not-applied: add app/src/debug/AndroidManifest.xml overriding $Activity android:exported=true + tools:replace (run-as am start is silently ineffective on Android 14)"
  } else { $start = "am" }
} else {
  $s = (& adb shell am start -n $comp 2>&1) -join " "
  if ($s -match "Error|Exception|Permission Denial") {
    & adb shell monkey -p $Pkg -c android.intent.category.LAUNCHER 1 | Out-Null
  } else { $start = "am" }
}
Start-Sleep -Milliseconds $SettleMs

# With -State: prove the requested activity is actually on top. "am start printed nothing" is not evidence that the
# state switched - that is exactly how the old run-as path produced a false pass.
if ($State -and -not $why) {
  $top = ((& adb shell dumpsys activity activities 2>&1 | Select-String -Pattern "topResumedActivity") | Select-Object -First 1)
  if ($top -and ($top -notmatch [regex]::Escape($Activity))) {
    $start = "am(state-not-top)"
    $why = "state-not-applied: top activity is not $Activity (got: $top)"
  }
}

# ---- 4. optional tap ----
if ($Tap -match "^\s*(\d+)\s*,\s*(\d+)\s*$") {
  Step ("tap " + $Tap)
  & adb shell input tap $Matches[1] $Matches[2] | Out-Null
  Start-Sleep -Milliseconds $SettleMs
}

# ---- 5. screenshot + dump ----
$prevSha = if (Test-Path $png) { (Get-FileHash $png -Algorithm SHA1).Hash } else { "" }
& adb shell screencap -p /sdcard/v.png | Out-Null
& adb pull /sdcard/v.png $png 2>&1 | Out-Null
& adb shell uiautomator dump /sdcard/v.xml | Out-Null
& adb pull /sdcard/v.xml $xml 2>&1 | Out-Null
if (-not (Test-Path $png)) { Write-Host "V name=$Name FAIL=no-screenshot"; exit 2 }

$b = [System.IO.File]::ReadAllBytes($png)
# PS 5.1 keeps [byte] type through -shl, so 3 -shl 8 == 0; multiply instead of shifting
$w = [int]$b[19] + 256 * [int]$b[18] + 65536 * [int]$b[17] + 16777216 * [int]$b[16]
$h = [int]$b[23] + 256 * [int]$b[22] + 65536 * [int]$b[21] + 16777216 * [int]$b[20]
$sha = (Get-FileHash $png -Algorithm SHA1).Hash
$same = if ($prevSha -and $prevSha -eq $sha) { "yes" } else { "no" }

# ---- 6. optional bounds for the P2 discriminator: did the change land? ----
if ($Bounds -and (Test-Path $xml)) {
  $x = Get-Content $xml -Raw -Encoding utf8
  $n = 0
  foreach ($m in [regex]::Matches($x, '(?s)<node[^>]*>')) {
    $tag = $m.Value
    if ($tag -notmatch [regex]::Escape($Bounds)) { continue }
    if ($tag -match 'text="([^"]*)"[^>]*bounds="([^"]*)"') { $t = $Matches[1]; $bd = $Matches[2] }
    elseif ($tag -match 'bounds="([^"]*)"') { $t = ""; $bd = $Matches[1] }
    else { continue }
    $n++
    if ($n -le 3) { Write-Host ("   B " + $bd + "  " + ($t -replace "\s+", " ")) }
  }
  if ($n -eq 0) { Write-Host "   B (no node matches '$Bounds')" }
}

# ---- 7. rotate old shots ----
Get-ChildItem $shots -Filter "*.png" | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Keep | Remove-Item -Force -ErrorAction SilentlyContinue

$line = "V name=$Name build=$build install=$inst start=$start sha1=$($sha.Substring(0,8)) size=${w}x${h} same_as_prev=$same png=$png dump=$xml"
if ($why) { $line += " note=$why" }
Write-Host $line
exit $(if ($why) { 2 } else { 0 })
