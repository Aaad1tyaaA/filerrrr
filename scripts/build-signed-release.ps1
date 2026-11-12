param([string]$Thumbprint=$env:FILERRRR_SIGNING_THUMBPRINT)
$ErrorActionPreference='Stop'
if($Thumbprint -notmatch '^[0-9A-Fa-f]{40}$'){throw 'An issued code-signing certificate is required. Set FILERRRR_SIGNING_THUMBPRINT to its Windows CurrentUser\My thumbprint. No password or private-key export is needed.'}
$signingCertificate=Get-Item -LiteralPath ('Cert:\CurrentUser\My\'+$Thumbprint) -ErrorAction Stop
if(-not $signingCertificate.HasPrivateKey -or $signingCertificate.NotAfter -le (Get-Date) -or $signingCertificate.NotBefore -gt (Get-Date)){throw 'Certificate is expired, not yet valid, or its signing key is unavailable'}
if(@($signingCertificate.EnhancedKeyUsageList.ObjectId) -notcontains '1.3.6.1.5.5.7.3.3'){throw 'Certificate is not valid for code signing'}
$appRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$previousThumbprint=$env:FILERRRR_SIGNING_THUMBPRINT
Push-Location -LiteralPath $appRoot
try{
  $env:FILERRRR_SIGNING_THUMBPRINT=$Thumbprint
  foreach($step in @('native','menu','engines','notices')){& npm.cmd run $step;if($LASTEXITCODE){throw ('Build step failed: '+$step)}}
  $buildConfig=(Get-Content -LiteralPath 'package.json' -Raw|ConvertFrom-Json).build
  $buildConfig|Add-Member -NotePropertyName forceCodeSigning -NotePropertyValue $true -Force
  $buildConfig|Add-Member -NotePropertyName publish -NotePropertyValue @(@{provider='github';owner='Aaad1tyaaA';repo='filerrrr-releases';releaseType='release'}) -Force
  $buildConfig.win|Add-Member -NotePropertyName signtoolOptions -NotePropertyValue @{certificateSha1=$Thumbprint;publisherName=@($signingCertificate.Subject);signingHashAlgorithms=@('sha256');rfc3161TimeStampServer='http://time.certum.pl'} -Force
  $buildConfig|ConvertTo-Json -Depth 20|Set-Content -LiteralPath 'build\signed-builder.json' -Encoding utf8
  & .\node_modules\.bin\electron-builder.cmd --win nsis --x64 --config build/signed-builder.json --publish never
  if($LASTEXITCODE){throw 'Signed release build failed'}
  $appVersion=(Get-Content -LiteralPath 'package.json' -Raw|ConvertFrom-Json).version
  foreach($file in @('release\win-unpacked\Filerrrr.exe',('release\Filerrrr-Setup-'+$appVersion+'.exe'))){
    $signature=Get-AuthenticodeSignature -LiteralPath $file
    if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -ne $signingCertificate.Subject){throw ('Publisher signature mismatch: '+$file)}
  }
  Write-Output 'Signed build verified. Nothing was uploaded. Test the installer and publish it with latest.yml only after verification.'
}finally{$env:FILERRRR_SIGNING_THUMBPRINT=$previousThumbprint;Pop-Location}
