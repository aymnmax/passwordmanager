'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Send standard Supabase Reset Link
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Check your email for the reset link!");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
       <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md text-center">
          <h2 className="text-2xl font-bold mb-4">Reset Password</h2>
          <form onSubmit={handleReset} className="space-y-4">
            <input type="email" required placeholder="Enter your email" className="w-full p-3 border rounded" value={email} onChange={e=>setEmail(e.target.value)} />
            <button disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded font-bold">Send Reset Link</button>
          </form>
       </div>
    </div>
  )
}