# ShopLite

![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-API-000000?logo=express&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Kubernetes](https://img.shields.io/badge/Kubernetes-kind-326CE5?logo=kubernetes&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

ShopLite is a production-oriented backend e-commerce demonstration built from
three independently deployable Node.js microservices. It covers the complete
path from application code to container images, automated tests, GitHub Actions,
GitHub Container Registry, and Kubernetes deployment.

The project has no browser frontend. Use the HTTP API through the NGINX gateway
with `curl`, PowerShell, Postman, or another API client.

## What the project does

ShopLite provides:

- User registration, login, password hashing, and JWT authentication.
- A product catalog with CRUD operations and atomic stock reduction.
- Authenticated order creation with price lookup and stock reservation.
- HTTP communication from Order Service to Product Service.
- Separate MongoDB databases for users, products, and orders.
- A single NGINX entry point for local and containerized API access.
- Automated testing, linting, image publishing, and Kubernetes smoke testing.

When a customer creates an order, Order Service verifies the JWT, requests the
product and price from Product Service, asks Product Service to reduce stock,
and saves the order only after those operations succeed. Product failures are
mapped to useful API responses such as `404`, `409`, and `503`.

## Architecture

```text
Client
  |
  v
NGINX Gateway :8080
  |-- /api/users    --> User Service :3001 --> MongoDB (shoplite_users)
  |-- /api/products --> Product Service :3002 --> MongoDB (shoplite_products)
  `-- /api/orders   --> Order Service :3003
                              |-- HTTP --> Product Service
                              `-- MongoDB (shoplite_orders)
```

All services use the same `JWT_SECRET` to verify tokens. Services communicate
by name on the Docker Compose network and by Kubernetes Service DNS in a
cluster. Only the gateway is exposed to the host in the default Compose setup.

## Project metrics

| Area | Current implementation |
| --- | --- |
| Application services | 3 independently deployable services |
| Public entry point | 1 NGINX gateway on port `8080` |
| Automated tests | 35 Jest/Supertest tests |
| Datastores | MongoDB with 3 service-specific databases |
| Service replicas in Kubernetes | 2 per application service |
| Container security | Multi-stage images running as non-root `node` |
| CI workflows | 3 service-specific pull-request workflows |
| Image publishing | 3 GHCR workflows with SHA and `latest` tags |
| Deployment pipeline | 1 kind-based Kubernetes build/deploy/smoke-test workflow |
| Health checks | Docker healthchecks and Kubernetes liveness/readiness probes |

## Technology stack

- **Runtime and API:** Node.js 20, Express
- **Data:** MongoDB 7, Mongoose
- **Security:** JWT, bcryptjs, shared authentication middleware
- **Service communication:** Axios with timeout and forwarded authorization
- **Quality:** Jest, Supertest, MongoDB Memory Server, ESLint
- **Containers:** Docker, Docker Compose, NGINX
- **Platform:** Kubernetes, kind, Kustomize, NGINX Ingress
- **Automation:** GitHub Actions, GitHub Container Registry (GHCR)

## Repository structure

```text
ShopLite/
├── services/
│   ├── user-service/       # Registration, login, and identity
│   ├── product-service/    # Catalog and inventory
│   └── order-service/      # Orders and service-to-service flow
├── gateway/
│   └── nginx.conf          # Public API routing
├── k8s/                    # Kubernetes resources and Kustomize entry point
├── .github/workflows/      # CI, image publishing, and deployment workflows
├── docker-compose.yml      # Local multi-container environment
├── package.json            # Root test and lint commands
└── README.md
```

## Prerequisites

For the recommended local workflow, install:

- Git
- Node.js 20 or newer
- Docker Desktop with the Linux engine running
- PowerShell, Bash, or another shell

For Kubernetes work, also install:

- `kubectl`
- `kind` (for local manual deployment)

## Quick start with Docker Compose

This is the easiest way to run the complete application locally.

### 1. Clone the repository

```powershell
git clone https://github.com/sonusoni-314/ShopLite.git
cd ShopLite
```

### 2. Create a local secret

The Compose configuration intentionally has no insecure default JWT secret.
Create a root `.env` file and keep it untracked:

```powershell
@"
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")
JWT_EXPIRES_IN=1h
"@ | Set-Content .env
```

Never commit `.env`, access tokens, database credentials, or private keys.
Use the provided `.env.example` files only as configuration templates.

### 3. Build and start the stack

```powershell
docker compose up --build
```

The first startup may take a few minutes while images build and MongoDB
initializes. Compose waits for required healthchecks before starting dependent
services.

### 4. Verify the gateway

Open a second terminal and run:

```powershell
Invoke-RestMethod http://localhost:8080/api/users/health
Invoke-RestMethod http://localhost:8080/api/products/health
Invoke-RestMethod http://localhost:8080/api/orders/health
```

The expected response from each health endpoint is a successful JSON response.
The root URL (`http://localhost:8080/`) intentionally has no frontend route and
may return an NGINX `404`.

### 5. Stop the stack

```powershell
docker compose down
```

Add `-v` only when you intentionally want to remove the named MongoDB volume:

```powershell
docker compose down -v
```

## API reference

All examples below use the gateway base URL:

```text
http://localhost:8080
```

| Service | Method | Route | Authentication |
| --- | --- | --- | --- |
| Users | `POST` | `/api/users/register` | Public |
| Users | `POST` | `/api/users/login` | Public |
| Users | `GET` | `/api/users/me` | Bearer JWT |
| Users | `GET` | `/api/users/health` | Public |
| Products | `GET` | `/api/products` | Public |
| Products | `GET` | `/api/products/:id` | Public |
| Products | `POST` | `/api/products` | Bearer JWT |
| Products | `PUT` | `/api/products/:id` | Bearer JWT |
| Products | `PATCH` | `/api/products/:id/stock` | Bearer JWT |
| Products | `GET` | `/api/products/health` | Public |
| Orders | `POST` | `/api/orders` | Bearer JWT |
| Orders | `GET` | `/api/orders` | Bearer JWT |
| Orders | `GET` | `/api/orders/:id` | Bearer JWT |
| Orders | `GET` | `/api/orders/health` | Public |

### Example API flow

Register and log in:

```powershell
$base = "http://localhost:8080"

$register = @{
  name = "Demo User"
  email = "demo@example.com"
  password = "Password123!"
} | ConvertTo-Json

Invoke-RestMethod "$base/api/users/register" `
  -Method Post -ContentType "application/json" -Body $register

$login = Invoke-RestMethod "$base/api/users/login" `
  -Method Post -ContentType "application/json" -Body $register

$headers = @{ Authorization = "Bearer $($login.token)" }
```

Create a product and place an order:

```powershell
$product = @{
  name = "Mechanical Keyboard"
  description = "Compact wireless keyboard"
  price = 79.99
  stock = 10
} | ConvertTo-Json

$created = Invoke-RestMethod "$base/api/products" `
  -Method Post -Headers $headers `
  -ContentType "application/json" -Body $product

$order = @{ items = @(@{ productId = $created._id; quantity = 1 }) } |
  ConvertTo-Json -Depth 5

Invoke-RestMethod "$base/api/orders" `
  -Method Post -Headers $headers `
  -ContentType "application/json" -Body $order
```

## Development and validation

The root scripts run all service checks:

```powershell
npm install
npm test
npm run lint
```

The test suites cover authentication, protected routes, product CRUD,
inventory behavior, order ownership, Product Service failures, timeouts, and
JWT forwarding. Order Service tests mock Axios, so they do not require a
running Product Service.

To work on one service:

```powershell
cd services/user-service
npm ci
npm test
npm run lint
```

The same pattern applies to `product-service` and `order-service`.

## Docker images

Each service has a multi-stage Dockerfile that installs production
dependencies in the runtime stage, runs as the non-root `node` user, exposes
the service port, and defines a `/health` check.

Build images independently:

```powershell
docker build -t shoplite/user-service:local services/user-service
docker build -t shoplite/product-service:local services/product-service
docker build -t shoplite/order-service:local services/order-service
```

## CI/CD workflow

### Pull request CI

The three service workflows run when their service changes:

- `.github/workflows/user-service.yml`
- `.github/workflows/product-service.yml`
- `.github/workflows/order-service.yml`

Each workflow checks out the code, installs Node.js dependencies with `npm ci`,
runs linting and tests, and builds the service Docker image. Configure these
checks as required status checks for protected `main`.

### Image publishing

After a service change reaches `main`, the corresponding publishing workflow
builds and pushes two GHCR tags:

```text
ghcr.io/sonusoni-314/shoplite-<service>:<commit-sha>
ghcr.io/sonusoni-314/shoplite-<service>:latest
```

The immutable commit-SHA tag makes each deployment traceable and allows a
specific version to be selected during a rollback. Publishing authenticates
with the repository-provided `GITHUB_TOKEN`; no registry password is stored in
the repository.

### Kubernetes deployment

The deployment workflow
([`deploy-kind.yml`](.github/workflows/deploy-kind.yml)) runs on relevant
changes merged to `main` and:

1. Builds and pushes all three service images.
2. Creates a temporary kind cluster.
3. Installs the NGINX Ingress Controller.
4. Creates runtime-only GHCR and application secrets.
5. Applies the Kustomize manifests.
6. Sets Deployments to the immutable commit-SHA images.
7. Waits for MongoDB and application rollouts.
8. Port-forwards User Service and smoke-tests `/health`.

The successful deployment run is available in
[GitHub Actions](https://github.com/sonusoni-314/ShopLite/actions).
The kind cluster exists only for the duration of the GitHub-hosted job; GHCR
images remain available after the job ends.

## Kubernetes manifests

The `k8s/` directory defines:

- A dedicated `shoplite` namespace.
- ConfigMap-based non-secret configuration.
- Runtime-created Secret values for JWT and MongoDB URIs.
- MongoDB Deployment, Service, and PersistentVolumeClaim.
- Two-replica Deployments and ClusterIP Services for each application service.
- CPU and memory requests/limits.
- Liveness and readiness probes on `/health`.
- NGINX Ingress routes for users, products, and orders.

For a manual deployment, install the NGINX Ingress Controller first, replace
the `OWNER` placeholders in the service manifests, create the runtime secrets,
and then run:

```powershell
kubectl apply -k k8s/
kubectl get pods -n shoplite
kubectl get ingress -n shoplite
```

Do not commit generated Kubernetes secrets. The automated workflow creates them
at runtime.

## Git workflow and security

Use feature branches and pull requests instead of committing directly to
`main`:

```powershell
git switch main
git pull
git switch -c feature/<name>
# make and validate changes
git add .
git commit -m "feat: describe the change"
git push -u origin feature/<name>
```

Protect `main` in GitHub repository settings by requiring pull requests,
successful service CI checks, and blocking force pushes. The local repository
cannot enforce GitHub branch protection by itself.

Security practices included in this project:

- Secrets are excluded by `.gitignore`.
- Compose requires an explicitly supplied `JWT_SECRET`.
- Kubernetes JWT and registry secrets are generated at runtime.
- Images run as a non-root user.
- Service-to-service requests have a timeout.
- Authentication is required for user, product-management, and order routes.

## Future improvements

1. **Production observability:** add structured JSON logs, request correlation
   IDs, Prometheus metrics, and centralized dashboards for latency, errors, and
   inventory operations.
2. **Production deployment and resilience:** move from the temporary kind
   demonstration to a managed or k3s cluster, add an external secret manager,
   and introduce a message broker or outbox pattern for reliable order and
   inventory events.

## Project status

All planned modules are implemented:

- [x] Repository and Git foundation
- [x] User Service
- [x] Product Service
- [x] Order Service and service-to-service communication
- [x] Automated tests and linting
- [x] Dockerfiles and Docker Compose
- [x] GitHub Actions CI
- [x] GHCR image publishing
- [x] Kubernetes manifests
- [x] Automated kind deployment and smoke test
- [x] Project documentation and polish
