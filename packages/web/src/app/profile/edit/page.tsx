'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { updateProfile, uploadProfileImage, checkDisplayNameAvailability } from '@/lib/api';
import { useSpoilerFree } from '@/lib/spoilerFree';
import { ArrowLeft, Camera } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function EditProfilePage() {
  const { user, setUser, isAuthenticated, isLoading } = useAuth();
  const { spoilerFreeMode, setSpoilerFreeMode } = useSpoilerFree();
  const router = useRouter();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  if (!isAuthenticated || !user) {
    router.push('/login');
    return null;
  }

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (displayName && displayName !== user.displayName) {
        const { available } = await checkDisplayNameAvailability(displayName);
        if (!available) {
          setError('Display name is already taken');
          setSaving(false);
          return;
        }
      }
      const { user: updatedUser } = await updateProfile({
        displayName: displayName || undefined,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });
      setUser({ ...user, ...updatedUser });
      setSuccess('Profile updated!');
    } catch (err: any) {
      setError(err.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { imageUrl } = await uploadProfileImage(file);
      setUser({ ...user, avatar: imageUrl });
    } catch (err: any) {
      setError(err.error || 'Failed to upload image');
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <Link href="/profile" className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft size={14} />
        Profile
      </Link>

      <h1 className="mb-6 text-xl font-bold">Edit Profile</h1>

      {/* Avatar */}
      <div className="mb-6 flex justify-center">
        <label className="group relative cursor-pointer">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-card">
            {user.avatar ? (
              <img src={user.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-primary">
                {user.displayName?.[0] || user.email[0].toUpperCase()}
              </span>
            )}
          </div>
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera size={20} className="text-white" />
          </div>
          <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
        </label>
      </div>

      {error && <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</div>}
      {success && <div className="mb-4 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">{success}</div>}

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-4 py-3 text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">First Name</label>
          <input
            type="text"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-4 py-3 text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Last Name</label>
          <input
            type="text"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-4 py-3 text-foreground focus:border-primary focus:outline-none"
          />
        </div>

        {/* Spoiler-free mode */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
          <div>
            <p className="text-sm font-medium">Spoiler-Free Mode</p>
            <p className="text-xs text-text-secondary">Hide fight outcomes until you rate</p>
          </div>
          <button
            onClick={() => setSpoilerFreeMode(!spoilerFreeMode)}
            className={`relative h-6 w-11 rounded-full transition-colors ${spoilerFreeMode ? 'bg-primary' : 'bg-border'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${spoilerFreeMode ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-lg bg-primary py-3 font-semibold text-text-on-accent transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
