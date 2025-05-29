# Azure Local Endpoints Codified as JSON

This PowerShell script enumerates the list of required firewall endpoints/URLs for Azure Local - for regions and OEM hardware vendors - and codifies it as JSON. Everything is retrieved from Microsoft documentation.

## 🚀 Features

- List of Azure Local endpoints as JSON for supported regions and OEM hardware vendors.
- The URL of the `json\azure-local-endpoints.json` file can be used as an evergreen link to the Azure Local endpoints'required firewall endpoints/URLs.
## 🗺️ Regions and endpoints
The current regions supporting Azure Local are documented in the table below, along with the number of required endpoints to open.

| Region         | Last updated         | Endpoint count | Azure Arc gateway support |
| -------------- | -------------------- | -------------- | ------------------------- |
| eastus | 2025-01-23 | 98 | 66 |
| westeurope | 2025-01-23 | 103 | 70 |
| australiaeast | 2025-01-23 | 103 | 70 |
| canadacentral | 2025-01-23 | 103 | 70 |
| indiacentral | 2025-01-23 | 102 | 68 |
| southeastasia | 2025-01-23 | 102 | 69 |
| japaneast | 2025-01-23 | 103 | 68 |
| southcentralus | 2025-01-23 | 102 | 65 |

## 📦 OEM hardware vendors and endpoints
The current OEM hardware vendors supporting Azure Local are documented in the table below, along with the number of required endpoints to open.

| Vendor         | Last updated         | Endpoint count | Azure Arc gateway support |
| -------------- | -------------------- | -------------- | ------------------------- |
| dataon | 2025-03-19 | 3 | 0 |
| dell | 2025-03-19 | 2 | 0 |
| hpe | 2025-03-19 | 4 | 0 |
| hitachi | 2025-03-19 | 2 | 0 |
| lenovo | 2025-03-19 | 4 | 0 |

## 📄 Howto

### 1️⃣ Run as workflow GitHub
Fork the https://github.com/erikgraa/azure-local-endpoints repository in GitHub and allow the scheduled workflow to run. Updates (if any) are retrieved every morning at 6am - or at your preferred cadence.

### 2️⃣ Run PowerShell cmdlet locally
Clone the repository and run the script. Updated lists of endpoints codified as JSON will be available in the `json` folder.
```powershell
  git clone https://github.com/erikgraa/azure-local-endpoints.git
  cd azure-local-endpoints
  ```
```powershell
  . .\scripts\Export-AzureLocalEndpoints.ps1
  Export-AzureLocalEndpoints
  ```
## ⚡ Use cases and making sense of the output
The JSON-formatted lists of endpoints can be used for automation, documentation or compliance purposes. See the related blog post at https://blog.graa.dev/AzureLocal-Endpoints for use cases.

## 🌳 Repository

The repository structure is as follows. Each region gets its own folder.

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
## 👏 Contributions

Any contributions are welcome and appreciated!
