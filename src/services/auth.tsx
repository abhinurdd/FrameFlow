import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { isDemoMode, supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type AuthUser = { id: string; email: string | null; name: string | null };

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  sendEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, code: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const DEMO_KEY = 'ff.demo-user';
export const OTP_LENGTH = 6;

function nameFromEmail(email: string) {
  const local = email.split('@')[0].split(/[._-]/)[0];
  return local ? local[0].toUpperCase() + local.slice(1) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      AsyncStorage.getItem(DEMO_KEY)
        .then((raw) => setUser(raw ? (JSON.parse(raw) as AuthUser) : null))
        .finally(() => setLoading(false));
      return;
    }
    const toUser = (u: { id: string; email?: string; user_metadata?: Record<string, unknown> } | undefined) =>
      u
        ? {
            id: u.id,
            email: u.email ?? null,
            name: (u.user_metadata?.full_name as string | undefined) ?? nameFromEmail(u.email ?? ''),
          }
        : null;
    supabase.auth.getSession().then(({ data }) => {
      setUser(toUser(data.session?.user));
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(toUser(session?.user)));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const demoSignIn = async (u: AuthUser) => {
      await AsyncStorage.setItem(DEMO_KEY, JSON.stringify(u));
      setUser(u);
    };

    return {
      user,
      loading,

      async sendEmailOtp(email) {
        if (!supabase) return; // demo: any 6-digit code works
        // Requires the Supabase "Magic Link" email template to include {{ .Token }}.
        const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        if (error) throw error;
      },

      async verifyEmailOtp(email, code) {
        if (!supabase) {
          if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)) throw new Error('Enter the 6-digit code');
          return demoSignIn({ id: `demo-${email}`, email, name: nameFromEmail(email) });
        }
        const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
        if (error) throw error;
      },

      async signInWithGoogle() {
        if (!supabase) {
          return demoSignIn({ id: 'demo-google', email: 'creator@gmail.com', name: 'Aarav' });
        }
        const redirectTo = Linking.createURL('auth/callback');
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error) throw error;
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== 'success') return; // user cancelled
        const { queryParams } = Linking.parse(result.url);
        const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
        if (!code) throw new Error('Google sign-in did not return a code');
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
      },

      async signOut() {
        if (!supabase) {
          await AsyncStorage.removeItem(DEMO_KEY);
          setUser(null);
          return;
        }
        await supabase.auth.signOut();
      },
    };
  }, [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export { isDemoMode };
