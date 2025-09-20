import dotenv from 'dotenv';
import app from './app';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3001;

// Start server
app.listen(PORT, () => {
  console.log(`🍅 Fighting Tomatoes API server running on port ${PORT}`);
  console.log(`📊 Prisma Studio: http://localhost:5555`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}`);
});
