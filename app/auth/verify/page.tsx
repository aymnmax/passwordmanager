'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { deriveKey } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Loader2, ShieldAlert } from 'lucide-react';

export default function VerifyPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setMasterKey } = useAuth();

  useEffect(() => {
    // Security Check: If they manually navigated here without logging in first
    const tempPass = sessionStorage.getItem('temp_key_material');
    if (!tempPass) router.push('/auth');
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Session expired');

      // 1. Verify Code in DB
      const { data: validCode, error } = await supabase
        .from('verification_codes')
        .select('*')
        .eq('user_id', user.id)
        .eq('code', code)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error || !validCode) throw new Error('Invalid or expired code');

      // 2. Add as Trusted Device
      const deviceId = sessionStorage.getItem('temp_device_id');
      const deviceName = sessionStorage.getItem('temp_device_name');
      
      await supabase.from('trusted_devices').insert({
        user_id: user.id,
        device_id: deviceId,
        device_name: deviceName
      });

      // 3. Derive Key & Cleanup
      const password = sessionStorage.getItem('temp_key_material')!;
      const key = await deriveKey(password, user.id);
      setMasterKey(key);
      
      // Clear sensitive temp data
      sessionStorage.removeItem('temp_key_material');
      
      // 4. Delete used code
      await supabase.from('verification_codes').delete().eq('id', validCode.id);

      toast.success('Device verified successfully!');
      router.push('/vault');

    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-sm border border-slate-100 text-center">
        <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900">New Device Verification</h2>
        <p className="text-sm text-slate-500 mb-6">
          We sent a 6-digit code to your email. Enter it below to trust this device.
        </p>

        <form onSubmit={handleVerify} className="space-y-4">
          <input 
            className="w-full text-center text-2xl tracking-[0.5em] font-bold py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g,''))}
          />
          <button disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition flex justify-center">
            {loading ? <Loader2 className="animate-spin" /> : 'Verify Device'}
          </button>
        </form>
      </div>
    </div>
  );
}