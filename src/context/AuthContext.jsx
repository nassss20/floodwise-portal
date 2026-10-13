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

  const fetchRole = async (userId, userEmail) => {
    if (!userId) {
      setUserRole(null);
      return;
    }

    const normalizedEmail = userEmail ? userEmail.trim().toLowerCase() : null;
    let preassignedRole = null;

    // 1. Check if there is a pre-assigned role for this user's email
    if (normalizedEmail) {
      try {
        const { data: preData, error: preError } = await supabase
          .from('preassigned_roles')
          .select('role')
          .eq('email', normalizedEmail)
          .maybeSingle();

        if (!preError && preData?.role) {
          preassignedRole = preData.role;
          console.log(`Found pre-assigned role for ${normalizedEmail}:`, preassignedRole);
        }
      } catch (err) {
        console.warn("Could not check preassigned_roles:", err);
      }
    }

    // 2. Fetch existing user_role record by user_id
    const { data, error } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
      
    console.log("Role fetch result:", { data, error, userId, preassignedRole });
    
    if (data) {
      let finalRole = data.role;

      // If there was a pre-assigned role that differs, update it
      if (preassignedRole && preassignedRole !== data.role) {
        finalRole = preassignedRole;
        try {
          await supabase
            .from('user_roles')
            .update({ role: preassignedRole })
            .eq('user_id', userId);
        } catch (e) {
          console.error("Failed to update role with pre-assigned role:", e);
        }
      }

      // Also ensure email is saved in user_roles if available and missing/differing
      if (normalizedEmail && data.email !== normalizedEmail) {
        try {
          await supabase
            .from('user_roles')
            .update({ email: normalizedEmail })
            .eq('user_id', userId);
        } catch (_) {
          // Ignore if email column does not exist
        }
      }

      console.log("Setting user role to:", finalRole);
      setUserRole(finalRole);

      // Clean up claimed pre-assigned role
      if (preassignedRole) {
        try {
          await supabase
            .from('preassigned_roles')
            .delete()
            .eq('email', normalizedEmail);
        } catch (_) {}
      }
    } else if (!error || error.code === 'PGRST116') {
      // If no row found, use pre-assigned role if exists, otherwise default to viewer
      const assignedRole = preassignedRole || 'viewer';
      setUserRole(assignedRole);
      setIsFirstTimeLogin(true);
      
      // Try inserting with email
      let inserted = false;
      if (normalizedEmail) {
        try {
          const { error: insErr } = await supabase
            .from('user_roles')
            .insert([{ user_id: userId, role: assignedRole, email: normalizedEmail }]);
          if (!insErr) inserted = true;
        } catch (_) {}
      }

      if (!inserted) {
        await supabase
          .from('user_roles')
          .insert([{ user_id: userId, role: assignedRole }]);
      }

      // Clean up claimed pre-assigned role
      if (preassignedRole) {
        try {
          await supabase
            .from('preassigned_roles')
            .delete()
            .eq('email', normalizedEmail);
        } catch (_) {}
      }
    } else {
      setUserRole(preassignedRole || 'viewer'); // fallback
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRole(session.user.id, session.user.email).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRole(session.user.id, session.user.email);
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
