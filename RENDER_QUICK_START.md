# Render Quick Start Guide

## Prerequisites Checklist
- [ ] GitHub account
- [ ] Code pushed to GitHub
- [ ] Render account created (sign up at https://render.com)

## Step 1: Push Code to GitHub (5 minutes)

```bash
# Make sure you're on main branch
git checkout main

# Add all files
git add .

# Commit
git commit -m "Add Render deployment configuration"

# Push to GitHub
git push origin main
```

## Step 2: Create PostgreSQL Database (3 minutes)

1. Go to https://dashboard.render.com/
2. Click "New +" → "PostgreSQL"
3. Enter these details:
   - Name: `fightcrewapp-db`
   - Database: `fightcrewapp`
   - User: `fightcrewapp_user`
   - Region: **Oregon** (or closest to you)
   - Plan: **Free**
4. Click "Create Database"
5. **IMPORTANT**: Copy the **Internal Database URL** (starts with `postgresql://`)
   - Save it in a notepad, you'll need it in Step 3!

## Step 3: Create Web Service (10 minutes)

1. Click "New +" → "Web Service"
2. Click "Connect account" if needed, select your GitHub repo: `fight-mobile-app`
3. Fill in these EXACT values:

   **Basic Settings:**
   - Name: `fightcrewapp-backend`
   - Region: **Oregon** (must match database!)
   - Branch: `main`
   - Root Directory: (leave empty)
   - Runtime: **Node**

   **Build & Start:**
   - Build Command:
     ```
     cd packages/backend && pnpm install && pnpm run db:generate && pnpm run build
     ```
   - Start Command:
     ```
     cd packages/backend && pnpm run db:migrate:deploy && pnpm start
     ```

   **Plan:**
   - Select: **Free**

4. Click "Advanced" button

5. **Add Environment Variables** (copy these exactly):

   ```
   DATABASE_URL=<paste the Internal Database URL from Step 2>
   NODE_ENV=production
   PORT=10000
   JWT_SECRET=9cd1f39ec05abb9efb92c70bf3051977bee8683755858726daf87d10a7cc78b216bdef6507348031ca5418d01b2bf649ec6393a4bdb6319e7bb5676038cee848
   JWT_REFRESH_SECRET=a35e5fafa94d8e9296ccf49071b4041dda1c7f583c23e0c42bc9164305edd1679d08022f8b7055b308441419d55664c0d1817c4510559b442b8c1450174dec8f
   SKIP_EMAIL_VERIFICATION=true
   ADMIN_EMAILS=michaelsprimak@gmail.com,avocadomike@hotmail.com
   CORS_ORIGINS=exp://expo.dev,exp://localhost:8083,http://localhost:8083
   ```

6. Click "Create Web Service"

## Step 4: Wait for Deployment (5-10 minutes)

1. Watch the build logs - you'll see:
   - Dependencies installing
   - TypeScript compiling
   - Prisma generating
   - Database migrating
   - Server starting

2. When you see "Your service is live 🎉" - it's ready!

3. Your backend URL will be:
   ```
   https://fightcrewapp-backend.onrender.com
   ```

## Step 5: Test Your Backend (2 minutes)

1. Open this URL in your browser:
   ```
   https://fightcrewapp-backend.onrender.com/health
   ```

2. You should see:
   ```json
   {"status":"ok"}
   ```

3. If you see that, SUCCESS! Your backend is live! 🎉

## Step 6: Your Mobile App is Already Configured!

Your mobile app code is already updated to use the production backend when not in development mode. No additional changes needed!

## Important Notes

### ⚠️ Free Tier Behavior:
- **Spins down after 15 minutes of inactivity**
- **First request after spin-down takes 30-60 seconds**
- This is NORMAL for free tier
- Users may see "loading" for ~30 seconds on first app open

### 💡 Keep It Alive (Optional):
To prevent spin-down:
1. Sign up for UptimeRobot (free): https://uptimerobot.com/
2. Create a monitor for: `https://fightcrewapp-backend.onrender.com/health`
3. Set interval: 5 minutes
4. This will keep your service warm 24/7

### 📊 Monitoring:
- View logs: Render Dashboard → Your Service → "Logs" tab
- View database: Render Dashboard → PostgreSQL service
- Check health: Visit `/health` endpoint anytime

## Troubleshooting

**"Build failed"**
- Check build logs in Render dashboard
- Most common: missing dependencies or wrong build command

**"Service won't start"**
- Verify all environment variables are set correctly
- Check DATABASE_URL is the Internal Database URL (not External)
- Ensure database and web service are in same region

**"Database connection failed"**
- Wait 2-3 minutes for database to fully provision
- Verify DATABASE_URL in web service environment variables
- Check both services are "Available" status

**"CORS errors in mobile app"**
- Add your expo scheme to CORS_ORIGINS environment variable
- Redeploy service after updating

## Next Steps After Deployment

1. [ ] Set up UptimeRobot (keeps service alive)
2. [ ] Test mobile app in production mode
3. [ ] Monitor logs for any errors
4. [ ] Add custom domain (optional)
5. [ ] Set up email service (optional, for later)

## Need Help?

- Render Docs: https://render.com/docs
- Render Community: https://community.render.com/
- Check your logs first - they usually show the issue!

---

## Summary - What You Just Did:

✅ Deployed a PostgreSQL database
✅ Deployed a Node.js/Fastify backend
✅ Set up automatic migrations
✅ Configured environment variables
✅ Got a public URL for your API
✅ Mobile app automatically uses production backend when built

**Your backend is now running 24/7 on Render!** 🚀
