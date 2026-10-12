import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings as SettingsIcon, Save, Key, CheckCircle2, AlertCircle, User, Smartphone, Download, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { usePWA } from '../context/PWAContext';
import PasswordInput from '../components/PasswordInput';

export default function Settings() {
  const { user } = useAuth();
  const { isInstallable, isInstalled, isIOS, installApp, isOnline, updateServiceWorker } = usePWA();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [username, setUsername] = useState('');
  const [currentUsername, setCurrentUsername] = useState(null);
  const [isSubmittingUsername, setIsSubmittingUsername] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState(null);
  const [usernameErrorMsg, setUsernameErrorMsg] = useState('');

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateMsg('');
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          setUpdateMsg('Checked! You are running the latest version.');
        } else {
          setUpdateMsg('Service Worker is active.');
        }
      } else {
        setUpdateMsg('Service workers are not supported by this browser.');
      }
    } catch (err) {
      setUpdateMsg('Unable to check for updates at this time.');
    } finally {
      setTimeout(() => setCheckingUpdate(false), 800);
    }
  };

  useEffect(() => {
    if (!user) return;
    const fetchUsername = async () => {
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('username')
          .eq('user_id', user.id)
          .single();
        if (data && data.username) {
          setCurrentUsername(data.username);
        }
      } catch (err) {
        console.error("Failed to fetch username:", err);
      }
    };
    fetchUsername();
  }, [user]);

  const handleUpdateUsername = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;

    setIsSubmittingUsername(true);
    setUsernameStatus(null);

    try {
      const { data, error } = await supabase
        .from('user_roles')
        .update({ username: username.trim() })
        .eq('user_id', user.id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Failed to update username. You may not have permission (RLS).");
      }
      
      setUsernameStatus('success');
      setCurrentUsername(username.trim());
      setUsername('');
      setTimeout(() => setUsernameStatus(null), 3000);
    } catch (error) {
      console.error(error);
      setUsernameStatus('error');
      setUsernameErrorMsg(error.message);
    } finally {
      setIsSubmittingUsername(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setStatus('error');
      setErrorMsg("Passwords do not match");
      return;
    }
    
    if (newPassword.length < 6) {
      setStatus('error');
      setErrorMsg("Password must be at least 6 characters");
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;
      
      setStatus('success');
      setNewPassword('');
      setConfirmPassword('');
      
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      console.error(error);
      setStatus('error');
      setErrorMsg(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto pb-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
          <SettingsIcon className="text-blue-600 dark:text-blue-400" />
          Account Settings
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your account security.</p>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-gray-400" />
            Change Password
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Update the password for {user?.email}</p>
        </div>
        
        <form onSubmit={handleUpdatePassword} className="p-6 flex flex-col gap-5">
          <AnimatePresence>
            {status === 'success' && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/50 flex items-start gap-3"
              >
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-green-800 dark:text-green-300">Password Updated!</h3>
                  <p className="text-sm text-green-600 dark:text-green-400 mt-1">Your password has been successfully changed.</p>
                </div>
              </motion.div>
            )}
            
            {status === 'error' && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">Update Failed</h3>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">{errorMsg}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">New Password</label>
              <PasswordInput 
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-white dark:bg-zinc-800"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Confirm New Password</label>
              <PasswordInput 
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-white dark:bg-zinc-800"
              />
            </div>
          </div>
          
          <div className="pt-2 flex justify-end">
            <button 
              type="submit" 
              disabled={isSubmitting || !newPassword || !confirmPassword}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <Save className="w-5 h-5" />
              )}
              Update Password
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden mt-8">
        <div className="p-6 border-b border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <User className="w-5 h-5 text-gray-400" />
            Profile Details
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Update your display username for logs.</p>
        </div>
        
        <form onSubmit={handleUpdateUsername} className="p-6 flex flex-col gap-5">
          <AnimatePresence>
            {usernameStatus === 'success' && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/50 flex items-start gap-3"
              >
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-green-800 dark:text-green-300">Username Updated!</h3>
                  <p className="text-sm text-green-600 dark:text-green-400 mt-1">Your username has been successfully changed.</p>
                </div>
              </motion.div>
            )}
            
            {usernameStatus === 'error' && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">Update Failed</h3>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">{usernameErrorMsg}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                Setup your profile to help administrators identify you.
              </p>
              
              {currentUsername && (
                <div className="text-sm bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700 rounded-lg p-3 my-2">
                  <span className="text-gray-500 dark:text-gray-400">Current Username:</span>{' '}
                  <strong className="text-gray-900 dark:text-white font-semibold">{currentUsername}</strong>
                </div>
              )}
              
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">New Username</label>
              <input 
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your new username..."
                className="block w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div className="pt-2 flex justify-end">
            <button 
              type="submit" 
              disabled={isSubmittingUsername || !username.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              {isSubmittingUsername ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <Save className="w-5 h-5" />
              )}
              Update Username
            </button>
          </div>
        </form>
      </div>

      {/* PWA & Mobile App Section */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden mt-8">
        <div className="p-6 border-b border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-blue-500" />
              Progressive Web App (PWA)
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Mobile installation, offline shell capabilities, and version management.
            </p>
          </div>
          <span className={`px-2.5 py-1 text-xs font-semibold rounded-full flex items-center gap-1.5 ${isInstalled ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'}`}>
            <span className={`w-2 h-2 rounded-full ${isInstalled ? 'bg-green-500' : 'bg-blue-500'}`}></span>
            {isInstalled ? 'Installed App' : 'Browser Mode'}
          </span>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Install Status Card */}
            <div className="p-4 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/40 flex flex-col justify-between">
              <div>
                <p className="text-xs uppercase font-semibold tracking-wider text-gray-500 dark:text-gray-400">
                  Installation
                </p>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mt-1">
                  {isInstalled ? 'Native App Active' : isInstallable ? 'Ready to Install' : isIOS ? 'Available via Safari' : 'Running in Web Browser'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {isInstalled 
                    ? 'FloodWise is installed directly on your device home screen / desktop.' 
                    : 'Install FloodWise for instantaneous launch, full-screen view, and offline capabilities.'}
                </p>
              </div>

              {!isInstalled && (
                <div className="mt-4 pt-3 border-t border-gray-200 dark:border-zinc-700/60">
                  {isInstallable ? (
                    <button
                      onClick={installApp}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
                    >
                      <Download className="w-4 h-4" />
                      Install FloodWise Now
                    </button>
                  ) : isIOS ? (
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                      On iOS: Tap Safari Share &gt; "Add to Home Screen"
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">
                      Already installed or use your browser's "Install App" button in the URL bar.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Offline & Cache Status Card */}
            <div className="p-4 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/40 flex flex-col justify-between">
              <div>
                <p className="text-xs uppercase font-semibold tracking-wider text-gray-500 dark:text-gray-400">
                  Network &amp; Offline Cache
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {isOnline ? (
                    <>
                      <Wifi className="w-4 h-4 text-green-500" />
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white">Online &amp; Connected</h3>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-4 h-4 text-amber-500" />
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white">Offline Mode</h3>
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Assets, maps, and fonts are cached via Workbox service worker for resilience during bad weather.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-200 dark:border-zinc-700/60 flex items-center justify-between gap-3">
                <button
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-medium transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                  Check for Updates
                </button>
                {updateMsg && (
                  <span className="text-[11px] text-green-600 dark:text-green-400 font-medium truncate">
                    {updateMsg}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}