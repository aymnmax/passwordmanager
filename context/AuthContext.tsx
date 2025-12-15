'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface AuthContextType {
  user: any;
  masterKey: CryptoKey | null;
  setMasterKey: (key: CryptoKey) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Check active Supabase session
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) setMasterKey(null); // Clear key on logout
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    setMasterKey(null); // Wipe key from memory
    await supabase.auth.signOut();
    router.push('/auth');
  };

  return (
    <AuthContext.Provider value={{ user, masterKey, setMasterKey, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext)!;