'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.push('/vault');
    else router.push('/auth');
  }, [user, router]);

  return <div className="flex items-center justify-center h-screen">Loading Secure Vault...</div>;
}