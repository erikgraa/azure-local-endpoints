function Export-AzureLocalEndpoints {
  [CmdletBinding()]
  param ()

  $azureLocalFirewallRequirementsUri = 'https://learn.microsoft.com/en-us/azure/azure-local/concepts/firewall-requirements'

  $regions = Invoke-RestMethod -Uri $azureLocalFirewallRequirementsUri

  $regionHash = [Ordered]@{}

  $regionMatch = ($regions | Select-String -AllMatches -Pattern '"(https:\/\/github.com\/Azure\/AzureStack-Tools\/.+\/(.+?)-hci-endpoints.md)"').Matches.Groups

  for ($i = 0; $i -lt $regionMatch.count; $i += 3) {
    $regionHash.Add($regionMatch[$i+2].Value.Trim(), $regionMatch[$i+1].Value)
  }

  $jsonPath = ('{0}\json' -f (Get-Location).Path)

  if (-not(Test-Path -Path $jsonPath)) {
    $null = New-Item -Path $jsonPath -ItemType Directory
  }

  $azureLocalVersion = (Select-String -InputObject $regions -Pattern 'Required firewall URLs for Azure Local, version (\w+) deployments').Matches.Groups[-1].Value.Trim()
  $azureLocalVersionLowerCase = (Select-String -InputObject $regions -Pattern 'Required firewall URLs for Azure Local, version (\w+) deployments').Matches.Groups[-1].Value.Trim().ToLower()

  $azureLocalVersionPath = ('{0}\{1}' -f $jsonPath, $azureLocalVersionLowerCase)

  if (-not(Test-Path -Path $azureLocalVersionPath)) {
    $null = New-Item -Path $azureLocalVersionPath -ItemType Directory
  }

  $everGreenFileName = 'azure-local-endpoints.json'

  $everGreenJson = @()

  $readme = @()

  $readme += '> ## Azure Local Endpoints'

  $readme += ('[![Update Azure Local Endpoints](https://github.com/{0}/actions/workflows/update.yml/badge.svg)](https://github.com/{0}/actions/workflows/update.yml)' -f $env:GITHUB_REPOSITORY)

  $readme += '### Documentation'

  $readme += 'This repository parses the list of required firewall endpoints/URLs for Azure Local and creates two JSON files per region (one readable and one compressed).'
  $readme += ('Documentation is available at {0}' -f $azureLocalFirewallRequirementsUri)

  $everGreenGitHubUri = ('https://raw.githubusercontent.com/{0}/refs/heads/main/{1}' -f $env:GITHUB_REPOSITORY, $everGreenFileName)

  $readme += '### Evergreen Link'

  $readme += 'The URL of the `azure-local-endpoints.json` file in this repository can be used as an evergreen link to JSON-formatted files for the various Azure Local required firewall endpoints/URLs'

  $readme += '### Use cases'

  $readme += '+ Automation'
  $readme += '+ Compliance'

  $readme += '### Regions'

  $readme += '|Region|Updated by Microsoft'
  $readme += '| :--- | --- |'

  foreach ($_region in $regionHash.GetEnumerator()) {
    $html = Invoke-RestMethod -Uri $_region.Value

    $updatedDate = (Select-String -InputObject $html -Pattern 'This list last update is from (\w+\s\d{1,2}\w+,\s\d{4,4})').Matches.Groups[-1].Value

    try {
      $updatedDateNormalized = Select-String -InputObject $updatedDate -Pattern '(\w+)\s(\d{1,2})\w+,\s(\d{4,4})' 

      $month = ((New-Object System.Globalization.CultureInfo("en-US")).DateTimeFormat.MonthNames.IndexOf($updatedDateNormalized.Matches.Groups[-3].Value)+1).ToString()
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
      'version' = $azureLocalVersionLowerCase
      'updated' = $updatedDate
      'url' = $_region.Value
    }
    
    $endpoints = @()

    foreach ($_row in $table) {
      $_entry = Select-String -Pattern '(?ms)<tr>\n<td>(\d+)<\/td>\n<td>(.*?)<\/td>\n<td>(.*?)<\/td>\n<td>(.*?)<\/td>\n<td>(.*?)<\/td>\n<td>(.*?)<\/td>\n<td>(.*?)<\/td>\n<\/tr>' -InputObject $_row
      $uri = if ($_entry.Matches.Groups[3].Value -match '<a href') {
        (Select-String -InputObject $_entry.Matches.Groups[3].Value -Pattern '<a href="(.*?)"').Matches.Groups[-1].Value
      }
      else {
        $_entry.Matches.Groups[3].Value
      }

      $wildcard = if ($uri -match '\*') {
       $true
      }
      else {
        $false
      }
    
      $hash = [Ordered]@{}
      $hash.add('id', $_entry.Matches.Groups[1].Value)
      $hash.add('azureLocalComponent', $_entry.Matches.Groups[2].Value)
      $hash.add('endpointUrl', $uri.Trim())
      $hash.add('port', ($_entry.Matches.Groups[4].Value.Split(',').Trim()))
      $hash.add('notes', $_entry.Matches.Groups[5].Value)
      $hash.add('arcGatewaySupport', $_entry.Matches.Groups[6].Value)
      $hash.add('requiredFor', ($_entry.Matches.Groups[7].Value -replace '&amp;','&').Split('8').Split('&').Trim())
      $hash.add('wildcard', $wildcard)

      $endpoints += New-Object -TypeName PSCustomObject -Property $hash
    }

    $json.Add('endpoints', $endpoints)

    $fileName = ('azure-local-endpoints-{0}' -f $regionLowerCase) 
    $fileNameCompressed = ('{0}-compressed' -f $fileName) 

    $filePath = ('json\{0}\{1}.json' -f $azureLocalVersionLowerCase, $fileName)
    $filePathCompressed = ('json\{0}\{1}.json' -f $azureLocalVersionLowerCase, $fileNameCompressed)

    $gitHubUri = ('https://raw.githubusercontent.com/{0}/refs/heads/main/{1}' -f $env:GITHUB_REPOSITORY, $filePath.Replace('\','/'))
    $gitHubUriCompressed = ('https://raw.githubusercontent.com/{0}/refs/heads/main/{1}' -f $env:GITHUB_REPOSITORY, $filePathCompressed.Replace('\','/'))

    $json | ConvertTo-Json -Depth 5 | Out-File -FilePath $filePath -Encoding utf8
    $json | ConvertTo-Json -Depth 5 -Compress | Out-File -FilePath $filePathCompressed -Encoding utf8

    $everGreenHash = [Ordered]@{
      'region' = $regionLowerCase
      'version' = $azureLocalVersionLowerCase
      'url' = $gitHubUri
      'urlCompressed' = $gitHubUriCompressed
    }

    $everGreenJson += New-Object -TypeName PSCustomObject -Property $everGreenHash

    $readme += ('{0}|{1}' -f $regionLowerCase, $updatedDate)
  }

  $readme | Out-File -FilePath 'README.md' -Encoding utf8

  $everGreenJson | ConvertTo-Json -Depth 5 | Out-File -FilePath $everGreenFileName -Encoding utf8
}

Export-AzureLocalEndpoints