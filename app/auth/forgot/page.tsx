'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { ShieldCheck, Mail, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ForgotPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Send secure reset link via Supabase
      const { error } = await supabase.auth.resetPasswordForEmail(email, { 
        redirectTo: `${window.location.origin}/auth/update-password` 
      });
      if (error) throw error;
      
      toast.success("Recovery link sent! Please check your email.");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLostEverything = async () => {
    if (!email) return toast.error("Please enter your email first.");
    if (!confirm("This will trigger a rigorous security process. A 24-hour hold will be placed on your account. Proceed?")) return;

    setLoading(true);
    try {
      const token = crypto.randomUUID();
      const deviceToken = localStorage.getItem('vault_device_token') || 'unknown_device';

      const res = await fetch('/api/recovery/initiate', {
        method: 'POST',
        body: JSON.stringify({ email, deviceToken, token })
      });
      
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      await fetch('/api/email', {
        method: 'POST',
        body: JSON.stringify({ type: 'recovery_request', to: email, data: { token, deviceToken } })
      });

      toast.success("Recovery request sent. Check your email to Accept/Decline.");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
       <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
          <div className="text-center mb-6">
            <div className="bg-slate-900 text-white w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4"><ShieldCheck size={24} /></div>
            <h2 className="text-2xl font-bold">Account Recovery</h2>
            <p className="text-slate-500 text-sm">Enter your email to receive a secure recovery link.</p>
          </div>

          <form onSubmit={handleResetRequest} className="space-y-4">
             <div className="space-y-1">
               <label className="text-xs font-bold uppercase text-slate-500">Email Address</label>
               <div className="relative"><Mail className="absolute left-3 top-3 text-gray-400" size={18} /><input type="email" required className="w-full pl-10 p-3 border rounded-lg outline-none focus:ring-2 focus:ring-slate-900" value={email} onChange={e => setEmail(e.target.value)} /></div>
             </div>
             
             <button disabled={loading} className="w-full bg-slate-900 text-white p-3 rounded-lg font-bold flex justify-center items-center gap-2 hover:bg-slate-800 transition-colors">
               {loading ? <Loader2 className="animate-spin" /> : <>Send Recovery Link <ArrowRight size={18}/></>}
             </button>
             
             <div className="pt-6 mt-6 border-t border-slate-100 text-center space-y-4">
               <div>
                 <p className="text-xs text-slate-500 mb-2">Lost your Emergency Kit or Authenticator?</p>
                 <button type="button" onClick={handleLostEverything} className="text-xs text-red-600 font-bold flex items-center justify-center gap-1 hover:underline w-full">
                    <AlertTriangle size={12}/> Initiate 24h Emergency Lockdown
                 </button>
               </div>
               <button type="button" onClick={() => router.push('/auth')} className="w-full text-sm text-slate-500 hover:text-slate-900">Return to Login</button>
             </div>
          </form>
       </div>
    </div>
  )
}