'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { encryptData, decryptData, generatePassword } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';
import { Copy, Plus, LogOut, Edit3, Save, AlertTriangle, ExternalLink, Loader2, Key } from 'lucide-react';
import { toast } from 'sonner';

export default function VaultDashboard() {
  const { masterKey, user, logout } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [tab, setTab] = useState<'password' | 'apikey'>('password');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // PAGE LOADING STATE
  const [pageLoading, setPageLoading] = useState(true);

  // Form State
  const [form, setForm] = useState({ name: '', url: '', username: '', password: '', description: '' });

  // 1. SECURE AUTH CHECK
  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      // Small delay to allow SessionStorage to populate after login redirect
      await new Promise(r => setTimeout(r, 500));

      const storedKey = sessionStorage.getItem('secure_vault_key');
      
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        if (mounted) router.push('/auth');
        return;
      }

      // If we have no key in RAM (masterKey) AND no key in Storage...
      if (!masterKey && !storedKey) {
        if (mounted) {
           toast.error("Session expired. Please login again.");
           router.push('/auth');
        }
        return;
      }

      // Success!
      if (mounted) {
        setPageLoading(false);
        if (masterKey) loadItems();
      }
    };

    checkSession();
    return () => { mounted = false; };
  }, [user, masterKey]);

  // Load items whenever masterKey becomes available
  useEffect(() => {
    if (masterKey) loadItems();
  }, [masterKey]);

  const loadItems = async () => {
    if (!masterKey) return;
    const { data } = await supabase.from('vault_items').select('*').order('created_at', { ascending: false });
    if (data) {
        const decrypted = await Promise.all(data.map(async (item) => {
            try {
                const secret = await decryptData(masterKey, item.encrypted_blob, item.iv);
                return { ...item, secret };
            } catch { return { ...item, secret: 'Error Decrypting' }; }
        }));
        setItems(decrypted);
    }
  };

  const handleSave = async () => {
    if (!masterKey) return;
    if (!form.name || !form.password) return toast.error("Name and Password required!");

    const type = tab; 
    const { ciphertext, iv } = await encryptData(masterKey, form.password);
    
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

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Unlocking Vault...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sky-50 p-6 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto">
        {/* Navbar */}
        <div className="flex justify-between items-center mb-8 bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <span className="bg-blue-600 text-white p-1 rounded-lg"><Key size={20}/></span>
              My Secure Stash
            </h1>
            <button onClick={logout} className="font-bold border border-slate-300 px-4 py-2 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors flex items-center gap-2">
                <LogOut size={16}/> Sign Out
            </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6">
            <button onClick={() => { setTab('password'); setIsAdding(false); }} className={`flex-1 py-3 font-bold text-lg border rounded-xl uppercase transition-all ${tab === 'password' ? 'bg-yellow-400 border-yellow-500 text-black shadow-md' : 'bg-white border-slate-200 text-slate-400'}`}>
                PASSWORDS
            </button>
            <button onClick={() => { setTab('apikey'); setIsAdding(false); }} className={`flex-1 py-3 font-bold text-lg border rounded-xl uppercase transition-all ${tab === 'apikey' ? 'bg-pink-400 border-pink-500 text-white shadow-md' : 'bg-white border-slate-200 text-slate-400'}`}>
                API KEYS
            </button>
        </div>

        {/* Add Button */}
        {!isAdding && (
            <button onClick={() => setIsAdding(true)} className="w-full bg-white border-2 border-dashed border-slate-300 text-slate-500 p-4 rounded-xl font-bold text-lg hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all mb-8 flex items-center justify-center gap-2">
                <Plus strokeWidth={3} /> ADD NEW {tab === 'password' ? 'PASSWORD' : 'API KEY'}
            </button>
        )}

        {/* FORM */}
        {isAdding && (
            <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-lg mb-8 animate-in slide-in-from-top-4">
                <h2 className="text-xl font-bold mb-4 uppercase text-slate-700">{editingId ? 'Edit Item' : `New ${tab}`}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input placeholder={tab === 'password' ? "Website Name" : "App Name"} className="border p-3 font-medium rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                    <input placeholder="Website Link (URL)" className="border p-3 font-medium rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={form.url} onChange={e => setForm({...form, url: e.target.value})} />
                    
                    {tab === 'password' && (
                        <input placeholder="Username / Email" className="border p-3 font-medium rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={form.username} onChange={e => setForm({...form, username: e.target.value})} />
                    )}
                    
                    <div className="flex gap-2">
                         <input placeholder={tab === 'password' ? "Password" : "API Key Secret"} className="w-full border p-3 font-medium rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
                         <button onClick={() => setForm({...form, password: generatePassword()})} className="bg-slate-100 border px-4 rounded-lg font-bold hover:bg-slate-200">GEN</button>
                    </div>

                    <textarea placeholder="Description / Notes" className="md:col-span-2 border p-3 font-medium rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
                </div>
                <div className="flex gap-4 mt-4">
                    <button onClick={handleSave} className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 shadow-sm flex justify-center items-center gap-2"><Save size={18}/> SAVE</button>
                    <button onClick={() => { setIsAdding(false); setEditingId(null); setForm({ name: '', url: '', username: '', password: '', description: '' }); }} className="flex-1 bg-slate-100 text-slate-600 font-bold py-3 rounded-lg hover:bg-slate-200">CANCEL</button>
                </div>
            </div>
        )}

        {/* LIST */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.filter(i => i.type === tab).map((item) => {
                const isExpired = checkExpiry(item.updated_at || item.created_at);
                return (
                    <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all relative group">
                        {isExpired && tab === 'password' && (
                            <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-sm z-10">
                                <AlertTriangle size={10} /> OLD PASS
                            </div>
                        )}
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="text-lg font-bold truncate text-slate-800">{item.name}</h3>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => startEdit(item)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-md transition-all"><Edit3 size={16} /></button>
                                {item.url && <a href={item.url} target="_blank" className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-md transition-all"><ExternalLink size={16} /></a>}
                            </div>
                        </div>
                        {tab === 'password' && <p className="font-mono text-xs text-slate-500 mb-3 bg-slate-50 p-1 rounded w-fit">{item.username}</p>}
                        <div className="bg-slate-800 text-white rounded-lg p-3 flex justify-between items-center mb-3 shadow-inner">
                            <span className="font-mono text-sm tracking-widest truncate w-2/3 select-all">•••••••••••••</span>
                            <button onClick={() => { navigator.clipboard.writeText(item.secret); toast.success("Copied!"); }} className="text-xs font-bold bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded flex items-center gap-1 transition-colors"><Copy size={12}/> COPY</button>
                        </div>
                        {item.description && <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-2 mt-2">{item.description}</p>}
                        <div className="mt-3 text-[10px] text-slate-300 font-bold uppercase text-right">UPDATED: {new Date(item.updated_at || item.created_at).toLocaleDateString()}</div>
                    </div>
                )
            })}
        </div>
      </div>
    </div>
  );
}