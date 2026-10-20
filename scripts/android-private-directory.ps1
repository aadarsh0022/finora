param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Path -PathType Container)) { throw 'Private directory must already exist.' }
$taskAcl = New-Object System.Security.AccessControl.DirectorySecurity
$taskAcl.SetAccessRuleProtection($true, $false)
$taskIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$taskInheritance = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
$taskPropagation = [System.Security.AccessControl.PropagationFlags]::None
$taskAllow = [System.Security.AccessControl.AccessControlType]::Allow
$taskRule = New-Object System.Security.AccessControl.FileSystemAccessRule($taskIdentity, 'FullControl', $taskInheritance, $taskPropagation, $taskAllow)
$taskAcl.AddAccessRule($taskRule)
$taskSystem = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
$taskAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($taskSystem, 'FullControl', $taskInheritance, $taskPropagation, $taskAllow)))
$taskAbsolutePath = [System.IO.Path]::GetFullPath($Path)
if ($PSVersionTable.PSEdition -eq 'Desktop') {
    [System.IO.Directory]::SetAccessControl($taskAbsolutePath, $taskAcl)
} else {
    [System.IO.FileSystemAclExtensions]::SetAccessControl((New-Object System.IO.DirectoryInfo($taskAbsolutePath)), $taskAcl)
}
