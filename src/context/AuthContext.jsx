import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFirstTimeLogin, setIsFirstTimeLogin] = useState(false);

  const fetchRole = async (userId) => {
    if (!userId) {
      setUserRole(null);
      return;
    }
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();
      
    console.log("Role fetch result:", { data, error, userId });
    
    if (data) {
      console.log("Setting user role to:", data.role);
      setUserRole(data.role);
    } else if (!error || error.code === 'PGRST116') {
      // If no row found (PGRST116), default to viewer and create a record
      setUserRole('viewer');
      setIsFirstTimeLogin(true);
      // Create default viewer role for new users
      await supabase.from('user_roles').insert([{ user_id: userId, role: 'viewer' }]);
    } else {
      setUserRole('viewer'); // fallback
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRole(session.user.id).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRole(session.user.id);
      } else {
        setUserRole(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = {
    session,
    user,
    userRole,
    isAdmin: userRole === 'admin',
    isEditor: ['editor', 'editor_jkr', 'editor_jkm', 'editor_jps', 'admin'].includes(userRole),
    canEditRoads: ['editor', 'editor_jkr', 'admin'].includes(userRole),
    canEditRivers: ['editor', 'editor_jps', 'admin'].includes(userRole),
    canEditPPS: ['editor', 'editor_jkm', 'admin'].includes(userRole),
    canViewRoads: ['viewer', 'editor', 'editor_jkr', 'editor_jkm', 'editor_jps', 'admin'].includes(userRole),
    canViewRivers: ['viewer', 'editor', 'editor_jkr', 'editor_jkm', 'editor_jps', 'admin'].includes(userRole),
    canViewPPS: ['viewer', 'editor', 'editor_jkr', 'editor_jkm', 'editor_jps', 'admin'].includes(userRole),
    isBanned: userRole === 'banned',
    isFirstTimeLogin,
    clearFirstTimeLogin: () => setIsFirstTimeLogin(false),
    signOut: () => supabase.auth.signOut(),
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
