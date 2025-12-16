'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { encryptData, decryptData, generatePassword } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';
import { Copy, Plus, LogOut, Edit3, Save, AlertTriangle, ExternalLink, Loader2, Key, Search, Code, Lock } from 'lucide-react';
import { toast } from 'sonner';

export default function VaultDashboard() {
  const { masterKey, user, logout } = useAuth();
  const router = useRouter();
  
  // Data State
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  
  // UI State
  const [isAdding, setIsAdding] = useState(false);
  const [addType, setAddType] = useState<'password' | 'apikey'>('password');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  // Form State
  const [form, setForm] = useState({ name: '', url: '', username: '', password: '', description: '' });

  // 1. SECURE AUTH CHECK
  useEffect(() => {
    let mounted = true;
    const checkSession = async () => {
      await new Promise(r => setTimeout(r, 500));
      const storedKey = sessionStorage.getItem('secure_vault_key');
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        if (mounted) router.push('/auth');
        return;
      }
      if (!masterKey && !storedKey) {
        if (mounted) {
           toast.error("Session expired. Please login again.");
           router.push('/auth');
        }
        return;
      }
      if (mounted) {
        setPageLoading(false);
        if (masterKey) loadItems();
      }
    };
    checkSession();
    return () => { mounted = false; };
  }, [user, masterKey]);

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
    if (!form.name || !form.password) return toast.error("Name and Secret required!");

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
            type: addType, // Use the type selected when button was clicked
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

  const startAdd = (type: 'password' | 'apikey') => {
    setAddType(type);
    setForm({ name: '', url: '', username: '', password: '', description: '' });
    setEditingId(null);
    setIsAdding(true);
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startEdit = (item: any) => {
      setForm({
          name: item.name,
          url: item.url || '',
          username: item.username || '',
          password: item.secret,
          description: item.description || ''
      });
      setAddType(item.type);
      setEditingId(item.id);
      setIsAdding(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const checkExpiry = (dateString: string) => {
      const date = new Date(dateString);
      const diff = new Date().getTime() - date.getTime();
      const days = diff / (1000 * 3600 * 24);
      return days > 30;
  };

  // Filter items based on search
  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) || 
    (item.username && item.username.toLowerCase().includes(search.toLowerCase()))
  );

  const passwords = filteredItems.filter(i => i.type === 'password');
  const apiKeys = filteredItems.filter(i => i.type === 'apikey');

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
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 bg-white border border-slate-200 p-4 rounded-xl shadow-sm gap-4">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <span className="bg-blue-600 text-white p-2 rounded-lg"><Key size={20}/></span>
              My Secure Stash
            </h1>
            
            <div className="flex-1 w-full md:w-auto max-w-md relative">
               <Search className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
               <input 
                 placeholder="Search vault..." 
                 className="w-full pl-10 pr-4 py-2 bg-slate-100 border-transparent focus:bg-white focus:border-blue-500 rounded-lg transition-all outline-none border"
                 value={search}
                 onChange={e => setSearch(e.target.value)}
               />
            </div>

            <button onClick={logout} className="font-bold text-slate-500 hover:text-red-600 transition-colors flex items-center gap-2 text-sm">
                <LogOut size={16}/> Sign Out
            </button>
        </div>

        {/* ACTION BUTTONS */}
        {!isAdding && (
          <div className="grid grid-cols-2 gap-4 mb-8">
             <button onClick={() => startAdd('password')} className="bg-yellow-400 hover:bg-yellow-500 border-2 border-yellow-600 text-black p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-none transition-all">
                <Lock size={20} /> Add New Password
             </button>
             <button onClick={() => startAdd('apikey')} className="bg-pink-400 hover:bg-pink-500 border-2 border-pink-600 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-none transition-all">
                <Code size={20} /> Add New API Key
             </button>
          </div>
        )}

        {/* ADD/EDIT FORM */}
        {isAdding && (
            <div className="bg-white border-2 border-slate-900 p-6 rounded-xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] mb-10 animate-in slide-in-from-top-4">
                <h2 className="text-xl font-black mb-6 uppercase flex items-center gap-2">
                   {addType === 'password' ? <Lock className="text-yellow-500"/> : <Code className="text-pink-500"/>}
                   {editingId ? 'Edit Entry' : `New ${addType === 'password' ? 'Password' : 'API Key'}`}
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Name</label>
                      <input placeholder={addType === 'password' ? "e.g. Netflix" : "e.g. Stripe Prod"} className="w-full border-2 border-slate-200 p-3 font-bold rounded-lg focus:border-blue-500 outline-none" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                    </div>
                    
                    <div>
                      <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">URL (Optional)</label>
                      <input placeholder="https://..." className="w-full border-2 border-slate-200 p-3 font-bold rounded-lg focus:border-blue-500 outline-none" value={form.url} onChange={e => setForm({...form, url: e.target.value})} />
                    </div>
                    
                    {addType === 'password' && (
                       <div className="md:col-span-2">
                         <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Username / Email</label>
                         <input placeholder="user@example.com" className="w-full border-2 border-slate-200 p-3 font-bold rounded-lg focus:border-blue-500 outline-none" value={form.username} onChange={e => setForm({...form, username: e.target.value})} />
                       </div>
                    )}
                    
                    <div className="md:col-span-2">
                         <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">{addType === 'password' ? 'Password' : 'API Secret'}</label>
                         <div className="flex gap-2">
                            <input className="w-full border-2 border-slate-200 p-3 font-bold rounded-lg focus:border-blue-500 outline-none font-mono" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
                            <button onClick={() => setForm({...form, password: generatePassword()})} className="bg-slate-100 border-2 border-slate-300 px-4 rounded-lg font-bold hover:bg-slate-200">Generate</button>
                         </div>
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Notes</label>
                      <textarea placeholder="Description..." className="w-full border-2 border-slate-200 p-3 font-bold rounded-lg focus:border-blue-500 outline-none" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
                    </div>
                </div>
                
                <div className="flex gap-4 mt-6">
                    <button onClick={handleSave} className="flex-1 bg-blue-600 text-white font-black py-3 rounded-lg hover:bg-blue-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] hover:shadow-none hover:translate-y-[2px] transition-all">SAVE ENTRY</button>
                    <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="flex-1 bg-slate-200 text-slate-600 font-black py-3 rounded-lg hover:bg-slate-300">CANCEL</button>
                </div>
            </div>
        )}

        {/* --- SECTION: PASSWORDS --- */}
        {passwords.length > 0 && (
          <div className="mb-10">
            <h3 className="text-xl font-black mb-4 flex items-center gap-2 text-slate-800">
              <span className="bg-yellow-400 p-1 rounded text-black"><Lock size={18}/></span> My Passwords
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {passwords.map((item) => {
                  const isExpired = checkExpiry(item.updated_at || item.created_at);
                  return (
                      <div key={item.id} className="bg-white border-2 border-slate-200 rounded-xl p-5 hover:border-blue-400 transition-all relative group shadow-sm">
                          {isExpired && (
                              <div className="absolute -top-3 -right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded rotate-3 flex items-center gap-1 shadow-sm z-10">
                                  <AlertTriangle size={10} /> OLD
                              </div>
                          )}
                          <div className="flex justify-between items-start mb-2">
                              <h3 className="text-lg font-bold truncate text-slate-800">{item.name}</h3>
                              <div className="flex gap-1">
                                  <button onClick={() => startEdit(item)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-md transition-all"><Edit3 size={16} /></button>
                                  {item.url && <a href={item.url} target="_blank" className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-md transition-all"><ExternalLink size={16} /></a>}
                              </div>
                          </div>
                          <p className="font-mono text-xs text-slate-500 mb-3 bg-slate-50 p-1 rounded w-fit">{item.username}</p>
                          <div className="bg-slate-900 text-white rounded-lg p-3 flex justify-between items-center mb-3">
                              <span className="font-mono text-sm tracking-widest truncate w-2/3 select-all">•••••••••••••</span>
                              <button onClick={() => { navigator.clipboard.writeText(item.secret); toast.success("Copied!"); }} className="text-xs font-bold bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded flex items-center gap-1 transition-colors"><Copy size={12}/> COPY</button>
                          </div>
                          {item.description && <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-2 mt-2">{item.description}</p>}
                      </div>
                  )
              })}
            </div>
          </div>
        )}

        {/* --- SECTION: API KEYS --- */}
        {apiKeys.length > 0 && (
          <div className="mb-10">
            <h3 className="text-xl font-black mb-4 flex items-center gap-2 text-slate-800">
              <span className="bg-pink-400 p-1 rounded text-white"><Code size={18}/></span> My API Keys
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {apiKeys.map((item) => (
                  <div key={item.id} className="bg-white border-2 border-slate-200 rounded-xl p-5 hover:border-pink-400 transition-all relative group shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                          <h3 className="text-lg font-bold truncate text-slate-800">{item.name}</h3>
                          <div className="flex gap-1">
                              <button onClick={() => startEdit(item)} className="p-1.5 hover:bg-pink-50 text-pink-500 rounded-md transition-all"><Edit3 size={16} /></button>
                              {item.url && <a href={item.url} target="_blank" className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-md transition-all"><ExternalLink size={16} /></a>}
                          </div>
                      </div>
                      <div className="bg-slate-900 text-pink-400 rounded-lg p-3 flex justify-between items-center mb-3 font-mono">
                          <span className="text-sm tracking-widest truncate w-2/3 select-all">•••••••••••••</span>
                          <button onClick={() => { navigator.clipboard.writeText(item.secret); toast.success("Copied!"); }} className="text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded flex items-center gap-1 transition-colors"><Copy size={12}/> COPY</button>
                      </div>
                      {item.description && <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-2 mt-2">{item.description}</p>}
                  </div>
              ))}
            </div>
          </div>
        )}

        {items.length === 0 && !isAdding && (
           <div className="text-center py-20 opacity-50">
             <Key className="w-16 h-16 mx-auto mb-4 text-slate-300" />
             <h3 className="text-xl font-bold text-slate-400">Your vault is empty</h3>
             <p className="text-slate-400">Add a password or API key to get started.</p>
           </div>
        )}

      </div>
    </div>
  );
}