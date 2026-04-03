export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="mb-6 text-2xl font-bold">Privacy Policy</h1>
      <div className="space-y-4 text-sm text-text-secondary">
        <p>Good Fights (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) operates the goodfights.app website and mobile application.</p>

        <h2 className="text-lg font-semibold text-foreground">Information We Collect</h2>
        <p>We collect information you provide directly: email address, display name, and fight ratings/reviews you submit.</p>

        <h2 className="text-lg font-semibold text-foreground">How We Use Your Information</h2>
        <p>We use your information to provide the Good Fights service, including displaying community ratings, reviews, and hype scores. We do not sell your personal information.</p>

        <h2 className="text-lg font-semibold text-foreground">Data Storage</h2>
        <p>Your data is stored securely on servers hosted by Render. Authentication tokens are encrypted.</p>

        <h2 className="text-lg font-semibold text-foreground">Account Deletion</h2>
        <p>You can delete your account at any time from the app settings or by visiting <a href="/delete-account" className="text-primary hover:underline">/delete-account</a>. This permanently removes all your data.</p>

        <h2 className="text-lg font-semibold text-foreground">Contact</h2>
        <p>For privacy questions, contact us at privacy@goodfights.app.</p>
      </div>
    </div>
  );
}
