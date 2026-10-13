import { useEffect } from 'react';
import { Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Droplets, LogOut, LayoutDashboard, Settings as SettingsIcon, ShieldAlert } from "lucide-react";
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { useAuth } from './context/AuthContext';
import { usePWA } from './context/PWAContext';
import { preloadGeoData } from './components/ArcGISLeafletMap';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import ResetPassword from './pages/ResetPassword';
import BackgroundMap from './components/BackgroundMap';
import IdleTimer from './components/IdleTimer';
import PWAPrompt from './components/PWAPrompt';

// Protected Route Component wrapper
const ProtectedRoute = ({ children }) => {
  const { session } = useAuth();
  if (!session) {
    // Redirect to login if not authenticated
    return <Navigate to="/" replace />;
  }
  return children;
};

// Role-based Route wrapper
const RoleRoute = ({ children, requireAdmin }) => {
  const { session, isAdmin, loading } = useAuth();
  
  if (!session) return <Navigate to="/" replace />;
  if (loading) return null; // wait for role to load
  
  if (requireAdmin && !isAdmin) return <Navigate to="/dashboard" replace />;
  
  return children;
};

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, signOut, isAdmin, isBanned } = useAuth();

  useEffect(() => {
    preloadGeoData();
  }, []);
  
  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  if (session && isBanned) {
    return (
      <IdleTimer>
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-red-200 dark:border-red-900/30 overflow-hidden text-center p-8">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Account Suspended</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">
            Your access to FloodWise has been halted by an administrator. Please contact support if you believe this is a mistake.
          </p>
          <button 
            onClick={handleLogout} 
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-900 dark:text-white font-medium rounded-xl transition-colors"
          >
            <LogOut className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            Log Out
          </button>
        </div>
      </div>
      </IdleTimer>
    );
  }

  return (
    <IdleTimer>
    <div className="min-h-screen text-gray-900 dark:text-gray-100 flex flex-col font-sans transition-colors duration-200 relative bg-transparent">
      
      <BackgroundMap />

      {/* Navigation Bar */}
      {session && (
        <nav className="border-b border-gray-200/60 dark:border-zinc-800/60 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md px-3 sm:px-6 py-2.5 sm:py-3 shadow-xs flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center">
              <img src="/floodwise-circle.png" alt="FloodWise Logo" className="w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow" />
            </div>
            <p className="font-display font-bold text-lg sm:text-xl tracking-tight hidden sm:block">Flood<span className="text-blue-600 dark:text-blue-400">Wise</span></p>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-4 overflow-x-auto no-scrollbar">
            <Link 
              to="/dashboard" 
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-all whitespace-nowrap ${location.pathname === '/dashboard' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold shadow-xs' : 'hover:bg-gray-100/60 dark:hover:bg-zinc-800/60 text-gray-600 dark:text-gray-400'}`}
            >
              <LayoutDashboard size={17} />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            {isAdmin && (
              <Link 
                to="/admin" 
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-all whitespace-nowrap ${location.pathname === '/admin' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold shadow-xs' : 'hover:bg-gray-100/60 dark:hover:bg-zinc-800/60 text-gray-600 dark:text-gray-400'}`}
              >
                <ShieldAlert size={17} />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            )}
          </div>
          
          <div className="flex items-center gap-1.5 sm:gap-3">
            <ThemeSwitcher />
            <Link 
              to="/settings" 
              className={`flex items-center justify-center p-2 rounded-lg transition-all ${location.pathname === '/settings' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shadow-xs' : 'hover:bg-gray-100/60 dark:hover:bg-zinc-800/60 text-gray-600 dark:text-gray-400'}`}
              title="Settings"
            >
              <SettingsIcon size={18} />
            </Link>
            <button 
              onClick={handleLogout} 
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg transition-all font-medium text-xs sm:text-sm shadow-xs"
              title="Log Out"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Log Out</span>
            </button>
          </div>
        </nav>
      )}

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto p-3 sm:p-6 lg:p-8">
        <Routes>
          {/* If already logged in, redirect away from login page */}
          <Route path="/" element={session ? <Navigate to="/dashboard" replace /> : <Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin" 
            element={
              <RoleRoute requireAdmin>
                <Admin />
              </RoleRoute>
            } 
          />
          <Route 
            path="/settings" 
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </main>

      {/* Global PWA update toast, offline banner, and install prompt */}
      <PWAPrompt />
    </div>
    </IdleTimer>
  );
}

export default App;
