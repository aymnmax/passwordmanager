'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ShieldAlert, Loader2, CheckCircle2 } from 'lucide-react';

function FreezeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const userId = searchParams.get('user');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (!userId) {
      setStatus('error');
      return;
    }

    const freezeVault = async () => {
      const { error } = await supabase.rpc('freeze_account', { target_user_id: userId });
      if (error) {
        setStatus('error');
      } else {
        setStatus('success');
      }
    };

    freezeVault();
  }, [userId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md text-center border border-slate-100">
        {status === 'loading' && (
          <div className="space-y-4">
            <Loader2 className="animate-spin w-12 h-12 text-slate-900 mx-auto" />
            <h2 className="text-xl font-bold">Initiating Lockdown...</h2>
          </div>
        )}
        
        {status === 'success' && (
          <div className="space-y-4 text-red-600 animate-in zoom-in">
            <ShieldAlert className="w-16 h-16 mx-auto" />
            <h2 className="text-2xl font-black">VAULT FROZEN</h2>
            <p className="text-slate-600 text-sm">
              Your account has been instantly locked to protect your data. All current sessions have been invalidated.
            </p>
            <p className="text-slate-600 text-sm font-bold">
              You must use your physical Emergency Kit to recover your vault and set a new password.
            </p>
            <button onClick={() => router.push('/auth/update-password')} className="mt-6 w-full bg-slate-900 text-white p-3 rounded font-bold hover:bg-slate-800">
              Recover Vault Now
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-red-600">Invalid Freeze Link</h2>
            <p className="text-slate-500 text-sm">This link is invalid or malformed.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FreezePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin"/></div>}>
      <FreezeContent />
    </Suspense>
  );
}