'use client';

'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import { AuthChangeEvent } from '@supabase/supabase-js';

interface Profile {
  id: string;
  name: string;
  avatar_url?: string;
  email?: string;
  created_at?: string;
}

interface AuthContextType {
  user: any;
  profile: Profile | null;
  loading: boolean;
  initialized: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  initialized: false,
});

const SESSION_CACHE_KEY = 'auth_session';
const PROFILE_CACHE_KEY = 'user_profile';
const CACHE_EXPIRY = 5 * 60 * 1000; // 5分

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);

  const clearAuthData = useCallback(() => {
    localStorage.removeItem(SESSION_CACHE_KEY);
    localStorage.removeItem(PROFILE_CACHE_KEY);
    localStorage.removeItem('session_cache_time');
    localStorage.removeItem('profile_cache_time');
    setUser(null);
    setProfile(null);
  }, []);

  const handleAuthError = useCallback(async () => {
    clearAuthData();
    await supabase.auth.signOut();
    router.push('/login');
  }, [clearAuthData, router]);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, avatar_url, email, created_at')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching user:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in fetchProfile:', error);
      return null;
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      try {
        const now = Date.now();
        if (now - lastFetch < 1000) {
          return;
        }
        setLastFetch(now);

        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Session error:', error);
          if (error.message.includes('Invalid Refresh Token')) {
            await handleAuthError();
            return;
          }
          throw error;
        }

        if (!session) {
          await handleAuthError();
          return;
        }

        setUser(session.user);
        const profile = await fetchProfile(session.user.id);
        if (profile) {
          setProfile(profile);
        } else if (pathname !== '/users/setup') {
          router.push('/users/setup');
        }
        setInitialized(true);
      } catch (error) {
        console.error('Error checking session:', error);
        await handleAuthError();
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session) => {
      console.log('Auth state changed:', event, session);

      if (event === 'SIGNED_OUT') {
        await handleAuthError();
        return;
      }

      if (session) {
        setUser(session.user);
        const profile = await fetchProfile(session.user.id);
        if (profile) {
          setProfile(profile);
        } else if (pathname !== '/users/setup') {
          router.push('/users/setup');
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, lastFetch, handleAuthError, pathname]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, initialized }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
} 