# verify.ps1 - one-command Windows desktop verify checkpoint (template; copy to <project>\.tmp-verify\v.ps1)
# Purpose: replace the hand loop  build -> kill old instance -> start -> wait window -> screenshot -> measure
# with ONE call that prints ONE machine-checkable line (build verdict + pid + window size + memory/handles/GDI + sha1).
# ASCII only on purpose: Windows PowerShell 5.1 reads BOM-less UTF-8 as GBK and mangles Chinese.
#
# usage:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .tmp-verify\v.ps1 -Name main
#   ... -Name leak -WaitMs 5000 -SampleSec 30          # 30 s resident sample for the leak slope
#   ... -Name dpi -NoBuild                            # re-shot only (no rebuild)
#   ... -Name main -AssertTitle 'CpuMem'              # assert window title regex
# Exit codes: 0 ok, 1 build failed, 2 launch/window/screenshot failed, 3 root/exe not found
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$Root = (Get-Location).Path,
  [string]$Exe = "",
  [string]$BuildScript = "",
  [string]$OutDir = "",
  [string]$AssertTitle = "",
  [int]$WaitMs = 3000,
  [int]$SampleSec = 0,
  [int]$Keep = 20,
  [switch]$NoBuild,
  [switch]$NoKill,
  [switch]$NoShot
)

$ErrorActionPreference = "Continue"
function L($m) { Write-Host ("  .. " + $m) }
function Stop-P($proc) { if ($proc -and -not $proc.HasExited) { $proc | Stop-Process -Force -ErrorAction SilentlyContinue } }

if (-not (Test-Path $Root)) { Write-Host "VW name=$Name FAIL=root-missing root=$Root"; exit 3 }
if (-not $OutDir) { $OutDir = Join-Path $Root ".tmp-verify" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$log = Join-Path $env:TEMP ("vw-{0}-build.log" -f $Name)
$png = Join-Path $OutDir ("{0}.png" -f $Name)
$cp  = Join-Path $OutDir ("{0}.memory.csv" -f $Name)

# ---- resolve exe (exclude .tmp*/bin/obj so a stale probe build never wins) ----
if (-not $Exe) {
  $cand = Get-ChildItem -Path $Root -Filter *.exe -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\\.tmp|\\bin\\|\\obj\\' } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($cand) { $Exe = $cand.FullName }
}
if (-not $Exe -or -not (Test-Path $Exe)) { Write-Host "VW name=$Name FAIL=exe-not-found root=$Root"; exit 3 }
$exeName = [System.IO.Path]::GetFileNameWithoutExtension($Exe)

# ---- 0. kill running instance: a live exe is locked and csc/MSBuild fails CS0016 ----
$old = Get-Process -Name $exeName -ErrorAction SilentlyContinue
if ($old) {
  L ("stop " + $old.Count + " running instance(s)")
  $old | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 400
}

# ---- 1. build: go through cmd so both streams land in the log and $LASTEXITCODE stays the tool's own code ----
$build = "skip"
if (-not $NoBuild) {
  if (-not $BuildScript) {
    $auto = @("build.ps1", "build.cmd", "build.bat") | ForEach-Object { Join-Path $Root $_ } |
      Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($auto) { $BuildScript = $auto }
  }
  Push-Location $Root
  try {
    if ($BuildScript) {
      L ("build " + [System.IO.Path]::GetFileName($BuildScript))
      $null = & $BuildScript *> $log
      $code = $LASTEXITCODE; if ($null -eq $code) { $code = if ($?) { 0 } else { 1 } }
    } else {
      $sln = Get-ChildItem -Path $Root -Filter *.sln -ErrorAction SilentlyContinue | Select-Object -First 1
      $proj = Get-ChildItem -Path $Root -Filter *.csproj -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '\\\.tmp' } | Select-Object -First 1
      if ($sln) {
        L "dotnet/msbuild sln"
        if (Get-Command dotnet -ErrorAction SilentlyContinue) {
          $null = cmd /c "dotnet build `"$($sln.FullName)`" -c Release -v m > `"$log`" 2>&1"
        } else {
          $null = cmd /c "msbuild `"$($sln.FullName)`" /p:Configuration=Release /v:m > `"$log`" 2>&1"
        }
        $code = $LASTEXITCODE
      } elseif ($proj) {
        L "dotnet build proj"
        $null = cmd /c "dotnet build `"$($proj.FullName)`" -c Release -v m > `"$log`" 2>&1"
        $code = $LASTEXITCODE
      } else {
        Write-Host "VW name=$Name BUILD=FAIL EXIT=-1 why=no-build-entry (pass -BuildScript)"
        exit 1
      }
    }
  } finally { Pop-Location }
  if ($code -ne 0) {
    $hit = Select-String -Path $log -Pattern "error|Error|FAILED|CS\d{4}" -Context 0,1 -ErrorAction SilentlyContinue |
      Select-Object -First 8
    Write-Host "VW name=$Name BUILD=FAIL EXIT=$code log=$log"
    $hit | ForEach-Object { Write-Host ("   | " + $_.Line.Trim()) }
    exit 1
  }
  $build = "ok"
}

