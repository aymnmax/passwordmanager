'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { deriveKey } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { UAParser } from 'ua-parser-js';
import { Loader2, Mail, Lock, ShieldCheck, ArrowRight, HelpCircle } from 'lucide-react';

const SECURITY_IMAGES = [
  { id: 'elephant', label: 'Elephant', icon: '🐘' },
  { id: 'cat', label: 'Cat', icon: '🐱' },
  { id: 'dog', label: 'Dog', icon: '🐶' },
  { id: 'lion', label: 'Lion', icon: '🦁' },
  { id: 'panda', label: 'Panda', icon: '🐼' },
  { id: 'fox', label: 'Fox', icon: '🦊' },
];

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loginStep, setLoginStep] = useState(1);
  
  const [form, setForm] = useState({ 
    email: '', 
    password: '', 
    securityQ: '', 
    securityA: '', 
    selectedImage: '' 
  });

  const { setMasterKey } = useAuth();
  const router = useRouter();

  // --- REGISTER (UPDATED FOR EMAIL CONFIRMATION) ---
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.selectedImage) return toast.error('Please select a security image.');
    setLoading(true);

    try {
      // Encode security answer
      const answerHash = btoa(form.securityA.toLowerCase().trim());

      // 1. Sign Up
      // We pass the Profile Data as "User Metadata"
      // The SQL Trigger will read this and create the profile row automatically.
      const { data, error } = await supabase.auth.signUp({ 
        email: form.email, 
        password: form.password,
        options: {
          data: {
            security_question: form.securityQ,
            security_answer_hash: answerHash,
            selected_animal: form.selectedImage
          }
        }
      });

      if (error) throw error;

      // 2. Success Message
      // We don't log them in yet because they need to click the email link.
      toast.success('Registration successful! Please check your email to confirm your account.');
      setIsLogin(true); // Switch back to login screen
      setForm({ email: '', password: '', securityQ: '', securityA: '', selectedImage: '' });

    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- LOGIN STEP 1 ---
  const handleLoginInit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ 
        email: form.email, 
        password: form.password 
      });
      
      if (error) {
        if (error.message.includes("Email not confirmed")) {
            throw new Error("Please verify your email address first.");
        }
        throw new Error('Invalid email or password.');
      }
      
      setLoginStep(2);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- LOGIN STEP 2 ---
  const handleLoginFinal = async (imageId: string) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Session expired.');

      // Fetch Profile to verify image
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('selected_animal')
        .eq('id', user.id)
        .single();

      if (!profile || profile.selected_animal !== imageId) {
        await supabase.auth.signOut();
        setLoginStep(1);
        throw new Error('Security verification failed.');
      }

      const key = await deriveKey(form.password, user.id);
      setMasterKey(key);

      const parser = new UAParser();
      await supabase.from('login_sessions').insert({
        user_id: user.id,
        device_name: `${parser.getBrowser().name} on ${parser.getOS().name}`,
        ip_address: 'Logged' 
      });

      router.push('/vault');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col md:flex-row border border-slate-100">
        
        {/* Branding Side */}
        <div className="md:w-5/12 bg-slate-900 p-8 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-6 text-blue-400">
              <ShieldCheck className="w-6 h-6" />
              <span className="font-bold tracking-wide">FORTRESS</span>
            </div>
            <h1 className="text-3xl font-bold mb-3">
              {isLogin ? 'Welcome Back.' : 'Secure Vault.'}
            </h1>
            <p className="text-slate-400 text-sm">
              {isLogin ? 'Multi-factor encryption for your digital assets.' : 'Create your zero-knowledge account.'}
            </p>
          </div>
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-blue-600 rounded-full blur-3xl opacity-20" />
        </div>

        {/* Form Side */}
        <div className="md:w-7/12 p-8 md:p-12">
          {isLogin ? (
            // LOGIN UI
            loginStep === 1 ? (
              <form onSubmit={handleLoginInit} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Sign In</h2>
                  <p className="text-slate-500 text-sm">Enter your credentials.</p>
                </div>
                <div className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
                    <input type="email" required placeholder="Email" className="w-full pl-10 pr-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
                    <input type="password" required placeholder="Password" className="w-full pl-10 pr-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
                  </div>
                </div>
                <button disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg flex justify-center gap-2 transition-all">
                  {loading ? <Loader2 className="animate-spin" /> : <>Next <ArrowRight size={18} /></>}
                </button>
              </form>
            ) : (
              <div className="animate-in zoom-in">
                <h2 className="text-xl font-bold text-center mb-2">Security Verification</h2>
                <p className="text-center text-sm text-slate-500 mb-6">Select your security image.</p>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {SECURITY_IMAGES.map((img) => (
                    <button key={img.id} onClick={() => handleLoginFinal(img.id)} disabled={loading} className="flex flex-col items-center p-3 rounded-xl border hover:border-blue-500 hover:bg-blue-50 transition-all">
                      <span className="text-3xl mb-1">{img.icon}</span>
                      <span className="text-xs font-medium text-slate-600">{img.label}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setLoginStep(1)} className="w-full text-sm text-slate-500 hover:text-slate-800">Go Back</button>
              </div>
            )
          ) : (
            // REGISTER UI
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Register</h2>
                <p className="text-slate-500 text-sm">Create your master account.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="email" placeholder="Email" required className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
                <input type="password" placeholder="Master Password" required className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium"><HelpCircle size={14} /> Security Question</div>
                <select className="w-full px-2 py-2 rounded border text-sm" value={form.securityQ} onChange={e => setForm({...form, securityQ: e.target.value})} required>
                  <option value="">Select...</option>
                  <option value="pet">First Pet Name</option>
                  <option value="city">Birth City</option>
                </select>
                <input type="text" placeholder="Answer" required className="w-full px-2 py-2 rounded border text-sm" value={form.securityA} onChange={e => setForm({...form, securityA: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">Security Image</label>
                <div className="grid grid-cols-6 gap-2">
                  {SECURITY_IMAGES.map((img) => (
                    <button key={img.id} type="button" onClick={() => setForm({...form, selectedImage: img.id})} className={`aspect-square flex items-center justify-center text-lg rounded border transition-all ${form.selectedImage === img.id ? 'bg-blue-600 text-white scale-105' : 'bg-white'}`}>{img.icon}</button>
                  ))}
                </div>
              </div>
              <button disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-lg shadow-lg mt-2">
                {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Register & Send Confirmation'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center pt-4 border-t border-slate-100">
            <button onClick={() => { setIsLogin(!isLogin); setLoginStep(1); }} className="text-sm font-medium text-slate-500 hover:text-blue-600">
              {isLogin ? "Need an account? Register" : "Have an account? Sign In"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}