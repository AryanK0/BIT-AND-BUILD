# BIT & BUILD

A college hackathon management platform.

**Current:** React frontend with landing page, role-based portal views, organizer-managed
team registration, generated team credentials, submissions, judging, and announcements.
Supabase is used for persistence when configured.

## Visual identity

BIT & BUILD is a serious, professional hackathon platform with a subtle
Spider-Verse-inspired aesthetic: dark background, red/pink accents, white
typography, and understated geometric "web strand" linework. The theme is a
visual layer, not a children's superhero skin — the platform should read as
a premium college tech event, not a cartoon.

## Project structure

```
BIT-AND-BUILD/
├── client/          React + Vite frontend (Phase 1)
│   └── src/
│       ├── components/   Reusable UI pieces (Navbar, Button, etc.)
│       ├── pages/         Route-level screens
│       ├── layouts/       Shared page/dashboard scaffolding
│       ├── styles/        Plain CSS, organized by scope
│       └── assets/        Static assets
├── server/          Reserved for Phase 2 (backend/API/auth) — empty for now
└── README.md
```

## Running the frontend

```bash
cd client
npm install
npm run dev
```

## Supabase setup

1. Create a Supabase project.
2. Run `client/supabase/supabase_migration.sql` in the Supabase SQL Editor.
3. Copy `client/.env` from the example values and set `VITE_SUPABASE_URL` and
    `VITE_SUPABASE_ANON_KEY`.
4. Log in as the organizer, open **All Teams**, and register each team.
5. Give each team its generated Team Login ID and password. Participants use
    those credentials; participant self-signup is disabled.

Organizer and judge demo credentials remain configured in the frontend for the
current prototype. Move those roles to Supabase Auth or server-side secrets
before production deployment.

## Phase roadmap

- **Phase 1 (this phase):** Frontend foundation, routing, visual identity,
  placeholder dashboards.
- **Phase 2+:** Authentication, backend APIs, database, judging logic,
  submissions, organizer tooling. Not implemented yet.
