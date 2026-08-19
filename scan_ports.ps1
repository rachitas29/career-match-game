$ports = @(80, 443, 6443, 8443, 8080, 9000, 9090, 3000, 5000)
foreach ($port in $ports) {
    $res = Test-NetConnection -ComputerName 192.168.1.6 -Port $port -WarningAction SilentlyContinue
    Write-Host "Port $port : $($res.TcpTestSucceeded)"
}
