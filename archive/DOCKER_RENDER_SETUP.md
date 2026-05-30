# Docker Deployment on Render

This guide explains how to deploy the FightCrewApp backend using Docker on Render to support Puppeteer-based web scraping.

## Why Docker?

The news scraper (and future scrapers) use Puppeteer which requires Chromium browser. Render's standard Node.js environment doesn't include Chromium, so we use Docker to install it.

## What's Included

The Dockerfile installs:
- **Node.js 20** (slim image for smaller size)
- **Chromium browser** (for Puppeteer)
- **All system dependencies** needed for headless browser operation
- **pnpm** (package manager)
- **Your application code** with all dependencies

## Files

- `Dockerfile` - Docker image definition with Chromium
- `.dockerignore` - Excludes unnecessary files from build
- `DOCKER_RENDER_SETUP.md` - This file

## Deployment Steps

### 1. Commit Docker Files

```bash
git add Dockerfile .dockerignore DOCKER_RENDER_SETUP.md
git commit -m "feat: Add Docker support for Puppeteer on Render"
git push origin main
```

### 2. Update Render Service Settings

1. Go to https://dashboard.render.com
2. Click on your `fightcrewapp-backend` service
3. Click "Settings" tab
4. Scroll to "Build & Deploy" section
5. Change:
   - **Environment**: From "Node" to **"Docker"**
   - **Dockerfile Path**: Leave as `./Dockerfile` (default)
   - **Docker Context**: Leave as `.` (default)
6. Scroll down and click "Save Changes"

### 3. Render Will Auto-Deploy

Render will automatically:
1. Detect the Dockerfile
2. Build the Docker image (takes 5-10 minutes first time)
3. Install Chromium and all dependencies
4. Deploy your application

### 4. Verify Deployment

Watch the build logs in Render dashboard. Look for:
```
Successfully built [image-id]
Successfully tagged [tag]
==> Your service is live 🎉
```

Then check the logs for:
```
[Background Jobs] News scraper scheduled (5 times daily: 6am, 9:30am, 1pm, 4pm, 7pm EDT)
```

### 5. Test the Scraper

```bash
# Test manual trigger
curl -X POST https://fightcrewapp-backend.onrender.com/api/news/scrape

# Check results
curl https://fightcrewapp-backend.onrender.com/api/news?limit=5

# Check scraper status
curl https://fightcrewapp-backend.onrender.com/api/news/scrape/status
```

## Environment Variables

Your existing environment variables will work with Docker. No changes needed:

- `DATABASE_URL` - Already configured
- `JWT_SECRET` - Already configured
- `NODE_ENV=production` - Already configured
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` - Set in Dockerfile
- `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` - Set in Dockerfile

## Docker Build Process

When you push to GitHub, Render will:

1. **Pull your code** from GitHub
2. **Build Docker image**:
   - Install Chromium and dependencies (~2 minutes)
   - Install Node.js packages (~1 minute)
   - Generate Prisma client (~30 seconds)
   - Build TypeScript (~30 seconds)
3. **Start container**:
   - Run Prisma migrations
   - Start your server
   - Initialize cron jobs

**Total build time**: 5-10 minutes (first build), 2-3 minutes (subsequent builds with cache)

## Troubleshooting

### Build Fails

**Check Render logs** for specific errors:
- "Cannot find module": Missing dependency in package.json
- "Prisma generate failed": Database connection issue
- "ENOSPC": Not enough disk space (unlikely on paid plan)

### Scraper Still Failing

1. **Check Puppeteer path**:
   ```bash
   # In Render shell (if available)
   which chromium
   # Should output: /usr/bin/chromium
   ```

2. **Check logs** for Puppeteer errors:
   ```
   [News Scraper] Starting scrape...
   Error: Failed to launch the browser process!
   ```

3. **Verify environment variables** in Render dashboard

### Build Takes Too Long

Docker builds can be slower than Node.js builds, but:
- First build: 5-10 minutes (installs Chromium)
- Subsequent builds: 2-3 minutes (uses cache)
- No impact on runtime performance

### Out of Memory

If scraping fails with memory errors:
1. Go to Render dashboard → Settings
2. Increase "Instance Type" to next tier
3. Starter plan ($7/month) should be sufficient

## Benefits of Docker Approach

✅ **Works with any future scrapers** - Full Chromium support
✅ **Stable environment** - Consistent across deployments
✅ **No manual config** - Everything in Dockerfile
✅ **Standard Render feature** - Well-supported, no hacks
✅ **Future-proof** - Can add more tools as needed

## Cost

Docker deployment on Render:
- **Build time**: Free (included in paid plan)
- **Runtime**: Same $7/month Starter plan
- **Storage**: ~500MB for Docker image (plenty of space)

No additional cost compared to Node.js deployment!

## Local Docker Testing (Optional)

To test Docker build locally:

```bash
# Build image
docker build -t fightcrewapp-backend .

# Run container
docker run -p 3001:10000 \
  -e DATABASE_URL="your-database-url" \
  -e JWT_SECRET="your-jwt-secret" \
  -e NODE_ENV=production \
  fightcrewapp-backend

# Test
curl -X POST http://localhost:3001/api/news/scrape
```

## Maintenance

### Updating the Dockerfile

If you need to add more system dependencies:

1. Edit `Dockerfile`
2. Add packages to the `apt-get install` command
3. Commit and push
4. Render will rebuild automatically

### Updating Node/Chromium Versions

Update first line in Dockerfile:
```dockerfile
FROM node:20-slim  # Change to node:21-slim, etc.
```

Chromium version is managed by Debian package manager (always latest stable).

## Support

- **Render Docker Docs**: https://render.com/docs/docker
- **Puppeteer Docs**: https://pptr.dev
- **Dockerfile Reference**: https://docs.docker.com/engine/reference/builder/

## Next Steps

After Docker deployment works:

1. ✅ News scraper runs automatically 5x daily
2. ✅ Can add more complex scrapers (UFC live events, etc.)
3. ✅ Full Puppeteer capabilities available
4. ✅ Ready for production use
