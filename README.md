# SecureBank NetBanking — Node.js Real-Time Banking Demo

> Educational project inspired by common Indian retail internet-banking workflows. This is **not SBI software**, does not use SBI branding, and must never be connected to real SBI credentials, accounts, cards, OTPs, or payment rails.

## Features

- Customer registration and login
- Secure password hashing with bcrypt
- Session-based authentication with HTTP-only cookies
- CSRF protection for state-changing forms
- Account dashboard and balance
- Beneficiary management
- Internal fund transfer
- Transaction history
- PostgreSQL database transactions and row locking
- Audit logging
- Rate limiting, Helmet security headers, input validation
- Docker Compose for local PostgreSQL
- Health endpoint
- Seed/demo data
- Production-oriented folder structure

## Stack

Node.js + Express + EJS + PostgreSQL + Docker

## Prerequisites

- Node.js 20+ (LTS recommended)
- npm
- Docker Desktop (recommended)

## 1. Start PostgreSQL

```bash
docker compose up -d postgres
docker compose ps
```

## 2. Install dependencies

```bash
npm install
```

## 3. Configure environment

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Linux/macOS:

```bash
cp .env.example .env
```

For local development the defaults work with Docker PostgreSQL.

## 4. Create schema and seed demo data

```bash
npm run db:init
npm run db:seed
```

Demo login:

- Customer ID: `demo`
- Password: `Demo@12345`

The seed creates two demo accounts. Do not use this password anywhere outside the demo.

## 5. Start application

```bash
npm run dev
```

Open:

http://localhost:3000

## Useful commands

```bash
npm start
npm run dev
npm run db:init
npm run db:seed
npm test
docker compose logs -f postgres
docker compose down
```

## Main API routes

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /dashboard`
- `GET /api/accounts`
- `GET /api/transactions`
- `POST /api/beneficiaries`
- `GET /transfer`
- `POST /transfer`

## Banking flow

Login -> Dashboard -> Add beneficiary -> Transfer -> PostgreSQL transaction -> Debit sender -> Credit receiver -> Create transaction record -> Audit event -> Updated balances.

## Production warning

This project is a training implementation. A production bank would require substantially more controls: HSM-backed key management, hardware/managed secrets, MFA/step-up authentication, device binding, fraud detection, maker-checker workflows, transaction signing, immutable audit storage, WAF/DDoS protection, centralized SIEM, disaster recovery, formal threat modeling, penetration testing, PCI/financial regulatory controls where applicable, and integration with regulated payment systems.

Never collect real banking credentials or OTPs in this demo.
