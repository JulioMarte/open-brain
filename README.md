# Open Brain

A modern task and memory management application powered by AI, built with React, TypeScript, Convex, and Clerk authentication.

## Features

- **AI-Powered Triage**: Intelligent task prioritization and sorting
- **Focus Mode**: Distraction-free workspace for deep work
- **Entity Management**: Organize and manage knowledge entities
- **Semantic Search**: Find information using natural language queries
- **Real-time Sync**: Data syncs instantly across all devices via Convex
- **Secure Authentication**: User authentication via Clerk with Convex integration

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Convex (fullstack TypeScript platform)
- **Authentication**: Clerk with Convex integration
- **Styling**: Tailwind CSS + shadcn/ui components
- **Routing**: Client-side routing with Clerk path-based navigation

## Getting Started

1. Clone the repository
2. Copy `.env.local` (see `.env.local.example` if available)
3. Run `npm install`
4. Run `npx convex dev` to start the backend
5. Run `npm run dev` to start the frontend

## Environment Variables

- `VITE_CLERK_PUBLISHABLE_KEY`: Clerk publishable key
- `VITE_CONVEX_URL`: Convex deployment URL
- `VITE_CONVEX_SITE_URL`: Convex site URL

## Project Structure

- `src/`: React frontend source
  - `components/`: UI components (Layout, TriageView, FocusView, etc.)
  - `providers/`: ConvexClerkProvider for auth setup
- `convex/`: Convex backend functions
  - `auth.config.ts`: Clerk/Convex authentication configuration
