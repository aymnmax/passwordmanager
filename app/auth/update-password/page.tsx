'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Lock, Loader2 } from 'lucide-react';

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Get the user's email from the current session (set by the reset link)
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setEmail(user.email);
    };
    getUser();
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!email) throw new Error("Session expired. Please try the reset link again.");

      // 1. Update Password
      const { error } = await supabase.auth.updateUser({ password: password });
      if (error) throw error;
      
      // 2. UNLOCK ACCOUNT (Reset attempts to 0)
      await supabase.rpc('unlock_account_by_email', { email_input: email });

      toast.success("Password updated & Account Unlocked! Logging you in...");
      router.push('/vault');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
       <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
          <div className="text-center mb-6">
            <div className="bg-green-100 text-green-600 w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4">
               <Lock size={24} />
            </div>
            <h2 className="text-2xl font-bold">Set New Password</h2>
            <p className="text-slate-500 text-sm">Enter your new master password to unlock your account.</p>
          </div>

          <form onSubmit={handleUpdate} className="space-y-4">
            <input 
              type="password" 
              required 
              placeholder="New Password" 
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none" 
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <button disabled={loading} className="w-full bg-green-600 text-white p-3 rounded-lg font-bold hover:bg-green-700 transition-all">
               {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Update & Unlock'}
            </button>
          </form>
       </div>
    </div>
  );
}