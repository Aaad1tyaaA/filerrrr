# End-to-end: real Ctrl + drags from File Explorer into the running app. Moves your mouse for ~1 minute.
# Usage: powershell -ExecutionPolicy Bypass -File tests\e2e\run.ps1 [-Exe <path to Filerrrr.exe>]
param([string]$Exe = "")
$ErrorActionPreference = 'Stop'
$app = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$work = Join-Path $env:TEMP ("filerrrr-e2e-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory $work | Out-Null
$trace = Join-Path $work 'trace.log'

# a small picture to drag
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 120, 80
$g = [System.Drawing.Graphics]::FromImage($bmp); $g.Clear([System.Drawing.Color]::FromArgb(255, 60, 120, 230)); $g.Dispose()
$bmp.Save((Join-Path $work 'poster.png'), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()

$resolvedWork = [IO.Path]::GetFullPath($work)
$testPrefix = Join-Path $env:TEMP 'filerrrr-e2e-'
if (-not $resolvedWork.StartsWith($testPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe test folder' }
$previousProfile=$env:FILERRRR_TEST_DATA_DIR
$previousDebug=$env:FILERRRR_DEBUG
$proc=$null
try {
$env:FILERRRR_TEST_DATA_DIR = Join-Path $work 'profile'
$env:FILERRRR_DEBUG = $trace
if ($Exe) { $proc = Start-Process $Exe -ArgumentList '--hidden' -PassThru }
else { $proc = Start-Process (Join-Path $app 'node_modules\electron\dist\electron.exe') -ArgumentList "`"$app`"", '--hidden' -PassThru }
Start-Sleep 6

# PNG palette, clockwise from the top (12 places, PNG itself shown disabled): WEBP JPG AVIF PDF SVG GIF TIFF BMP ICO TGA QOI PNG
# so straight right (3 o'clock) is PDF. Image tools: MRG HALF DBL SQR …
$cases = @(
  @{ name = 'drop on the disc takes the first guess'; args = @{};                          expect = 'poster.webp' },
  @{ name = 'aiming right picks the option there';    args = @{ Dx = 160; Dy = 0 };        expect = 'poster.pdf' },
  @{ name = 'wheel steps through options';            args = @{ Wheel = 3 };               expect = 'poster.pdf' },
  @{ name = 'typing jumps to a format';               args = @{ Keys = 'gi' };             expect = 'poster.gif' },
  @{ name = 'Tab flips to tools, wheel picks one';    args = @{ Tab = 1; Wheel = 1 };  expect = 'poster-half.png' },
  @{ name = 'letting go of Ctrl drops normally';      args = @{ LetGoCtrl = 1 };       expect = $null }
)
$failed = 0
foreach ($c in $cases) {
  $before = @(Get-ChildItem $work -File | Where-Object Name -ne 'trace.log' | ForEach-Object Name)
  $a = $c.args
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'drag.ps1') -Folder $work -Name 'poster.png' @a
  Start-Sleep 4
  $new = @(Get-ChildItem $work -File | Where-Object { $_.Name -ne 'trace.log' -and $before -notcontains $_.Name } | ForEach-Object Name)
  $ok = if ($c.expect) { $new.Count -eq 1 -and $new[0] -eq $c.expect } else { $new.Count -eq 0 }
  if ($ok) { "PASS  $($c.name)" } else { $failed++; "FAIL  $($c.name): expected $($c.expect), got [$($new -join ', ')]" }
  $new | ForEach-Object { Remove-Item (Join-Path $work $_) }
}

} finally {
if ($proc -and -not $proc.HasExited) { & taskkill.exe /PID $proc.Id /T /F 2>$null | Out-Null }
$env:FILERRRR_TEST_DATA_DIR=$previousProfile
$env:FILERRRR_DEBUG=$previousDebug
}
(New-Object -ComObject Shell.Application).Windows() | Where-Object { $_.LocationName -eq (Split-Path $work -Leaf) } | ForEach-Object { $_.Quit() }
if ($failed) { "--- trace ---"; Get-Content $trace -Tail 40; "$failed failed" ; exit 1 }
Remove-Item -LiteralPath $resolvedWork -Recurse -Force
"ok: all end-to-end drags passed"
