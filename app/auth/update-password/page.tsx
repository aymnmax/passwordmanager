'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Lock, Loader2 } from 'lucide-react';

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: password });
      
      if (error) throw error;
      
      toast.success("Password updated successfully! Logging you in...");
      router.push('/vault'); // Redirect to Vault
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
            <p className="text-slate-500 text-sm">Enter your new master password below.</p>
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
               {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Update Password'}
            </button>
          </form>
       </div>
    </div>
  );
}