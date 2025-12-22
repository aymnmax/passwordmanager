'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { ShieldCheck, Mail, HelpCircle, AlertTriangle, ArrowRight, Loader2, Smartphone, AlertOctagon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { authenticator } from 'otplib';

const QUESTIONS: Record<string, string> = {
  pet: "What was your first pet's name?",
  city: "In which city were you born?",
  school: "What is your favorite school subject?"
};

export default function ForgotPage() {
  const router = useRouter();
  const [step, setStep] = useState(1); 
  const [loading, setLoading] = useState(false);
  
  // Data
  const [email, setEmail] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [errorCount, setErrorCount] = useState(0);

  // --- HELPER: SHA-256 Hashing ---
  const hashAnswer = async (text: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(text.toLowerCase().trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // --- NEW: Handle "Lost Everything" Request ---
  const handleLostEverything = async () => {
    if (!email) return toast.error("Please enter your email first.");
    if (!confirm("This will trigger a rigorous security process. A 24-hour hold will be placed on your account. Proceed?")) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.rpc('get_user_id_by_email', { email_input: email }); // Needs RPC helper or search
      // Simpler: Just search users if you have permission, or assume email is valid for security flow
      // Since client can't search auth.users, we insert blind or use an Edge Function. 
      // For this demo, we assume the user ID is retrievable via a secure RPC or we skip user_id check here and do it in email.
      
      // Let's generate a unique token
      const token = crypto.randomUUID();
      const deviceToken = localStorage.getItem('vault_device_token') || 'unknown_device';

      // 1. Create DB Request
      // NOTE: We need the UserID. If you can't get it easily on client, 
      // you should move this logic to a NextJS API Route. 
      // For now, I will use a dummy fetch to an API route to handle the lookup safely.
      
      const res = await fetch('/api/recovery/initiate', {
        method: 'POST',
        body: JSON.stringify({ email, deviceToken, token })
      });
      
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      // 2. Send Email
      await fetch('/api/email', {
        method: 'POST',
        body: JSON.stringify({
          type: 'recovery_request',
          to: email,
          data: { token, deviceToken }
        })
      });

      toast.success("Recovery request sent. Check your email to Accept/Decline.");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Find User
  const handleFindUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: qCode, error } = await supabase.rpc('get_security_question', { email_input: email });
      if (error || !qCode) throw new Error("No account found.");
      setQuestion(QUESTIONS[qCode as string] || "Security Question");
      setStep(2);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify Normal
  const handleVerifyAndSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const answerHash = await hashAnswer(answer);
      const { data: secret, error } = await supabase.rpc('verify_security_answer', { email_input: email, answer_hash_input: answerHash });
      
      if (error || secret === null) {
        setErrorCount(prev => prev + 1);
        if (errorCount >= 2) throw new Error("Too many failures. Account Locked.");
        throw new Error("Incorrect Security Answer.");
      }

      if (secret) {
        if (!authCode) throw new Error("Enter Authenticator Code.");
        if (!authenticator.check(authCode, secret)) throw new Error("Invalid Code.");
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/update-password` });
      if (resetError) throw resetError;
      toast.success("Verified! Password reset link sent.");
      router.push('/auth');
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
            <p className="text-slate-500 text-sm">Verify identity to reset password.</p>
          </div>

          {step === 1 ? (
            <form onSubmit={handleFindUser} className="space-y-4">
               <div className="space-y-1">
                 <label className="text-xs font-bold uppercase text-slate-500">Enter your email</label>
                 <div className="relative"><Mail className="absolute left-3 top-3 text-gray-400" size={18} /><input type="email" required className="w-full pl-10 p-3 border rounded-lg" value={email} onChange={e => setEmail(e.target.value)} /></div>
               </div>
               <button disabled={loading} className="w-full bg-slate-900 text-white p-3 rounded-lg font-bold flex justify-center gap-2">{loading ? <Loader2 className="animate-spin" /> : <>Continue <ArrowRight size={18}/></>}</button>
               
               {/* THE NEW "LOST EVERYTHING" BUTTON */}
               <div className="pt-4 border-t mt-4 text-center">
                 <p className="text-xs text-gray-500 mb-2">Forgot your Security Question or Lost 2FA?</p>
                 <button type="button" onClick={handleLostEverything} className="text-xs text-red-600 font-bold flex items-center justify-center gap-1 hover:underline w-full">
                    <AlertTriangle size={12}/> Initiate Full Recovery (24h Wait)
                 </button>
               </div>
               
               <button type="button" onClick={() => router.push('/auth')} className="w-full text-sm text-slate-500 mt-2">Back to Login</button>
            </form>
          ) : (
            <form onSubmit={handleVerifyAndSend} className="space-y-5 animate-in slide-in-from-right">
               <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-blue-800 text-sm font-medium flex gap-2 mb-2"><HelpCircle className="shrink-0" size={18} />{question}</div>
               <input type="text" required className="w-full p-3 border rounded-lg" placeholder="Your Answer" value={answer} onChange={e => setAnswer(e.target.value)} />
               <div><label className="text-xs font-bold uppercase text-slate-500 mb-1 flex items-center gap-1"><Smartphone size={12} /> Authenticator Code</label><input type="text" maxLength={6} className="w-full p-3 border rounded-lg font-mono text-center text-lg" placeholder="000 000" value={authCode} onChange={e => setAuthCode(e.target.value)} /></div>
               <button disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold">{loading ? <Loader2 className="animate-spin" /> : 'Verify & Reset Password'}</button>
               <button type="button" onClick={() => setStep(1)} className="w-full text-sm text-slate-500 mt-2">Back</button>
            </form>
          )}
       </div>
    </div>
  )
}