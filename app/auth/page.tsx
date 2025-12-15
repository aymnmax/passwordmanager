'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { deriveKey } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { UAParser } from 'ua-parser-js';
import { Eye, EyeOff, Lock, User, HelpCircle, ArrowRight } from 'lucide-react';

const ANIMALS = [
  { id: 'elephant', icon: '🐘' },
  { id: 'cat', icon: '🐱' },
  { id: 'dog', icon: '🐶' },
  { id: 'lion', icon: '🦁' },
  { id: 'panda', icon: '🐼' },
  { id: 'fox', icon: '🦊' },
];

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ 
    email: '', 
    password: '', 
    securityQ: '', 
    securityA: '', 
    selectedAnimal: '' 
  });
  
  // Login State
  const [loginStep, setLoginStep] = useState(1); // 1 = Creds, 2 = Animal

  const { setMasterKey } = useAuth();
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.selectedAnimal) return toast.error('Pick an animal!');
    setLoading(true);

    try {
      // 1. Sign Up
      const { data, error } = await supabase.auth.signUp({ email: form.email, password: form.password });
      if (error) throw error;
      if (!data.user) throw new Error('Registration failed');

      // 2. Create Profile (Security Q + Animal)
      // Hash the answer for basic privacy
      const answerHash = btoa(form.securityA.toLowerCase().trim()); 
      
      const { error: profileError } = await supabase.from('user_profiles').insert({
        id: data.user.id,
        security_question: form.securityQ,
        security_answer_hash: answerHash,
        selected_animal: form.selectedAnimal
      });

      if (profileError) throw profileError;

      toast.success('Account created! Please log in.');
      setIsLogin(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginInit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Move to step 2 (Animal Check)
    setLoginStep(2);
  };

  const handleLoginFinal = async (animalId: string) => {
    setLoading(true);
    try {
      // 1. Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email: form.email, 
        password: form.password 
      });
      if (error) throw new Error('Wrong credentials');

      // 2. Check Animal (Security Step)
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('selected_animal')
        .eq('id', data.user.id)
        .single();

      if (!profile || profile.selected_animal !== animalId) {
        await supabase.auth.signOut();
        throw new Error('Wrong animal! Security check failed.');
      }

      // 3. Success - Derive Key
      const key = await deriveKey(form.password, data.user.id);
      setMasterKey(key);

      // 4. Log Session (Optional)
      const parser = new UAParser();
      await supabase.from('login_sessions').insert({
        user_id: data.user.id,
        device_name: `${parser.getBrowser().name} on ${parser.getOS().name}`
      });

      router.push('/vault');
      toast.success('Welcome back!');
    } catch (err: any) {
      toast.error(err.message);
      if (err.message.includes('animal')) setLoginStep(1); // Reset on security fail
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-yellow-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-xl overflow-hidden">
        
        {/* Header */}
        <div className="bg-blue-400 p-6 border-b-4 border-black text-center">
          <h1 className="text-3xl font-black text-white uppercase tracking-wider drop-shadow-md">
            {isLogin ? 'Vault Login' : 'Join the Squad'}
          </h1>
        </div>

        <div className="p-8">
          {/* LOGIN FLOW */}
          {isLogin && (
            <>
              {loginStep === 1 ? (
                <form onSubmit={handleLoginInit} className="space-y-4">
                  <div>
                    <label className="font-bold text-sm uppercase">Email</label>
                    <input 
                      type="email" required 
                      className="w-full border-4 border-black rounded-lg p-3 font-bold focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:translate-x-[-2px] focus:translate-y-[-2px] transition-all outline-none"
                      value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="font-bold text-sm uppercase">Password</label>
                    <input 
                      type="password" required 
                      className="w-full border-4 border-black rounded-lg p-3 font-bold outline-none"
                      value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                    />
                  </div>
                  <button className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-black py-4 border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-none transition-all flex items-center justify-center gap-2">
                    NEXT STEP <ArrowRight strokeWidth={3} />
                  </button>
                  <p className="text-center font-bold underline cursor-pointer" onClick={() => router.push('/auth/forgot')}>Forgot Password?</p>
                </form>
              ) : (
                <div className="text-center animate-in zoom-in">
                  <h3 className="text-xl font-black mb-4">Pick your Security Animal 🐘</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {ANIMALS.map(a => (
                      <button 
                        key={a.id}
                        onClick={() => handleLoginFinal(a.id)}
                        className="text-4xl p-4 border-4 border-black rounded-lg hover:bg-green-200 hover:scale-105 transition-transform"
                      >
                        {a.icon}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setLoginStep(1)} className="mt-6 font-bold underline text-sm">Go Back</button>
                </div>
              )}
            </>
          )}

          {/* REGISTER FLOW */}
          {!isLogin && (
            <form onSubmit={handleRegister} className="space-y-4">
               <div>
                  <label className="font-bold text-xs uppercase">Email</label>
                  <input type="email" required className="w-full border-2 border-black rounded p-2 font-bold" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
               </div>
               <div>
                  <label className="font-bold text-xs uppercase">Master Password</label>
                  <input type="password" required className="w-full border-2 border-black rounded p-2 font-bold" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
               </div>
               
               <div className="border-t-2 border-black border-dashed pt-2">
                 <label className="font-bold text-xs uppercase">Security Question</label>
                 <select className="w-full border-2 border-black rounded p-2 font-bold mb-2" value={form.securityQ} onChange={e => setForm({...form, securityQ: e.target.value})}>
                   <option value="">Select Question...</option>
                   <option value="pet">First Pet's Name?</option>
                   <option value="school">First School?</option>
                   <option value="city">City you were born?</option>
                 </select>
                 <input type="text" placeholder="Answer..." className="w-full border-2 border-black rounded p-2 font-bold" value={form.securityA} onChange={e => setForm({...form, securityA: e.target.value})} />
               </div>

               <div>
                 <label className="font-bold text-xs uppercase mb-2 block">Select Security Animal</label>
                 <div className="flex justify-between">
                    {ANIMALS.map(a => (
                      <button 
                        key={a.id} type="button"
                        onClick={() => setForm({...form, selectedAnimal: a.id})}
                        className={`text-2xl p-1 border-2 border-black rounded ${form.selectedAnimal === a.id ? 'bg-green-300 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'bg-white'}`}
                      >
                        {a.icon}
                      </button>
                    ))}
                 </div>
               </div>

               <button className="w-full bg-pink-500 text-white font-black py-3 border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-none transition-all mt-4">
                 CREATE VAULT
               </button>
            </form>
          )}
        </div>
        
        <div className="bg-gray-100 p-4 text-center border-t-4 border-black">
          <button onClick={() => { setIsLogin(!isLogin); setLoginStep(1); }} className="font-bold text-sm text-gray-600 hover:text-black">
            {isLogin ? "Need a Vault? Register" : "Have a Vault? Login"}
          </button>
        </div>
      </div>
    </div>
  );
}