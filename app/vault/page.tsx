'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { encryptData, decryptData, generatePassword } from '@/lib/crypto';
import { toast } from 'sonner';
import { Copy, Plus, LogOut, Edit3, Save, AlertTriangle, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function VaultDashboard() {
  const { masterKey, user, logout } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [tab, setTab] = useState<'password' | 'apikey'>('password');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const router = useRouter();

  // Form State
  const [form, setForm] = useState({ name: '', url: '', username: '', password: '', description: '' });

  useEffect(() => {
    if (!user) router.push('/auth');
    if (user && !masterKey) router.push('/auth');
    loadItems();
  }, [user, masterKey]);

  const loadItems = async () => {
    if (!masterKey) return;
    const { data } = await supabase.from('vault_items').select('*').order('created_at', { ascending: false });
    if (data) {
        const decrypted = await Promise.all(data.map(async (item) => {
            try {
                const secret = await decryptData(masterKey, item.encrypted_blob, item.iv);
                return { ...item, secret };
            } catch { return { ...item, secret: 'Error' }; }
        }));
        setItems(decrypted);
    }
  };

  const handleSave = async () => {
    if (!masterKey) return;
    const type = tab; // 'password' or 'apikey'
    const { ciphertext, iv } = await encryptData(masterKey, form.password); // 'password' holds the secret (pass or api key)
    
    if (editingId) {
        // UPDATE
        await supabase.from('vault_items').update({
            name: form.name,
            username: form.username,
            url: form.url,
            description: form.description,
            encrypted_blob: ciphertext,
            iv: iv,
            updated_at: new Date().toISOString()
        }).eq('id', editingId);
        toast.success("Updated!");
        setEditingId(null);
    } else {
        // CREATE
        await supabase.from('vault_items').insert({
            user_id: user.id,
            type: type,
            name: form.name,
            username: form.username,
            url: form.url,
            description: form.description,
            encrypted_blob: ciphertext,
            iv: iv
        });
        toast.success("Saved!");
    }
    setIsAdding(false);
    setForm({ name: '', url: '', username: '', password: '', description: '' });
    loadItems();
  };

  const startEdit = (item: any) => {
      setForm({
          name: item.name,
          url: item.url || '',
          username: item.username || '',
          password: item.secret,
          description: item.description || ''
      });
      setTab(item.type);
      setEditingId(item.id);
      setIsAdding(true);
  };

  const checkExpiry = (dateString: string) => {
      const date = new Date(dateString);
      const diff = new Date().getTime() - date.getTime();
      const days = diff / (1000 * 3600 * 24);
      return days > 30;
  };

  if (!masterKey) return null;

  return (
    <div className="min-h-screen bg-sky-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto">
        {/* Navbar */}
        <div className="flex justify-between items-center mb-8 bg-white border-4 border-black p-4 rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <h1 className="text-2xl font-black uppercase">My Secure Stash 🔐</h1>
            <button onClick={logout} className="font-bold border-2 border-black px-4 py-2 rounded hover:bg-red-400 hover:text-white transition-colors">
                SIGNOUT
            </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6">
            <button onClick={() => { setTab('password'); setIsAdding(false); }} className={`flex-1 py-3 font-black text-xl border-4 border-black rounded-xl uppercase transition-all ${tab === 'password' ? 'bg-yellow-400 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' : 'bg-white text-gray-400'}`}>
                PASSWORDS
            </button>
            <button onClick={() => { setTab('apikey'); setIsAdding(false); }} className={`flex-1 py-3 font-black text-xl border-4 border-black rounded-xl uppercase transition-all ${tab === 'apikey' ? 'bg-pink-400 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' : 'bg-white text-gray-400'}`}>
                API KEYS
            </button>
        </div>

        {/* Add Button */}
        {!isAdding && (
            <button onClick={() => setIsAdding(true)} className="w-full bg-green-400 border-4 border-black p-4 rounded-xl font-black text-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-none transition-all mb-8 flex items-center justify-center gap-2">
                <Plus strokeWidth={4} /> ADD NEW {tab === 'password' ? 'PASSWORD' : 'API KEY'}
            </button>
        )}

        {/* FORM */}
        {isAdding && (
            <div className="bg-white border-4 border-black p-6 rounded-xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] mb-8 animate-in slide-in-from-top-4">
                <h2 className="text-xl font-black mb-4 uppercase">{editingId ? 'Edit Item' : `New ${tab}`}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input placeholder={tab === 'password' ? "Website Name" : "App Name"} className="border-4 border-black p-3 font-bold rounded-lg" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                    <input placeholder="Website Link (URL)" className="border-4 border-black p-3 font-bold rounded-lg" value={form.url} onChange={e => setForm({...form, url: e.target.value})} />
                    
                    {tab === 'password' && (
                        <input placeholder="Username / Email" className="border-4 border-black p-3 font-bold rounded-lg" value={form.username} onChange={e => setForm({...form, username: e.target.value})} />
                    )}
                    
                    <div className="flex gap-2">
                         <input placeholder={tab === 'password' ? "Password" : "API Key Secret"} className="w-full border-4 border-black p-3 font-bold rounded-lg" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
                         <button onClick={() => setForm({...form, password: generatePassword()})} className="bg-gray-200 border-4 border-black px-4 rounded-lg font-bold">GEN</button>
                    </div>

                    <textarea placeholder="Description / Notes" className="md:col-span-2 border-4 border-black p-3 font-bold rounded-lg" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
                </div>
                <div className="flex gap-4 mt-4">
                    <button onClick={handleSave} className="flex-1 bg-blue-500 text-white font-black py-3 border-4 border-black rounded-lg hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">SAVE</button>
                    <button onClick={() => { setIsAdding(false); setEditingId(null); setForm({ name: '', url: '', username: '', password: '', description: '' }); }} className="flex-1 bg-gray-300 font-black py-3 border-4 border-black rounded-lg">CANCEL</button>
                </div>
            </div>
        )}

        {/* LIST */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {items.filter(i => i.type === tab).map((item) => {
                const isExpired = checkExpiry(item.updated_at || item.created_at);
                return (
                    <div key={item.id} className="bg-white border-4 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all relative">
                        {isExpired && tab === 'password' && (
                            <div className="absolute -top-3 -right-3 bg-red-500 text-white text-xs font-black px-2 py-1 border-2 border-black rounded rotate-12 flex items-center gap-1 shadow-sm">
                                <AlertTriangle size={12} /> CHANGE PASS
                            </div>
                        )}
                        
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="text-xl font-black truncate">{item.name}</h3>
                            <div className="flex gap-2">
                                <button onClick={() => startEdit(item)} className="p-1 hover:bg-gray-200 rounded border-2 border-transparent hover:border-black transition-all"><Edit3 size={18} /></button>
                                {item.url && <a href={item.url} target="_blank" className="p-1 hover:bg-gray-200 rounded border-2 border-transparent hover:border-black transition-all"><ExternalLink size={18} /></a>}
                            </div>
                        </div>

                        {tab === 'password' && <p className="font-mono text-sm text-gray-500 mb-2">{item.username}</p>}
                        
                        <div className="bg-gray-100 border-2 border-black rounded p-2 flex justify-between items-center mb-2">
                            <span className="font-mono font-bold tracking-widest text-sm truncate w-2/3">•••••••••••••</span>
                            <button onClick={() => { navigator.clipboard.writeText(item.secret); toast.success("Copied!"); }} className="text-sm font-black text-blue-600 hover:underline">COPY</button>
                        </div>
                        
                        {item.description && <p className="text-xs text-gray-500 italic border-t border-gray-300 pt-2">{item.description}</p>}
                        
                        <div className="mt-3 text-[10px] text-gray-400 font-bold uppercase text-right">
                             UPDATED: {new Date(item.updated_at || item.created_at).toLocaleDateString()}
                        </div>
                    </div>
                )
            })}
        </div>
      </div>
    </div>
  );
}