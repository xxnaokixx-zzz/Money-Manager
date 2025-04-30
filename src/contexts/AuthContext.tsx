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

const isClient = typeof window !== 'undefined';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);

  const clearAuthData = useCallback(() => {
    if (isClient) {
      try {
        localStorage.clear();
      } catch (error) {
        console.error('Error clearing localStorage:', error);
      }
    }
    setUser(null);
    setProfile(null);
  }, []);

  const handleAuthError = useCallback(async () => {
    clearAuthData();
    await supabase.auth.signOut();
    if (pathname !== '/login') {
      router.push('/login');
    }
  }, [clearAuthData, router, pathname]);

  const fetchProfile = useCallback(async () => {
    try {
      console.log('Starting fetchProfile...');
      const { data: authUser, error: authError } = await supabase.auth.getUser();

      if (authError || !authUser?.user?.id) {
        console.error('Auth user fetch error:', authError || 'No user');
        return null;
      }

      const userId = authUser.user.id;
      console.log('Auth user ID:', userId);
      console.log('Auth user data:', authUser);

      const { data, error } = await supabase
        .from('users')
        .select('id, name, avatar_url, email, created_at')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user profile:', error);
        console.error('Error details:', error.message, error.details);
        return null;
      }

      if (!data) {
        console.error('No profile found for user:', userId);
        return null;
      }

      console.log('Successfully fetched profile:', data);
      return data;
    } catch (error) {
      console.error('Error in fetchProfile:', error);
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }
      return null;
    }
  }, []);

  const initializeAuth = useCallback(async () => {
    try {
      console.log('Starting initializeAuth...');
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Session error:', error);
        await handleAuthError();
        return;
      }

      if (!session) {
        console.log('No session found');
        if (pathname !== '/login' && pathname !== '/signup') {
          await handleAuthError();
        }
        return;
      }

      console.log('Session found:', session);
      console.log('Session user:', session.user);
      setUser(session.user);

      const profile = await fetchProfile();
      if (profile) {
        console.log('Profile found:', profile);
        setProfile(profile);
        console.log('Profile state updated:', profile);
      } else {
        console.log('No profile found');
        if (pathname !== '/users/setup') {
          router.push('/users/setup');
        }
      }
    } catch (error) {
      console.error('Error in initializeAuth:', error);
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }
      await handleAuthError();
    } finally {
      setLoading(false);
      setInitialized(true);
      console.log('Auth initialization completed');
    }
  }, [fetchProfile, handleAuthError, pathname, router]);

  useEffect(() => {
    if (!isClient) {
      console.log('Not in client environment, skipping auth initialization');
      return;
    }

    const now = Date.now();
    if (now - lastFetch < 1000) {
      console.log('Skipping auth initialization due to rate limit');
      return;
    }
    setLastFetch(now);

    console.log('Starting auth initialization...');
    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session) => {
      console.log('Auth state changed:', event);
      console.log('New session:', session);

      if (event === 'SIGNED_OUT') {
        console.log('User signed out');
        await handleAuthError();
        return;
      }

      if (session) {
        console.log('New session detected, updating user state');
        setUser(session.user);
        const profile = await fetchProfile();
        if (profile) {
          console.log('Profile found after auth state change:', profile);
          setProfile(profile);
          console.log('Profile state updated after auth change:', profile);
        } else if (pathname !== '/users/setup') {
          console.log('No profile found, redirecting to setup');
          router.push('/users/setup');
        }
      }
    });

    return () => {
      console.log('Cleaning up auth subscription');
      subscription.unsubscribe();
    };
  }, [initializeAuth, lastFetch, handleAuthError, pathname, router, fetchProfile]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, initialized }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
} 