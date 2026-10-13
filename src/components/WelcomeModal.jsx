import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, CheckCircle, AlertCircle, X, Save } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';

export default function WelcomeModal({ isOpen, onClose }) {
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
       setErrorMsg("Please fill in both fields");
       return;
    }
    if (password.length < 6) {
       setErrorMsg("Password must be at least 6 characters");
       return;
    }
    
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .update({ username: username.trim() })
        .eq('user_id', user.id)
        .select();
      
      if (roleError) throw roleError;
      if (!roleData || roleData.length === 0) {
        throw new Error("Failed to update username. You may not have permission (RLS).");
      }

      const { error: passError } = await supabase.auth.updateUser({
        password: password
      });

      if (passError) throw passError;

      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-md relative pointer-events-auto max-h-[90vh] flex flex-col"
            >
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col items-center text-center gap-4 mt-2 overflow-y-auto shrink-0 pr-1 pb-1">
                <div className="w-16 h-16 shrink-0 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8" />
                </div>
                
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Welcome to the Dashboard!</h2>
                  <p className="text-gray-600 dark:text-gray-400 mt-2 text-sm leading-relaxed">
                    It looks like this is your first time logging in. Your account has been automatically assigned the <strong>Viewer</strong> role.
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/50 rounded-xl p-4 w-full text-left flex gap-3 shrink-0">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-blue-900 dark:text-blue-300 text-sm">Need higher access?</h3>
                    <p className="text-blue-800 dark:text-blue-400 text-sm mt-1">
                      If you require Editor or Administrator permissions, please contact the administrator:
                    </p>
                    <a 
                      href="mailto:admin@floodwise.com" 
                      className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-blue-700 dark:text-blue-400 hover:underline"
                    >
                      <Mail className="w-4 h-4" />
                      admin@floodwise.com
                    </a>
                  </div>
                </div>

                <div className="w-full h-px bg-gray-200 dark:bg-zinc-800 my-2"></div>

                <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3 text-left">
                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Setup your profile to help administrators identify you.
                  </p>
                  
                  {errorMsg && (
                    <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50 p-3 rounded-lg flex items-start gap-2">
                       <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                       {errorMsg}
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Set Username</label>
                    <input 
                      type="text" 
                      placeholder="e.g. jkr_ahmad"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Change Password</label>
                    <PasswordInput 
                      placeholder="Minimum 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-white dark:bg-zinc-800"
                    />
                  </div>
                  
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-2.5 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors text-sm"
                    >
                      Skip for now
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !username.trim() || !password}
                      className="flex-[2] py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 text-sm flex justify-center items-center gap-1.5"
                    >
                      {isSubmitting ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save Details
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
