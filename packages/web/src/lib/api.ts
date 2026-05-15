const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://fightcrewapp-backend.onrender.com/api';

export { API_BASE_URL };

let accessToken: string | null = null;
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function refreshAccessToken(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }
  isRefreshing = true;
  refreshPromise = doRefreshToken();
  try {
    return await refreshPromise;
  } finally {
    isRefreshing = false;
    refreshPromise = null;
  }
}

async function doRefreshToken(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) return false;
    const data = await response.json();
    if (data.accessToken) {
      accessToken = data.accessToken;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

interface ApiError {
  error: string;
  code: string;
  status?: number;
  details?: unknown;
}

async function makeRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  isRetry = false,
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {};

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  });

  if (response.status === 401 && !isRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return makeRequest<T>(endpoint, options, true);
    }
    accessToken = null;
    const error: ApiError = { error: 'Session expired. Please log in again.', code: 'SESSION_EXPIRED', status: 401 };
    throw error;
  }

  const data = await response.json();
  if (!response.ok) {
    throw { status: response.status, ...data } as ApiError;
  }
  return data;
}

// ==================== AUTH ====================

export async function login(email: string, password: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw data;
  accessToken = data.accessToken;
  return data;
}

export async function loginWithGoogle(idToken: string) {
  const res = await fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ idToken }),
  });
  const data = await res.json();
  if (!res.ok) throw data;
  accessToken = data.accessToken;
  return data;
}

export async function loginWithApple(payload: {
  identityToken: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}) {
  const res = await fetch('/api/auth/apple', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw data;
  accessToken = data.accessToken;
  return data;
}

export async function register(userData: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
}) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(userData),
  });
  const data = await res.json();
  if (!res.ok) throw data;
  accessToken = data.accessToken;
  return data;
}

export async function logout() {
  accessToken = null;
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}

export async function refreshSession() {
  return refreshAccessToken();
}

// ==================== EVENTS ====================

