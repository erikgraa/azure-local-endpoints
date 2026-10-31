<#PSScriptInfo
  .VERSION 1.1
  .GUID 5010fe8f-5e56-4361-8cd8-b760206adbea
  .AUTHOR erikgraa
#>

<#

  .DESCRIPTION
  Script to enumerate Azure Local firewall endpoints and codify them as JSON.

#>

#Requires -PSEdition Core

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
    [String]$DestinationPathName = 'json'
  )

  begin { }

  process {
  try {
    $documentation = Invoke-RestMethod -Uri $uri

    $regionHash = [Ordered]@{}

    $regionPattern = '"(https:\/\/github.com\/Azure\/AzureStack-Tools\/.+\/(.+?)-hci-endpoints.md)"'

    $vendorHash = [Ordered]@{}

    $vendorPattern = '"(https:\/\/github.com\/Azure\/AzureStack-Tools\/.+\/(.+?)AzureLocalEndpoints.md)"'

    $regionMatch = ($documentation | Select-String -AllMatches -Pattern $regionPattern).Matches.Groups

    $vendorMatch = ($documentation | Select-String -AllMatches -Pattern $vendorPattern).Matches.Groups

    for ($i = 0; $i -lt $regionMatch.count; $i += 3) {
      $gitHubUri = 'https://github.com/Azure/AzureStack-Tools/blob/'
      $gitHubUriRaw = 'https://raw.githubusercontent.com/Azure/AzureStack-Tools/refs/heads/'
      $regionHash.Add($regionMatch[$i+2].Value.Trim(), $regionMatch[$i+1].Value.Replace($gitHubUri, $gitHubUriRaw))
    }

    for ($i = 0; $i -lt $vendorMatch.count; $i += 3) {
      $gitHubUri = 'https://github.com/Azure/AzureStack-Tools/blob/'
      $gitHubUriRaw = 'https://raw.githubusercontent.com/Azure/AzureStack-Tools/refs/heads/'
      $vendorHash.Add($vendorMatch[$i+2].Value.Trim(), $vendorMatch[$i+1].Value.Replace($gitHubUri, $gitHubUriRaw))
    }    

    $location = Get-Location | Select-Object -ExpandProperty Path

    $destinationPath = ('{0}\{1}' -f $location, $DestinationPathName)

    $filePath = ('{0}\{1}.json' -f $destinationPath, $FileName)

    if (-not(Test-Path -Path $destinationPath -ErrorAction SilentlyContinue)) {
      $null = New-Item -Path $destinationPath -ItemType Directory
    }

    $outputJson = @()

    foreach ($_region in $regionHash.GetEnumerator()) {
      $markdown = Invoke-RestMethod -Uri $_region.Value

      $updatedDate = (Select-String -InputObject $markdown -Pattern '(?:This list (?:last update is from|was last updated on)|Last updated:?(?: on)?) (\w+\s\d{1,2}\w*,\s\d{4,4})').Matches.Groups[-1].Value

      try {
        $updatedDateNormalized = Select-String -InputObject $updatedDate -Pattern '(\w+)\s(\d{1,2})\w*,\s(\d{4,4})' 

        $month = ((New-Object System.Globalization.CultureInfo('en-US')).DateTimeFormat.MonthNames.IndexOf($updatedDateNormalized.Matches.Groups[-3].Value)+1).ToString()
        $month = $month.PadLeft(2, "0")
        $day = $updatedDateNormalized.Matches.Groups[-2].Value
        $year = $updatedDateNormalized.Matches.Groups[-1].Value

        $updatedDate = ('{0}-{1}-{2}' -f $year, $month, $day)
      }
      catch { }

      $regionLowerCase = $_region.Key.ToLower()

      $markdownPattern = "(?ms)\|.*?(\d+).*?\|.*?(.*?)\s+?\|\s+?(.*?)\s+?\|\s+?(.*?)\s+?\|\s+?(.*?)\s+?\|\s+?(.*?)\s+?\|\s+?(.*?)\s+?\|"

      $table = $markdown | Select-String -AllMatches -Pattern $markdownPattern

      $json = [Ordered]@{
        'type' = 'region'
        'name' = $regionLowerCase
        'updated' = $updatedDate
        'url' = $_region.Value
      }
      
      $endpoints = @()

      $i = 0

      $endpointCount = 0

      $thresholdEndpointCount = 10

      try {
        $endpointCount = $table.Matches.Groups.Count / 8
      }
      catch {
        throw ("Endpoint count {0} for region {1}" -f $endpointCount, $regionLowerCase)
      }
      finally {
        if ($endpointCount -lt $thresholdEndpointCount) {
          throw ('Will not write endpoint JSON as count was less than {0} - something is amiss' -f $thresholdEndpointCount)
        }
      }    

      do {
        try {
          $endpointUrl = $table.matches.groups[$i+3].Value

          $wildcard = if ($endpointUrl -match '\*') {
            $true
          }
          else {
            $false
          }

          Write-Debug ("Processing endpoint ID {0} for region {1}" -f $table.matches.groups[$i+1].Value, $regionLowerCase)
        
          $hash = [Ordered]@{}
          $hash.add('id', $table.matches.groups[$i+1].Value)
          $hash.add('azureLocalComponent', $table.matches.groups[$i+2].Value)
          $hash.add('endpointUrl', $endpointUrl)
          $hash.add('port', $table.matches.groups[$i+4].Value)
          $hash.add('notes', $table.matches.groups[$i+5].Value)
          $hash.add('arcGatewaySupport', $table.matches.groups[$i+6].Value)
          $hash.add('requiredFor', $table.matches.groups[$i+7].Value.Split('8').Split('&').Trim())
          $hash.add('wildcard', $wildcard)
        }
        catch {
          throw ('Failed enumerating endpoints: {0}' -f $_)
        }

        $i += 8

        $endpoints += New-Object -TypeName PSCustomObject -Property $hash
      }
      while ($i -lt $table.Matches.Groups.Count)

      $json.Add('endpoints', $endpoints)

      $regionPath = ('{0}\regions\{1}' -f $destinationPath, $regionLowerCase)

      if (-not(Test-Path -Path $regionPath -ErrorAction SilentlyContinue)) {
        $null = New-Item -Path $regionPath -ItemType Directory
      }

      $regionFileName = ('{0}-{1}' -f $FileName, $regionLowerCase) 
      $regionFileNameCompressed = ('{0}-compressed' -f $regionFileName) 

      $actualFilePath = ('{0}\regions\{1}\{2}.json' -f $destinationPath, $regionLowerCase, $regionFileName)
      $actualFilePathCompressed = ('{0}\regions\{1}\{2}.json' -f $destinationPath, $regionLowerCase, $regionFileNameCompressed)

      $gitHubUri = ('https://raw.githubusercontent.com/{0}/{1}{2}' -f $env:GITHUB_REPOSITORY, $env:GITHUB_REF, $actualFilePath.Replace('\','/').Replace($location,''))
      $gitHubUriCompressed = ('https://raw.githubusercontent.com/{0}/{1}{2}' -f $env:GITHUB_REPOSITORY, $env:GITHUB_REF, $actualFilePathCompressed.Replace('\','/').Replace($location,''))

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
        'type' = 'region'
        'name' = $regionLowerCase
        'updated' = $updatedDate
        'count' = $endpoints.Count
        'url' = $actualUri
        'urlCompressed' = $actualUriCompressed
      }

      $outputJson += New-Object -TypeName PSCustomObject -Property $_regionHash

    }

    foreach ($_vendor in $vendorHash.GetEnumerator()) {
      $markdown = Invoke-RestMethod -Uri $_vendor.Value

      $updatedDate = (Select-String -InputObject $markdown -Pattern 'Last updated on (\w+\s\d+,\s\d+)').Matches.Groups[-1].Value

      try {
        $updatedDateNormalized = Select-String -InputObject $updatedDate -Pattern '(\w+)\s(\d+),\s(\d+)' 

        $month = ((New-Object System.Globalization.CultureInfo('en-US')).DateTimeFormat.MonthNames.IndexOf($updatedDateNormalized.Matches.Groups[-3].Value)+1).ToString()
        $month = $month.PadLeft(2, "0")
        $day = $updatedDateNormalized.Matches.Groups[-2].Value
        $year = $updatedDateNormalized.Matches.Groups[-1].Value

        $updatedDate = ('{0}-{1}-{2}' -f $year, $month, $day)
      }
      catch { }

      $vendorLowerCase = $_vendor.Key.ToLower()

      $markdownPattern = '(?ms)\|.*?(\d+).*?\|(.*?)\|(.*?)\|(.*?)\|(.*?)\|(.*?)\|(.*?)\|'

      $table = $markdown | Select-String -AllMatches -Pattern $markdownPattern

      $json = [Ordered]@{
        'type' = 'vendor'
        'name' = $vendorLowerCase
        'updated' = $updatedDate
        'url' = $_vendor.Value
      }
      
      $endpoints = @()

      $i = 0

      $endpointCount = 0

      $thresholdEndpointCount = 1

      try {
        $endpointCount = $table.Matches.Groups.Count / 8
      }
      catch {
        throw ("Endpoint count {0} for vendor {1}" -f $endpointCount, $vendorLowerCase)
      }
      finally {
        if ($endpointCount -lt $thresholdEndpointCount) {
          throw ('Will not write endpoint JSON as count was less than {0} - something is amiss' -f $thresholdEndpointCount)
        }
      }    

      do {
        try {
          $endpointUrl = $table.matches.groups[$i+3].Value.Trim()

          $wildcard = if ($endpointUrl -match '\*') {
            $true
          }
          else {
            $false
          }

          Write-Verbose ("Processing endpoint ID {0} for vendor {1}" -f $table.matches.groups[$i+1].Value, $vendorLowerCase)
        
          $hash = [Ordered]@{}
          $hash.add('id', $table.matches.groups[$i+1].Value.Trim())
          $hash.add('description', $table.matches.groups[$i+2].Value.Trim())
          $hash.add('endpointUrl', $endpointUrl)
          $hash.add('port', $table.matches.groups[$i+4].Value.Trim())
          $hash.add('notes', $table.matches.groups[$i+5].Value.Trim())
          $hash.add('arcGatewaySupport', $table.matches.groups[$i+6].Value.Trim())
          $hash.add('requiredFor', $table.matches.groups[$i+7].Value.Split('8').Split('&').Trim())
          $hash.add('wildcard', $wildcard)
        }
        catch {
          throw ('Failed enumerating endpoints: {0}' -f $_)
        }

        $i += 8

        $endpoints += New-Object -TypeName PSCustomObject -Property $hash
      }
      while ($i -lt $table.Matches.Groups.Count)

      $json.Add('endpoints', $endpoints)

      $vendorPath = ('{0}\oem\{1}' -f $destinationPath, $vendorLowerCase)

      if (-not(Test-Path -Path $vendorPath -ErrorAction SilentlyContinue)) {
        $null = New-Item -Path $vendorPath -ItemType Directory
      }

      $vendorFileName = ('{0}-{1}' -f $FileName, $vendorLowerCase) 
      $vendorFileNameCompressed = ('{0}-compressed' -f $vendorFileName) 

      $actualFilePath = ('{0}\oem\{1}\{2}.json' -f $destinationPath, $vendorLowerCase, $vendorFileName)
      $actualFilePathCompressed = ('{0}\oem\{1}\{2}.json' -f $destinationPath, $vendorLowerCase, $vendorFileNameCompressed)

      $gitHubUri = ('https://raw.githubusercontent.com/{0}/{1}{2}' -f $env:GITHUB_REPOSITORY, $env:GITHUB_REF, $actualFilePath.Replace('\','/').Replace($location,''))
      $gitHubUriCompressed = ('https://raw.githubusercontent.com/{0}/{1}{2}' -f $env:GITHUB_REPOSITORY, $env:GITHUB_REF, $actualFilePathCompressed.Replace('\','/').Replace($location,''))

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

      $_vendorHash = [Ordered]@{
        'type' = 'vendor'
        'name' = $vendorLowerCase
        'updated' = $updatedDate
        'count' = $endpoints.Count
        'url' = $actualUri
        'urlCompressed' = $actualUriCompressed
      }

      $outputJson += New-Object -TypeName PSCustomObject -Property $_vendorHash

    }    

    $outputJson | ConvertTo-Json -Depth 5 | Out-File -FilePath $filePath -Encoding utf8
    }
    catch {
      $PSCmdlet.ThrowTerminatingError($_)
    }
  }

  end { }
}