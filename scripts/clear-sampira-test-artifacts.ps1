[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$TempRoot,
    [Parameter(Mandatory=$true)][string]$ManifestPath,
    [switch]$Apply
)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Resolve-Path -LiteralPath $TempRoot).Path).TrimEnd('\')
if($root -notmatch '\\AppData\\Local\\Temp$'){throw 'Only the user Local Temp directory is allowed.'}
$processes=@(Get-CimInstance Win32_Process)
$references=@($processes | ForEach-Object {$_.ExecutablePath; $_.CommandLine})
$references+=@(Get-CimInstance Win32_Service | Select-Object -ExpandProperty PathName)
$worktrees=@(git worktree list --porcelain | Where-Object {$_ -like 'worktree *'} | ForEach-Object {$_.Substring(9).Replace('/','\')})
if($LASTEXITCODE){throw 'Cannot verify Git worktrees.'}
$pattern='^sampira-(?:(?:6b-fe|qa|5a-fe|5b|4b|5a|auth|be-api-audit)-[a-f0-9]{32}|(?:browser|phase1-http)-[A-Za-z0-9]{6})$'
$rows=@()
foreach($directory in Get-ChildItem -LiteralPath $root -Directory -Force | Where-Object {$_.Name -like 'sampira*'}) {
    $path=[IO.Path]::GetFullPath($directory.FullName)
    if([IO.Path]::GetDirectoryName($path) -ne $root){throw "Outside Temp: $path"}
    $reason=$null
    if($directory.Name -notmatch $pattern){$reason='Not a recognized disposable test directory'}
    elseif($directory.Attributes -band [IO.FileAttributes]::ReparsePoint){$reason='Reparse point'}
    elseif(@($references | Where-Object {$_ -and $_.IndexOf($directory.Name,[StringComparison]::OrdinalIgnoreCase) -ge 0}).Count){$reason='Referenced by a live process/service'}
    elseif(@($worktrees | Where-Object {$_ -eq $path -or $_.StartsWith($path+'\',[StringComparison]::OrdinalIgnoreCase)}).Count){$reason='Git worktree'}
    elseif(@(Get-ChildItem -LiteralPath $path -Force | Where-Object {$_.Name -eq '.git' -or $_.Name -match 'backup|restore|production|runtime|server-main'}).Count){$reason='Protected backup/runtime marker'}
    $files=@()
    if(!$reason){
        $scanErrors=@()
        $files=@(Get-ChildItem -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue -ErrorVariable scanErrors)
        if($scanErrors.Count){$reason='Could not inspect all contents'}
        elseif(@($files | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){$reason='Nested reparse point'}
    }
    $bytes=if(!$reason){[long](($files | Where-Object {!$_.PSIsContainer} | Measure-Object Length -Sum).Sum)}else{0}
    $rows+= [pscustomobject]@{Path=$path;Name=$directory.Name;Bytes=$bytes;Decision=if($reason){'Keep'}else{'Delete'};Reason=$reason;Deleted=$false}
}
$before=(Get-PSDrive -Name C).Free
$rows | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $ManifestPath -Encoding utf8
$candidates=@($rows | Where-Object {$_.Decision -eq 'Delete'})
[pscustomobject]@{Mode=if($Apply){'Apply'}else{'Audit'};DeleteFolders=$candidates.Count;CandidateGiB=[math]::Round((($candidates | Measure-Object Bytes -Sum).Sum)/1GB,2);Kept=@($rows | Where-Object {$_.Decision -eq 'Keep'} | Select-Object Name,Reason);FreeGiB=[math]::Round($before/1GB,2)} | ConvertTo-Json -Depth 4 -Compress
if(!$Apply){return}
$deleted=0
foreach($row in $candidates) {
    # Revalidate each exact absolute target and live references immediately before deletion.
    $target=[IO.Path]::GetFullPath((Resolve-Path -LiteralPath $row.Path).Path)
    if([IO.Path]::GetDirectoryName($target) -ne $root -or [IO.Path]::GetFileName($target) -notmatch $pattern){throw "Unsafe deletion target: $target"}
    if((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Target changed: $target"}
    $active=@(Get-CimInstance Win32_Process | Where-Object {($_.ExecutablePath -and $_.ExecutablePath.IndexOf($row.Name,[StringComparison]::OrdinalIgnoreCase) -ge 0) -or ($_.CommandLine -and $_.CommandLine.IndexOf($row.Name,[StringComparison]::OrdinalIgnoreCase) -ge 0)})
    if($active.Count){$row.Decision='Keep';$row.Reason='Became active after audit';continue}
    try {
        Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
        $row.Deleted=!(Test-Path -LiteralPath $target)
        if($row.Deleted){$deleted++}
    } catch { $row.Reason='Deletion incomplete: '+$_.Exception.GetType().Name }
    if($deleted -and $deleted%50 -eq 0){Write-Output "Removed $deleted test folders."}
}
$rows | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $ManifestPath -Encoding utf8
$after=(Get-PSDrive -Name C).Free
[pscustomobject]@{DeletedFolders=$deleted;NotDeleted=@($rows | Where-Object {$_.Decision -eq 'Delete' -and !$_.Deleted} | Select-Object Name,Reason);FreeGiBAfter=[math]::Round($after/1GB,2);FreedGiB=[math]::Round(($after-$before)/1GB,2)} | ConvertTo-Json -Depth 4 -Compress
