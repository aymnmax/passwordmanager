'use client';
import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface AuthContextType {
  user: any;
  masterKey: CryptoKey | null;
  setMasterKey: (key: CryptoKey | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const router = useRouter();
  const idleTimer = useRef<NodeJS.Timeout | null>(null);

  // 1. Load Session & Restore Key on Refresh
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        restoreKey();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) {
        sessionStorage.removeItem('secure_vault_key'); // Clear on Supabase logout
        setMasterKey(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Auto-Logout Timer (10 Minutes)
  useEffect(() => {
    const resetTimer = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        alert("Session timed out for security.");
        logout();
      }, 10 * 60 * 1000); // 10 Minutes
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);

    resetTimer(); // Start immediately

    return () => {
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
    };
  }, []);

  // Helper: Save Key to Session Storage (Export as JWK)
  const saveKey = async (key: CryptoKey | null) => {
    if (!key) {
      sessionStorage.removeItem('secure_vault_key');
      setMasterKey(null);
      return;
    }
    const exported = await window.crypto.subtle.exportKey('jwk', key);
    sessionStorage.setItem('secure_vault_key', JSON.stringify(exported));
    setMasterKey(key);
  };

  // Helper: Restore Key from Session Storage
  const restoreKey = async () => {
    const stored = sessionStorage.getItem('secure_vault_key');
    if (stored) {
      try {
        const jwk = JSON.parse(stored);
        const key = await window.crypto.subtle.importKey(
          'jwk',
          jwk,
          { name: 'AES-GCM' },
          true,
          ['encrypt', 'decrypt']
        );
        setMasterKey(key);
      } catch (e) {
        console.error("Failed to restore key", e);
      }
    }
  };

  // THE FIX: Secure Logout Function
  const logout = async () => {
    try {
      // 1. Wipe encryption keys and temporary session data from RAM/Session Storage
      sessionStorage.removeItem('secure_vault_key');
      sessionStorage.removeItem('temp_device_token');
      sessionStorage.removeItem('temp_device_name');
      
      setMasterKey(null);
      setUser(null);

      // CRUCIAL: Do NOT use localStorage.clear() here.
      // We must keep localStorage.getItem('vault_device_token') safe so devices stay trusted!

      // 2. Log out of Supabase
      await supabase.auth.signOut();
      
      // 3. Redirect to login
      router.push('/auth');
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, masterKey, setMasterKey: saveKey, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext)!;