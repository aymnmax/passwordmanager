'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { deriveKey } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { UAParser } from 'ua-parser-js';
import { 
  Loader2, 
  Mail, 
  Lock, 
  ShieldCheck, 
  ArrowRight, 
  HelpCircle, 
  CheckCircle2, 
  LayoutGrid 
} from 'lucide-react';

// Professional icons for the security image step
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
  const [loginStep, setLoginStep] = useState(1); // 1 = Credentials, 2 = Security Image
  
  const [form, setForm] = useState({ 
    email: '', 
    password: '', 
    securityQ: '', 
    securityA: '', 
    selectedImage: '' 
  });

  const { setMasterKey } = useAuth();
  const router = useRouter();

  // --- REGISTRATION LOGIC ---
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.selectedImage) return toast.error('Please select a security image.');
    setLoading(true);

    try {
      // 1. Create Auth User
      const { data, error } = await supabase.auth.signUp({ 
        email: form.email, 
        password: form.password 
      });

      if (error) throw error;
      if (!data.user) throw new Error('Registration failed. Please try again.');

      // 2. Create Security Profile
      // Note: If you get an RLS error here, ensure "Confirm Email" is DISABLED in Supabase
      const answerHash = btoa(form.securityA.toLowerCase().trim()); // Basic encoding
      
      const { error: profileError } = await supabase.from('user_profiles').insert({
        id: data.user.id,
        security_question: form.securityQ,
        security_answer_hash: answerHash,
        selected_animal: form.selectedImage
      });

      if (profileError) {
        // Fallback: If insert fails, try to clean up auth user so they can try again
        console.error("Profile Error:", profileError);
        throw new Error("Failed to create profile. Please contact support.");
      }

      toast.success('Account created successfully. Please sign in.');
      setIsLogin(true);
      setForm({ email: '', password: '', securityQ: '', securityA: '', selectedImage: '' });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- LOGIN STEP 1: VALIDATE CREDENTIALS ---
  const handleLoginInit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Check if credentials are valid before moving to image step
      const { error } = await supabase.auth.signInWithPassword({ 
        email: form.email, 
        password: form.password 
      });

      if (error) throw new Error('Invalid email or password.');
      
      // If valid, move to Security Image Step
      setLoginStep(2);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- LOGIN STEP 2: VALIDATE IMAGE & DERIVE KEY ---
  const handleLoginFinal = async (imageId: string) => {
    setLoading(true);
    try {
      // 1. Get current session (we signed in during step 1)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Session expired. Please login again.');

      // 2. Verify Security Image
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('selected_animal')
        .eq('id', user.id)
        .single();

      if (!profile || profile.selected_animal !== imageId) {
        // Security mismatch - Force logout
        await supabase.auth.signOut();
        setLoginStep(1);
        throw new Error('Security verification failed.');
      }

      // 3. Derive Encryption Key (Zero Knowledge)
      const key = await deriveKey(form.password, user.id);
      setMasterKey(key);

      // 4. Log Session
      const parser = new UAParser();
      await supabase.from('login_sessions').insert({
        user_id: user.id,
        device_name: `${parser.getBrowser().name} on ${parser.getOS().name}`,
        ip_address: 'Logged' 
      });

      toast.success('Vault unlocked.');
      router.push('/vault');

    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row border border-slate-100">
        
        {/* Left Side: Visual/Branding */}
        <div className="md:w-1/2 bg-slate-900 p-12 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-8 text-blue-400">
              <ShieldCheck className="w-8 h-8" />
              <span className="font-semibold text-lg tracking-wide">FORTRESS</span>
            </div>
            <h1 className="text-4xl font-bold mb-4 leading-tight">
              {isLogin ? 'Welcome Back.' : 'Secure Your Digital Life.'}
            </h1>
            <p className="text-slate-400 text-lg">
              {isLogin 
                ? 'Access your encrypted vault securely with multi-factor verification.' 
                : 'Zero-knowledge encryption for your passwords and API keys.'}
            </p>
          </div>
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-blue-600 rounded-full blur-3xl opacity-20" />
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-indigo-600 rounded-full blur-3xl opacity-20" />
        </div>

        {/* Right Side: Form */}
        <div className="md:w-1/2 p-12 flex flex-col justify-center">
          
          {/* LOGIN FLOW */}
          {isLogin && (
            <>
              {loginStep === 1 ? (
                <form onSubmit={handleLoginInit} className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-1">Sign In</h2>
                    <p className="text-slate-500 text-sm">Enter your master credentials to proceed.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
                        <input 
                          type="email" required 
                          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                          value={form.email} 
                          onChange={e => setForm({...form, email: e.target.value})}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-sm font-medium text-slate-700">Master Password</label>
                        <button type="button" onClick={() => router.push('/auth/forgot')} className="text-xs text-blue-600 hover:underline">Forgot?</button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
                        <input 
                          type="password" required 
                          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                          value={form.password} 
                          onChange={e => setForm({...form, password: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>

                  <button 
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-70"
                  >
                    {loading ? <Loader2 className="animate-spin" /> : <>Verify Credentials <ArrowRight size={18} /></>}
                  </button>
                </form>
              ) : (
                <div className="animate-in zoom-in duration-300">
                  <h2 className="text-2xl font-bold text-slate-900 mb-2 text-center">Security Verification</h2>
                  <p className="text-slate-500 text-sm text-center mb-6">Select your personal security image to unlock the vault.</p>
                  
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {SECURITY_IMAGES.map((img) => (
                      <button
                        key={img.id}
                        onClick={() => handleLoginFinal(img.id)}
                        disabled={loading}
                        className="flex flex-col items-center p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all group"
                      >
                        <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">{img.icon}</span>
                        <span className="text-xs font-medium text-slate-600 group-hover:text-blue-600">{img.label}</span>
                      </button>
                    ))}
                  </div>
                  
                  <button onClick={() => setLoginStep(1)} className="w-full text-sm text-slate-500 hover:text-slate-800">
                    Cancel and go back
                  </button>
                </div>
              )}
            </>
          )}

          {/* REGISTER FLOW */}
          {!isLogin && (
            <form onSubmit={handleRegister} className="space-y-4 animate-in fade-in slide-in-from-left-8 duration-500">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-1">Create Account</h2>
                <p className="text-slate-500 text-sm">Configure your vault security settings.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input 
                  type="email" placeholder="Email Address" required
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                />
                <input 
                  type="password" placeholder="Master Password" required
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                />
              </div>

              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <HelpCircle size={16} className="text-blue-500" /> Security Question
                </div>
                <select 
                  className="w-full px-3 py-2 rounded border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={form.securityQ} onChange={e => setForm({...form, securityQ: e.target.value})}
                  required
                >
                  <option value="">Select a question...</option>
                  <option value="pet">What was the name of your first pet?</option>
                  <option value="school">What elementary school did you attend?</option>
                  <option value="city">In what city were you born?</option>
                </select>
                <input 
                  type="text" placeholder="Your Answer" required
                  className="w-full px-3 py-2 rounded border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={form.securityA} onChange={e => setForm({...form, securityA: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Select Security Image</label>
                <div className="grid grid-cols-6 gap-2">
                  {SECURITY_IMAGES.map((img) => (
                    <button
                      key={img.id} type="button"
                      onClick={() => setForm({...form, selectedImage: img.id})}
                      className={`aspect-square flex items-center justify-center text-xl rounded-lg border transition-all ${
                        form.selectedImage === img.id 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-105' 
                          : 'bg-white border-slate-200 hover:border-blue-400'
                      }`}
                      title={img.label}
                    >
                      {img.icon}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                disabled={loading}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-lg transition-all shadow-sm mt-2 disabled:opacity-70"
              >
                {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Create Secure Vault'}
              </button>
            </form>
          )}

          {/* Footer Toggle */}
          <div className="mt-8 text-center pt-6 border-t border-slate-100">
            <button 
              onClick={() => { setIsLogin(!isLogin); setLoginStep(1); }}
              className="text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors flex items-center justify-center gap-1 mx-auto"
            >
              {isLogin ? (
                <>Don't have an account? <span className="text-blue-600">Register</span></>
              ) : (
                <>Already have an account? <span className="text-blue-600">Sign In</span></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}