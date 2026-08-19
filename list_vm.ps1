Get-Service | Where-Object { $_.Name -like "*vm*" -or $_.Name -like "*virtual*" -or $_.Name -like "*hyper-v*" -or $_.DisplayName -like "*virtual*" } | Format-Table -AutoSize
