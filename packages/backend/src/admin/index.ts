import AdminJS from 'adminjs';
import AdminJSFastify from '@adminjs/fastify';
import * as AdminJSPrisma from '@adminjs/prisma';
import { PrismaClient } from '@prisma/client';
import { FastifyInstance } from 'fastify';

const prisma = new PrismaClient();

// Register AdminJS adapter
AdminJS.registerAdapter({
  Database: AdminJSPrisma.Database,
  Resource: AdminJSPrisma.Resource,
});

export async function setupAdminPanel(fastify: FastifyInstance) {
  const admin = new AdminJS({
    resources: [
      {
        resource: { model: prisma.user, client: prisma },
        options: {
          navigation: { name: 'User Management', icon: 'User' },
          properties: {
            password: { isVisible: false },
            refreshToken: { isVisible: false },
            pushToken: { isVisible: false },
          },
        },
      },
      {
        resource: { model: prisma.event, client: prisma },
        options: {
          navigation: { name: 'Content', icon: 'Calendar' },
          listProperties: ['name', 'promotion', 'date', 'location', 'hasStarted', 'isComplete'],
          editProperties: ['name', 'promotion', 'date', 'location', 'venue', 'imageUrl', 'hasStarted', 'isComplete'],
        },
      },
      {
        resource: { model: prisma.fight, client: prisma },
        options: {
          navigation: { name: 'Content', icon: 'Flag' },
          listProperties: ['eventId', 'weightClass', 'isMainEvent', 'hasStarted', 'isComplete'],
          editProperties: [
            'eventId', 'fighter1Id', 'fighter2Id', 'weightClass', 'isTitle',
            'cardSection', 'orderInCard', 'hasStarted', 'isComplete',
            'currentRound', 'completedRounds', 'winnerId', 'result', 'method', 'endRound', 'endTime',
          ],
        },
      },
      {
        resource: { model: prisma.fighter, client: prisma },
        options: {
          navigation: { name: 'Content', icon: 'UserPlus' },
          listProperties: ['firstName', 'lastName', 'nickname', 'country', 'wins', 'losses', 'draws'],
          editProperties: [
            'firstName', 'lastName', 'nickname', 'country', 'weightClass',
            'wins', 'losses', 'draws', 'reach', 'height', 'age', 'imageUrl',
          ],
        },
      },
      {
        resource: { model: prisma.crew, client: prisma },
        options: {
          navigation: { name: 'Community', icon: 'Users' },
          listProperties: ['name', 'description', 'ownerId', 'totalMembers', 'maxMembers'],
        },
      },
      {
        resource: { model: prisma.fightRating, client: prisma },
        options: {
          navigation: { name: 'Analytics', icon: 'Star' },
          listProperties: ['userId', 'fightId', 'rating', 'createdAt'],
        },
      },
      {
        resource: { model: prisma.fightReview, client: prisma },
        options: {
          navigation: { name: 'Analytics', icon: 'MessageSquare' },
          listProperties: ['userId', 'fightId', 'content', 'createdAt'],
        },
      },
    ],
    rootPath: '/admin',
    branding: {
      companyName: 'FightCrewApp Admin',
      logo: false,
    },
  });

  // Admin authentication
  const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];

  await AdminJSFastify.buildAuthenticatedRouter(
    admin,
    {
      authenticate: async (email: string, password: string) => {
        // Check if user exists and is an admin
        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !adminEmails.includes(email)) {
          return null;
        }

        // Verify password
        if (!user.password) {
          return null;
        }

        const bcrypt = await import('bcryptjs');
        const isValid = await bcrypt.compare(password, user.password);

        if (!isValid) {
          return null;
        }

        return { email: user.email, id: user.id };
      },
      cookiePassword: process.env.ADMIN_COOKIE_SECRET || 'super-secret-cookie-password-change-in-production',
      cookieName: 'adminjs',
    },
    fastify,
    {
      // Session options
      secret: process.env.ADMIN_COOKIE_SECRET || 'super-secret-cookie-password-change-in-production',
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
      },
    }
  );

  console.log(`AdminJS started on http://localhost:${process.env.PORT || 3001}${admin.options.rootPath}`);
}
