import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';
export type Member = {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  role: string;
  plan_id: string;
  membership_status: string;
  onboarded: boolean;
  profile: Record<string, any>;
  entitlements: Record<string, any>;
};
type AuthState = {
  user: Member | null;
  loading: boolean;
  demo: boolean;
  billing_configured: boolean;
  ai_configured: boolean;
  refresh: () => Promise<void>;
};
const AuthContext = createContext<AuthState>(null!);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<AuthState, 'refresh'>>({
    user: null,
    loading: true,
    demo: false,
    billing_configured: false,
    ai_configured: false,
  });
  const refresh = async () => {
    try {
      const data = await api('/auth/me');
      setState({ ...data, loading: false });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <AuthContext.Provider value={{ ...state, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
