# Tech Stack & Dependencies

## Frontend (Mobile)
- **Framework**: React Native with Expo 54.0.9
- **Navigation**: Expo Router (file-based routing)
- **State Management**: React Query + Auth Context
- **UI**: Custom components with dark/light theme support
- **Storage**: Expo SecureStore for tokens

## Backend (API)
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM 5.22.0
- **Auth**: JWT tokens with refresh token rotation
- **Validation**: Currently minimal, needs Zod integration

## Development Tools
- **Package Manager**: pnpm with workspaces
- **Linting**: ESLint + Prettier with Husky hooks
- **Testing**: Jest (configured but minimal tests)
- **Build**: TypeScript compilation

## Key Dependencies
```json
{
  "expo": "54.0.9",
  "react-native": "0.81.4",
  "prisma": "5.22.0",
  "express": "4.21.2",
  "@tanstack/react-query": "4.41.0"
}