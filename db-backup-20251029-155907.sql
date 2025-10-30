--
-- PostgreSQL database dump
--

\restrict jFDVTefnV4BhZAj1LbIExYd2piA13yz7HrOlDkjVplbhR0x3BHChpGas3Fr3fgX

-- Dumped from database version 15.14
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: ActivityType; Type: TYPE; Schema: public; Owner: dev
--

CREATE TYPE public."ActivityType" AS ENUM (
    'FIGHT_RATED',
    'REVIEW_WRITTEN',
    'PREDICTION_MADE',
    'PREDICTION_ACCURATE',
    'REVIEW_UPVOTED',
    'DAILY_LOGIN',
    'FIGHTER_FOLLOWED'
);


ALTER TYPE public."ActivityType" OWNER TO dev;

--
-- Name: AuthProvider; Type: TYPE; Schema: public; Owner: dev
--

CREATE TYPE public."AuthProvider" AS ENUM (
    'EMAIL',
    'GOOGLE',
    'APPLE'
);


ALTER TYPE public."AuthProvider" OWNER TO dev;

--
-- Name: Gender; Type: TYPE; Schema: public; Owner: dev
--

CREATE TYPE public."Gender" AS ENUM (
    'MALE',
    'FEMALE'
);


ALTER TYPE public."Gender" OWNER TO dev;

--
-- Name: NotificationType; Type: TYPE; Schema: public; Owner: dev
--

CREATE TYPE public."NotificationType" AS ENUM (
    'FIGHT_STARTING',
    'FIGHTER_FIGHTING_SOON',
    'REVIEW_UPVOTED',
    'LEVEL_UP',
    'PREDICTION_RESULT',
    'SYSTEM_ANNOUNCEMENT'
);


ALTER TYPE public."NotificationType" OWNER TO dev;

--
-- Name: ReportReason; Type: TYPE; Schema: public; Owner: dev
--

CREATE TYPE public."ReportReason" AS ENUM (
    'SPAM',
    'HARASSMENT',
    'INAPPROPRIATE_CONTENT',
    'MISINFORMATION',
    'OTHER'
);


ALTER TYPE public."ReportReason" OWNER TO dev;

--
-- Name: Sport; Type: TYPE; Schema: public; Owner: dev
--

CREATE TYPE public."Sport" AS ENUM (
    'MMA',
    'BOXING',
    'BARE_KNUCKLE_BOXING',
    'MUAY_THAI',
    'KICKBOXING'
);


ALTER TYPE public."Sport" OWNER TO dev;

--
-- Name: TagCategory; Type: TYPE; Schema: public; Owner: dev
--

CREATE TYPE public."TagCategory" AS ENUM (
    'STYLE',
    'PACE',
    'OUTCOME',
    'EMOTION',
    'QUALITY'
);


ALTER TYPE public."TagCategory" OWNER TO dev;

--
-- Name: WeightClass; Type: TYPE; Schema: public; Owner: dev
--

CREATE TYPE public."WeightClass" AS ENUM (
    'STRAWWEIGHT',
    'FLYWEIGHT',
    'BANTAMWEIGHT',
    'FEATHERWEIGHT',
    'LIGHTWEIGHT',
    'WELTERWEIGHT',
    'MIDDLEWEIGHT',
    'LIGHT_HEAVYWEIGHT',
    'HEAVYWEIGHT',
    'SUPER_HEAVYWEIGHT',
    'WOMENS_STRAWWEIGHT',
    'WOMENS_FLYWEIGHT',
    'WOMENS_BANTAMWEIGHT',
    'WOMENS_FEATHERWEIGHT'
);


ALTER TYPE public."WeightClass" OWNER TO dev;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: fight_alerts; Type: TABLE; Schema: public; Owner: dev
--

