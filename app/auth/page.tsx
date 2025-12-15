'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { deriveKey } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { UAParser } from 'ua-parser-js';
import { Loader2, Mail, Lock, ShieldCheck, ArrowRight, HelpCircle, AlertTriangle } from 'lucide-react';

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
  const [loginStep, setLoginStep] = useState(1); // 1=Creds, 2=Image, 3=OTP
  const [otp, setOtp] = useState('');
  
  const [form, setForm] = useState({ 
    email: '', password: '', securityQ: '', securityA: '', selectedImage: '' 
  });

  const { setMasterKey } = useAuth();
  const router = useRouter();

  // Helper: Send Email (Fails gracefully if API is down)
  const sendAlert = async (type: string, payload: any) => {
    try {
      await fetch('/api/send-email', {
        method: 'POST',
        body: JSON.stringify({
          to: form.email,
          subject: type === 'OTP' ? '🔐 Verification Code' : '✅ Login Alert',
          html: type === 'OTP' 
            ? `<h1>Code: ${payload.code}</h1><p>Enter this code to verify your new device.</p>`
            : `<p>New login detected from <b>${payload.device}</b>.</p>`
        })
      });
    } catch (e) {
      console.error("Email API failed:", e);
    }
  };

  // --- REGISTER ---
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.selectedImage) return toast.error('Please select a security image.');
    setLoading(true);

    try {
      // Encode security answer to hide it slightly
      const answerHash = btoa(form.securityA.toLowerCase().trim());
      
      // 1. Sign Up
      // We pass the Profile Data as "User Metadata"
      // The Database Trigger will read this and create the profile row automatically.
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

      toast.success('Account created! You can now sign in.');
      setIsLogin(true);
      setForm({ email: '', password: '', securityQ: '', securityA: '', selectedImage: '' });

    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- LOGIN STEP 1: Verify Credentials ---
  const handleLoginInit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ 
        email: form.email, password: form.password 
      });
      if (error) throw error;
      setLoginStep(2); // Success -> Move to Security Image
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- LOGIN STEP 2: Verify Image & Check Device ---
  const handleLoginImage = async (imageId: string) => {
    setLoading(true);
    console.log("Step 1: Checking Security Image...");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expired. Please reload.");

      // 1. Verify Image from Database
      const { data: profile } = await supabase.from('user_profiles').select('selected_animal').eq('id', user.id).single();
      
      if (!profile || profile.selected_animal !== imageId) {
        await supabase.auth.signOut();
        setLoginStep(1);
        throw new Error("Wrong Security Image! Verification failed.");
      }

      console.log("Step 2: Image Correct. Checking Device Trust...");

      // 2. Check Device Trust
      const parser = new UAParser();
      const deviceName = `${parser.getBrowser().name} on ${parser.getOS().name}`;
      // Create a unique ID for this browser
      const deviceId = btoa(`${user.id}-${deviceName}`); 
      
      console.log("Step 3: Device ID generated:", deviceId);

      // Check if this device ID exists in the trusted_devices table
      const { data: trusted, error } = await supabase
        .from('trusted_devices')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();
      
      if (error) {
        console.error("Database Error:", error);
        throw new Error("System error checking device. See console.");
      }

      console.log("Step 4: Trust Check Result:", trusted);
      
      if (!trusted) {
        // --- NEW DEVICE DETECTED ---
        console.log("Step 5: New Device! Sending OTP...");
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save temporary state for the next step
        sessionStorage.setItem('temp_otp', code);
        sessionStorage.setItem('temp_device', deviceName);
        sessionStorage.setItem('temp_device_id', deviceId);

        console.log("DEBUG OTP (In case email fails):", code); // Look here in F12 Console
        await sendAlert('OTP', { code });
        
        toast.info("New device detected! Check email for OTP code.");
        setLoginStep(3); // Move to OTP Step
        return; 
      }

      // --- TRUSTED DEVICE ---
      console.log("Step 5: Trusted Device. Logging in...");
      await completeLogin(user, deviceName);

    } catch (err: any) {
      console.error("Login Error:", err);
      toast.error(err.message || "Error checking security");
    } finally {
      setLoading(false);
    }
  };

  // --- LOGIN STEP 3: Verify OTP ---
  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const storedOtp = sessionStorage.getItem('temp_otp');
    
    if (otp !== storedOtp) return toast.error("Invalid Code. Check console for DEBUG OTP.");

    const { data: { user } } = await supabase.auth.getUser();
    const deviceName = sessionStorage.getItem('temp_device')!;
    const deviceId = sessionStorage.getItem('temp_device_id')!;

    // Add to Trusted Devices so we don't ask again
    await supabase.from('trusted_devices').insert({ 
      user_id: user?.id, 
      device_id: deviceId, 
      device_name: deviceName 
    });
    
    await completeLogin(user!, deviceName);
  };

  const completeLogin = async (user: any, deviceName: string) => {
    // 1. Derive Encryption Key (Zero Knowledge)
    const key = await deriveKey(form.password, user.id);
    setMasterKey(key);
    
    // 2. Alert & Log
    await sendAlert('LOGIN', { device: deviceName });
    await supabase.from('login_sessions').insert({ user_id: user.id, device_name: deviceName });
    
    router.push('/vault');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col md:flex-row border border-slate-100">
        
        {/* Left Side: Branding */}
        <div className="md:w-5/12 bg-slate-900 p-8 text-white relative flex flex-col justify-center">
           <ShieldCheck className="w-12 h-12 text-blue-400 mb-4" />
           <h1 className="text-3xl font-bold mb-2">Fortress Vault</h1>
           <p className="text-slate-400">Secure. Private. Encrypted.</p>
           <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600 rounded-full blur-3xl opacity-20 transform translate-x-1/2 -translate-y-1/2" />
        </div>

        {/* Right Side: Forms */}
        <div className="md:w-7/12 p-10 flex flex-col justify-center">
          {isLogin ? (
            <>
              {/* STEP 1: EMAIL & PASSWORD */}
              {loginStep === 1 && (
                <form onSubmit={handleLoginInit} className="space-y-4">
                   <h2 className="text-2xl font-bold">Sign In</h2>
                   <div className="relative">
                      <Mail className="absolute left-3 top-3 text-gray-400 w-5 h-5"/>
                      <input type="email" required placeholder="Email" className="w-full pl-10 p-3 rounded border" value={form.email} onChange={e=>setForm({...form, email: e.target.value})} />
                   </div>
                   <div className="relative">
                      <Lock className="absolute left-3 top-3 text-gray-400 w-5 h-5"/>
                      <input type="password" required placeholder="Password" className="w-full pl-10 p-3 rounded border" value={form.password} onChange={e=>setForm({...form, password: e.target.value})} />
                   </div>
                   
                   <button disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700 disabled:opacity-50">
                     {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Next'}
                   </button>
                   
                   {/* Forgot Password Link */}
                   <div className="text-center mt-3">
                     <button type="button" onClick={()=>router.push('/auth/forgot')} className="text-sm text-blue-600 hover:underline">
                        Forgot Password?
                     </button>
                   </div>
                </form>
              )}

              {/* STEP 2: SECURITY IMAGE */}
              {loginStep === 2 && (
                 <div className="text-center">
                    <h2 className="text-xl font-bold mb-4">Verify Security Image</h2>
                    <p className="text-sm text-gray-500 mb-4">Select the image you chose during registration.</p>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {SECURITY_IMAGES.map(img => (
                        <button key={img.id} onClick={()=>handleLoginImage(img.id)} disabled={loading} className="p-4 border rounded hover:bg-blue-50 text-3xl transition transform hover:scale-105">
                            {img.icon}
                        </button>
                      ))}
                    </div>
                    <button onClick={()=>setLoginStep(1)} className="text-sm underline text-gray-500">Back to Login</button>
                 </div>
              )}

              {/* STEP 3: OTP */}
              {loginStep === 3 && (
                 <form onSubmit={handleOtpVerify} className="space-y-4 text-center">
                    <div className="mx-auto w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-2">
                        <AlertTriangle className="text-yellow-600" size={24} />
                    </div>
                    <h2 className="text-xl font-bold">New Device Detected</h2>
                    <p className="text-sm text-gray-500">We sent a verification code to your email.</p>
                    
                    <input className="w-full text-center text-3xl tracking-widest p-3 border rounded font-mono" placeholder="000000" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value)} />
                    
                    <button disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded font-bold">Verify & Trust Device</button>
                    <p className="text-xs text-gray-400">Check console (F12) if email fails</p>
                 </form>
              )}
            </>
          ) : (
            // REGISTER FORM
            <form onSubmit={handleRegister} className="space-y-4">
               <h2 className="text-2xl font-bold">Create Account</h2>
               <div className="grid grid-cols-2 gap-2">
                 <input type="email" required placeholder="Email" className="w-full p-2 border rounded" value={form.email} onChange={e=>setForm({...form, email: e.target.value})} />
                 <input type="password" required placeholder="Password" className="w-full p-2 border rounded" value={form.password} onChange={e=>setForm({...form, password: e.target.value})} />
               </div>
               
               <div className="bg-gray-50 p-3 rounded border">
                 <div className="flex items-center gap-2 mb-2 text-sm font-bold text-gray-700">
                    <HelpCircle size={14} /> Security Question
                 </div>
                 <select className="w-full p-2 border rounded mb-2 text-sm" value={form.securityQ} onChange={e=>setForm({...form, securityQ: e.target.value})} required>
                    <option value="">Select Question...</option>
                    <option value="pet">What was your first pet's name?</option>
                    <option value="city">In which city were you born?</option>
                    <option value="school">What is your favorite school subject?</option>
                 </select>
                 <input type="text" required placeholder="Your Answer" className="w-full p-2 border rounded text-sm" value={form.securityA} onChange={e=>setForm({...form, securityA: e.target.value})} />
               </div>
               
               <div>
                  <label className="text-sm font-bold block mb-2">Select Security Image</label>
                  <div className="flex justify-between">
                    {SECURITY_IMAGES.map(img => (
                        <button type="button" key={img.id} onClick={()=>setForm({...form, selectedImage: img.id})} className={`text-xl p-2 border rounded ${form.selectedImage === img.id ? 'bg-blue-600 text-white scale-110 shadow-lg' : 'bg-white'}`}>{img.icon}</button>
                    ))}
                  </div>
               </div>
               <button disabled={loading} className="w-full bg-slate-900 text-white p-3 rounded font-bold hover:bg-slate-800 disabled:opacity-50">
                 {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Create Account'}
               </button>
            </form>
          )}

          <div className="mt-6 text-center border-t pt-4">
             <button onClick={()=>{setIsLogin(!isLogin); setLoginStep(1)}} className="text-blue-600 font-medium">
               {isLogin ? "Need an account? Register" : "Have an account? Sign In"}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}