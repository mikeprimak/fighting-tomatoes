# Render Deployment Guide for FightCrewApp

## Step 1: Push Code to GitHub

First, make sure your code is committed and pushed to GitHub:

```bash
git add .
git commit -m "Add Render deployment configuration"
git push origin main
```

## Step 2: Create Render Account

1. Go to https://render.com/
2. Sign up with GitHub (recommended) or email
3. Authorize Render to access your GitHub repositories

## Step 3: Create PostgreSQL Database

1. Click "New +" button in Render dashboard
2. Select "PostgreSQL"
3. Fill in details:
   - **Name**: `fightcrewapp-db`
   - **Database**: `fightcrewapp`
   - **User**: `fightcrewapp_user`
   - **Region**: Oregon (or closest to you)
   - **Plan**: Free
4. Click "Create Database"
5. Wait for database to provision (1-2 minutes)
6. **SAVE THE INTERNAL DATABASE URL** - you'll need this for the web service

## Step 4: Create Web Service

1. Click "New +" button in Render dashboard
2. Select "Web Service"
3. Connect your GitHub repository: `fight-mobile-app`
4. Fill in details:
   - **Name**: `fightcrewapp-backend`
   - **Region**: Oregon (same as database)
   - **Branch**: `main`
   - **Root Directory**: Leave empty (monorepo handled by commands)
   - **Runtime**: Node
   - **Build Command**:
     ```bash
     cd packages/backend && pnpm install && pnpm run db:generate && pnpm run build
     ```
   - **Start Command**:
     ```bash
     cd packages/backend && pnpm run db:migrate:deploy && pnpm start
     ```
   - **Plan**: Free

5. Click "Advanced" to add environment variables

## Step 5: Configure Environment Variables

Add these environment variables in the Render dashboard:

### Required Variables:

1. **DATABASE_URL**
   - Copy the **Internal Database URL** from your PostgreSQL database
   - Format: `postgresql://user:password@hostname:5432/database`

2. **NODE_ENV**
   - Value: `production`

3. **PORT**
   - Value: `10000`

4. **JWT_SECRET**
   - Click "Generate" button to create a random value
   - Or use your existing: `9cd1f39ec05abb9efb92c70bf3051977bee8683755858726daf87d10a7cc78b216bdef6507348031ca5418d01b2bf649ec6393a4bdb6319e7bb5676038cee848`

5. **JWT_REFRESH_SECRET**
   - Click "Generate" button to create a random value
   - Or use your existing: `a35e5fafa94d8e9296ccf49071b4041dda1c7f583c23e0c42bc9164305edd1679d08022f8b7055b308441419d55664c0d1817c4510559b442b8c1450174dec8f`

6. **SKIP_EMAIL_VERIFICATION**
   - Value: `true`

7. **ADMIN_EMAILS**
   - Value: `michaelsprimak@gmail.com,avocadomike@hotmail.com`

8. **CORS_ORIGINS**
   - Value: `exp://expo.dev,https://fightcrewapp.onrender.com`
   - (We'll update this after deployment)

### Optional Variables (can add later):

- **SMTP_HOST**: `smtp.gmail.com`
- **SMTP_PORT**: `587`
- **SMTP_USER**: your-email@gmail.com
- **SMTP_PASS**: your-app-password
- **SMTP_FROM**: `Fighting Tomatoes <noreply@fightingtomatoes.com>`

## Step 6: Deploy

1. Click "Create Web Service"
2. Render will automatically start building and deploying
3. Monitor the logs - build takes ~5-10 minutes on free tier
4. Wait for "Live" status

## Step 7: Get Your Backend URL

Once deployed, your backend will be available at:
```
https://fightcrewapp-backend.onrender.com
```

Test it by visiting:
```
https://fightcrewapp-backend.onrender.com/health
```

You should see: `{"status":"ok"}`

## Step 8: Update Mobile App Configuration

Update your mobile app to use the new backend URL:

1. Open `packages/mobile/services/api.ts`
2. Find the `API_BASE_URL` configuration
3. Update it to use your Render URL:
   ```typescript
   const API_BASE_URL = __DEV__
     ? Platform.OS === 'web'
       ? 'http://localhost:3001/api'
       : 'http://10.0.0.53:3001/api'
     : 'https://fightcrewapp-backend.onrender.com/api';
   ```

## Step 9: Update CORS Origins

1. Go back to Render dashboard
2. Click on your web service
3. Go to "Environment" tab
4. Update **CORS_ORIGINS** to include your actual mobile app scheme:
   ```
   exp://expo.dev,exp://localhost:8083,http://localhost:8083
   ```

## Step 10: Redeploy

1. Click "Manual Deploy" → "Clear build cache & deploy"
2. Wait for deployment to complete

## Important Notes

### Free Tier Limitations:
- **Spins down after 15 minutes of inactivity**
- First request after spin-down takes ~30-60 seconds
- 750 hours/month free (enough for 24/7 with one service)
- Database has 1GB storage limit

### Keeping Service Active:
To prevent spin-down, you can:
1. Use a service like **UptimeRobot** (free) to ping your health endpoint every 5-10 minutes
2. Add a cron job to your service (more advanced)

### Monitoring:
- View logs in Render dashboard under "Logs" tab
- Monitor database usage under PostgreSQL service
- Check service health at `/health` endpoint

### Troubleshooting:

**Build fails:**
- Check build logs in Render dashboard
- Ensure all dependencies are in package.json
- Verify pnpm-lock.yaml is committed to git

**Database connection fails:**
- Verify DATABASE_URL is correct
- Check database is in same region as web service
- Ensure database is "Available"

**Service won't start:**
- Check environment variables are set correctly
- Look for errors in startup logs
- Verify PORT is set to 10000

## Next Steps

1. Set up UptimeRobot to keep service alive
2. Configure custom domain (optional)
3. Set up email service for verification emails
4. Add Redis for caching (if needed later)
5. Upgrade to paid plan when ready ($7/month per service)

## URLs to Save:

- **Backend API**: https://fightcrewapp-backend.onrender.com
- **Health Check**: https://fightcrewapp-backend.onrender.com/health
- **API Status**: https://fightcrewapp-backend.onrender.com/api/status
- **Database Dashboard**: (in Render PostgreSQL service page)

## Support

- Render Documentation: https://render.com/docs
- Render Community: https://community.render.com/
