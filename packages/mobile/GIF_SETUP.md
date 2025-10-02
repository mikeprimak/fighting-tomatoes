# GIF Functionality Setup

The crew chat now supports GIF messages powered by Giphy! To enable this feature, you need to add your Giphy API key.

## Getting a Giphy API Key

1. Go to [Giphy Developers](https://developers.giphy.com/)
2. Create a free account or sign in
3. Create a new app (choose "API" as the product)
4. Copy your API Key

## Adding the API Key

Open `packages/mobile/components/GifPickerModal.tsx` and replace `'YOUR_GIPHY_API_KEY'` on line 15 with your actual Giphy API key:

```typescript
const GIPHY_API_KEY = 'your_actual_api_key_here';
```

## How to Use

1. Open any crew chat
2. Tap the image icon (📷) next to the message input
3. Search for GIFs or browse trending GIFs
4. Tap a GIF to send it to the chat
5. GIFs will appear as images in the message thread

## Features

- **Search**: Type to search for specific GIFs
- **Trending**: See trending GIFs when search is empty
- **Preview**: 3-column grid layout for easy browsing
- **Animated**: GIFs play automatically in chat messages

## Attribution

The app includes "Powered by GIPHY" attribution as required by Giphy's terms of service.

## Notes

- Free API tier allows 42 requests per hour per IP
- GIFs are rated PG-13 for appropriate content
- GIF URLs are stored as regular message content in the backend
