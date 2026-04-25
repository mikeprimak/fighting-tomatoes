import { PrismaClient } from '@prisma/client';
import { sendPushNotifications } from './notificationService';

const prisma = new PrismaClient();

export const LIKE_TIERS = [1, 5, 10, 25, 50, 100] as const;
export type LikeTier = typeof LIKE_TIERS[number];

function findTierCrossed(prevHighest: number, newCount: number): LikeTier | null {
  for (let i = LIKE_TIERS.length - 1; i >= 0; i--) {
    const tier = LIKE_TIERS[i];
    if (tier > prevHighest && tier <= newCount) return tier;
  }
  return null;
}

function copyForTier(tier: LikeTier): { title: string; body: (matchup: string) => string } {
  switch (tier) {
    case 1:   return { title: 'Your comment got a like!',                 body: (m) => m };
    case 5:   return { title: 'Your comment got 5 likes!',                body: (m) => m };
    case 10:  return { title: '🔥 Your comment got 10 likes!',            body: (m) => m };
    case 25:  return { title: '🔥 Your comment is getting attention — 25 likes!', body: (m) => m };
    case 50:  return { title: '🚀 Your comment is on fire — 50 likes!',   body: (m) => m };
    case 100: return { title: '🚀 Your comment hit 100 likes!',           body: (m) => m };
  }
}

interface FightContext {
  fightId: string;
  fighter1Name: string;
  fighter2Name: string;
  eventStatus: string;
}

async function fireMilestoneNotification(args: {
  authorUserId: string;
  tier: LikeTier;
  commentType: 'pre_fight' | 'post_fight';
  commentId: string;
  fight: FightContext;
}): Promise<void> {
  const { authorUserId, tier, commentType, commentId, fight } = args;
  const matchup = `${fight.fighter1Name} vs ${fight.fighter2Name}`;
  const copy = copyForTier(tier);

  // Push notification (gated by user.notificationsEnabled + valid pushToken inside sendPushNotifications)
  await sendPushNotifications([authorUserId], {
    title: copy.title,
    body: copy.body(matchup),
    data: {
      type: 'comment_liked',
      tier,
      commentType,
      commentId,
      fightId: fight.fightId,
      eventStatus: fight.eventStatus,
    },
  });

  // In-app notification row (so a future inbox UI can surface this)
  await prisma.userNotification.create({
    data: {
      userId: authorUserId,
      title: copy.title,
      message: copy.body(matchup),
      type: 'REVIEW_UPVOTED',
      linkType: 'fight',
      linkId: fight.fightId,
    },
  }).catch((err) => {
    // In-app row is best-effort; never let this fail the upvote response
    console.error('[CommentLike] Failed to write UserNotification row:', err);
  });
}

/**
 * Called after a post-fight review (FightReview) gets a new external upvote.
 * Idempotent and race-safe — uses a conditional UPDATE so concurrent voters can't
 * both fire the same milestone.
 */
export async function maybeNotifyReviewLike(reviewId: string, voterUserId: string): Promise<void> {
  try {
    const review = await prisma.fightReview.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        userId: true,
        lastNotifiedLikeCount: true,
        fight: {
          select: {
            id: true,
            fighter1: { select: { firstName: true, lastName: true } },
            fighter2: { select: { firstName: true, lastName: true } },
            event: { select: { eventStatus: true } },
          },
        },
      },
    });
    if (!review) return;
    if (review.userId === voterUserId) return; // never notify on self-upvote

    // External upvote count (excludes author's own auto-upvote on creation)
    const externalCount = await prisma.reviewVote.count({
      where: {
        reviewId,
        isUpvote: true,
        userId: { not: review.userId },
      },
    });

    const tier = findTierCrossed(review.lastNotifiedLikeCount, externalCount);
    if (tier === null) return;

    // Atomic guard — only fire if this row's lastNotifiedLikeCount is still below the tier.
    const updated = await prisma.fightReview.updateMany({
      where: { id: reviewId, lastNotifiedLikeCount: { lt: tier } },
      data: { lastNotifiedLikeCount: tier },
    });
    if (updated.count === 0) return; // another concurrent voter already fired this tier

    const f1 = `${review.fight.fighter1.firstName} ${review.fight.fighter1.lastName}`.trim();
    const f2 = `${review.fight.fighter2.firstName} ${review.fight.fighter2.lastName}`.trim();

    await fireMilestoneNotification({
      authorUserId: review.userId,
      tier,
      commentType: 'post_fight',
      commentId: reviewId,
      fight: {
        fightId: review.fight.id,
        fighter1Name: f1,
        fighter2Name: f2,
        eventStatus: review.fight.event.eventStatus,
      },
    });
  } catch (err) {
    console.error('[CommentLike] maybeNotifyReviewLike error:', err);
  }
}

/**
 * Called after a pre-fight comment (PreFightComment) gets a new upvote.
 */
export async function maybeNotifyPreFightCommentLike(commentId: string, voterUserId: string): Promise<void> {
  try {
    const comment = await prisma.preFightComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        userId: true,
        lastNotifiedLikeCount: true,
        fight: {
          select: {
            id: true,
            fighter1: { select: { firstName: true, lastName: true } },
            fighter2: { select: { firstName: true, lastName: true } },
            event: { select: { eventStatus: true } },
          },
        },
      },
    });
    if (!comment) return;
    if (comment.userId === voterUserId) return;

    const externalCount = await prisma.preFightCommentVote.count({
      where: {
        commentId,
        userId: { not: comment.userId },
      },
    });

    const tier = findTierCrossed(comment.lastNotifiedLikeCount, externalCount);
    if (tier === null) return;

    const updated = await prisma.preFightComment.updateMany({
      where: { id: commentId, lastNotifiedLikeCount: { lt: tier } },
      data: { lastNotifiedLikeCount: tier },
    });
    if (updated.count === 0) return;

    const f1 = `${comment.fight.fighter1.firstName} ${comment.fight.fighter1.lastName}`.trim();
    const f2 = `${comment.fight.fighter2.firstName} ${comment.fight.fighter2.lastName}`.trim();

    await fireMilestoneNotification({
      authorUserId: comment.userId,
      tier,
      commentType: 'pre_fight',
      commentId,
      fight: {
        fightId: comment.fight.id,
        fighter1Name: f1,
        fighter2Name: f2,
        eventStatus: comment.fight.event.eventStatus,
      },
    });
  } catch (err) {
    console.error('[CommentLike] maybeNotifyPreFightCommentLike error:', err);
  }
}
