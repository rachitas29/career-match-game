$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    $doc = $word.Documents.Open("c:\Users\admin\Desktop\IAF requirement for 8th august.docx", $null, $true)
    Write-Host $doc.Content.Text
    $doc.Close()
} catch {
    Write-Host "Error: $_"
}
$word.Quit()
