'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { encryptData, decryptData, generatePassword } from '@/lib/crypto';
import { useAuth } from '@/context/AuthContext';
import { Copy, Plus, LogOut, Shield } from 'lucide-react';

export default function VaultPage() {
  const { masterKey, user, logout } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [newItem, setNewItem] = useState({ name: '', username: '', password: '' });
  const [isAdding, setIsAdding] = useState(false);

  // Security Check: If no master key (e.g. page refresh), kick back to login
  useEffect(() => {
    if (!user) router.push('/auth');
    if (user && !masterKey) router.push('/auth');
  }, [user, masterKey, router]);

  // Load and Decrypt Vault Items
  useEffect(() => {
    if (!masterKey) return;

    const fetchItems = async () => {
      const { data } = await supabase
        .from('vault_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) {
        const decryptedItems = await Promise.all(
          data.map(async (item) => {
            try {
              const secret = await decryptData(masterKey, item.encrypted_blob, item.iv);
              return { ...item, secret };
            } catch (e) {
              return { ...item, secret: 'Error Decrypting' };
            }
          })
        );
        setItems(decryptedItems);
      }
    };

    fetchItems();
  }, [masterKey]);

  const handleSave = async () => {
    if (!masterKey || !newItem.name || !newItem.password) return;

    const { ciphertext, iv } = await encryptData(masterKey, newItem.password);

    const { error } = await supabase.from('vault_items').insert({
      user_id: user.id,
      name: newItem.name,
      username: newItem.username,
      encrypted_blob: ciphertext,
      iv: iv
    });

    if (!error) {
      setNewItem({ name: '', username: '', password: '' });
      setIsAdding(false);
      // Reload items to show new one
      window.location.reload(); 
    } else {
      alert('Error saving item');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Password copied to clipboard!');
  };

  if (!masterKey) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-8 bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center gap-2">
            <Shield className="text-blue-600 h-8 w-8" />
            <h1 className="text-2xl font-bold text-gray-800">Secure Vault</h1>
          </div>
          <button onClick={logout} className="flex items-center gap-2 text-red-600 hover:text-red-700 font-medium">
            <LogOut size={20} /> Logout
          </button>
        </header>

        {/* Add New Item Button */}
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="mb-6 bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition"
        >
          <Plus size={20} /> Add New Password
        </button>

        {/* Add Item Form */}
        {isAdding && (
          <div className="bg-white p-6 rounded-lg shadow-md mb-8 border border-blue-100">
            <h2 className="text-lg font-bold mb-4">New Credential</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <input 
                placeholder="Website (e.g., Google)" 
                className="border p-2 rounded" 
                value={newItem.name} 
                onChange={e => setNewItem({...newItem, name: e.target.value})} 
              />
              <input 
                placeholder="Username / Email" 
                className="border p-2 rounded" 
                value={newItem.username} 
                onChange={e => setNewItem({...newItem, username: e.target.value})} 
              />
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Password" 
                  className="border p-2 rounded w-full" 
                  value={newItem.password} 
                  onChange={e => setNewItem({...newItem, password: e.target.value})} 
                />
                <button 
                  onClick={() => setNewItem({...newItem, password: generatePassword()})} 
                  className="bg-gray-200 px-3 rounded text-sm font-semibold hover:bg-gray-300"
                >
                  Gen
                </button>
              </div>
            </div>
            <button onClick={handleSave} className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700">Save</button>
          </div>
        )}

        {/* Password Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-white p-5 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition">
              <h3 className="font-bold text-lg text-gray-800 mb-1">{item.name}</h3>
              <p className="text-gray-500 text-sm mb-4">{item.username}</p>
              
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded border border-gray-100">
                <span className="font-mono text-gray-600 text-sm">••••••••••••</span>
                <button 
                  onClick={() => copyToClipboard(item.secret)} 
                  className="text-blue-500 hover:bg-blue-50 p-2 rounded-full transition"
                  title="Copy Password"
                >
                  <Copy size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}