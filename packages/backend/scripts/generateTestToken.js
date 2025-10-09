const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function generateToken() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'fart@fightingtomatoes.com' },
      select: { id: true, email: true }
    });

    if (!user) {
      console.log('User not found!');
      return;
    }

    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here-change-in-production';

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log('\nGenerated JWT Token:');
    console.log(token);
    console.log('\n\nTest the my-ratings endpoint with:');
    console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:3001/api/fights/my-ratings`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

generateToken();
