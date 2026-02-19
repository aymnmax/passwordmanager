'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { deriveKey, unwrapMEK, wrapMEK } from '@/lib/crypto';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Key, Lock, Loader2, AlertTriangle } from 'lucide-react';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [emergencyKey, setEmergencyKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Verify the user clicked a valid email link
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

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return toast.error("Passwords do not match.");
    if (emergencyKey.length < 32) return toast.error("Invalid Emergency Key format.");
    if (!user) return toast.error("Authentication error.");

    setLoading(true);
    try {
      // 1. Fetch the Recovery "Locked Box" from the database
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('encrypted_mek_recovery, recovery_mek_iv')
        .eq('id', user.id)
        .single();

      if (profileError || !profile?.encrypted_mek_recovery) {
        throw new Error("Vault architecture not found. Cannot recover.");
      }

      // 2. Derive the emergency wrapping key from the user's input
      const emergencyWrappingKey = await deriveKey(emergencyKey, user.id);

      // 3. UNWRAP THE MEK! (If the emergency key is wrong, this will throw an error)
      let mek;
      try {
        mek = await unwrapMEK(profile.encrypted_mek_recovery, profile.recovery_mek_iv, emergencyWrappingKey);
      } catch (cryptoErr) {
        throw new Error("Invalid Emergency Key. Decryption failed.");
      }

      // 4. Derive the NEW Master Wrapping Key from the new password
      const newMasterWrappingKey = await deriveKey(newPassword, user.id);

      // 5. Wrap the MEK with the new Master Password
      const { encryptedKey: newEncryptedMek, iv: newMekIv } = await wrapMEK(mek, newMasterWrappingKey);

      // 6. Update the Database with the newly locked box
      const { error: dbError } = await supabase
        .from('user_profiles')
        .update({ 
          encrypted_mek: newEncryptedMek, 
          mek_iv: newMekIv 
        })
        .eq('id', user.id);

      if (dbError) throw new Error("Failed to save new encryption locks.");

      // 7. Finally, update the actual Supabase Auth password
      const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
      if (authError) throw authError;

      // 8. Sign out so they have to log back in cleanly
      await supabase.auth.signOut();
      toast.success("Vault successfully recovered! Please log in with your new Master Password.", { duration: 6000 });
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
          <div className="text-center mb-6">
            <div className="bg-blue-100 text-blue-600 w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4"><Key size={24} /></div>
            <h2 className="text-2xl font-bold">Decrypt & Restore Vault</h2>
            <p className="text-slate-500 text-sm mt-2">Enter your Emergency Kit key to unlock your vault and set a new Master Password.</p>
          </div>

          <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg mb-6 flex gap-3 text-amber-800">
             <AlertTriangle className="shrink-0 mt-0.5" size={18} />
             <p className="text-xs font-medium leading-relaxed">Your data is currently locked. If you enter the wrong Emergency Key, the vault cannot be restored.</p>
          </div>

          <form onSubmit={handleRecovery} className="space-y-4">
             <div className="space-y-1">
               <label className="text-xs font-bold uppercase text-slate-500">Emergency Kit Key</label>
               <div className="relative"><Key className="absolute left-3 top-3 text-gray-400" size={18} />
               <input type="text" required placeholder="ABCD-1234-EFGH-5678..." className="w-full pl-10 p-3 border rounded-lg font-mono text-sm outline-none focus:ring-2 focus:ring-blue-600 uppercase" value={emergencyKey} onChange={e => setEmergencyKey(e.target.value)} /></div>
             </div>

             <div className="space-y-1 pt-2 border-t border-slate-100">
               <label className="text-xs font-bold uppercase text-slate-500">New Master Password</label>
               <div className="relative"><Lock className="absolute left-3 top-3 text-gray-400" size={18} />
               <input type="password" required className="w-full pl-10 p-3 border rounded-lg outline-none focus:ring-2 focus:ring-slate-900" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
             </div>

             <div className="space-y-1">
               <label className="text-xs font-bold uppercase text-slate-500">Confirm New Password</label>
               <div className="relative"><Lock className="absolute left-3 top-3 text-gray-400" size={18} />
               <input type="password" required className="w-full pl-10 p-3 border rounded-lg outline-none focus:ring-2 focus:ring-slate-900" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></div>
             </div>
             
             <button disabled={loading} className="w-full bg-slate-900 text-white p-3 rounded-lg font-bold flex justify-center items-center gap-2 mt-4 hover:bg-slate-800 transition-colors">
               {loading ? <Loader2 className="animate-spin" /> : 'Restore Vault Data'}
             </button>
          </form>
       </div>
    </div>
  )
}