function Export-AzureLocalEndpoints {
  [CmdletBinding()]
  param (
    [Parameter(Mandatory=$false)]
    [ValidateNotNullOrEmpty()]
    [String]$FileName = 'azure-local-endpoints',

    [Parameter(Mandatory=$false)]
    [ValidateNotNullOrEmpty()]
    [System.Uri]$Uri = 'https://learn.microsoft.com/en-us/azure/azure-local/concepts/firewall-requirements',

    [Parameter(Mandatory=$false)]
    [ValidateNotNullOrEmpty()]
    [String]$DestinationPathName = 'json',

    [Parameter(Mandatory=$false)]
    [Switch]$IncludeDocumentation
  )

  $documentation = Invoke-RestMethod -Uri $uri

  $regionHash = [Ordered]@{}

  $regionTableInfo = @()

  $regionPattern = '"(https:\/\/github.com\/Azure\/AzureStack-Tools\/.+\/(.+?)-hci-endpoints.md)"'

  $regionMatch = ($documentation | Select-String -AllMatches -Pattern $regionPattern).Matches.Groups

  for ($i = 0; $i -lt $regionMatch.count; $i += 3) {
    $regionHash.Add($regionMatch[$i+2].Value.Trim(), $regionMatch[$i+1].Value)
  }

  $location = Get-Location | Select-Object -ExpandProperty Path

  $destinationPath = ('{0}\{1}' -f $location, $DestinationPathName)

  $filePath = ('{0}\{1}.json' -f $destinationPath, $FileName)

  if (-not(Test-Path -Path $destinationPath -ErrorAction SilentlyContinue)) {
    $null = New-Item -Path $destinationPath -ItemType Directory
  }

  $outputJson = @()

  foreach ($_region in $regionHash.GetEnumerator()) {
    $html = Invoke-RestMethod -Uri $_region.Value

    $updatedDate = (Select-String -InputObject $html -Pattern 'This list last update is from (\w+\s\d{1,2}\w+,\s\d{4,4})').Matches.Groups[-1].Value

    try {
      $updatedDateNormalized = Select-String -InputObject $updatedDate -Pattern '(\w+)\s(\d{1,2})\w+,\s(\d{4,4})' 

      $month = ((New-Object System.Globalization.CultureInfo('en-US')).DateTimeFormat.MonthNames.IndexOf($updatedDateNormalized.Matches.Groups[-3].Value)+1).ToString()
      $month = $month.PadLeft(2, "0")
      $day = $updatedDateNormalized.Matches.Groups[-2].Value
      $year = $updatedDateNormalized.Matches.Groups[-1].Value

      $updatedDate = ('{0}-{1}-{2}' -f $year, $month, $day)
    }
    catch { }

    $regionLowerCase = $_region.Key.ToLower()

    $table = ($html | Select-String -AllMatches -Pattern '(?ms)<tr>\n<td>\d+<\/td>\n<td>.+?<\/td>\n<td>.*?<\/td>\n<td>.*?<\/td>\n<td>.*?<\/td>\n<td>.*?<\/td>\n<\/tr>').Matches.Groups

    $json = [Ordered]@{
      'region' = $regionLowerCase
      'updated' = $updatedDate
      'url' = $_region.Value
    }
    
    $endpoints = @()

    foreach ($_row in $table) {
      $_entry = Select-String -Pattern '(?ms)<tr>\n<td>(\d+)<\/td>\n<td>(.*?)<\/td>\n<td>(.*?)<\/td>\n<td>(.*?)<\/td>\n<td>(.*?)<\/td>\n<td>(.*?)<\/td>\n<td>(.*?)<\/td>\n<\/tr>' -InputObject $_row
      $endpointUri = if ($_entry.Matches.Groups[3].Value -match '<a href') {
        (Select-String -InputObject $_entry.Matches.Groups[3].Value -Pattern '<a href="(.*?)"').Matches.Groups[-1].Value
      }
      else {
        $_entry.Matches.Groups[3].Value
      }

      $wildcard = if ($endpointUri -match '\*') {
       $true
      }
      else {
        $false
      }
    
      $hash = [Ordered]@{}
      $hash.add('id', $_entry.Matches.Groups[1].Value)
      $hash.add('azureLocalComponent', $_entry.Matches.Groups[2].Value)
      $hash.add('endpointUrl', $endpointUri.Trim())
      $hash.add('port', ($_entry.Matches.Groups[4].Value.Split(',').Trim()))
      $hash.add('notes', $_entry.Matches.Groups[5].Value)
      $hash.add('arcGatewaySupport', $_entry.Matches.Groups[6].Value)
      $hash.add('requiredFor', ($_entry.Matches.Groups[7].Value -replace '&amp;','&').Split('8').Split('&').Trim())
      $hash.add('wildcard', $wildcard)

      $endpoints += New-Object -TypeName PSCustomObject -Property $hash
    }

    $json.Add('endpoints', $endpoints)

    $regionPath = ('{0}\{1}' -f $destinationPath, $regionLowerCase)

    if (-not(Test-Path -Path $regionPath -ErrorAction SilentlyContinue)) {
      $null = New-Item -Path $regionPath -ItemType Directory
    }

    $regionFileName = ('{0}-{1}' -f $FileName, $regionLowerCase) 
    $regionFileNameCompressed = ('{0}-compressed' -f $regionFileName) 

    $actualFilePath = ('{0}\{1}\{2}.json' -f $destinationPath, $regionLowerCase, $regionFileName)
    $actualFilePathCompressed = ('{0}\{1}\{2}.json' -f $destinationPath, $regionLowerCase, $regionFileNameCompressed)

    $gitHubUri = ('https://raw.githubusercontent.com/{0}/{1}{2}' -f $env:GITHUB_REPOSITORY, $env:GITHUB_REF, $actualFilePath.Replace('\','/').Replace($location,''))
    $gitHubUriCompressed = ('https://raw.githubusercontent.com/{0}/{1}{2}' -f $env:GITHUB_REPOSITORY, $env:GITHUB_REF, $actualFilePathCompressed.Replace('\','/').Replace($location,''))

    write-host "null: $($null -eq $env:GITHUB_REPOSITORY)"

    $actualUri = if ($null -eq $env:GITHUB_REPOSITORY) {
      $actualFilePath
    }
    else {
      $gitHubUri
    }

    $actualUriCompressed = if ($null -eq $env:GITHUB_REPOSITORY) {
      $actualFilePathCompressed
    }
    else {
      $gitHubUriCompressed
    }    

    $json | ConvertTo-Json -Depth 5 | Out-File -FilePath $actualFilePath -Encoding utf8
    $json | ConvertTo-Json -Depth 5 -Compress | Out-File -FilePath $actualFilePathCompressed -Encoding utf8

    $_regionHash = [Ordered]@{
      'region' = $regionLowerCase
      'updated' = $updatedDate
      'count' = $endpoints.Count
      'url' = $actualUri
      'urlCompressed' = $actualUriCompressed
    }

    $outputJson += New-Object -TypeName PSCustomObject -Property $_regionHash

    $regionTableInfo += ('|{0}|{1}|{2}|' -f $regionLowerCase, $updatedDate, $endpoints.Count)
  }

  if ($PSBoundParameters.ContainsKey('IncludeDocumentation') -and ($null -ne $env:GITHUB_REPOSITORY)) {
    $readmeMarkdown = @()

    $readmeMarkdown += '> ## Azure Local Endpoints'
    $readmeMarkdown += '---'

    $readmeMarkdown += ('[![Update Azure Local Endpoints](https://github.com/{0}/actions/workflows/update.yml/badge.svg)](https://github.com/{0}/actions/workflows/update.yml)  ' -f $env:GITHUB_REPOSITORY)

    $readmeMarkdown += 'This repository parses the list of required firewall endpoints/URLs for Azure Local and creates two JSON files per region (one readable and one compressed).'
    $readmeMarkdown += ('Documentation is available at {0}' -f $uri)

    $everGreenGitHubUri = ('https://raw.githubusercontent.com/{0}/refs/heads/main/{1}/{2}' -f $env:GITHUB_REPOSITORY, $DestinationPathName, $FileName)

    $readmeMarkdown += '### Evergreen Link'

    $readmeMarkdown += ('The URL of the `{0}\{1}.json` file in this repository can be used as an evergreen link to JSON-formatted files for the various Azure Local required firewall endpoints/URLs' -f $DestinationPathName, $FileName)

    $readmeMarkdown += '### Regions'

    $readmeMarkdown += '|Region|Updated by Microsoft|Endpoint count|'
    $readmeMarkdown += '| :--- | --- | --- |'

    $readmeMarkdown += $regionTableInfo

    $readmeMarkdown | Out-File -FilePath 'README.md' -Encoding utf8
  }

  $outputJson | ConvertTo-Json -Depth 5 | Out-File -FilePath $filePath -Encoding utf8
}