#requires -Version 5.1
<#
.SYNOPSIS
Copies a Windows folder over SSH, then starts a profile import on Ubuntu.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Source,
    [string]$Destination = '/home/mediaspacedev/media-imports',
    [string]$Server = 'mediaspacedev@100.75.180.84',
    [string]$Profile,
    [ValidateSet('Production', 'Development')][string]$Target = 'Production',
    [ValidateRange(1, 65535)][int]$Port = 22,
    [string]$IdentityFile,
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Quote-Sh([string]$Value) {
    if ($Value -match '[\r\n\x00]') { throw 'Newlines and NUL characters are not supported in paths.' }
    return "'" + $Value.Replace("'", "'\''") + "'"
}
function Invoke-Ssh([string]$Command) {
    & ssh @script:SshOptions $Server $Command
    if ($LASTEXITCODE -ne 0) { throw "SSH operation failed (exit $LASTEXITCODE). Import not confirmed; check the output above." }
}
Get-Command ssh, scp -ErrorAction Stop | Out-Null
$Folder = Get-Item -LiteralPath $Source
if (-not $Folder.PSIsContainer -or $Folder.PSProvider.Name -ne 'FileSystem') { throw 'Source must be a local folder.' }
if ($Folder.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Source cannot be a junction or symbolic link.' }
$Links = Get-ChildItem -LiteralPath $Folder.FullName -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint } | Select-Object -First 1
if ($Links) { throw 'Remove junctions and symbolic links from the source tree before copying.' }
if (-not $Profile) { $Profile = $Folder.Name.ToLowerInvariant() }
if ($Profile.Length -gt 60 -or $Profile -cnotmatch '^[a-z0-9]+(-[a-z0-9]+)*$') { throw 'Use -Profile with lowercase letters, numbers and single hyphens (maximum 60 characters).' }
if ($Server -notmatch '^[a-z_][a-z0-9_-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*$') { throw 'Server must be user@hostname or user@IPv4-address.' }
if ($Destination -notmatch '^/[a-zA-Z0-9_/-]+$' -or $Destination -match '(^|/)\.\.(/|$)') { throw 'Destination must be an absolute Ubuntu path using letters, numbers, underscores, hyphens and slashes.' }
$script:SshOptions = @('-p', "$Port", '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=6')
$ScpOptions = @('-P', "$Port", '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=6')
if ($IdentityFile) {
    $Key = (Get-Item -LiteralPath $IdentityFile).FullName
    $script:SshOptions += @('-i', $Key)
    $ScpOptions += @('-i', $Key)
}
$Batch = (Get-Date -Format 'yyyyMMddTHHmmss') + '-' + [guid]::NewGuid().ToString('N')
$RemoteBatch = $Destination.TrimEnd('/') + '/' + $Profile + '/' + $Batch
$RemoteSource = $RemoteBatch + '/source'
$Runner = '/home/mediaspacedev/projects/sturdy-journey/scripts/run-folder-import.py'
Write-Host "Source: $($Folder.FullName)"
Write-Host "Destination: ${Server}:$RemoteSource"
Write-Host "Target: $Target; profile: $Profile; visibility: private"
Write-Host 'Windows originals are preserved. The app pauses during import and video processing.'
if ($DryRun) { Write-Host 'Dry run only: no transfer, SSH connection or import performed.'; return }
Invoke-Ssh ('test -r ' + (Quote-Sh $Runner) + ' && umask 077 && mkdir -p -- ' + (Quote-Sh $RemoteBatch))
# Validate the target app before spending time transferring the folder.
$Preflight = @{ source = $RemoteBatch; profile = $Profile; target = $Target } | ConvertTo-Json -Compress
$PreflightEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Preflight))
Invoke-Ssh ('python3 ' + (Quote-Sh $Runner) + ' --config ' + (Quote-Sh $PreflightEncoded))
# Copy to a new, nonexistent source path: avoids nested folders on repeat batches.
& scp @ScpOptions -r $Folder.FullName "${Server}:$RemoteSource"
if ($LASTEXITCODE -ne 0) { throw 'Copy failed. Import was not started. Originals and any partial staging copy remain in place.' }
$Config = @{ source = $RemoteSource; profile = $Profile; target = $Target } | ConvertTo-Json -Compress
$Encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Config))
Invoke-Ssh ('python3 ' + (Quote-Sh $Runner) + ' --launch --config ' + (Quote-Sh $Encoded))
Write-Host 'Transfer complete; Ubuntu is processing the batch. You may close this terminal.'
Write-Host "Watch progress: ssh -p $Port $Server 'tail -f $RemoteBatch/import.log'"
Write-Host 'Wait for Import completed. before reviewing the profile in Manage profiles.'
