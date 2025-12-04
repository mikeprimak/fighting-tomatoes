// Type declarations for Fastify request extensions
import 'fastify';
import { FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      displayName: string | null;
      isActive: boolean;
      isEmailVerified: boolean;
      isMedia: boolean;
      mediaOrganization: string | null;
      points: number;
      level: number;
    };
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuthenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireVerified: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
