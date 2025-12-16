'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { encryptData, decryptData, generatePassword } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';
import { 
  Copy, Plus, Edit3, Save, ExternalLink, 
  Loader2, Search, Lock, Key, Shield, Globe, User, 
  X, Trash2, Eye, EyeOff
} from 'lucide-react';
import { toast } from 'sonner';

// --- COMPONENTS ---
const Badge = ({ children, color }: { children: React.ReactNode, color: string }) => (
  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${color}`}>
    {children}
  </span>
);

export default function VaultDashboard() {
  const { masterKey, user, logout } = useAuth();
  const router = useRouter();
  
  // Data & UI State
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addType, setAddType] = useState<'password' | 'apikey'>('password');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [showSecret, setShowSecret] = useState(false);

  // Form State
  const [form, setForm] = useState({ name: '', url: '', username: '', password: '', description: '' });

  // --- 1. AUTO LOGOUT LOGIC (30 Mins) ---
  useEffect(() => {
    let logoutTimer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(logoutTimer);
      logoutTimer = setTimeout(() => {
        toast.warning("Session timed out due to inactivity.");
        logout();
      }, 30 * 60 * 1000); 
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    resetTimer();

    return () => {
      clearTimeout(logoutTimer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
    };
  }, [logout]);

  // --- 2. AUTH CHECK ---
  useEffect(() => {
    let mounted = true;
    const checkSession = async () => {
      await new Promise(r => setTimeout(r, 500));
      const storedKey = sessionStorage.getItem('secure_vault_key');
      const { data: { session } } = await supabase.auth.getSession();

      if (!session || (!masterKey && !storedKey)) {
        if (mounted) router.push('/auth');
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

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this item? This cannot be undone.")) return;

    const { error } = await supabase.from('vault_items').delete().eq('id', id);
    if (error) {
      toast.error("Failed to delete item.");
    } else {
      toast.success("Item deleted permanently.");
      loadItems(); 
    }
  };

  const handleSave = async () => {
    if (!masterKey) return;
    if (!form.name || !form.password) return toast.error("Name and Secret are required.");

    const { ciphertext, iv } = await encryptData(masterKey, form.password);
    
    try {
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
          toast.success("Item updated successfully.");
      } else {
          // INSERT
          await supabase.from('vault_items').insert({
              user_id: user.id,
              type: addType,
              name: form.name,
              username: form.username,
              url: form.url,
              description: form.description,
              encrypted_blob: ciphertext,
              iv: iv
          });
          toast.success("New item added to vault.");
      }
      closeForm();
      loadItems();
    } catch (error) {
      toast.error("Failed to save. Check database connection.");
    }
  };

  const closeForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setForm({ name: '', url: '', username: '', password: '', description: '' });
    setShowSecret(false);
  };

  const startAdd = (type: 'password' | 'apikey') => {
    setAddType(type);
    setForm({ name: '', url: '', username: '', password: '', description: '' });
    setEditingId(null);
    setIsAdding(true);
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

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) || 
    (item.username && item.username.toLowerCase().includes(search.toLowerCase()))
  );

  const passwords = filteredItems.filter(i => i.type === 'password');
  const apiKeys = filteredItems.filter(i => i.type === 'apikey');

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 pb-20">
      
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-gray-900 text-white p-1.5 rounded-md">
                <Shield size={18} />
              </div>
              <span className="font-semibold text-lg tracking-tight">AymnSecureVault</span>
            </div>

            <div className="flex items-center gap-4">
               <div className="hidden md:flex items-center bg-gray-100 px-3 py-1.5 rounded-md border border-gray-200">
                  <Search size={14} className="text-gray-400 mr-2" />
                  <input 
                    placeholder="Search vault..." 
                    className="bg-transparent border-none outline-none text-sm w-48"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
               </div>
               <button onClick={logout} className="text-sm font-medium text-gray-500 hover:text-red-600 transition-colors">
                  Log Out
               </button>
            </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pt-8">
        
        {/* ACTION BAR */}
        {!isAdding && (
          <div className="flex gap-3 mb-10">
             <button onClick={() => startAdd('password')} className="flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-black text-white text-sm font-medium rounded-lg shadow-sm transition-all hover:-translate-y-0.5">
                <Plus size={16} /> Add Password
             </button>
             <button onClick={() => startAdd('apikey')} className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg shadow-sm transition-all hover:-translate-y-0.5">
                <Key size={16} /> Add API Key
             </button>
          </div>
        )}

        {/* --- ADD/EDIT FORM --- */}
        {isAdding && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-6 mb-10 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                       {addType === 'password' ? <Lock size={18} className="text-gray-400"/> : <Key size={18} className="text-gray-400"/>}
                       {editingId ? 'Edit Item' : `New ${addType === 'password' ? 'Password' : 'API Key'}`}
                    </h2>
                    <button onClick={closeForm} className="text-gray-400 hover:text-gray-700"><X size={20}/></button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</label>
                      <input placeholder="e.g. Google Workspace" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">URL</label>
                      <div className="relative">
                         <Globe size={16} className="absolute left-3 top-3 text-gray-400" />
                         <input placeholder="https://..." className="w-full pl-9 p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all" value={form.url} onChange={e => setForm({...form, url: e.target.value})} />
                      </div>
                    </div>
                    
                    {addType === 'password' && (
                       <div className="md:col-span-2 space-y-1">
                         <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Username</label>
                         <div className="relative">
                            <User size={16} className="absolute left-3 top-3 text-gray-400" />
                            <input placeholder="user@company.com" className="w-full pl-9 p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all" value={form.username} onChange={e => setForm({...form, username: e.target.value})} />
                         </div>
                       </div>
                    )}
                    
                    <div className="md:col-span-2 space-y-1">
                         <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{addType === 'password' ? 'Password' : 'API Secret'}</label>
                         <div className="flex gap-2">
                            <div className="relative flex-1">
                               <input 
                                 type={showSecret ? "text" : "password"}
                                 className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all" 
                                 value={form.password} 
                                 onChange={e => setForm({...form, password: e.target.value})} 
                               />
                               <button onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                                 {showSecret ? <EyeOff size={16}/> : <Eye size={16}/>}
                               </button>
                            </div>
                            <button onClick={() => setForm({...form, password: generatePassword()})} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg uppercase tracking-wide border border-gray-200">
                               Generate
                            </button>
                         </div>
                    </div>

                    <div className="md:col-span-2 space-y-1">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
                      <textarea placeholder="Additional details..." rows={3} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all resize-none" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
                    </div>
                </div>
                
                <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
                    <button onClick={closeForm} className="px-5 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">Cancel</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-gray-900 hover:bg-black text-white text-sm font-medium rounded-lg shadow-sm flex items-center gap-2">
                        <Save size={16}/> Save Item
                    </button>
                </div>
            </div>
        )}

        {/* --- SECTION: PASSWORDS --- */}
        {passwords.length > 0 && (
          <div className="mb-12">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
               Passwords <Badge color="bg-gray-100 text-gray-600">{passwords.length}</Badge>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {passwords.map((item) => (
                  <VaultCard key={item.id} item={item} onEdit={() => startEdit(item)} onDelete={() => handleDelete(item.id)} />
              ))}
            </div>
          </div>
        )}

        {/* --- SECTION: API KEYS --- */}
        {apiKeys.length > 0 && (
          <div className="mb-12">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
               API Keys <Badge color="bg-blue-50 text-blue-600">{apiKeys.length}</Badge>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {apiKeys.map((item) => (
                  <VaultCard key={item.id} item={item} onEdit={() => startEdit(item)} onDelete={() => handleDelete(item.id)} isApi={true} />
              ))}
            </div>
          </div>
        )}

        {items.length === 0 && !isAdding && (
           <div className="text-center py-24 bg-white rounded-xl border border-dashed border-gray-300">
             <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="text-gray-400" size={32} />
             </div>
             <h3 className="text-lg font-semibold text-gray-900">Vault is empty</h3>
             <p className="text-gray-500 text-sm mt-1 max-w-xs mx-auto">Store your passwords and API keys securely with zero-knowledge encryption.</p>
           </div>
        )}

      </main>
    </div>
  );
}

// --- SUB-COMPONENT: CARD ---
function VaultCard({ item, onEdit, onDelete, isApi = false }: { item: any, onEdit: () => void, onDelete: () => void, isApi?: boolean }) {
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
    };

    return (
        <div className="group bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-300 hover:shadow-md transition-all duration-200 flex flex-col h-full">
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${isApi ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                        {isApi ? <CodeIcon size={16} /> : <Lock size={16} />}
                    </div>
                    <div className="truncate">
                        <h4 className="font-semibold text-gray-900 truncate text-sm">{item.name}</h4>
                        {item.username && <p className="text-xs text-gray-500 truncate">{item.username}</p>}
                    </div>
                </div>
                
                {/* ACTIONS */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.url && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Open Link">
                            <ExternalLink size={14} />
                        </a>
                    )}
                    <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded" title="Edit">
                        <Edit3 size={14} />
                    </button>
                    <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            <div className="mt-auto pt-3">
                <div className="bg-gray-50 border border-gray-100 rounded flex items-center justify-between p-2 group-hover:border-gray-200 transition-colors">
                    <div className="flex gap-1">
                       <span className="text-[10px] font-mono text-gray-400">●●●●●●●●●●</span>
                    </div>
                    <button onClick={() => copyToClipboard(item.secret)} className="text-gray-400 hover:text-gray-900 transition-colors">
                        <Copy size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}

const CodeIcon = ({size}: {size: number}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
);