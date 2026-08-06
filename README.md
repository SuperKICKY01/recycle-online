# Recycle Online

Multi-tenant management system for recycling / scrap-buying shops.
Records real-money purchase transactions — data integrity is paramount.

- `server/`  — FastAPI + PostgreSQL API (single source of truth, all business rules)
- `mobile/`  — React Native + Expo (yard floor, offline-first purchase bills)
- `desktop/` — Electron + React + TypeScript (back office, thermal slip printing)

New sessions start with START_HERE.md.
See CLAUDE.md for the full rules, architecture, and scope.