CREATE TABLE public.fight_alerts (
    id text NOT NULL,
    "userId" text NOT NULL,
    "fightId" text NOT NULL,
    "alertTime" timestamp(3) without time zone NOT NULL,
    "isSent" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.fight_alerts OWNER TO dev;

--
-- Name: fight_predictions; Type: TABLE; Schema: public; Owner: dev
--

CREATE TABLE public.fight_predictions (
    id text NOT NULL,
    "userId" text NOT NULL,
    "fightId" text NOT NULL,
    "predictedRating" integer NOT NULL,
    "actualRating" integer,
    accuracy double precision,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.fight_predictions OWNER TO dev;

--
-- Name: fight_reviews; Type: TABLE; Schema: public; Owner: dev
--

CREATE TABLE public.fight_reviews (
    id text NOT NULL,
    "userId" text NOT NULL,
    "fightId" text NOT NULL,
    content text NOT NULL,
    rating integer NOT NULL,
    "articleUrl" text,
    "articleTitle" text,
    "isReported" boolean DEFAULT false NOT NULL,
    "isHidden" boolean DEFAULT false NOT NULL,
    upvotes integer DEFAULT 0 NOT NULL,
    downvotes integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.fight_reviews OWNER TO dev;

--
-- Name: fight_tags; Type: TABLE; Schema: public; Owner: dev
--

CREATE TABLE public.fight_tags (
    id text NOT NULL,
    "userId" text NOT NULL,
    "fightId" text NOT NULL,
    "tagId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.fight_tags OWNER TO dev;

--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: dev
--

CREATE TABLE public.refresh_tokens (
    id text NOT NULL,
    token text NOT NULL,
    "userId" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.refresh_tokens OWNER TO dev;

--
-- Name: review_reports; Type: TABLE; Schema: public; Owner: dev
--

CREATE TABLE public.review_reports (
    id text NOT NULL,
    "reporterId" text NOT NULL,
    "reviewId" text NOT NULL,
    reason public."ReportReason" NOT NULL,
    description text,
    "isResolved" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "resolvedAt" timestamp(3) without time zone
);


ALTER TABLE public.review_reports OWNER TO dev;

--
-- Name: review_votes; Type: TABLE; Schema: public; Owner: dev
--

CREATE TABLE public.review_votes (
    id text NOT NULL,
    "userId" text NOT NULL,
    "reviewId" text NOT NULL,
    "isUpvote" boolean NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.review_votes OWNER TO dev;

--
-- Name: tags; Type: TABLE; Schema: public; Owner: dev
--

CREATE TABLE public.tags (
    id text NOT NULL,
    name text NOT NULL,
    category public."TagCategory" NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "forHighRatings" boolean DEFAULT false NOT NULL,
    "forMediumRatings" boolean DEFAULT false NOT NULL,
    "forLowRatings" boolean DEFAULT false NOT NULL,
    "forVeryLowRatings" boolean DEFAULT false NOT NULL
);


ALTER TABLE public.tags OWNER TO dev;

--
-- Name: user_activities; Type: TABLE; Schema: public; Owner: dev
--

CREATE TABLE public.user_activities (
    id text NOT NULL,
    "userId" text NOT NULL,
    "activityType" public."ActivityType" NOT NULL,
    points integer NOT NULL,
    description text,
    "fightId" text,
    "reviewId" text,
    "predictionId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.user_activities OWNER TO dev;

--
-- Name: user_fighter_follows; Type: TABLE; Schema: public; Owner: dev
--

CREATE TABLE public.user_fighter_follows (
    id text NOT NULL,
    "userId" text NOT NULL,
    "fighterId" text NOT NULL,
    "dayBeforeNotification" boolean DEFAULT true NOT NULL,
    "startOfFightNotification" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.user_fighter_follows OWNER TO dev;

--
-- Name: user_notifications; Type: TABLE; Schema: public; Owner: dev
--

CREATE TABLE public.user_notifications (
    id text NOT NULL,
    "userId" text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    type public."NotificationType" NOT NULL,
    "isRead" boolean DEFAULT false NOT NULL,
    "linkUrl" text,
    "linkType" text,
    "linkId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "readAt" timestamp(3) without time zone
);


ALTER TABLE public.user_notifications OWNER TO dev;

--
-- Name: user_recommendations; Type: TABLE; Schema: public; Owner: dev
--

CREATE TABLE public.user_recommendations (
    id text NOT NULL,
    "userId" text NOT NULL,
    "fightId" text NOT NULL,
    score double precision NOT NULL,
    reason text,
    "isViewed" boolean DEFAULT false NOT NULL,
    "isRated" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone
);


ALTER TABLE public.user_recommendations OWNER TO dev;

--
-- Name: users; Type: TABLE; Schema: public; Owner: dev
--

CREATE TABLE public.users (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean DEFAULT false,
    "emailVerificationToken" text,
    password text,
    "firstName" text,
    "lastName" text,
    "displayName" text,
    avatar text,
    "authProvider" text DEFAULT 'EMAIL'::text,
    "googleId" text,
    "appleId" text,
    "emailVerificationExpires" timestamp without time zone,
    "passwordResetToken" text,
    "passwordResetExpires" timestamp without time zone,
    "isActive" boolean DEFAULT true,
    "isEmailVerified" boolean DEFAULT false,
    "wantsEmails" boolean DEFAULT true,
    "pushToken" text,
    "notificationsEnabled" boolean DEFAULT true,
    "notifyEventStart" boolean DEFAULT true,
    "notifyFightStart" boolean DEFAULT true,
    "notifyMainCardOnly" boolean DEFAULT false,
    "notifyUFCOnly" boolean DEFAULT false,
    "notifyCrewMessages" boolean DEFAULT true,
    "notifyCrewInvites" boolean DEFAULT true,
    "notifyRoundChanges" boolean DEFAULT false,
    "notifyFightResults" boolean DEFAULT true,
    "isMedia" boolean DEFAULT false,
    "mediaOrganization" text,
    "mediaWebsite" text,
    points integer DEFAULT 0,
    level integer DEFAULT 1,
    "totalRatings" integer DEFAULT 0,
    "totalReviews" integer DEFAULT 0,
    "upvotesReceived" integer DEFAULT 0,
    "downvotesReceived" integer DEFAULT 0,
    "accuracyScore" double precision DEFAULT 0,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "lastLoginAt" timestamp without time zone
);


ALTER TABLE public.users OWNER TO dev;

--
-- Data for Name: fight_alerts; Type: TABLE DATA; Schema: public; Owner: dev
--

COPY public.fight_alerts (id, "userId", "fightId", "alertTime", "isSent", "isActive", "createdAt") FROM stdin;
\.


--
-- Data for Name: fight_predictions; Type: TABLE DATA; Schema: public; Owner: dev
--

COPY public.fight_predictions (id, "userId", "fightId", "predictedRating", "actualRating", accuracy, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: fight_reviews; Type: TABLE DATA; Schema: public; Owner: dev
--

COPY public.fight_reviews (id, "userId", "fightId", content, rating, "articleUrl", "articleTitle", "isReported", "isHidden", upvotes, downvotes, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: fight_tags; Type: TABLE DATA; Schema: public; Owner: dev
--

COPY public.fight_tags (id, "userId", "fightId", "tagId", "createdAt") FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: dev
--

COPY public.refresh_tokens (id, token, "userId", "expiresAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: review_reports; Type: TABLE DATA; Schema: public; Owner: dev
--

COPY public.review_reports (id, "reporterId", "reviewId", reason, description, "isResolved", "createdAt", "resolvedAt") FROM stdin;
\.


--
-- Data for Name: review_votes; Type: TABLE DATA; Schema: public; Owner: dev
--

COPY public.review_votes (id, "userId", "reviewId", "isUpvote", "createdAt") FROM stdin;
\.


--
-- Data for Name: tags; Type: TABLE DATA; Schema: public; Owner: dev
--

COPY public.tags (id, name, category, "isActive", "sortOrder", "forHighRatings", "forMediumRatings", "forLowRatings", "forVeryLowRatings") FROM stdin;
\.


--
-- Data for Name: user_activities; Type: TABLE DATA; Schema: public; Owner: dev
--

COPY public.user_activities (id, "userId", "activityType", points, description, "fightId", "reviewId", "predictionId", "createdAt") FROM stdin;
\.


--
-- Data for Name: user_fighter_follows; Type: TABLE DATA; Schema: public; Owner: dev
--

COPY public.user_fighter_follows (id, "userId", "fighterId", "dayBeforeNotification", "startOfFightNotification", "createdAt") FROM stdin;
\.


--
-- Data for Name: user_notifications; Type: TABLE DATA; Schema: public; Owner: dev
--

COPY public.user_notifications (id, "userId", title, message, type, "isRead", "linkUrl", "linkType", "linkId", "createdAt", "readAt") FROM stdin;
\.


--
-- Data for Name: user_recommendations; Type: TABLE DATA; Schema: public; Owner: dev
--

COPY public.user_recommendations (id, "userId", "fightId", score, reason, "isViewed", "isRated", "createdAt", "expiresAt") FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: dev
--

COPY public.users (id, email, "emailVerified", "emailVerificationToken", password, "firstName", "lastName", "displayName", avatar, "authProvider", "googleId", "appleId", "emailVerificationExpires", "passwordResetToken", "passwordResetExpires", "isActive", "isEmailVerified", "wantsEmails", "pushToken", "notificationsEnabled", "notifyEventStart", "notifyFightStart", "notifyMainCardOnly", "notifyUFCOnly", "notifyCrewMessages", "notifyCrewInvites", "notifyRoundChanges", "notifyFightResults", "isMedia", "mediaOrganization", "mediaWebsite", points, level, "totalRatings", "totalReviews", "upvotesReceived", "downvotesReceived", "accuracyScore", "createdAt", "updatedAt", "lastLoginAt") FROM stdin;
\.


--
-- Name: fight_alerts fight_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.fight_alerts
    ADD CONSTRAINT fight_alerts_pkey PRIMARY KEY (id);


--
-- Name: fight_predictions fight_predictions_pkey; Type: CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.fight_predictions
    ADD CONSTRAINT fight_predictions_pkey PRIMARY KEY (id);


--
-- Name: fight_reviews fight_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.fight_reviews
    ADD CONSTRAINT fight_reviews_pkey PRIMARY KEY (id);


--
-- Name: fight_tags fight_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.fight_tags
    ADD CONSTRAINT fight_tags_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: review_reports review_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.review_reports
    ADD CONSTRAINT review_reports_pkey PRIMARY KEY (id);


--
-- Name: review_votes review_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.review_votes
    ADD CONSTRAINT review_votes_pkey PRIMARY KEY (id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: user_activities user_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.user_activities
    ADD CONSTRAINT user_activities_pkey PRIMARY KEY (id);


--
-- Name: user_fighter_follows user_fighter_follows_pkey; Type: CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.user_fighter_follows
    ADD CONSTRAINT user_fighter_follows_pkey PRIMARY KEY (id);


--
-- Name: user_notifications user_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_pkey PRIMARY KEY (id);


--
-- Name: user_recommendations user_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.user_recommendations
    ADD CONSTRAINT user_recommendations_pkey PRIMARY KEY (id);


--
-- Name: users users_appleId_key; Type: CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_appleId_key" UNIQUE ("appleId");


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_googleId_key; Type: CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_googleId_key" UNIQUE ("googleId");


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: fight_alerts_userId_fightId_key; Type: INDEX; Schema: public; Owner: dev
--

CREATE UNIQUE INDEX "fight_alerts_userId_fightId_key" ON public.fight_alerts USING btree ("userId", "fightId");


--
-- Name: fight_predictions_userId_fightId_key; Type: INDEX; Schema: public; Owner: dev
--

CREATE UNIQUE INDEX "fight_predictions_userId_fightId_key" ON public.fight_predictions USING btree ("userId", "fightId");


--
-- Name: fight_reviews_userId_fightId_key; Type: INDEX; Schema: public; Owner: dev
--

CREATE UNIQUE INDEX "fight_reviews_userId_fightId_key" ON public.fight_reviews USING btree ("userId", "fightId");


--
-- Name: fight_tags_userId_fightId_tagId_key; Type: INDEX; Schema: public; Owner: dev
--

CREATE UNIQUE INDEX "fight_tags_userId_fightId_tagId_key" ON public.fight_tags USING btree ("userId", "fightId", "tagId");


--
-- Name: refresh_tokens_token_key; Type: INDEX; Schema: public; Owner: dev
--

CREATE UNIQUE INDEX refresh_tokens_token_key ON public.refresh_tokens USING btree (token);


--
-- Name: review_votes_userId_reviewId_key; Type: INDEX; Schema: public; Owner: dev
--

CREATE UNIQUE INDEX "review_votes_userId_reviewId_key" ON public.review_votes USING btree ("userId", "reviewId");


--
-- Name: tags_name_key; Type: INDEX; Schema: public; Owner: dev
--

CREATE UNIQUE INDEX tags_name_key ON public.tags USING btree (name);


--
-- Name: user_fighter_follows_userId_fighterId_key; Type: INDEX; Schema: public; Owner: dev
--

CREATE UNIQUE INDEX "user_fighter_follows_userId_fighterId_key" ON public.user_fighter_follows USING btree ("userId", "fighterId");


--
-- Name: user_recommendations_userId_fightId_key; Type: INDEX; Schema: public; Owner: dev
--

CREATE UNIQUE INDEX "user_recommendations_userId_fightId_key" ON public.user_recommendations USING btree ("userId", "fightId");


--
-- Name: fight_tags fight_tags_tagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.fight_tags
    ADD CONSTRAINT "fight_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES public.tags(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: review_reports review_reports_reviewId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.review_reports
    ADD CONSTRAINT "review_reports_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES public.fight_reviews(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: review_votes review_votes_reviewId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: dev
--

ALTER TABLE ONLY public.review_votes
    ADD CONSTRAINT "review_votes_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES public.fight_reviews(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict jFDVTefnV4BhZAj1LbIExYd2piA13yz7HrOlDkjVplbhR0x3BHChpGas3Fr3fgX

