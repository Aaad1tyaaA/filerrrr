$ErrorActionPreference='Stop'
$appRoot=Split-Path -Parent $PSScriptRoot
$vswhere="${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vsInstall=& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(-not $vsInstall){throw 'Visual Studio C++ Build Tools are required'}
$vcvars=Join-Path $vsInstall 'VC\Auxiliary\Build\vcvars64.bat'
$sourcePath=Join-Path $appRoot 'native\drop.cpp'
$outputPath=Join-Path $appRoot 'build\filerrrr_drop.dll'
$objectPath=Join-Path $appRoot 'build\drop.obj'
cmd /c "`"$vcvars`" >nul 2>nul && cl /nologo /std:c++17 /O2 /EHsc /W4 /LD `"$sourcePath`" /Fo`"$objectPath`" /link /OUT:`"$outputPath`" ole32.lib oleaut32.lib shell32.lib uuid.lib user32.lib"
if($LASTEXITCODE){throw 'Native drop target build failed'}
