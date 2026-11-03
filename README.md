<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="site/favicon-dark.svg">
    <img src="site/favicon-light.svg" alt="Azure Local Endpoints icon" width="96" height="96">
  </picture>
</p>

# Azure Local Endpoints Codified as JSON

This PowerShell tool enumerates the list of required firewall endpoints/URLs for Azure Local - for regions and OEM hardware vendors - and codifies it as JSON.

> [!IMPORTANT]  
> This tool covers required firewall endpoints as parsed from [Microsoft's documentation](https://learn.microsoft.com/en-us/azure/azure-local/concepts/firewall-requirements). There may be other requirements, such as for additional Azure services  

> [!WARNING]
> **Community-driven, unofficial tool.** Not affiliated with, endorsed by, or sponsored by Microsoft. Azure and Azure Local are trademarks of Microsoft Corporation. Data comes from Microsoft's public [Azure Local firewall documentation](https://learn.microsoft.com/en-us/azure/azure-local/concepts/firewall-requirements) and [AzureStack-Tools](https://github.com/Azure/AzureStack-Tools/tree/master/HCI). Always verify generated rules against the official documentation before deploying. Provided as-is, without warranty.

> [!NOTE]
> https://endpoints.azl.graa.dev is a **demo site** provided as-is, without any guarantee of availability. For production use, fork the repository and host your own copy (see Howto below).

## 🚀 Features

- **Web UI** at https://endpoints.azl.graa.dev (demo site): search, filter and select Azure Local endpoints per region or OEM vendor, export CSV.
- **Terraform generation** for Palo Alto (PAN-OS), Cisco (Secure Firewall/FMC), VMware NSX, Fortinet (FortiGate) and Check Point, in the browser, via the CLI, or as pre-generated files.
- **Static anonymous API** (plain JSON on GitHub Pages, no server): `api/v1/index.json`, `api/v1/<region|oem>/<name>.json`.
- **Pluggable generators**: one small file per firewall vendor.
- Rebuilt and deployed nightly by GitHub Actions; the evergreen `json/azure-local-endpoints.json` is still maintained.

### Pre-generated Terraform and API

```text
https://endpoints.azl.graa.dev/api/v1/index.json
https://endpoints.azl.graa.dev/api/v1/region/westeurope.json
https://endpoints.azl.graa.dev/terraform/paloalto/region-westeurope.tf      (panos provider 2.x)
https://endpoints.azl.graa.dev/terraform/paloalto-v1/region-westeurope.tf   (panos provider 1.x)
https://endpoints.azl.graa.dev/terraform/cisco/region-westeurope.tf
https://endpoints.azl.graa.dev/terraform/nsx/region-westeurope.tf
```

### CLI (Node.js 20+, no dependencies)

```powershell
node src/cli.js scopes
node src/cli.js list westeurope --search arc --port 443
node src/cli.js generate paloalto westeurope --prefix azlocal --source-zone trust -o out
node src/cli.js generate cisco dell
npm test          # unit tests
npm run validate:terraform   # terraform fmt -check + validate on generated files (needs terraform; uses the resolved provider versions)
npm run build     # builds ./dist (UI + API + Terraform); set AZL_OFFLINE=1 to skip the provider registry lookup
```

Web endpoints (80/443) become a URL category (PAN-OS) or URL group (FMC). Other ports become FQDN, service and port objects. Wildcards on non-web ports are skipped and listed in a comment. Always review generated code before applying.

### Provider versions

At build time the newest stable release of each Terraform provider is looked up in the Terraform Registry and rendered as a `~> MAJOR.MINOR` constraint in the generated `required_providers` block (shown in the header comment and in `api/v1/providers.json`). Only releases inside a major line a generator was written for are used; a newer major is reported as a build warning but not used until the generator is updated. If the registry lookup fails, the pinned default is used and the build still succeeds. The CI step `npm run validate:terraform` runs `terraform fmt` and `terraform validate` against the resolved versions and fails the workflow if a new provider release breaks the generated syntax.

**Palo Alto supports both provider lines.** The `panos` provider 2.x renamed its resources (`panos_address`, `panos_service`, `panos_security_policy_rules`) and added a `location` attribute, so the generator produces two variants: 2.x (default, with a `location` variable that works for a firewall vsys, a Panorama device group or `shared`; requires Terraform 1.8+) and 1.x (legacy, `terraform/paloalto-v1/`). The web UI has a "Provider version" dropdown, and the CLI takes `--provider-major 1|2`. A generator declares such variants with a `variants` array (the first, flagged `default`, keeps the plain `terraform/<vendor>/` path).

Dependabot (`.github/dependabot.yml`) opens weekly grouped update PRs for GitHub Actions, npm and the Docker base images.

### Container image (self-contained, air-gapped friendly)

Every successful nightly run on `main` (after the export step has committed any new data) builds a small image with the whole site baked in: the UI, `api/v1/*.json`, the generated Terraform for every vendor and the export code. It is published to GHCR for `linux/amd64` and `linux/arm64`:

```text
ghcr.io/erikgraa/azure-local-endpoints:latest        newest build
ghcr.io/erikgraa/azure-local-endpoints:2026-11-03    the nightly build of that day (UTC)
ghcr.io/erikgraa/azure-local-endpoints:sha-abc1234   the exact commit
```

```powershell
docker run -d --name azure-local-endpoints -p 8080:8080 ghcr.io/erikgraa/azure-local-endpoints:latest
# open http://localhost:8080 (API: /api/v1/index.json, Terraform: /terraform/)
```

- **Non-root, no runtime network:** it is `nginx-unprivileged` (uid 101, port 8080). Nothing is fetched at runtime, so it works in air-gapped networks: pull or `docker save`/`docker load` the image once and run it anywhere. The page only links out to Microsoft's documentation.
- **Data freshness:** the UI shows "Data last updated" and "fetched" for the selected scope, and the generated Terraform and JSON carry the same dates. The image labels `org.opencontainers.image.created` (build time), `org.opencontainers.image.revision` (commit) and `dev.graa.azure-local-endpoints.data-updated` (newest data date) show it without starting the container: `docker inspect --format '{{json .Config.Labels}}' <image>`. Pull a newer tag to refresh; running containers never change.
- **Health and caching:** `GET /healthz` returns `ok` (used by the Docker `HEALTHCHECK`). Files are served with `Cache-Control: no-cache` (clients revalidate with ETag), icons for a day, and CORS is open for the public API and Terraform files.
- **Build it yourself:** `docker build -t azure-local-endpoints .` (add `--build-arg AZL_OFFLINE=1` to skip the Terraform Registry lookup of provider versions). Pull requests that touch the image run a build and smoke test (`scripts/smoke-test-image.sh`).
- **One-time setting:** a new GHCR package is private by default; make it public under the package settings (Package settings → Change visibility) if you want anonymous pulls.

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
│   package.json
│   Dockerfile                    self-contained image (static site on nginx-unprivileged)
│
├───.github
│   ├───dependabot.yml
│   └───workflows
│           update.yml            nightly: export JSON, test, build, deploy to Pages, publish image
│           docker-build.yml      PR check: build + smoke test the image
│
├───docker
│       nginx.conf                server config baked into the image
├───json                          source data (written by the PowerShell script)
│   │   azure-local-endpoints.json 🍏
│   │
│   ├───oem 📦
│   │   └───<vendor>
│   │           azure-local-endpoints-<vendor>.json
│   │           azure-local-endpoints-<vendor>-compressed.json
│   │
│   └───regions 🗺️
│       └───<region>
│               azure-local-endpoints-<region>.json
│               azure-local-endpoints-<region>-compressed.json
│
├───scripts
│       Export-AzureLocalEndpoints.ps1
│       smoke-test-image.sh       checks a built image serves the site
│
├───site
│       index.html                static web UI
│
├───src
│   │   cli.js                    command line tool
│   │   endpoints.js              loads and normalizes the JSON
│   │   build-site.js             builds ./dist (UI, API, Terraform)
│   │
│   └───generators                one file per firewall vendor
│           index.js
│           paloalto.js
│           cisco.js
│           nsx.js
│           fortinet.js
│           checkpoint.js
│           util.js
│
└───test
        generators.test.js
```
## 👏 Contributions

Any contributions are welcome and appreciated!
