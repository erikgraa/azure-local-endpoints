# Azure Local Endpoints Codified as JSON

This PowerShell script enumerates the list of required firewall endpoints/URLs for Azure Local from Microsoft documentation. Two JSON files are created per region - one readable/prettified and one compressed.

## 🗺️ Regions and endpoints

|Region|Updated by Microsoft|Endpoint count|Arc gateway supported endpoints|
| :--- | --- | --- | --- |
|eastus|2025-01-23|101|65|
|westeurope|2025-01-23|106|69|
|australiaeast|2025-01-23|106|69|
|canadacentral|2025-01-23|106|69|
|indiacentral|2025-01-23|105|67|
|southeastasia|2025-01-23|105|68|
|japaneast|2025-01-23|106|67|
|southcentralus|2025-01-23|106|67|

## 🚀 Features

- Parses the list of Azure Local endpoints from Microsoft documentation and converts them to JSON for each region.
- The URL of the `json\azure-local-endpoints.json` file in this repository can be used as an evergreen link to JSON-formatted files for the various Azure Local required firewall endpoints/URLs.
## 📄 Howto

### 1️⃣ Run in GitHub
Fork the https://github.com/erikgraa/azure-local-endpoints repository in GitHub and allow the scheduled workflow to run. This allows for updates every morning at 6am - or at your preferred cadence.
### 2️⃣ Run locally
Clone the repository and run the script. Updated list of endpoints codified as JSON will be available in the `json` folder.
```powershell
git clone https://github.com/erikgraa/azure-local-endpoints.git
cd azure-local-endpoints
```
```powershell
. .\scripts\Export-AzureLocalEndpoints.ps1
Export-AzureLocalEndpoints
```
### ⚡ Use cases and making sense of the output
The JSON-formatted lists of endpoints can be used for automation, documentation or compliance purposes. See the related blog post at https://blog.graa.dev/AzureLocal-Endpoints for use cases.
[![Example](/assets/json.png)](https://github.com/erikgraa/azure-local-endpoints/tree/main/json) 

## 🌳 Repository

The repository structure is as follows (with multiple regions' endpoints):

```plaintext
│   LICENSE
│   README.md
│
├───.github
│   └───workflows
│           update.yml
│
├───assets
│       json.png
│
├───json
│   │   azure-local-endpoints.json 🍏
│   │
│   │
│   └───<region>
│           azure-local-endpoints-<region>-compressed.json
│           azure-local-endpoints-<region>.json
│
└───scripts
        Export-AzureLocalEndpoints.ps1
```
## 👏 Contributions

Any contributions are welcome and appreciated!
