# Social Media - Weekly Hype Post

## What Is This?

Every week, you make a social media post showing the most hyped fights coming up that weekend across all combat sports (UFC, PFL, BKFC, ONE, etc.). There's a page on your website that builds the image for you automatically.

## How To Use (Step by Step)

1. **Go to the page**: Visit your production URL at `https://web-jet-gamma-12.vercel.app/weekly-hype`. No setup needed — it deploys with the rest of the web app.

2. **Pick fights**: You'll see this weekend's events listed with all their fights. Click the fights you want to feature in the post. The most hyped fights (highest hype scores from users) are the ones worth featuring.

3. **Fighter images load automatically**: If a fighter has a profile photo in the app, it shows up on the card. If not, you can drag and drop an image or paste a URL to add one manually.

4. **Promotion logos**: Each fight row shows the org's logo (UFC, PFL, BKFC, etc.) next to the fighter images automatically.

5. **Event info**: Each fight shows the event name and start time (e.g. "Sat 5pm ET") using the earliest card start time.

6. **Preview the card**: As you add fights, the card updates live. Toggle between Instagram and Twitter formats to preview both.

7. **Download the image**: Hit one of the download buttons:
   - **Instagram** (square, 1080x1080)
   - **Twitter/Facebook** (wide, 1200x675)

8. **Post it**: Upload the downloaded image to your social media accounts with a caption like "This weekend's most hyped fights across all combat sports"

## Access

- **Production**: `https://web-jet-gamma-12.vercel.app/weekly-hype` (always available, no setup)
- **Local dev** (only if editing the page): `cd packages/web && pnpm dev` then `http://localhost:3000/weekly-hype`

## What's On The Card

- Good Fights hand logo + "MOST HYPED FIGHTS" header
- Weekend dates (e.g. "THIS WEEKEND - Fri Apr 3rd - Sun Apr 5th")
- Ranked fight rows with: rank number, org logo, fighter photos, names, event name, start time, hype score
- Good Fights branding in footer

## Future

Once the app has enough real user hype data, the page will auto-select the most hyped fights for you. Then it's just: open page, review, download, post.
