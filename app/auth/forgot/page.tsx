'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { ShieldCheck, Mail, HelpCircle, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

const QUESTIONS: Record<string, string> = {
  pet: "What was your first pet's name?",
  city: "In which city were you born?",
  school: "What is your favorite school subject?"
};

export default function ForgotPage() {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1=Email, 2=Question
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  
  // State for failed attempts
  const [errorCount, setErrorCount] = useState(0);

  // Step 1: Find User & Get Question
  const handleFindUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Call the RPC function we just created
      const { data: qCode, error } = await supabase.rpc('get_security_question', { 
        email_input: email 
      });

      if (error) throw error;
      if (!qCode) throw new Error("No account found with this email.");

      setQuestion(QUESTIONS[qCode as string] || "Security Question");
      setStep(2);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify Answer & Send Email
  const handleVerifyAndSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const answerHash = btoa(answer.toLowerCase().trim());

      // Call the RPC verification function
      const { data: isValid, error } = await supabase.rpc('verify_security_answer', {
        email_input: email,
        answer_hash_input: answerHash
      });

      if (error) throw error;

      if (!isValid) {
        // Wrong Answer Logic
        setErrorCount(prev => prev + 1);
        if (errorCount >= 2) {
           throw new Error("Maximum attempts reached. Contact creator: aliaymanwork@gmail.com");
        }
        throw new Error("Incorrect Answer. Please try again.");
      }

      // CORRECT ANSWER: Send the Reset Email
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`, // This fixes the 404
      });

      if (resetError) throw resetError;

      toast.success("Security verified! Password reset link sent to your email.");
      router.push('/auth'); // Go back to login

    } catch (err: any) {
      toast.error(err.message, { duration: 5000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
       <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
          
          <div className="text-center mb-6">
            <div className="bg-slate-900 text-white w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4">
               <ShieldCheck size={24} />
            </div>
            <h2 className="text-2xl font-bold">Account Recovery</h2>
            <p className="text-slate-500 text-sm">Verify your identity to reset password.</p>
          </div>

          {step === 1 ? (
            <form onSubmit={handleFindUser} className="space-y-4">
               <div className="space-y-1">
                 <label className="text-xs font-bold uppercase text-slate-500">Enter your email</label>
                 <div className="relative">
                    <Mail className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input 
                      type="email" 
                      required 
                      className="w-full pl-10 p-3 border rounded-lg focus:ring-2 focus:ring-blue-600 outline-none" 
                      placeholder="user@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                 </div>
               </div>
               <button disabled={loading} className="w-full bg-slate-900 text-white p-3 rounded-lg font-bold hover:bg-black transition-all flex justify-center gap-2">
                 {loading ? <Loader2 className="animate-spin" /> : <>Continue <ArrowRight size={18}/></>}
               </button>
               <button type="button" onClick={() => router.push('/auth')} className="w-full text-sm text-slate-500 hover:text-slate-800">Back to Login</button>
            </form>
          ) : (
            <form onSubmit={handleVerifyAndSend} className="space-y-4 animate-in slide-in-from-right">
               <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-blue-800 text-sm font-medium flex gap-2">
                  <HelpCircle className="shrink-0" size={18} />
                  {question}
               </div>

               <div className="space-y-1">
                 <label className="text-xs font-bold uppercase text-slate-500">Your Answer</label>
                 <input 
                    type="text" 
                    required 
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-600 outline-none" 
                    placeholder="Type your answer..."
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                 />
               </div>

               {errorCount > 0 && (
                 <div className="text-red-500 text-xs flex items-center gap-1 font-bold">
                    <AlertTriangle size={12} /> {errorCount}/3 Attempts used
                 </div>
               )}

               <button disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold hover:bg-blue-700 transition-all flex justify-center">
                 {loading ? <Loader2 className="animate-spin" /> : 'Verify & Reset Password'}
               </button>
               <button type="button" onClick={() => setStep(1)} className="w-full text-sm text-slate-500 hover:text-slate-800">Back</button>
            </form>
          )}

       </div>
    </div>
  )
}