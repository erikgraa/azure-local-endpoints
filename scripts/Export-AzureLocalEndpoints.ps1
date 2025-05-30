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
    [String]$DestinationPathName = 'json',

    [Parameter(Mandatory=$false)]
    [Switch]$IncludeDocumentation
  )

  begin {
      $tree = @'
```plaintext
│   LICENSE
│   README.md
│
├───.github
│   └───workflows
│           update.yml
│
├───json
│   │   azure-local-endpoints.json 🍏
│   │
│   ├───oem 📦
│   │       azure-local-endpoints-vendor-compressed.json
│   │       azure-local-endpoints-vendor.json 
│   │
│   └───regions 🗺️
│           azure-local-endpoints-region-compressed.json
│           azure-local-endpoints-region.json
│
└───scripts
        Export-AzureLocalEndpoints.ps1
```
'@     
  }

  process {
  try {
    $documentation = Invoke-RestMethod -Uri $uri

    $regionHash = [Ordered]@{}

    $regionTableInfo = @()

    $regionPattern = '"(https:\/\/github.com\/Azure\/AzureStack-Tools\/.+\/(.+?)-hci-endpoints.md)"'

    $vendorHash = [Ordered]@{}

    $vendorTableInfo = @()    

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

      $updatedDate = (Select-String -InputObject $markdown -Pattern 'This list last update is from (\w+\s\d{1,2}\w+,\s\d{4,4})').Matches.Groups[-1].Value

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

      $regionTableInfo += ('| {0} | {1} | {2} | {3} |' -f $regionLowerCase, $updatedDate, $endpoints.Count, ($endpoints | Where-Object { $_.arcGatewaySupport -match 'Yes' }).Count)
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

      $vendorTableInfo += ('| {0} | {1} | {2} | {3} |' -f $vendorLowerCase, $updatedDate, $endpoints.Count, ($endpoints | Where-Object { $_.arcGatewaySupport -match 'Yes' }).Count)
    }    

    $outputJson | ConvertTo-Json -Depth 5 | Out-File -FilePath $filePath -Encoding utf8  

    if ($PSBoundParameters.ContainsKey('IncludeDocumentation') -and ($null -ne $env:GITHUB_REPOSITORY)) {
      $readmeMarkdown = @()

      $readmeMarkdown += '# Azure Local Endpoints Codified as JSON'
      $readmeMarkdown += ''    

      $readmeMarkdown += 'This PowerShell tool enumerates the list of required firewall endpoints/URLs for Azure Local - for regions and OEM hardware vendors - and codifies it as JSON.'
      $readmeMarkdown += ''

      $readmeMarkdown += '> [!IMPORTANT]  '
      $readmeMarkdown += "> This tool covers required firewall endpoints as parsed from [Microsoft's documentation](https://learn.microsoft.com/en-us/azure/azure-local/concepts/firewall-requirements). There may be other requirements, such as for additional Azure services  "
      $readmeMarkdown += ''


      $readmeMarkdown += '## 🚀 Features'
      $readmeMarkdown += ''

      $readmeMarkdown += '- List of Azure Local endpoints as JSON for supported regions and OEM hardware vendors.'
      $readmeMarkdown += ('- The URL of the `{0}\{1}.json` file can be used as an evergreen link to the Azure Local endpoints' -f $DestinationPathName, $FileName) + "'" + 'required firewall endpoints/URLs.'

      $readmeMarkdown += '## 🗺️ Regions and endpoints'
      $readmeMarkdown += 'The current regions supporting Azure Local are documented in the table below, along with the number of required endpoints to open.'      
      $readmeMarkdown += ''

      $readmeMarkdown += '| Region         | Last updated         | Endpoint count | Azure Arc gateway support |'
      $readmeMarkdown += '| -------------- | -------------------- | -------------- | ------------------------- |'

      $readmeMarkdown += $regionTableInfo
      $readmeMarkdown += ''

      $readmeMarkdown += '## 📦 OEM hardware vendors and endpoints'
      $readmeMarkdown += 'The current OEM hardware vendors supporting Azure Local are documented in the table below, along with the number of required endpoints to open.'      
      $readmeMarkdown += ''

      $readmeMarkdown += '| Vendor         | Last updated         | Endpoint count | Azure Arc gateway support |'
      $readmeMarkdown += '| -------------- | -------------------- | -------------- | ------------------------- |'

      $readmeMarkdown += $vendorTableInfo
      $readmeMarkdown += ''      

      $readmeMarkdown += '## 📄 Howto'
      $readmeMarkdown += ''    

      $readmeMarkdown += '### 1️⃣ Run as workflow GitHub'
      
      $readmeMarkdown += 'Fork the https://github.com/erikgraa/azure-local-endpoints repository in GitHub and allow the scheduled workflow to run. Updates (if any) are retrieved every morning at 6am - or at your preferred cadence.'    

      $readmeMarkdown += ''    

      $readmeMarkdown += '### 2️⃣ Run PowerShell cmdlet locally'

      $readmeMarkdown += 'Clone the repository and run the script. Updated lists of endpoints codified as JSON will be available in the `json` folder.'

      $readmeMarkdown += '```powershell
  git clone https://github.com/erikgraa/azure-local-endpoints.git
  cd azure-local-endpoints
  ```'

      $readmeMarkdown += '```powershell
  . .\scripts\Export-AzureLocalEndpoints.ps1
  Export-AzureLocalEndpoints
  ```'

      $readmeMarkdown += '## ⚡ Use cases and making sense of the output'
      $readmeMarkdown += 'The JSON-formatted lists of endpoints can be used for automation, documentation or compliance purposes. See the related blog post at https://blog.graa.dev/AzureLocal-Endpoints for use cases.'

      $readmeMarkdown += ''
      $readmeMarkdown += '## 🌳 Repository'
      $readmeMarkdown += ''    
      $readmeMarkdown += "The repository structure is as follows. Each region gets its own folder."
      $readmeMarkdown += '' 

      $readmeMarkdown += $tree

      $readmeMarkdown += '## 👏 Contributions'
      $readmeMarkdown += ''    
      $readmeMarkdown += 'Any contributions are welcome and appreciated!'    

      $readmeMarkdown | Out-File -FilePath 'README.md' -Encoding utf8
    }
    }
    catch {
      $PSCmdlet.ThrowTerminatingError($_)
    }
  }

  end { }
}