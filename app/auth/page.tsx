'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { deriveKey, generateMEK, wrapMEK, unwrapMEK, generateEmergencyKey } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { UAParser } from 'ua-parser-js';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import zxcvbn from 'zxcvbn';
import { 
  Loader2, Mail, Lock, ShieldCheck, Smartphone, 
  CheckCircle2, Key, AlertTriangle, Copy, Eye, EyeOff
} from 'lucide-react';

const SECURITY_IMAGES = [
  { id: 'elephant', label: 'Elephant', icon: '🐘' },
  { id: 'cat', label: 'Cat', icon: '🐈' },
  { id: 'dog', label: 'Dog', icon: '🐕' },
  { id: 'lion', label: 'Lion', icon: '🦁' },
  { id: 'panda', label: 'Panda', icon: '🐼' },
  { id: 'fox', label: 'Fox', icon: '🦊' },
];

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // LOGIN STATE
  const [loginStep, setLoginStep] = useState(1);
  const [authCode, setAuthCode] = useState('');
  const [isNewDeviceFlow, setIsNewDeviceFlow] = useState(false);

  // REGISTER STATE
  const [regStep, setRegStep] = useState(1);
  const [qrImage, setQrImage] = useState('');
  const [generatedSecret, setGeneratedSecret] = useState('');
  
  // PASSWORD STRENGTH & CONFIRMATION STATE
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordScore, setPasswordScore] = useState(0);
  const [passwordFeedback, setPasswordFeedback] = useState('');
  
  // EMERGENCY KIT STATE
  const [emergencyKey, setEmergencyKey] = useState('');
  const [savedKit, setSavedKit] = useState(false);

  const [form, setForm] = useState({ email: '', password: '', selectedImage: '' });

  const { setMasterKey } = useAuth();
  const router = useRouter();

  // --- HANDLES EMAIL VERIFICATION REDIRECT ONLY ---
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const hasEmailToken = window.location.hash.includes('access_token');

      if (event === 'SIGNED_IN' && hasEmailToken) {
        toast.success("Email verified! Please sign in with your Master Password.");
        setIsLogin(true);
        setLoginStep(1);
        setRegStep(1);
        window.history.replaceState(null, '', window.location.pathname);
      }
      
      if (event === 'USER_UPDATED') {
        toast.info("Account updated.");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const getDeviceIdentifier = () => {
    let deviceId = typeof window !== 'undefined' ? localStorage.getItem('vault_device_token') : null;
    if (!deviceId) {
      deviceId = `device_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
      if (typeof window !== 'undefined') localStorage.setItem('vault_device_token', deviceId);
    }
    return deviceId;
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setForm({ ...form, password: val });
    
    if (val.length === 0) {
      setPasswordScore(0);
      setPasswordFeedback('');
    } else {
      const result = zxcvbn(val);
      setPasswordScore(result.score);
      
      if (result.score === 4 && val.length >= 12) {
        setPasswordFeedback("Strong Password!");
      } else {
        setPasswordFeedback(result.feedback.warning || result.feedback.suggestions[0] || "Keep typing...");
      }
    }
  };

  // ================= REGISTER FLOW =================
  const handleRegInit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.selectedImage) return toast.error('Pick a security image first!');
    if (form.password !== confirmPassword) return toast.error('Passwords do not match!');
    if (form.password.length < 12 || passwordScore < 4) return toast.error('Password is not strong enough.');
    
    setLoading(true);
    try {
      const secret = authenticator.generateSecret();
      setGeneratedSecret(secret);
      const otpauth = authenticator.keyuri(form.email, 'AymnSecureVault', secret);
      const imageUrl = await QRCode.toDataURL(otpauth);
      setQrImage(imageUrl);
      setRegStep(2); 
    } catch (err) { toast.error('Error generating QR code'); } 
    finally { setLoading(false); }
  };

  const handleRegFinal = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const isValid = authenticator.check(authCode, generatedSecret);
      if (!isValid) throw new Error("Invalid Code. Please scan the QR again.");

      const { data: authData, error: authError } = await supabase.auth.signUp({ 
        email: form.email, password: form.password,
        options: { data: { selected_animal: form.selectedImage, totp_secret: generatedSecret } }
      });
      if (authError || !authData.user) throw authError || new Error("Signup failed.");

      const userId = authData.user.id;
      const eKey = generateEmergencyKey();
      const mek = await generateMEK(); 
      
      const masterWrappingKey = await deriveKey(form.password, userId); 
      const emergencyWrappingKey = await deriveKey(eKey, userId);       

      const { encryptedKey: encMekMaster, iv: ivMaster } = await wrapMEK(mek, masterWrappingKey);
      const { encryptedKey: encMekRecovery, iv: ivRecovery } = await wrapMEK(mek, emergencyWrappingKey);

      const { error: dbError } = await supabase.rpc('save_initial_keys', {
        target_user_id: userId,
        new_enc_mek: encMekMaster,
        new_mek_iv: ivMaster,
        new_enc_mek_rec: encMekRecovery,
        new_rec_mek_iv: ivRecovery
      });

      if (dbError) throw new Error("Failed to save encryption keys.");
      setEmergencyKey(eKey);
      setRegStep(3); 
    } catch (err: any) { toast.error(err.message); } 
    finally { setLoading(false); }
  };

  const finishRegistration = () => {
    toast.success('Account secured! Check email to verify, then log in.');
    setIsLogin(true);
    setRegStep(1);
    setForm({ email: '', password: '', selectedImage: '' });
    setConfirmPassword('');
    setEmergencyKey('');
    setSavedKit(false);
  };

  // ================= LOGIN FLOW =================
  const handleLoginInit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: statusData } = await supabase.rpc('check_account_status', { email_input: form.email });
      if (statusData && statusData.length > 0) {
        const { status, lock_time } = statusData[0];
        if (status === 'perm_locked') throw new Error("Account permanently locked.");
        if (status === 'temp_locked') throw new Error(`Too many attempts. Try again later.`);
      }

      const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (error) { 
        await supabase.rpc('handle_failed_attempt', { email_input: form.email });
        throw new Error("Invalid email or Master Password.");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Session Error");

      const uniqueDeviceToken = getDeviceIdentifier();
      const parser = new UAParser();
      const deviceName = `${parser.getBrowser().name} on ${parser.getOS().name}`;
      
      sessionStorage.setItem('temp_device_token', uniqueDeviceToken || '');
      sessionStorage.setItem('temp_device_name', deviceName);

      const { data: trusted } = await supabase.from('trusted_devices').select('*').eq('user_id', user.id).eq('device_id', uniqueDeviceToken).maybeSingle();

      if (trusted) { setIsNewDeviceFlow(false); setLoginStep(3); } 
      else { setIsNewDeviceFlow(true); setLoginStep(2); }
      
    } catch (err: any) { toast.error(err.message); } 
    finally { setLoading(false); }
  };

  const handleAuthVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('user_profiles').select('totp_secret').eq('id', user?.id).single(); 
      if (!profile?.totp_secret) throw new Error("Security setup missing.");

      if (!authenticator.check(authCode, profile.totp_secret)) {
        await supabase.rpc('handle_failed_attempt', { email_input: form.email });
        throw new Error("Invalid Authenticator Code.");
      }
      setLoginStep(3);
    } catch (err: any) { toast.error(err.message); } 
    finally { setLoading(false); }
  };

  const handleLoginImage = async (imageId: string) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('user_profiles').select('selected_animal').eq('id', user?.id).single();
      
      if (!profile || profile.selected_animal !== imageId) {
        await supabase.rpc('handle_failed_attempt', { email_input: form.email });
        await supabase.auth.signOut();
        setLoginStep(1);
        throw new Error("Wrong Security Image!");
      }

      const deviceToken = sessionStorage.getItem('temp_device_token')!;
      const deviceName = sessionStorage.getItem('temp_device_name')!;

      if (isNewDeviceFlow) {
        await supabase.from('trusted_devices').insert({ user_id: user?.id, device_id: deviceToken, device_name: deviceName });
      }
      await completeLogin(user, deviceName);
    } catch (err: any) { toast.error(err.message); } 
    finally { setLoading(false); }
  };

  const completeLogin = async (user: any, deviceName: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('encrypted_mek, mek_iv')
        .eq('id', user.id)
        .single();
      
      if (error || !profile) {
        throw new Error("Vault profile not found.");
      }

      const masterWrappingKey = await deriveKey(form.password, user.id);
      const mek = await unwrapMEK(profile.encrypted_mek, profile.mek_iv, masterWrappingKey);
      
      const exported = await window.crypto.subtle.exportKey('jwk', mek);
      sessionStorage.setItem('secure_vault_key', JSON.stringify(exported));
      setMasterKey(mek);
      
      await supabase.from('login_sessions').insert({ user_id: user.id, device_name: deviceName });
      await supabase.rpc('unlock_account_by_email', { email_input: form.email });

      router.push('/vault');
    } catch (e: any) {
      await supabase.auth.signOut();
      setLoginStep(1);
      toast.error(e.message || "Decryption failed.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-900 relative">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col md:flex-row border border-slate-100">
        
        {/* LEFT PANEL */}
        <div className="md:w-5/12 bg-slate-900 p-8 text-white flex flex-col justify-center relative overflow-hidden">
           <ShieldCheck className="w-12 h-12 text-blue-400 mb-6" />
           <h1 className="text-3xl font-bold mb-4">AymnSecureVault</h1>
           <div className="space-y-4 text-slate-300 text-sm leading-relaxed z-10 relative">
             <p className="flex items-start gap-2"><CheckCircle2 size={16} className="text-blue-400 mt-1"/> Zero-Knowledge Architecture</p>
             <p className="flex items-start gap-2"><CheckCircle2 size={16} className="text-blue-400 mt-1"/> Cryptographic Key Wrapping</p>
             <p className="flex items-start gap-2"><CheckCircle2 size={16} className="text-blue-400 mt-1"/> Absolute Privacy Guaranteed</p>
           </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="md:w-7/12 p-10 flex flex-col justify-center">
          {isLogin ? (
            <>
              {loginStep === 1 && (
                <form onSubmit={handleLoginInit} className="space-y-4">
                   <h2 className="text-2xl font-bold">Sign In</h2>
                   <div className="relative">
                     <Mail className="absolute left-3 top-3 text-gray-400 w-5 h-5"/>
                     <input type="email" required placeholder="Email" className="w-full pl-10 p-3 rounded border" value={form.email} onChange={e=>setForm({...form, email: e.target.value})} />
                   </div>
                   <div className="relative">
                     <Lock className="absolute left-3 top-3 text-gray-400 w-5 h-5"/>
                     <input type={showPassword ? "text" : "password"} required placeholder="Master Password" className="w-full pl-10 pr-10 p-3 rounded border" value={form.password} onChange={e=>setForm({...form, password: e.target.value})} />
                     <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-gray-400 hover:text-slate-600">
                       {showPassword ? <EyeOff size={20}/> : <Eye size={20}/>}
                     </button>
                   </div>
                   <button disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700">{loading ? <Loader2 className="animate-spin mx-auto" /> : 'Next'}</button>
                   {/* RESTORED RECOVERY LINK */}
                   <p className="text-center text-sm text-blue-600 cursor-pointer hover:underline" onClick={()=>router.push('/auth/forgot')}>Account Recovery</p>
                </form>
              )}
              {loginStep === 2 && (
                <form onSubmit={handleAuthVerify} className="space-y-4 text-center">
                   <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-2"><Smartphone className="text-blue-600" size={24} /></div>
                   <h2 className="text-xl font-bold">Identity Verification</h2>
                   <input className="w-full text-center text-3xl tracking-widest p-3 border rounded font-mono" placeholder="000 000" maxLength={6} value={authCode} onChange={e=>setAuthCode(e.target.value)} />
                   <button disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded font-bold">Verify</button>
                </form>
              )}
              {loginStep === 3 && (
                 <div className="text-center animate-in zoom-in">
                    <h2 className="text-xl font-bold mb-4">Security Image</h2>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {SECURITY_IMAGES.map(img => (
                        <button key={img.id} type="button" onClick={()=>handleLoginImage(img.id)} disabled={loading} className="p-4 border rounded hover:bg-blue-50 text-3xl transition transform hover:scale-105">{img.icon}</button>
                      ))}
                    </div>
                    <button type="button" onClick={()=>setLoginStep(1)} className="text-sm underline text-gray-500">Cancel</button>
                 </div>
              )}
            </>
          ) : (
            <>
              {regStep === 1 && (
                <form onSubmit={handleRegInit} className="space-y-4">
                   <h2 className="text-2xl font-bold">Create Vault</h2>
                   <div className="relative"><Mail className="absolute left-3 top-3 text-gray-400 w-5 h-5"/><input type="email" required placeholder="Email Address" className="w-full pl-10 p-3 border rounded" value={form.email} onChange={e=>setForm({...form, email: e.target.value})} /></div>
                   <div>
                     <div className="relative">
                       <Lock className="absolute left-3 top-3 text-gray-400 w-5 h-5"/>
                       <input type={showPassword ? "text" : "password"} required placeholder="Master Password (12+ chars)" className="w-full pl-10 pr-10 p-3 border rounded" value={form.password} onChange={handlePasswordChange} />
                       <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-gray-400">
                         {showPassword ? <EyeOff size={20}/> : <Eye size={20}/>}
                       </button>
                     </div>
                     {form.password.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <div className="flex gap-1 h-1.5 w-full">
                            {[0, 1, 2, 3].map((index) => (
                              <div key={index} className={`h-full flex-1 rounded-full ${passwordScore > index ? (passwordScore === 4 ? 'bg-green-500' : 'bg-yellow-400') : 'bg-gray-200'}`} />
                            ))}
                          </div>
                          <p className={`text-xs font-medium ${passwordScore === 4 ? 'text-green-600' : 'text-yellow-600'}`}>
                            {passwordFeedback}
                          </p>
                        </div>
                     )}
                   </div>
                   <div>
                     <div className="relative">
                       <ShieldCheck className="absolute left-3 top-3 text-gray-400 w-5 h-5"/>
                       <input type={showConfirmPassword ? "text" : "password"} required placeholder="Confirm Master Password" className={`w-full pl-10 pr-10 p-3 border rounded ${confirmPassword && form.password !== confirmPassword ? 'border-red-500 bg-red-50' : ''}`} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} />
                       <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-3 text-gray-400">
                         {showConfirmPassword ? <EyeOff size={20}/> : <Eye size={20}/>}
                       </button>
                     </div>
                     {confirmPassword && form.password !== confirmPassword && (
                       <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><AlertTriangle size={12}/> Passwords do not match</p>
                     )}
                   </div>
                   <div className="space-y-2">
                     <p className="text-xs font-semibold text-gray-500 uppercase">Select Security Image</p>
                     <div className="flex justify-between bg-slate-50 p-2 rounded-lg border">
                       {SECURITY_IMAGES.map(img => (
                         <button type="button" key={img.id} onClick={()=>setForm({...form, selectedImage: img.id})} className={`text-xl p-2 rounded-md transition-all ${form.selectedImage === img.id ? 'bg-blue-600 text-white shadow-md' : 'bg-transparent grayscale hover:grayscale-0'}`}>{img.icon}</button>
                       ))}
                     </div>
                   </div>
                   <button disabled={loading || passwordScore < 4 || form.password.length < 12 || form.password !== confirmPassword || !form.selectedImage} className="w-full bg-slate-900 text-white p-3 rounded font-bold disabled:bg-slate-300">Next</button>
                </form>
              )}
              {regStep === 2 && (
                <form onSubmit={handleRegFinal} className="space-y-4 text-center">
                   <div className="mx-auto bg-white p-4 border rounded-lg inline-block">{qrImage && <img src={qrImage} alt="QR" className="w-48 h-48" />}</div>
                   <h2 className="text-xl font-bold">Authenticator Setup</h2>
                   <input className="w-full text-center text-3xl tracking-widest p-3 border rounded font-mono" placeholder="000 000" maxLength={6} value={authCode} onChange={e=>setAuthCode(e.target.value)} required />
                   <button disabled={loading} className="w-full bg-green-600 text-white p-3 rounded font-bold">Complete</button>
                </form>
              )}
              {regStep === 3 && (
                <div className="space-y-5">
                   <h2 className="text-2xl font-black text-red-600 text-center">Recovery Kit</h2>
                   <div className="bg-slate-50 border-2 border-dashed border-slate-300 p-6 rounded-xl text-center relative">
                     <p className="font-mono text-xl font-bold text-slate-900 break-all">{emergencyKey}</p>
                     <button onClick={() => { navigator.clipboard.writeText(emergencyKey); toast.success("Copied!"); }} className="absolute top-2 right-2 p-2"><Copy size={18}/></button>
                   </div>
                   <label className="flex items-start gap-3 p-4 bg-red-50 rounded-lg cursor-pointer">
                     <input type="checkbox" className="mt-1 w-5 h-5 accent-red-600" checked={savedKit} onChange={(e) => setSavedKit(e.target.checked)} />
                     <span className="text-sm font-medium text-red-900">I have saved my Recovery Kit securely.</span>
                   </label>
                   <button disabled={!savedKit} onClick={finishRegistration} className="w-full bg-slate-900 text-white p-3 rounded font-bold">Finish</button>
                </div>
              )}
            </>
          )}

          {regStep !== 3 && (
            <div className="mt-6 text-center border-t pt-4">
              <button onClick={()=>{setIsLogin(!isLogin); setLoginStep(1); setRegStep(1)}} className="text-blue-600 font-medium">{isLogin ? "Need an account? Register" : "Have an account? Sign In"}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}