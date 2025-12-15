'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { encryptData, decryptData, generatePassword } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';
import { Copy, Plus, LogOut, Shield, Search, Key, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function VaultPage() {
  const { masterKey, user, logout } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [filteredItems, setFilteredItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [newItem, setNewItem] = useState({ name: '', username: '', password: '' });
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (!user) router.push('/auth');
    if (user && !masterKey) router.push('/auth');
  }, [user, masterKey]);

  useEffect(() => {
    if (!masterKey) return;
    const fetchItems = async () => {
      const { data } = await supabase.from('vault_items').select('*').order('created_at', { ascending: false });
      if (data) {
        const decrypted = await Promise.all(data.map(async (item) => {
          try {
            const secret = await decryptData(masterKey, item.encrypted_blob, item.iv);
            return { ...item, secret };
          } catch { return { ...item, secret: 'Error' }; }
        }));
        setItems(decrypted);
        setFilteredItems(decrypted);
      }
    };
    fetchItems();
  }, [masterKey]);

  useEffect(() => {
    setFilteredItems(items.filter(i => i.name.toLowerCase().includes(search.toLowerCase())));
  }, [search, items]);

  const handleSave = async () => {
    if (!newItem.name || !newItem.password) return toast.warning('Please fill details');
    const { ciphertext, iv } = await encryptData(masterKey!, newItem.password);
    
    const { error } = await supabase.from('vault_items').insert({
      user_id: user.id,
      name: newItem.name,
      username: newItem.username,
      encrypted_blob: ciphertext,
      iv: iv
    });

    if (!error) {
      toast.success('Password saved!');
      setNewItem({ name: '', username: '', password: '' });
      setIsAdding(false);
      window.location.reload();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (!masterKey) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2 text-slate-800">
            <Shield className="w-8 h-8 text-blue-600 fill-blue-100" />
            <span className="font-bold text-xl tracking-tight">Fortress</span>
          </div>
          <button onClick={logout} className="text-slate-500 hover:text-red-600 transition flex items-center gap-2 text-sm font-medium">
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6">
        {/* Controls */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-8">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
            <input 
              placeholder="Search vault..." 
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="w-full md:w-auto bg-slate-900 text-white px-5 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-slate-800 transition shadow-lg shadow-slate-200"
          >
            <Plus size={18} /> Add Entry
          </button>
        </div>

        {/* Add Form */}
        {isAdding && (
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 mb-8 animate-in slide-in-from-top-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <input placeholder="Website Name" className="border p-3 rounded-xl text-sm" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
              <input placeholder="Username" className="border p-3 rounded-xl text-sm" value={newItem.username} onChange={e => setNewItem({...newItem, username: e.target.value})} />
              <div className="flex gap-2">
                <input type="text" placeholder="Password" className="border p-3 rounded-xl w-full text-sm font-mono" value={newItem.password} onChange={e => setNewItem({...newItem, password: e.target.value})} />
                <button onClick={() => setNewItem({...newItem, password: generatePassword()})} className="bg-slate-100 hover:bg-slate-200 p-3 rounded-xl transition">
                  <RefreshCw size={18} className="text-slate-600" />
                </button>
              </div>
            </div>
            <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition">Save Entry</button>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredItems.map((item) => (
            <div key={item.id} className="group bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-200 hover:shadow-lg transition-all duration-300">
              <div className="flex items-start justify-between mb-4">
                <div className="bg-slate-100 p-3 rounded-xl">
                  <Key className="w-5 h-5 text-slate-500 group-hover:text-blue-600 transition" />
                </div>
                <button onClick={() => copyToClipboard(item.secret)} className="text-slate-400 hover:text-blue-600 transition">
                  <Copy size={18} />
                </button>
              </div>
              <h3 className="font-bold text-slate-800 text-lg mb-1">{item.name}</h3>
              <p className="text-slate-500 text-sm mb-4 font-mono">{item.username}</p>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-slate-300 w-2/3 group-hover:bg-blue-500 transition-colors" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}