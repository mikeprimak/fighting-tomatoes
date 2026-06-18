import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPost } from '@/lib/posts';
import { BlogArticle } from '@/components/BlogArticle';

/**
 * Live-fidelity preview of a blog post — including drafts. Renders through the
 * real web app (same <BlogArticle>, same Tailwind theme, real React hydration
 * of fight cards) so admins can see exactly how a post will look before it's
 * published. Linked only from the admin panel's draft list.
 *
 * Always dynamic and `noindex, nofollow`: these URLs are unlisted (not in the
 * sitemap, RSS, /blog index, or home rotation) — they're just not secret. Don't
 * link to them publicly.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function BlogPreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug, { includeDrafts: true });
  if (!post) notFound();

  return (
    <>
      <div className="mx-auto mb-4 max-w-2xl rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
        Preview — this is how the post will render live. Unlisted &amp; hidden from search engines.
      </div>
      <BlogArticle post={post} />
    </>
  );
}
