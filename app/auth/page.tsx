'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { deriveKey } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { UAParser } from 'ua-parser-js';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { Loader2, Mail, Lock, ShieldCheck, HelpCircle, QrCode, Smartphone } from 'lucide-react';

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
  
  // LOGIN STATE
  // 1=Creds, 2=Image (Final), 3=Authenticator (New Device)
  const [loginStep, setLoginStep] = useState(1); 
  const [authCode, setAuthCode] = useState('');
  const [isNewDeviceFlow, setIsNewDeviceFlow] = useState(false);

  // REGISTER STATE
  // 1=Form, 2=QR Setup
  const [regStep, setRegStep] = useState(1);
  const [qrImage, setQrImage] = useState('');
  const [generatedSecret, setGeneratedSecret] = useState('');

  const [form, setForm] = useState({ 
    email: '', password: '', securityQ: '', securityA: '', selectedImage: '' 
  });

  const { setMasterKey } = useAuth();
  const router = useRouter();

  // ================= REGISTER FLOW =================

  // Step 1: Validate Form & Generate QR
  const handleRegInit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.selectedImage) return toast.error('Pick a security image first!');
    
    setLoading(true);
    try {
      // 1. Generate Secret
      const secret = authenticator.generateSecret();
      setGeneratedSecret(secret);

      // 2. Generate QR Code URL
      const otpauth = authenticator.keyuri(form.email, 'Fortress Vault', secret);
      const imageUrl = await QRCode.toDataURL(otpauth);
      
      setQrImage(imageUrl);
      setRegStep(2); // Move to Scan Step
    } catch (err) {
      toast.error('Error generating QR code');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify Code & Create Account
  const handleRegFinal = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Verify the user actually scanned it
      const isValid = authenticator.check(authCode, generatedSecret);
      if (!isValid) throw new Error("Invalid Code. Scan the QR again.");

      const answerHash = btoa(form.securityA.toLowerCase().trim());

      // 2. Create User (Save Secret in Metadata)
      const { error } = await supabase.auth.signUp({ 
        email: form.email, 
        password: form.password,
        options: {
          data: {
            security_question: form.securityQ,
            security_answer_hash: answerHash,
            selected_animal: form.selectedImage,
            totp_secret: generatedSecret // <--- SAVING SECRET TO DB
          }
        }
      });

      if (error) throw error;

      toast.success('Account created! Setup complete.');
      setIsLogin(true);
      setRegStep(1);
      setForm({ email: '', password: '', securityQ: '', securityA: '', selectedImage: '' });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };


  // ================= LOGIN FLOW =================

  // Step 1: Check Creds & Device
  const handleLoginInit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Sign In
      const { error } = await supabase.auth.signInWithPassword({ 
        email: form.email, password: form.password 
      });
      if (error) throw error;

      // 2. Check Device
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Session Error");

      const parser = new UAParser();
      const deviceName = `${parser.getBrowser().name} on ${parser.getOS().name}`;
      const deviceId = btoa(`${user.id}-${deviceName}`); 
      
      sessionStorage.setItem('temp_device', deviceName);
      sessionStorage.setItem('temp_device_id', deviceId);

      const { data: trusted } = await supabase
        .from('trusted_devices')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (trusted) {
        // Trusted -> Go to Image
        setIsNewDeviceFlow(false);
        setLoginStep(2); 
      } else {
        // New Device -> Go to Authenticator
        setIsNewDeviceFlow(true);
        setLoginStep(3);
      }

    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify Authenticator (New Device Only)
  const handleAuthVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Fetch Secret from DB
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('totp_secret')
        .eq('id', user?.id)
        .single();
        
      if (!profile?.totp_secret) throw new Error("Security setup missing. Contact support.");

      // Verify
      const isValid = authenticator.check(authCode, profile.totp_secret);
      if (!isValid) throw new Error("Invalid Code. Try again.");

      toast.success("Identity Verified. Now confirm Security Image.");
      setLoginStep(2); // Go to Image Step
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Verify Image (Final)
  const handleLoginImage = async (imageId: string) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // 1. Check Image
      const { data: profile } = await supabase.from('user_profiles').select('selected_animal').eq('id', user?.id).single();
      if (!profile || profile.selected_animal !== imageId) {
        await supabase.auth.signOut();
        setLoginStep(1);
        throw new Error("Wrong Security Image! Login aborted.");
      }

      // 2. Trust Device (If New)
      const deviceName = sessionStorage.getItem('temp_device')!;
      const deviceId = sessionStorage.getItem('temp_device_id')!;

      if (isNewDeviceFlow) {
        await supabase.from('trusted_devices').insert({ 
          user_id: user?.id, 
          device_id: deviceId, 
          device_name: deviceName 
        });
      }

      // 3. Complete
      const key = await deriveKey(form.password, user?.id!);
      setMasterKey(key);
      await supabase.from('login_sessions').insert({ user_id: user?.id, device_name: deviceName });
      
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
        
        {/* Branding */}
        <div className="md:w-5/12 bg-slate-900 p-8 text-white flex flex-col justify-center relative overflow-hidden">
           <ShieldCheck className="w-12 h-12 text-blue-400 mb-4" />
           <h1 className="text-3xl font-bold mb-2">Fortress Vault</h1>
           <p className="text-slate-400">Secure. Private. Zero-Knowledge.</p>
        </div>

        {/* Forms */}
        <div className="md:w-7/12 p-10 flex flex-col justify-center">
          
          {/* ================= LOGIN ================= */}
          {isLogin && (
            <>
              {loginStep === 1 && (
                <form onSubmit={handleLoginInit} className="space-y-4">
                   <h2 className="text-2xl font-bold">Sign In</h2>
                   <input type="email" required placeholder="Email" className="w-full p-3 rounded border" value={form.email} onChange={e=>setForm({...form, email: e.target.value})} />
                   <input type="password" required placeholder="Password" className="w-full p-3 rounded border" value={form.password} onChange={e=>setForm({...form, password: e.target.value})} />
                   <button disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700">
                     {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Next'}
                   </button>
                   <p className="text-center text-sm text-blue-600 cursor-pointer" onClick={()=>router.push('/auth/forgot')}>Forgot Password?</p>
                </form>
              )}

              {loginStep === 3 && (
                <form onSubmit={handleAuthVerify} className="space-y-4 text-center">
                   <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-2">
                      <Smartphone className="text-blue-600" size={24} />
                   </div>
                   <h2 className="text-xl font-bold">New Device Detected</h2>
                   <p className="text-sm text-gray-500">Open your Authenticator App and enter the code.</p>
                   <input className="w-full text-center text-3xl tracking-widest p-3 border rounded font-mono" placeholder="000 000" maxLength={6} value={authCode} onChange={e=>setAuthCode(e.target.value)} />
                   <button disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded font-bold">Verify Code</button>
                </form>
              )}

              {loginStep === 2 && (
                 <div className="text-center animate-in zoom-in">
                    <h2 className="text-xl font-bold mb-4">Security Image</h2>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {SECURITY_IMAGES.map(img => (
                        <button key={img.id} onClick={()=>handleLoginImage(img.id)} disabled={loading} className="p-4 border rounded hover:bg-blue-50 text-3xl transition transform hover:scale-105">
                            {img.icon}
                        </button>
                      ))}
                    </div>
                    <button onClick={()=>setLoginStep(1)} className="text-sm underline text-gray-500">Cancel</button>
                 </div>
              )}
            </>
          )}

          {/* ================= REGISTER ================= */}
          {!isLogin && (
            <>
              {regStep === 1 ? (
                <form onSubmit={handleRegInit} className="space-y-4">
                   <h2 className="text-2xl font-bold">Create Account</h2>
                   <div className="grid grid-cols-2 gap-2">
                     <input type="email" required placeholder="Email" className="w-full p-2 border rounded" value={form.email} onChange={e=>setForm({...form, email: e.target.value})} />
                     <input type="password" required placeholder="Master Password" className="w-full p-2 border rounded" value={form.password} onChange={e=>setForm({...form, password: e.target.value})} />
                   </div>
                   <div className="bg-gray-50 p-3 rounded border">
                     <div className="flex items-center gap-2 mb-2 text-sm font-bold text-gray-700"><HelpCircle size={14} /> Security Question</div>
                     <select className="w-full p-2 border rounded mb-2 text-sm" value={form.securityQ} onChange={e=>setForm({...form, securityQ: e.target.value})} required>
                        <option value="">Select Question...</option>
                        <option value="pet">First Pet Name?</option>
                        <option value="city">Birth City?</option>
                     </select>
                     <input type="text" required placeholder="Answer" className="w-full p-2 border rounded text-sm" value={form.securityA} onChange={e=>setForm({...form, securityA: e.target.value})} />
                   </div>
                   <div>
                      <label className="text-sm font-bold block mb-2">Select Security Image</label>
                      <div className="flex justify-between">
                        {SECURITY_IMAGES.map(img => (
                            <button type="button" key={img.id} onClick={()=>setForm({...form, selectedImage: img.id})} className={`text-xl p-2 border rounded ${form.selectedImage === img.id ? 'bg-blue-600 text-white scale-110 shadow-lg' : 'bg-white'}`}>{img.icon}</button>
                        ))}
                      </div>
                   </div>
                   <button disabled={loading} className="w-full bg-slate-900 text-white p-3 rounded font-bold hover:bg-slate-800">
                     {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Next Step'}
                   </button>
                </form>
              ) : (
                <form onSubmit={handleRegFinal} className="space-y-4 text-center animate-in slide-in-from-right">
                   <div className="mx-auto bg-white p-4 border-2 border-black rounded-lg inline-block">
                      {qrImage && <img src={qrImage} alt="Scan QR" className="w-48 h-48" />}
                   </div>
                   <h2 className="text-xl font-bold">Setup Authenticator</h2>
                   <p className="text-sm text-gray-600">Scan this with Google Authenticator or Authy.</p>
                   
                   <input 
                      className="w-full text-center text-3xl tracking-widest p-3 border rounded font-mono mt-4" 
                      placeholder="000 000" 
                      maxLength={6} 
                      value={authCode} 
                      onChange={e=>setAuthCode(e.target.value)} 
                      required
                   />
                   
                   <button disabled={loading} className="w-full bg-green-600 text-white p-3 rounded font-bold hover:bg-green-700 mt-2">
                     {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Verify & Create Account'}
                   </button>
                   <button type="button" onClick={()=>setRegStep(1)} className="text-sm underline mt-2">Back</button>
                </form>
              )}
            </>
          )}

          <div className="mt-6 text-center border-t pt-4">
             <button onClick={()=>{setIsLogin(!isLogin); setLoginStep(1); setRegStep(1)}} className="text-blue-600 font-medium">
               {isLogin ? "Need an account? Register" : "Have an account? Sign In"}
             </button>
          </div>

        </div>
      </div>
    </div>
  );
}