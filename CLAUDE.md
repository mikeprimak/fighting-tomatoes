# Fighting Tomatoes - Combat Sports Rating App

## Project Overview
A React Native + Node.js application for rating combat sports fights (like Rotten Tomatoes for fights). Users can browse upcoming/past events and rate fights on a 1-10 scale.

## Business Goal
Create an enterprise-ready app suitable for acquisition by larger companies (UFC, ESPN, etc.).

## Current Focus
[UPDATE EACH CHAT SESSION]

Database architecture and setup completed. Moving to API development and authentication system implementation.
Recent Completion:

Modern PostgreSQL database with comprehensive schema
Eliminated legacy MD5 table structure
Implemented proper relationships and foreign keys
Added gamification, notifications, and analytics foundation
Complete data seeding with realistic scenarios

Next Priority:

JWT-based authentication system
RESTful API endpoints using new Prisma schema
User registration and email verification

## Quick Context for Claude
- Monorepo structure with backend, mobile, and shared packages
- Working auth system, event browsing, and fight rating features
- Need to add search, social features, analytics, and admin panel
- All core CRUD operations are functional

## Last Updated
[DATE] - [BRIEF SUMMARY OF LAST SESSION'S WORK]

Current Focus:
Authentication system completed and tested. Moving to core API development for fights, ratings, and user interactions.
Recent Completion:

Complete JWT-based authentication system with refresh tokens
User registration and login endpoints working
Email verification infrastructure (disabled for development)
Password reset functionality
Rate limiting and security middleware
Input validation with Zod schemas
Comprehensive error handling
Production-ready authentication tested and verified

Next Priority:

Core API endpoints for fights, fighters, events
User action APIs (ratings, reviews, follows)
Real-time features and WebSocket integration