# ---- 2. launch: Start-Process -PassThru returns immediately for GUI apps (never block the executor) ----
L "start $exeName"
try { $p = Start-Process -FilePath $Exe -PassThru } catch { Write-Host "VW name=$Name FAIL=start err=$($_.Exception.Message)"; exit 2 }
$deadline = (Get-Date).AddMilliseconds($WaitMs * 2)
do {
  Start-Sleep -Milliseconds 250
  $p.Refresh()
} while ($p.MainWindowHandle -eq 0 -and -not $p.HasExited -and (Get-Date) -lt $deadline)
if ($p.HasExited) { Write-Host "VW name=$Name FAIL=exited-early pid=$($p.Id) code=$($p.ExitCode)"; exit 2 }
if ($p.MainWindowHandle -eq 0) { Stop-P $p; Write-Host "VW name=$Name FAIL=no-window pid=$($p.Id)"; exit 2 }
Start-Sleep -Milliseconds $WaitMs
$p.Refresh()

$title = $p.MainWindowTitle
if ($AssertTitle -and ($title -notmatch $AssertTitle)) {
  Stop-P $p
  Write-Host "VW name=$Name FAIL=title-mismatch want=$AssertTitle got=$title pid=$($p.Id)"
  exit 2
}

# ---- 3. metrics: six indicators (Private/WS/Handles/Threads/GDI/USER); slope only when -SampleSec > 0 ----
Add-Type -Namespace VW -Name Native -MemberDefinition @'
[DllImport("user32.dll")] public static extern int GetGuiResources(System.IntPtr h, int f);
[DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT r);
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
'@
$gdi = [VW.Native]::GetGuiResources($p.Handle, 0)
$usr = [VW.Native]::GetGuiResources($p.Handle, 1)
$priv0 = [math]::Round($p.PrivateMemorySize64 / 1MB, 1)
$ws0 = [math]::Round($p.WorkingSet64 / 1MB, 1)
if ($SampleSec -gt 0) {
  "t,privMB,wsMB,handles,gdi,user,threads" | Set-Content -Path $cp -Encoding ascii
  for ($i = 0; $i -le $SampleSec; $i += 5) {
    $p.Refresh()
    ("{0},{1},{2},{3},{4},{5},{6}" -f $i, [math]::Round($p.PrivateMemorySize64 / 1MB, 1), [math]::Round($p.WorkingSet64 / 1MB, 1),
      $p.HandleCount, [VW.Native]::GetGuiResources($p.Handle, 0), [VW.Native]::GetGuiResources($p.Handle, 1), $p.Threads.Count) | Add-Content $cp
    if ($i -lt $SampleSec) { Start-Sleep -Seconds 5 }
  }
}

# ---- 4. screenshot of the window rect (not the whole screen) ----
$shot = "skip"; $sha = "00000000"; $size = "0x0"
if (-not $NoShot) {
  $r = New-Object VW.Native+RECT
  if ([VW.Native]::GetWindowRect($p.MainWindowHandle, [ref]$r)) {
    $w = $r.Right - $r.Left; $h = $r.Bottom - $r.Top
    if ($w -gt 0 -and $h -gt 0) {
      Add-Type -AssemblyName System.Drawing
      $bmp = New-Object System.Drawing.Bitmap $w, $h
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $prev = if (Test-Path $png) { (Get-FileHash $png -Algorithm SHA1).Hash } else { "" }
      $g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
      $bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
      $g.Dispose(); $bmp.Dispose()
      $sha = (Get-FileHash $png -Algorithm SHA1).Hash.Substring(0, 8)
      $size = "${w}x${h}"
      $same = if ($prev -and $prev.Substring(0, 8) -eq $sha) { "yes" } else { "no" }
      $shot = $png
    } else { $same = "na" }
  } else { $same = "na" }
}

# ---- 5. optional resident sample verdict ----
$note = ""
if ($SampleSec -gt 0 -and (Test-Path $cp)) {
  $rows = Import-Csv $cp
  if ($rows.Count -ge 2) {
    $dPriv = [math]::Round([double]$rows[-1].privMB - [double]$rows[0].privMB, 1)
    $dH = [int]$rows[-1].handles - [int]$rows[0].handles
    $note = "dPrivMB=$dPriv dHandles=$dH"
    if ([math]::Abs($dH) -gt 50) { $note += " LEAK-SUSPECT" }
  }
}

$self = $p.Id
if (-not $NoKill) { $p | Stop-Process -Force -ErrorAction SilentlyContinue }
Get-ChildItem $OutDir -Filter "*.png" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Keep | Remove-Item -Force -ErrorAction SilentlyContinue

$line = "VW name=$Name build=$build pid=$self title=$title priv=${priv0}MB ws=${ws0}MB handles=$($p.HandleCount) gdi=$gdi user=$usr threads=$($p.Threads.Count) shot=$shot sha1=$sha size=$size same_as_prev=$same"
if ($note) { $line += " $note" }
Write-Host $line
exit 0
