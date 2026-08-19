$word = New-Object -ComObject Word.Application
$word.Visible = $false

Get-ChildItem 'c:\Users\admin\Desktop\*.docx' | ForEach-Object {
    try {
        $doc = $word.Documents.Open($_.FullName, $null, $true) # open read-only
        $content = $doc.Content.Text
        if ($content -like "*presentation*" -or $content -like "*sync*") {
            Write-Host "Found in: $($_.Name)"
            # Print first 500 characters
            Write-Host "Snippet: $($content.Substring(0, [Math]::Min(500, $content.Length)))"
            Write-Host "------------------------------------"
        }
        $doc.Close()
    } catch {
        Write-Host "Error reading $($_.Name): $_"
    }
}
$word.Quit()
