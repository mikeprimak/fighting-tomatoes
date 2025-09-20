@echo off
echo 🍅 Setting up Fighting Tomatoes mobile app project structure...

REM Create main project directory structure
mkdir .github\workflows 2>nul
mkdir docs 2>nul

REM Packages structure
mkdir packages\mobile\app 2>nul
mkdir packages\mobile\app\auth 2>nul
mkdir packages\mobile\app\tabs 2>nul
mkdir packages\mobile\assets 2>nul
mkdir packages\mobile\components\ui 2>nul
mkdir packages\mobile\components\screens 2>nul
mkdir packages\mobile\constants 2>nul
mkdir packages\mobile\hooks 2>nul
mkdir packages\mobile\services 2>nul
mkdir packages\mobile\store 2>nul
mkdir packages\mobile\types 2>nul
mkdir packages\mobile\utils 2>nul

mkdir packages\backend\src 2>nul
mkdir packages\backend\src\controllers 2>nul
mkdir packages\backend\src\middleware 2>nul
mkdir packages\backend\src\routes 2>nul
mkdir packages\backend\src\services 2>nul
mkdir packages\backend\src\types 2>nul
mkdir packages\backend\src\utils 2>nul
mkdir packages\backend\tests 2>nul
mkdir packages\backend\prisma\migrations 2>nul
mkdir packages\backend\uploads 2>nul

mkdir packages\shared\src\types 2>nul
mkdir packages\shared\src\utils 2>nul

REM Create empty files - Mobile app structure (Expo Router)
echo. > packages\mobile\app\_layout.tsx
echo. > packages\mobile\app\+not-found.tsx
echo. > packages\mobile\app\auth\login.tsx
echo. > packages\mobile\app\auth\register.tsx
echo. > packages\mobile\app\tabs\index.tsx
echo. > packages\mobile\app\tabs\profile.tsx
echo. > packages\mobile\app\tabs\fights.tsx
echo. > packages\mobile\app\tabs\events.tsx

REM Backend structure
echo. > packages\backend\src\app.ts
echo. > packages\backend\src\server.ts
echo. > packages\backend\src\controllers\auth.controller.ts
echo. > packages\backend\src\controllers\fights.controller.ts
echo. > packages\backend\src\controllers\events.controller.ts
echo. > packages\backend\src\routes\auth.routes.ts
echo. > packages\backend\src\routes\fights.routes.ts
echo. > packages\backend\src\routes\events.routes.ts
echo. > packages\backend\src\routes\index.ts
echo. > packages\backend\src\middleware\auth.middleware.ts
echo. > packages\backend\src\middleware\validation.middleware.ts
echo. > packages\backend\src\services\auth.service.ts
echo. > packages\backend\src\services\fights.service.ts
echo. > packages\backend\src\services\events.service.ts
echo. > packages\backend\prisma\seed.ts

REM Shared types
echo. > packages\shared\src\types\auth.ts
echo. > packages\shared\src\types\fights.ts
echo. > packages\shared\src\types\events.ts
echo. > packages\shared\src\types\api.ts
echo. > packages\shared\src\types\index.ts
echo. > packages\shared\src\utils\validation.ts
echo. > packages\shared\src\utils\constants.ts

REM Configuration files
echo. > .env.example
echo. > .gitignore
echo. > .nvmrc
echo. > README.md
echo. > docker-compose.yml
echo. > package.json
echo. > pnpm-workspace.yaml
echo. > turbo.json
echo. > packages\mobile\package.json
echo. > packages\mobile\app.json
echo. > packages\mobile\babel.config.js
echo. > packages\mobile\tsconfig.json
echo. > packages\mobile\expo-env.d.ts
echo. > packages\backend\package.json
echo. > packages\backend\tsconfig.json
echo. > packages\backend\jest.config.js
echo. > packages\backend\Dockerfile
echo. > packages\backend\.env.example
echo. > packages\shared\package.json
echo. > packages\shared\tsconfig.json

REM Documentation
echo. > docs\API.md
echo. > docs\DEPLOYMENT.md
echo. > docs\DEVELOPMENT.md

echo ✅ Project structure created successfully!
echo.
echo Next steps:
echo 1. Copy the configuration files from Claude's artifacts
echo 2. Run: pnpm install
echo 3. Run: docker-compose up -d
echo 4. Run: cd packages\backend ^&^& pnpm prisma migrate dev --name init
echo.
echo 🍅 Happy coding!