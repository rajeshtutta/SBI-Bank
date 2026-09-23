$ErrorActionPreference = "Stop"
docker compose up -d postgres
npm install
npm run db:init
npm run db:seed
npm run dev
