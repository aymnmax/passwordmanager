'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { deriveKey, unwrapMEK, wrapMEK } from '@/lib/crypto';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Key, Lock, Loader2, AlertTriangle, Smartphone } from 'lucide-react';
import zxcvbn from 'zxcvbn';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

const SECURITY_IMAGES = [
  { id: 'elephant', label: 'Elephant', icon: '🐘' },
  { id: 'cat', label: 'Cat', icon: '🐈' },
  { id: 'dog', label: 'Dog', icon: '🐕' },
  { id: 'lion', label: 'Lion', icon: '🦁' },
  { id: 'panda', label: 'Panda', icon: '🐼' },
  { id: 'fox', label: 'Fox', icon: '🦊' },
];

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [user, setUser] = useState<any>(null);
  
  // Step 1 State: Keys & Images
  const [emergencyKey, setEmergencyKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedImage, setSelectedImage] = useState('');
  
  // Password Strength State
  const [passwordScore, setPasswordScore] = useState(0);
  const [passwordFeedback, setPasswordFeedback] = useState('');

  // Step 2 State: Authenticator
  const [qrImage, setQrImage] = useState('');
  const [generatedSecret, setGeneratedSecret] = useState('');
  const [authCode, setAuthCode] = useState('');

  useEffect(() => {
    // Verify the user clicked a valid email link and is temporarily authenticated
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Invalid or expired recovery link.");
        router.push('/auth');
      } else {
        setUser(session.user);
      }
    };
    checkSession();
  }, [router]);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewPassword(val);
    if (val.length === 0) {
      setPasswordScore(0);
      setPasswordFeedback('');
    } else {
      const result = zxcvbn(val);
      setPasswordScore(result.score);
      setPasswordFeedback(result.feedback.warning || "Keep typing...");
    }
  };

  const handleNextStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emergencyKey.length < 32) return toast.error("Invalid Emergency Key format.");
    if (newPassword !== confirmPassword) return toast.error("Passwords do not match.");
    if (newPassword.length < 12 || passwordScore < 4) return toast.error("Password is not strong enough.");
    if (!selectedImage) return toast.error("Please select a new Security Image.");

    setLoading(true);
    try {
      // Generate new Authenticator Secret for Step 2
      const secret = authenticator.generateSecret();
      setGeneratedSecret(secret);
      const otpauth = authenticator.keyuri(user.email, 'AymnSecureVault', secret);
      const imageUrl = await QRCode.toDataURL(otpauth);
      setQrImage(imageUrl);
      setStep(2);
    } catch (err) {
      toast.error('Error generating Authenticator QR code');
    } finally {
      setLoading(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error("Authentication error.");

    setLoading(true);
    try {
      // 1. Verify the new Authenticator Code
      const isValid = authenticator.check(authCode, generatedSecret);
      if (!isValid) throw new Error("Invalid Authenticator Code. Please try again.");

      // 2. Fetch the Recovery "Locked Box" from the database
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('encrypted_mek_recovery, recovery_mek_iv')
        .eq('id', user.id)
        .single();

      if (profileError || !profile?.encrypted_mek_recovery) {
        throw new Error("Vault architecture not found. Cannot recover.");
      }

      // 3. Derive the emergency wrapping key from the user's input
      const emergencyWrappingKey = await deriveKey(emergencyKey, user.id);

      // 4. UNWRAP THE MEK! (If the emergency key is wrong, this throws an error)
      let mek;
      try {
        mek = await unwrapMEK(profile.encrypted_mek_recovery, profile.recovery_mek_iv, emergencyWrappingKey);
      } catch (cryptoErr) {
        throw new Error("Invalid Emergency Key. Decryption failed.");
      }

      // 5. Derive the NEW Master Wrapping Key from the new password
      const newMasterWrappingKey = await deriveKey(newPassword, user.id);

      // 6. Wrap the MEK with the new Master Password
      const { encryptedKey: newEncryptedMek, iv: newMekIv } = await wrapMEK(mek, newMasterWrappingKey);

      // 7. Update the Database with the newly locked box, new image, and new TOTP secret
      const { error: dbError } = await supabase
        .from('user_profiles')
        .update({ 
          encrypted_mek: newEncryptedMek, 
          mek_iv: newMekIv,
          selected_animal: selectedImage,
          totp_secret: generatedSecret
        })
        .eq('id', user.id);

      if (dbError) throw new Error("Failed to save new security settings to the database.");

      // 8. Update the actual Supabase Auth password and sync metadata
      const { error: authError } = await supabase.auth.updateUser({ 
        password: newPassword,
        data: { selected_animal: selectedImage, totp_secret: generatedSecret }
      });
      if (authError) throw authError;

      // 9. Sign out so they have to log back in cleanly
      await supabase.auth.signOut();
      toast.success("Vault successfully recovered! All security settings have been reset. Please log in.", { duration: 8000 });
      router.push('/auth');

    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-slate-900 w-8 h-8"/></div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
       <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-lg border border-slate-100">
          
          {step === 1 ? (
            <div className="animate-in fade-in">
              <div className="text-center mb-6">
                <div className="bg-red-100 text-red-600 w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4"><Key size={24} /></div>
                <h2 className="text-2xl font-bold">Total Vault Recovery</h2>
                <p className="text-slate-500 text-sm mt-2">Enter your Emergency Key to unlock your vault, then set your new security credentials.</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg mb-6 flex gap-3 text-amber-800">
                 <AlertTriangle className="shrink-0 mt-0.5" size={18} />
                 <p className="text-xs font-medium leading-relaxed">Your old password, security image, and authenticator will be permanently overwritten.</p>
              </div>

              <form onSubmit={handleNextStep} className="space-y-4">
                 <div className="space-y-1">
                   <label className="text-xs font-bold uppercase text-slate-500">Emergency Kit Key</label>
                   <div className="relative"><Key className="absolute left-3 top-3 text-gray-400" size={18} />
                   <input type="text" required placeholder="ABCD-1234-EFGH-5678..." className="w-full pl-10 p-3 border rounded-lg font-mono text-sm outline-none focus:ring-2 focus:ring-blue-600 uppercase" value={emergencyKey} onChange={e => setEmergencyKey(e.target.value)} /></div>
                 </div>

                 <div className="space-y-1 pt-4 border-t border-slate-100">
                   <label className="text-xs font-bold uppercase text-slate-500">New Master Password</label>
                   <div className="relative"><Lock className="absolute left-3 top-3 text-gray-400" size={18} />
                   <input type="password" required placeholder="Min 12 characters" className="w-full pl-10 p-3 border rounded-lg outline-none focus:ring-2 focus:ring-slate-900" value={newPassword} onChange={handlePasswordChange} /></div>
                   
                   {/* Strength Meter */}
                   {newPassword.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="flex gap-1 h-1.5 w-full">
                          {[0, 1, 2, 3].map((index) => (
                            <div key={index} className={`h-full flex-1 rounded-full transition-colors ${passwordScore > index ? (passwordScore === 4 ? 'bg-green-500' : passwordScore === 3 ? 'bg-blue-400' : passwordScore === 2 ? 'bg-yellow-400' : 'bg-red-500') : 'bg-gray-200'}`} />
                          ))}
                        </div>
                        <p className={`text-xs font-medium ${passwordScore === 4 && newPassword.length >= 12 ? 'text-green-600' : 'text-slate-500'}`}>
                          {passwordScore === 4 && newPassword.length >= 12 ? "Excellent! Your vault is highly secure." : passwordFeedback || "Password must be at least 12 characters and achieve maximum strength."}
                        </p>
                      </div>
                   )}
                 </div>

                 <div className="space-y-1">
                   <label className="text-xs font-bold uppercase text-slate-500">Confirm New Password</label>
                   <div className="relative"><Lock className="absolute left-3 top-3 text-gray-400" size={18} />
                   <input type="password" required className={`w-full pl-10 p-3 border rounded-lg outline-none focus:ring-2 focus:ring-slate-900 ${confirmPassword && newPassword !== confirmPassword ? 'border-red-400 bg-red-50' : ''}`} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></div>
                 </div>

                 <div className="pt-2">
                   <label className="text-xs font-bold uppercase text-slate-500 block mb-2">Select New Security Image</label>
                   <div className="grid grid-cols-6 gap-2">
                     {SECURITY_IMAGES.map(img => (
                       <button type="button" key={img.id} onClick={() => setSelectedImage(img.id)} className={`text-2xl p-2 border rounded-lg transition-all ${selectedImage === img.id ? 'bg-blue-600 text-white scale-110 shadow-md border-blue-600' : 'bg-white hover:bg-slate-50'}`}>
                         {img.icon}
                       </button>
                     ))}
                   </div>
                 </div>
                 
                 <button disabled={loading || passwordScore < 4 || newPassword.length < 12 || newPassword !== confirmPassword || !selectedImage} className="w-full bg-slate-900 text-white p-3 rounded-lg font-bold flex justify-center items-center gap-2 mt-6 hover:bg-slate-800 disabled:bg-slate-300 transition-colors">
                   {loading ? <Loader2 className="animate-spin" /> : 'Next: Setup Authenticator'}
                 </button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleRecovery} className="space-y-4 text-center animate-in slide-in-from-right">
               <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-2"><Smartphone className="text-blue-600" size={24} /></div>
               <h2 className="text-xl font-bold">Setup New Authenticator</h2>
               <p className="text-sm text-gray-600 mb-4">Scan this QR code with your Google Authenticator app to link your new device.</p>
               
               <div className="mx-auto bg-white p-4 border-2 border-slate-200 rounded-xl inline-block shadow-sm">
                 {qrImage && <img src={qrImage} alt="Scan QR" className="w-48 h-48" />}
               </div>
               
               <div className="pt-4">
                 <input className="w-full text-center text-3xl tracking-widest p-4 border-2 rounded-lg font-mono outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all" placeholder="000 000" maxLength={6} value={authCode} onChange={e => setAuthCode(e.target.value)} required />
               </div>

               <button disabled={loading || authCode.length < 6} className="w-full bg-slate-900 text-white p-4 rounded-lg font-bold hover:bg-slate-800 mt-4 transition-colors disabled:bg-slate-300 flex justify-center items-center">
                 {loading ? <Loader2 className="animate-spin" /> : 'Decrypt & Restore Vault'}
               </button>

               <button type="button" onClick={() => setStep(1)} className="text-sm text-slate-500 hover:text-slate-900 mt-2">Back to previous step</button>
            </form>
          )}

       </div>
    </div>
  )
}