export async function getEvents(params: {
  page?: number;
  limit?: number;
  type?: 'upcoming' | 'past' | 'all';
  includeFights?: boolean;
  promotions?: string;
} = {}) {
  const qp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined) qp.append(k, String(v));
  });
  const qs = qp.toString();
  return makeRequest<{
    events: any[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(`/events${qs ? `?${qs}` : ''}`);
}

export async function getEvent(eventId: string) {
  return makeRequest<{ event: any }>(`/events/${eventId}`);
}

export async function getEventFights(eventId: string) {
  return makeRequest<{ fights: any[] }>(`/events/${eventId}/fights`);
}

// ==================== FIGHTS ====================

export async function getFights(params: {
  page?: number;
  limit?: number;
  includeUserData?: boolean;
  eventId?: string;
  fighterId?: string;
} = {}) {
  const qp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined) qp.append(k, String(v));
  });
  const qs = qp.toString();
  return makeRequest<{
    fights: any[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(`/fights${qs ? `?${qs}` : ''}`);
}

export async function getFight(fightId: string) {
  return makeRequest<{ fight: any }>(`/fights/${fightId}`);
}

export async function rateFight(fightId: string, rating: number) {
  return makeRequest<{ rating: any; message: string }>(`/fights/${fightId}/rate`, {
    method: 'POST',
    body: JSON.stringify({ rating }),
  });
}

export async function revealFightOutcome(fightId: string) {
  return makeRequest<{ message: string; hasRevealedOutcome: boolean }>(`/fights/${fightId}/reveal-outcome`, {
    method: 'POST',
  });
}

export async function reviewFight(fightId: string, data: {
  content: string;
  rating: number;
  articleUrl?: string;
  articleTitle?: string;
}) {
  return makeRequest<{ review: any; message: string }>(`/fights/${fightId}/review`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateReview(fightId: string, data: {
  content: string;
  rating: number;
  articleUrl?: string;
  articleTitle?: string;
}) {
  return makeRequest<{ review: any; message: string }>(`/fights/${fightId}/review`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function applyFightTags(fightId: string, tagNames: string[]) {
  return makeRequest<{ tags: any[]; message: string }>(`/fights/${fightId}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tagNames }),
  });
}

export async function getFightTags(fightId: string) {
  return makeRequest<{ tags: any[] }>(`/fights/${fightId}/tags`);
}

export async function getFightReviews(fightId: string, params: { page?: number; limit?: number } = {}) {
  const qp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined) qp.append(k, String(v));
  });
  const qs = qp.toString();
  return makeRequest<{
    reviews: any[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(`/fights/${fightId}/reviews${qs ? `?${qs}` : ''}`);
}

export async function toggleReviewUpvote(fightId: string, reviewId: string) {
  return makeRequest<{ message: string; isUpvoted: boolean; upvotesCount: number }>(
    `/fights/${fightId}/reviews/${reviewId}/upvote`,
    { method: 'POST' },
  );
}

export async function flagReview(fightId: string, reviewId: string, reason: string) {
  return makeRequest<{ message: string }>(`/fights/${fightId}/reviews/${reviewId}/flag`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function removeAllFightData(fightId: string) {
  return makeRequest<{ message: string }>(`/fights/${fightId}/rating`, { method: 'DELETE' });
}

// ==================== PREDICTIONS / HYPE ====================

export async function createFightPrediction(fightId: string, data: {
  predictedRating?: number;
}) {
  return makeRequest<{ prediction: any; averageHype: number; totalHypePredictions: number; message: string }>(
    `/fights/${fightId}/prediction`,
    { method: 'POST', body: JSON.stringify(data) },
  );
}

export async function getFightPrediction(fightId: string) {
  return makeRequest<{ prediction: any }>(`/fights/${fightId}/prediction`);
}

export async function getFightPredictionStats(fightId: string) {
  return makeRequest<{
    fightId: string;
    totalPredictions: number;
    averageHype: number;
    distribution: Record<number, number>;
  }>(`/fights/${fightId}/predictions`);
}

export async function getFightAggregateStats(fightId: string) {
  return makeRequest<{
    fightId: string;
    reviewCount: number;
    totalRatings: number;
    topTags: Array<{ name: string; count: number }>;
    userHypeScore: number | null;
    communityAverageHype: number | null;
    hypeDistribution: Record<number, number>;
    ratingDistribution: Record<number, number>;
    averageRating: number;
  }>(`/fights/${fightId}/aggregate-stats`);
}

// ==================== FIGHTERS ====================

export async function getFighter(fighterId: string) {
  return makeRequest<{ fighter: any }>(`/fighters/${fighterId}`);
}

export async function getFighters(params: { page?: number; limit?: number } = {}) {
  const qp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined) qp.append(k, String(v));
  });
  const qs = qp.toString();
  return makeRequest<{
    fighters: any[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(`/fighters${qs ? `?${qs}` : ''}`);
}

export async function followFighter(fighterId: string) {
  return makeRequest<{ message: string; isFollowing: boolean }>(`/fighters/${fighterId}/follow`, { method: 'POST' });
}

export async function unfollowFighter(fighterId: string) {
  return makeRequest<{ message: string; isFollowing: boolean }>(`/fighters/${fighterId}/unfollow`, { method: 'DELETE' });
}

export async function getFollowedFighters() {
  return makeRequest<{ fighters: any[] }>('/fighters/followed');
}

// ==================== PRE-FIGHT COMMENTS ====================

export async function createPreFightComment(fightId: string, content: string) {
  return makeRequest<{ comment: any; message: string }>(`/fights/${fightId}/pre-fight-comment`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export async function getFightPreFightComments(fightId: string) {
  return makeRequest<{ comments: any[]; userComment: any | null }>(`/fights/${fightId}/pre-fight-comments`);
}

export async function createPreFightCommentReply(fightId: string, commentId: string, content: string) {
  return makeRequest<{ comment: any; message: string }>(`/fights/${fightId}/pre-fight-comments/${commentId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export async function updatePreFightComment(fightId: string, commentId: string, content: string) {
  return makeRequest<{ comment: any; message: string }>(`/fights/${fightId}/pre-fight-comments/${commentId}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export async function togglePreFightCommentUpvote(fightId: string, commentId: string) {
  return makeRequest<{ upvotes: number; userHasUpvoted: boolean }>(
    `/fights/${fightId}/pre-fight-comments/${commentId}/upvote`,
    { method: 'POST' },
  );
}

export async function flagPreFightComment(fightId: string, commentId: string, reason: string) {
  return makeRequest<{ message: string }>(`/fights/${fightId}/pre-fight-comments/${commentId}/flag`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// ==================== REVIEWS (post-fight) ====================

export async function createFightReviewReply(fightId: string, reviewId: string, content: string) {
  return makeRequest<{ review: any; message: string }>(`/fights/${fightId}/reviews/${reviewId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export async function updateFightReview(fightId: string, reviewId: string, content: string) {
  return makeRequest<{ review: any; message: string }>(`/fights/${fightId}/reviews/${reviewId}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

// ==================== PROFILE ====================

export async function updateProfile(data: {
  displayName?: string;
  firstName?: string;
  lastName?: string;
}) {
  return makeRequest<{ user: any; message: string }>('/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteAccount(confirmation: string) {
  return makeRequest<{ message: string }>('/auth/account', {
    method: 'DELETE',
    body: JSON.stringify({ confirmation }),
  });
}

export async function uploadProfileImage(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return makeRequest<{ imageUrl: string; message: string }>('/upload/profile-image', {
    method: 'POST',
    body: formData,
  });
}

export async function getMyRatings(params: {
  page?: string;
  limit?: string;
  sortBy?: string;
  filterType?: string;
  tagFilter?: string;
} = {}) {
  const qp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined) qp.append(k, String(v));
  });
  const qs = qp.toString();
  return makeRequest<{
    fights: any[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(`/fights/my-ratings${qs ? `?${qs}` : ''}`);
}

export async function checkDisplayNameAvailability(displayName: string) {
  return makeRequest<{ available: boolean; displayName: string }>(
    `/auth/check-displayname?displayName=${encodeURIComponent(displayName)}`,
  );
}

// ==================== COMMUNITY ====================

export async function getTopComments() {
  return makeRequest<{ data: any[] }>('/community/top-comments');
}

export async function getTopPreFightComments() {
  return makeRequest<{ data: any[] }>('/community/top-pre-fight-comments');
}

export async function getTopUpcomingFights(period = 'week') {
  return makeRequest<{ data: any[] }>(`/community/top-upcoming-fights?period=${period}`);
}

export async function getTopRecentFights(period = 'week', promotions?: string) {
  const params = new URLSearchParams({ period });
  if (promotions) params.append('promotions', promotions);
  return makeRequest<{ data: any[] }>(`/community/top-recent-fights?${params.toString()}`);
}

// ==================== SEARCH ====================

export async function search(query: string, limit = 10) {
  return makeRequest<{
    data: {
      fighters: any[];
      fights: any[];
      events: any[];
    };
  }>(`/search?q=${encodeURIComponent(query)}&limit=${limit}`);
}

// ==================== FEEDBACK ====================

export async function sendFeedback(data: { content: string; type: string }) {
  return makeRequest<{ message: string }>('/feedback', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
