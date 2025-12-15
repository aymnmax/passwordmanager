'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { deriveKey } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';
import { UAParser } from 'ua-parser-js';
import { toast } from 'sonner';
import { Loader2, Lock, Mail, ArrowRight, ShieldCheck } from 'lucide-react';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const { setMasterKey } = useAuth();
  const router = useRouter();

  // Helper: Send Email via our API
  const sendEmail = async (type: 'OTP' | 'ALERT' | 'FAILED', details: any) => {
    let subject = '';
    let html = '';

    if (type === 'OTP') {
      subject = '🔐 Verify New Device Login';
      html = `<h2>New Device Detected</h2><p>Your OTP code is: <strong>${details.code}</strong></p><p>If this wasn't you, change your password immediately.</p>`;
    } else if (type === 'ALERT') {
      subject = '✅ Successful Login';
      html = `<p>New login detected from <strong>${details.device}</strong> at ${new Date().toLocaleString()}.</p>`;
    } else if (type === 'FAILED') {
      subject = '⚠️ Failed Login Attempt';
      html = `<p>A failed login attempt was made for your account from <strong>${details.device}</strong>.</p>`;
    }

    await fetch('/api/send-email', {
      method: 'POST',
      body: JSON.stringify({ to: email, subject, html }),
    });
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const parser = new UAParser();
    const deviceName = `${parser.getBrowser().name || 'Unknown'} on ${parser.getOS().name || 'System'}`;
    // Simple device ID (In prod, use a dedicated fingerprint library)
    const deviceId = btoa(`${deviceName}-${navigator.platform}`); 

    try {
      if (isLogin) {
        // 1. Supabase Login
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        
        if (error) {
          await sendEmail('FAILED', { device: deviceName });
          throw new Error('Invalid credentials');
        }

        // 2. Check Trusted Device
        const { data: trusted } = await supabase
          .from('trusted_devices')
          .select('*')
          .eq('user_id', data.user.id)
          .eq('device_id', deviceId)
          .single();

        if (!trusted) {
          // --- NEW DEVICE FLOW ---
          const code = Math.floor(100000 + Math.random() * 900000).toString(); // Generate 6-digit OTP
          
          // Save OTP to DB
          await supabase.from('verification_codes').insert({
            user_id: data.user.id,
            code: code,
            expires_at: new Date(Date.now() + 5 * 60000).toISOString() // 5 mins expiry
          });

          // Send OTP Email
          await sendEmail('OTP', { code });

          // Store temp data and redirect to verify page
          sessionStorage.setItem('temp_key_material', password); // Temporary storage for verify step
          sessionStorage.setItem('temp_device_id', deviceId);
          sessionStorage.setItem('temp_device_name', deviceName);
          
          toast.info('New device detected. Please check your email for a code.');
          router.push('/auth/verify');
          return;
        }

        // --- TRUSTED DEVICE FLOW ---
        const key = await deriveKey(password, data.user.id);
        setMasterKey(key);
        
        await sendEmail('ALERT', { device: deviceName });
        toast.success('Welcome back to your Vault');
        router.push('/vault');

      } else {
        // Register
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success('Registration successful! Please confirm your email.');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
        <div className="text-center mb-8">
          <div className="bg-blue-600 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
            <ShieldCheck className="text-white w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            {isLogin ? 'Enter your credentials to access your vault.' : 'Setup your secure zero-knowledge vault.'}
          </p>
        </div>
        
        <form onSubmit={handleAuth} className="space-y-5">
          <div className="relative">
            <Mail className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
            <input 
              type="email" 
              placeholder="Email address"
              required
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
            <input 
              type="password" 
              placeholder="Master Password"
              required
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-200 disabled:opacity-70"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : (
              <>
                {isLogin ? 'Unlock Vault' : 'Create Vault'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-slate-500 hover:text-blue-600 font-medium transition-colors"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
          </button>
        </div>
      </div>
    </div>
  );
}