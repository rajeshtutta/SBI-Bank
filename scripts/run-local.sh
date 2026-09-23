#!/usr/bin/env bash
set -e
docker compose up -d postgres
npm install
npm run db:init
npm run db:seed
npm run dev
