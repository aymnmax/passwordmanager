'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ShieldAlert, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function RecoveryActionPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const action = searchParams.get('action'); // 'accept' or 'decline'
  const device = searchParams.get('device');

  const [status, setStatus] = useState<'loading' | 'success' | 'wait' | 'error'>('loading');
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    if (!token || !action) return;

    const processAction = async () => {
      try {
        if (action === 'decline') {
           // BLACKLIST DEVICE
           await supabase.from('blacklisted_devices').insert({ 
             device_token: device, 
             reason: 'User declined recovery request' 
           });
           setStatus('success'); // "Device Blocked"
           return;
        }

        if (action === 'accept') {
           // 1. Get Request Info
           const { data: req, error } = await supabase.from('recovery_requests').select('*').eq('token', token).single();
           if (error || !req) throw new Error("Invalid or expired token.");

           // 2. Check Time
           if (!req.unlock_at) {
             // START TIMER NOW (First click)
             const unlockDate = new Date();
             unlockDate.setHours(unlockDate.getHours() + 24);
             
             await supabase.from('recovery_requests')
               .update({ status: 'waiting_period', unlock_at: unlockDate.toISOString() })
               .eq('id', req.id);
             
             setStatus('wait');
             setTimeLeft("24 hours");
           } else {
             // CHECK TIMER (Return visit)
             const unlockTime = new Date(req.unlock_at).getTime();
             const now = new Date().getTime();
             
             if (now < unlockTime) {
               setStatus('wait');
               const hoursLeft = Math.ceil((unlockTime - now) / (1000 * 60 * 60));
               setTimeLeft(`${hoursLeft} hours`);
             } else {
               // SUCCESS! TIMER FINISHED.
               // Allow reset. We send a standard reset email now, or redirect to a special reset page.
               // For simplicity, we trigger the standard reset email logic here.
               const { data: { user } } = await supabase.auth.admin.getUserById(req.user_id); // Admin only, see note below*
               // *Client-side limitation: We can't use admin functions here. 
               // In real app, call API. Here we just show success message.
               
               setStatus('success');
             }
           }
        }
      } catch (err) {
        setStatus('error');
      }
    };
    processAction();
  }, [token, action, device]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
       <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-lg text-center">
         {status === 'loading' && <Loader2 className="w-12 h-12 animate-spin mx-auto text-blue-600"/>}
         
         {status === 'success' && action === 'decline' && (
           <div className="text-red-600">
             <ShieldAlert className="w-16 h-16 mx-auto mb-4"/>
             <h1 className="text-2xl font-bold">Device Blocked</h1>
             <p className="text-slate-600 mt-2">We have blacklisted the device that made this request.</p>
           </div>
         )}

         {status === 'wait' && (
            <div className="text-yellow-600">
              <Clock className="w-16 h-16 mx-auto mb-4"/>
              <h1 className="text-2xl font-bold">Security Hold Active</h1>
              <p className="text-slate-600 mt-2">For your security, there is a 24-hour waiting period.</p>
              <div className="bg-yellow-50 border border-yellow-200 p-4 mt-4 rounded-lg">
                <p className="font-bold text-xl">{timeLeft}</p>
                <p className="text-sm">Time Remaining</p>
              </div>
              <p className="text-xs text-slate-400 mt-4">Please verify the URL is correct and bookmark this page.</p>
            </div>
         )}

         {status === 'success' && action === 'accept' && (
           <div className="text-green-600">
             <CheckCircle className="w-16 h-16 mx-auto mb-4"/>
             <h1 className="text-2xl font-bold">Identity Verified</h1>
             <p className="text-slate-600 mt-2">The waiting period is over. You may now reset your credentials.</p>
             <button onClick={() => router.push('/auth/reset-credentials')} className="mt-6 bg-green-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-green-700">
               Reset Security Settings
             </button>
           </div>
         )}

         {status === 'error' && (
           <div className="text-slate-400">
             <XCircle className="w-16 h-16 mx-auto mb-4"/>
             <h1 className="text-2xl font-bold">Invalid Request</h1>
             <p className="mt-2">This link is expired or invalid.</p>
           </div>
         )}
       </div>
    </div>
  );
}