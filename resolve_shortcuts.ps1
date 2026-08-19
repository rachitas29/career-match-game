$sh = New-Object -ComObject WScript.Shell
Get-ChildItem 'c:\Users\admin\Desktop\*.lnk' | ForEach-Object {
    [PSCustomObject]@{
        Name   = $_.Name
        Target = $sh.CreateShortcut($_.FullName).TargetPath
    }
} | Format-Table -AutoSize
