# Azure Local Endpoints Codified as JSON

This PowerShell tool enumerates the list of required firewall endpoints/URLs for Azure Local - for regions and OEM hardware vendors - and codifies it as JSON.

> [!IMPORTANT]  
> This tool covers required firewall endpoints as parsed from [Microsoft's documentation](https://learn.microsoft.com/en-us/azure/azure-local/concepts/firewall-requirements). There may be other requirements, such as for additional Azure services  

## 🚀 Features

- **Web UI** at https://endpoints.azurelocal.graa.dev: search, filter and select Azure Local endpoints per region or OEM vendor, export CSV.
- **Terraform generation** for Palo Alto (PAN-OS) and Cisco (Secure Firewall/FMC), in the browser, via the CLI, or as pre-generated files.
- **Static anonymous API** (plain JSON on GitHub Pages, no server): `api/v1/index.json`, `api/v1/<region|oem>/<name>.json`.
- **Pluggable generators**: one small file per firewall vendor.
- Rebuilt and deployed nightly by GitHub Actions; the evergreen `json/azure-local-endpoints.json` is still maintained.

### Pre-generated Terraform and API

```text
https://endpoints.azurelocal.graa.dev/api/v1/index.json
https://endpoints.azurelocal.graa.dev/api/v1/region/westeurope.json
https://endpoints.azurelocal.graa.dev/terraform/paloalto/region-westeurope.tf
https://endpoints.azurelocal.graa.dev/terraform/cisco/region-westeurope.tf
```

### CLI (Node.js 20+, no dependencies)

```powershell
node src/cli.js scopes
node src/cli.js list westeurope --search arc --port 443
node src/cli.js generate paloalto westeurope --prefix azlocal --source-zone trust -o out
node src/cli.js generate cisco dell
npm test          # unit tests
npm run build     # builds ./dist (UI + API + Terraform)
```

Web endpoints (80/443) become a URL category (PAN-OS) or URL group (FMC). Other ports become FQDN, service and port objects. Wildcards on non-web ports are skipped and listed in a comment. Always review generated code before applying.

### Adding a firewall vendor

Create `src/generators/<vendor>.js` exporting `{ id, name, description, generate(endpoints, options) }` returning `[{ filename, content }]`, and register it in `src/generators/index.js`. The CLI, web UI, API index and nightly build pick it up automatically.

## 🗺️ Regions
The regions currently supporting Azure Local, as of the last data refresh. The tables are maintained manually; the live list is at `api/v1/index.json`.

| Region         | Last updated         |
| -------------- | -------------------- |
| eastus | 2025-11-27 |
| westeurope | 2025-11-27 |
| australiaeast | 2025-11-27 |
| canadacentral | 2025-11-27 |
| indiacentral | 2025-11-27 |
| southeastasia | 2025-11-27 |
| japaneast | 2025-11-27 |
| southcentralus | 2025-11-27 |
| usgovvirginia | 2026-10-20 |
| usgovarizona | 2026-10-19 |

## 📦 OEM hardware vendors
The OEM hardware vendors currently supporting Azure Local.

| Vendor         | Last updated         |
| -------------- | -------------------- |
| dataon | 2025-03-19 |
| dell | 2025-03-19 |
| hpe | 2026-06-25 |
| hitachi | 2025-03-19 |
| lenovo | 2025-03-19 |

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
