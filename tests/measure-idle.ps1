param([string]$Exe=(Join-Path $PSScriptRoot '..\release\win-unpacked\Filerrrr.exe'))
$ErrorActionPreference='Stop'
$exePath=[IO.Path]::GetFullPath($Exe)
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $exePath.StartsWith($workspace+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Measure only this workspace build'}
$oldProfile=$env:FILERRRR_TEST_DATA_DIR;$oldHook=$env:FILERRRR_TEST_NO_HOOK
$env:FILERRRR_TEST_DATA_DIR=Join-Path $env:TEMP ('filerrrr-idle-exe-'+[guid]::NewGuid().ToString('N'))
$env:FILERRRR_TEST_NO_HOOK='0'
$probe=$null
try{
  $probe=Start-Process -FilePath $exePath -ArgumentList '--hidden' -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 3
  if($probe.HasExited){throw 'Probe exited before measurement'}
  $owned=[Collections.Generic.HashSet[int]]::new();[void]$owned.Add($probe.Id)
  $allProcesses=Get-CimInstance Win32_Process
  do{$added=0;foreach($processInfo in $allProcesses){if($owned.Contains([int]$processInfo.ParentProcessId)-and $owned.Add([int]$processInfo.ProcessId)){$added++}}}while($added)
  $rows=@(foreach($processId in $owned){$ownedProcess=Get-Process -Id $processId -ErrorAction SilentlyContinue;if($ownedProcess){[pscustomobject]@{pid=$processId;workingSetMiB=[math]::Round($ownedProcess.WorkingSet64/1MB,2);privateMiB=[math]::Round($ownedProcess.PrivateMemorySize64/1MB,2)}}})
  [pscustomobject]@{exe=$exePath;hookEnabled=$true;workingSetMiB=[math]::Round(($rows|Measure-Object -Property workingSetMiB -Sum).Sum,2);processes=$rows}|ConvertTo-Json -Depth 4
}finally{
  if($probe -and -not $probe.HasExited){& taskkill.exe /PID $probe.Id /T /F 2>$null | Out-Null}
  $env:FILERRRR_TEST_DATA_DIR=$oldProfile;$env:FILERRRR_TEST_NO_HOOK=$oldHook
}
