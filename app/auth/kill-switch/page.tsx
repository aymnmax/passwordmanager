'use client';

import { useEffect, useState, Suspense } from 'react'; // Added Suspense
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AlertOctagon, Loader2 } from 'lucide-react';

// 1. The inner component that reads the URL
function KillSwitchContent() {
  const searchParams = useSearchParams();
  const uid = searchParams.get('uid');
  
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const kill = async () => {
       await supabase.rpc('trigger_kill_switch', { target_user_id: uid });
       await supabase.auth.signOut(); 
       setDone(true);
    };
    kill();
  }, [uid]);

  return (
    <div className="bg-white p-10 rounded-xl shadow-2xl text-center border-2 border-red-500 max-w-md">
       {done ? (
         <>
           <AlertOctagon className="w-20 h-20 mx-auto text-red-600 mb-4 animate-pulse"/>
           <h1 className="text-3xl font-black text-red-700">ACCOUNT LOCKED</h1>
           <p className="text-slate-600 mt-4 text-lg">We have terminated all sessions and flagged your account.</p>
           <p className="text-slate-500 mt-2 text-sm">Please contact the administrator or use the recovery flow to regain access.</p>
         </>
       ) : (
         <Loader2 className="w-12 h-12 animate-spin mx-auto text-red-600"/>
       )}
    </div>
  );
}

// 2. The main page component that wraps it in Suspense
export default function KillSwitchPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
      <Suspense fallback={<Loader2 className="w-12 h-12 animate-spin text-red-600"/>}>
        <KillSwitchContent />
      </Suspense>
    </div>
  );
}