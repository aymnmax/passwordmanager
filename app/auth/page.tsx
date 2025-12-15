'use client';
import { useState, useEffect } from 'react';
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
  const [loginStep, setLoginStep] = useState(1); // 1=Creds, 2=Security Image, 3=OTP
  const [otp, setOtp] = useState('');
  
  const [form, setForm] = useState({ 
    email: '', password: '', securityQ: '', securityA: '', selectedImage: '' 
  });

  const { setMasterKey } = useAuth();
  const router = useRouter();

  // Helper to send emails via your API (Gmail)
  const sendAlert = async (type: string, payload: any) => {
    await fetch('/api/send-email', {
      method: 'POST',
      body: JSON.stringify({
        to: form.email,
        subject: type === 'OTP' ? '🔐 New Device Verification Code' : '✅ Successful Login Alert',
        html: type === 'OTP' 
          ? `<h1>Verification Code</h1><p>Your code is: <b>${payload.code}</b></p>`
          : `<p>New login detected from <b>${payload.device}</b>.</p>`
      })
    });
  };

  // --- REGISTER ---
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const answerHash = btoa(form.securityA.toLowerCase().trim());
      // Pass profile data in 'options' for the SQL Trigger to catch
      const { error } = await supabase.auth.signUp({ 
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
      toast.success('Registered! Check your email to confirm account.');
      setIsLogin(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- LOGIN STEP 1: Verify Creds ---
  const handleLoginInit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ 
        email: form.email, password: form.password 
      });
      if (error) throw error;
      setLoginStep(2); // Go to Image Check
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- LOGIN STEP 2: Verify Image & Check Device ---
  const handleLoginImage = async (imageId: string) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expired");

      // 1. Verify Image
      const { data: profile } = await supabase.from('user_profiles').select('selected_animal').eq('id', user.id).single();
      if (profile?.selected_animal !== imageId) {
        await supabase.auth.signOut();
        setLoginStep(1);
        throw new Error("Wrong Security Image!");
      }

      // 2. Check Device
      const parser = new UAParser();
      const deviceName = `${parser.getBrowser().name} on ${parser.getOS().name}`;
      const deviceId = btoa(`${deviceName}-${user.id}`); // Simple ID
      
      const { data: trusted } = await supabase.from('trusted_devices').select('*').eq('device_id', deviceId).single();
      
      if (!trusted) {
        // NEW DEVICE: Send OTP
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        await sendAlert('OTP', { code });
        sessionStorage.setItem('temp_otp', code); // Store locally for demo (In prod, store hash in DB)
        sessionStorage.setItem('temp_device', deviceName);
        sessionStorage.setItem('temp_device_id', deviceId);
        toast.info("New device! Check email for OTP.");
        setLoginStep(3); // Go to OTP Entry
      } else {
        // TRUSTED: Login
        await completeLogin(user, deviceName);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- LOGIN STEP 3: Verify OTP ---
  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const storedOtp = sessionStorage.getItem('temp_otp');
    if (otp !== storedOtp) return toast.error("Invalid Code");

    const { data: { user } } = await supabase.auth.getUser();
    const deviceName = sessionStorage.getItem('temp_device')!;
    const deviceId = sessionStorage.getItem('temp_device_id')!;

    // Trust this device
    await supabase.from('trusted_devices').insert({ user_id: user?.id, device_id: deviceId, device_name: deviceName });
    
    await completeLogin(user!, deviceName);
  };

  const completeLogin = async (user: any, deviceName: string) => {
    // 1. Derive Key
    const key = await deriveKey(form.password, user.id);
    setMasterKey(key);
    
    // 2. Send Alert
    await sendAlert('LOGIN', { device: deviceName });
    
    // 3. Log Session
    await supabase.from('login_sessions').insert({ user_id: user.id, device_name: deviceName });
    
    router.push('/vault');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col md:flex-row border border-slate-100">
        
        {/* Left Branding */}
        <div className="md:w-5/12 bg-slate-900 p-8 text-white relative overflow-hidden">
           <div className="relative z-10 flex flex-col h-full justify-center">
             <ShieldCheck className="w-12 h-12 text-blue-400 mb-4" />
             <h1 className="text-3xl font-bold mb-2">Fortress Vault</h1>
             <p className="text-slate-400">Bank-grade security for your digital life.</p>
           </div>
           <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600 rounded-full blur-3xl opacity-20 transform translate-x-1/2 -translate-y-1/2" />
        </div>

        {/* Right Form */}
        <div className="md:w-7/12 p-10 flex flex-col justify-center">
          {isLogin ? (
            <>
              {loginStep === 1 && (
                <form onSubmit={handleLoginInit} className="space-y-4">
                   <h2 className="text-2xl font-bold">Sign In</h2>
                   <input type="email" required placeholder="Email" className="w-full p-3 rounded border" value={form.email} onChange={e=>setForm({...form, email: e.target.value})} />
                   <input type="password" required placeholder="Password" className="w-full p-3 rounded border" value={form.password} onChange={e=>setForm({...form, password: e.target.value})} />
                   <button disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700">Next</button>
                   <p className="text-center text-sm mt-4 cursor-pointer hover:text-blue-600" onClick={()=>router.push('/auth/forgot')}>Forgot Password?</p>
                </form>
              )}
              {loginStep === 2 && (
                 <div className="text-center">
                    <h2 className="text-xl font-bold mb-4">Select Security Image</h2>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {SECURITY_IMAGES.map(img => (
                        <button key={img.id} onClick={()=>handleLoginImage(img.id)} className="p-4 border rounded hover:bg-blue-50 text-3xl transition">{img.icon}</button>
                      ))}
                    </div>
                    <button onClick={()=>setLoginStep(1)} className="text-sm underline">Back</button>
                 </div>
              )}
              {loginStep === 3 && (
                 <form onSubmit={handleOtpVerify} className="space-y-4">
                    <h2 className="text-xl font-bold">New Device Verification</h2>
                    <p className="text-sm text-gray-500">We sent a code to your email.</p>
                    <input className="w-full text-center text-2xl tracking-widest p-3 border rounded" placeholder="000000" value={otp} onChange={e=>setOtp(e.target.value)} />
                    <button disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded font-bold">Verify & Login</button>
                 </form>
              )}
            </>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
               <h2 className="text-2xl font-bold">Create Account</h2>
               <div className="grid grid-cols-2 gap-2">
                 <input type="email" required placeholder="Email" className="w-full p-2 border rounded" value={form.email} onChange={e=>setForm({...form, email: e.target.value})} />
                 <input type="password" required placeholder="Password" className="w-full p-2 border rounded" value={form.password} onChange={e=>setForm({...form, password: e.target.value})} />
               </div>
               <select className="w-full p-2 border rounded" value={form.securityQ} onChange={e=>setForm({...form, securityQ: e.target.value})} required>
                  <option value="">Select Security Question...</option>
                  <option value="pet">First Pet?</option>
                  <option value="city">Birth City?</option>
               </select>
               <input type="text" required placeholder="Answer" className="w-full p-2 border rounded" value={form.securityA} onChange={e=>setForm({...form, securityA: e.target.value})} />
               <div>
                  <label className="text-sm font-bold">Security Image</label>
                  <div className="flex justify-between mt-2">
                    {SECURITY_IMAGES.map(img => (
                        <button type="button" key={img.id} onClick={()=>setForm({...form, selectedImage: img.id})} className={`text-xl p-2 border rounded ${form.selectedImage === img.id ? 'bg-blue-600 text-white' : ''}`}>{img.icon}</button>
                    ))}
                  </div>
               </div>
               <button disabled={loading} className="w-full bg-slate-900 text-white p-3 rounded font-bold hover:bg-slate-800">Register</button>
            </form>
          )}

          <div className="mt-6 text-center border-t pt-4">
             <button onClick={()=>{setIsLogin(!isLogin); setLoginStep(1)}} className="text-blue-600 font-medium">
               {isLogin ? "Need an account? Register" : "Have an account? Login"}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}