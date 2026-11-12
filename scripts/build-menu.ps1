# Builds the Windows 11 File Explorer menu entry: build\menu\filerrrr_menu.dll and build\menu\Filerrrr.ExplorerMenu.msix.
# Needs Visual Studio Build Tools (C++) and the Windows 10/11 SDK.
$ErrorActionPreference = 'Stop'
$app = Split-Path -Parent $PSScriptRoot
$src = Join-Path $app 'native\menu'
$out = Join-Path $app 'build\menu'
$stage = Join-Path $out 'package'
Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory (Join-Path $stage 'Assets') -Force | Out-Null

# 1. the COM DLL, with the 64-bit MSVC environment
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw 'Visual Studio C++ Build Tools not found' }
$vcvars = Join-Path $vs 'VC\Auxiliary\Build\vcvars64.bat'
$cl = "cl /nologo /O2 /EHsc /W4 /LD /DUNICODE /D_UNICODE `"$src\menu.cpp`" /Fo`"$out\\`" /link /DEF:`"$src\menu.def`" /OUT:`"$out\filerrrr_menu.dll`" /IMPLIB:`"$out\menu.lib`" ole32.lib shell32.lib shlwapi.lib user32.lib"
cmd /c "`"$vcvars`" >nul 2>nul && $cl"
if ($LASTEXITCODE) { throw "cl failed ($LASTEXITCODE)" }

# 2. the sparse package (manifest + logos only; the DLL and exe live in the install folder)
$version = (Get-Content (Join-Path $app 'package.json') -Raw | ConvertFrom-Json).version
(Get-Content (Join-Path $src 'AppxManifest.xml') -Raw).Replace('__VERSION__', $version) | Set-Content (Join-Path $stage 'AppxManifest.xml') -Encoding UTF8
Push-Location $app # node resolves sharp from the app folder
foreach ($a in @(@('StoreLogo', 50), @('Square44x44Logo', 44), @('Square150x150Logo', 150))) {
  & node -e "require('sharp')(process.argv[1]).resize(+process.argv[3]).png().toFile(process.argv[2])" (Join-Path $app 'build\icon.png') (Join-Path $stage "Assets\$($a[0]).png") $a[1]
  if ($LASTEXITCODE) { throw 'logo render failed' }
}
Pop-Location
$sdk = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\makeappx.exe" | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $sdk) { throw 'Windows SDK (makeappx.exe) not found' }
& $sdk.FullName pack /o /d $stage /p (Join-Path $out 'Filerrrr.ExplorerMenu.msix') /nv | Out-Null
if ($LASTEXITCODE) { throw "makeappx failed ($LASTEXITCODE)" }
Remove-Item $stage -Recurse -Force
Get-ChildItem $out -Include *.obj, *.lib, *.exp -Recurse | Remove-Item
Get-ChildItem $out | ForEach-Object { "{0,-34} {1,8:N0} bytes" -f $_.Name, $_.Length }
