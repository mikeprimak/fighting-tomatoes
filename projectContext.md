Fighting Tomatoes – Project Context
1. Project Overview

Fighting Tomatoes is a React Native + Node.js application for rating combat sports fights — similar to “Rotten Tomatoes” but for fights.
Users can browse upcoming/past events, rate fights on a 1–10 scale, and interact with reviews, tags, and community features.

Business Goal

Build an enterprise-ready app positioned for potential acquisition by organizations like UFC or ESPN.

2. Architecture & Design Patterns
Project Structure
packages/
├── backend/     # Fastify API server (Node.js, TypeScript)
├── mobile/      # React Native Expo app
└── shared/      # Shared TypeScript types

Database Design

Users → Sessions (1:many for refresh tokens)

Organizations → Events → Fights (hierarchical)

Fights ↔ Fighters (many-to-many)

Users → FightRatings ← Fights (junction table)

API Patterns

RESTful endpoints with consistent response format: { error, code, details? }

Centralized error handling with machine-readable codes

JWT authentication middleware

React Query for client-side caching

Mobile Architecture

File-based routing (Expo Router)

Screen-level components in app/

Shared UI components in components/

Auth state via React Context

Type-safe API calls with shared TS interfaces

Code Standards

TypeScript strict mode everywhere

Functional React components with hooks

ESLint + Prettier formatting + Husky hooks

Consistent error/loading state patterns

3. Key Architectural Decisions
Database

Single PostgreSQL database (replaces legacy MySQL/MD5 schema)

UUID v4 primary keys via Prisma

Foreign key constraints with cascading behaviors

20+ interconnected tables, seeded with realistic scenarios

Authentication & Security

JWT dual-token strategy

Access tokens: 15 minutes

Refresh tokens: 7 days (DB-stored for revocation)

Password hashing: bcrypt (12 rounds) with regex complexity rules

Email verification: crypto-based tokens, 24-hour expiry (dev bypass)

Rate limiting: 5 attempts / 15 minutes (Redis-ready)

CORS: environment-based origin allowlists

Validation & Middleware

Zod schemas for input validation + OpenAPI documentation

Layered middleware (auth, validation, rate limiting, CORS)

Features

Gamification system: points, activities, levels

Tagging system: category + rating-based logic

Social features: reviews, votes, follows, notifications

Analytics foundation: recommendation scoring engine

Scalability

Stateless JWT tokens for horizontal scaling

Prisma connection pooling

Redis-ready rate limiting

Structured logging & monitoring hooks

Enterprise Readiness

Authentication event auditing

Provider-agnostic OAuth architecture (Google/Apple planned)

Admin-level permissions system

4. Tech Stack & Dependencies
Frontend (Mobile)

Framework: React Native (Expo managed workflow)

Navigation: Expo Router

State Management: React Query + Auth Context

UI: Custom components with dark/light theme

Storage: Expo SecureStore for tokens

Backend (API)

Runtime: Node.js + TypeScript

Framework: Fastify (chosen for performance & TS support)

Database: PostgreSQL with Prisma ORM

Auth: JWT with refresh token rotation

Validation: Zod schemas

Development Tools

Package Manager: pnpm with workspaces

Linting: ESLint + Prettier + Husky

Testing: Jest (light coverage so far)

Build: TypeScript compiler

Local Dev: nodemon, ts-node, dotenv

Key Dependencies
{
  "expo": "54.0.9",
  "react-native": "0.81.4",
  "prisma": "5.22.0",
  "fastify": "5.x",
  "@tanstack/react-query": "4.41.0"
}

5. Current Development Context
Current Sprint

Focus: API infrastructure & core endpoints

Last Completed: Auth system, DB schema, and shared TypeScript types

Recent Completions

Modern PostgreSQL schema with UUIDs & foreign keys

Gamification, tagging, and analytics foundation

JWT-based authentication system with refresh tokens

User registration & login flows

Email verification + password reset flows

Rate limiting & security middleware

Input validation (Zod) + comprehensive error handling

Basic Fastify server running with health/status endpoints

Next Priorities

Implement fights/events/fighters/users/reviews/tags API routes

Integrate authentication middleware

Connect mobile app to new API endpoints

Build mobile API service layer

Add UI for tag selection + fight reviews

Implement WebSocket for real-time fight updates

Success Criteria

Complete fights API with ratings, tagging, reviews

At least one mobile screen connected to API

Email verification flow working end-to-end

Technical Debt

Limited automated tests

No offline support yet

Mobile API layer not fully implemented

6. Implementation Details
Database Schema (excerpt)
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  username  String   @unique
  // ...
}

model Fight {
  id          String  @id @default(cuid())
  fightOrder  Int
  isTitle     Boolean @default(false)
  // ...
}

API Reference (Core Endpoints)
Authentication

POST /api/auth/register

POST /api/auth/login

POST /api/auth/refresh

GET /api/auth/profile

Fights

GET /api/fights (with query params)

GET /api/fights/:id

POST /api/fights/:id/rate

PUT /api/fights/:id/rate

Events

GET /api/events

GET /api/events/:id

File References

Backend

packages/backend/prisma/schema.prisma – complete DB schema

packages/backend/src/routes/*.ts – API routes (fights, events, fighters, users, reviews, tags)

packages/backend/src/middleware/auth.ts – enhanced auth middleware

Frontend

packages/mobile/app/(tabs)/fights.tsx – rating screen

packages/mobile/store/AuthContext.tsx – auth state

packages/shared/src/types/index.ts – shared TypeScript types

7. Last Updated

September 21, 2025 – API infrastructure completed, comprehensive route implementation next.