# ShopLite

ShopLite is a backend e-commerce application built as three small Node.js
microservices. It demonstrates JWT authentication, service-to-service HTTP
communication, Docker, Kubernetes, and GitHub Actions CI/CD.

There is no frontend. Use curl or Postman to exercise the APIs.

## Architecture

```text
Client
  |
  v
NGINX Gateway
  |-- /api/users    --> user-service
  |-- /api/products --> product-service
  |-- /api/orders   --> order-service
                              |
                              +-- HTTP --> product-service
                              +-- MongoDB (orders database)
```

The services use one MongoDB server with a separate database for each service.
All services verify JWTs with the same `JWT_SECRET`.

## Repository structure

```text
ShopLite/
├── services/
│   ├── user-service/
│   ├── product-service/
│   └── order-service/
├── gateway/
├── k8s/
├── .github/
│   └── workflows/
├── .editorconfig
├── .gitignore
└── README.md
```

## Services

| Service | Local port | Responsibility |
| --- | ---: | --- |
| user-service | 3001 | Registration, login, JWT authentication |
| product-service | 3002 | Product catalog and stock |
| order-service | 3003 | Orders and Product Service communication |
| NGINX gateway | 8080 | Public API routing |

## Technology

- Node.js 20 and Express
- MongoDB and Mongoose
- JWT and bcrypt authentication
- Axios for service-to-service requests
- Jest, Supertest, and ESLint
- Docker and Docker Compose
- Kubernetes with kind or minikube
- GitHub Actions and GitHub Container Registry

## Module progress

- [x] Module 1: Repo and Git setup
- [x] Module 2: User Service
- [x] Module 3: Product Service
- [x] Module 4: Order Service
- [ ] Module 5: Tests
- [ ] Module 6: Dockerize
- [ ] Module 7: Docker Compose
- [ ] Module 8: GitHub Actions CI
- [ ] Module 9: Push images to GHCR
- [ ] Module 10: Kubernetes manifests
- [ ] Module 11: Deploy from the pipeline
- [ ] Module 12: Polish

## Module 1: Repository setup

### Prerequisites

- Git
- Node.js 20
- Docker
- A GitHub account for the remote repository and pull requests

### Git workflow

Work is done on feature branches and merged through pull requests:

```powershell
git switch main
git pull
git switch -c feature/<name>
# make changes and verify them
git add .
git commit -m "feat: describe the change"
git push -u origin feature/<name>
# open a pull request, wait for checks, and merge
git switch main
git pull
git branch -d feature/<name>
```

Use these commit prefixes:

- `feat:` for a new feature
- `fix:` for a bug fix
- `chore:` for setup or tooling
- `docs:` for documentation
- `test:` for tests

### GitHub branch protection

After pushing this repository to GitHub, protect `main` in:
`Settings` → `Branches` → `Add branch ruleset` (or branch protection rule).

Enable:

- Require a pull request before merging
- Block force pushes
- Require status checks once Module 8 workflows exist

The local repository cannot enforce GitHub-hosted branch protection by itself.

## Planned API routes

| Service | Routes |
| --- | --- |
| user-service | `POST /users/register`, `POST /users/login`, `GET /users/me`, `GET /health` |
| product-service | `GET /products`, `GET /products/:id`, `POST /products`, `PUT /products/:id`, `PATCH /products/:id/stock`, `GET /health` |
| order-service | `POST /orders`, `GET /orders`, `GET /orders/:id`, `GET /health` |

## User Service

The User Service is in `services/user-service`. Copy `.env.example` to `.env`,
start a local MongoDB instance, and run:

```powershell
cd services/user-service
npm install
npm start
```

It listens on port `3001` by default and exposes registration, login, the
authenticated `/users/me` route, and `/health`.

## Product Service

The Product Service is in `services/product-service`. Copy `.env.example` to
`.env`, start a local MongoDB instance, and run:

```powershell
cd services/product-service
npm install
npm start
```

It listens on port `3002` by default. Product listing and retrieval are public;
creating, updating, and changing stock require a Bearer JWT signed with the
same `JWT_SECRET` used by the User Service. Stock can be set with
`{ "stock": 10 }` or reduced atomically with `{ "quantity": 2 }`.

## Order Service

The Order Service is in `services/order-service`. Copy `.env.example` to
`.env`, start MongoDB and the Product Service, and run:

```powershell
cd services/order-service
npm install
npm start
```

It listens on port `3003` by default. `POST /orders` verifies the caller's JWT,
gets the product price, asks Product Service to atomically reduce stock, and
saves the order. Product Service failures return `404` for a missing product,
`409` for insufficient stock, and `503` for an unavailable or timed-out
Product Service.

## Next step

Module 5 will add the complete cross-service test and linting workflow.
