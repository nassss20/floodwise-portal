import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, RefreshCw, WifiOff, X, CheckCircle2, Share } from 'lucide-react';
import { usePWA } from '../context/PWAContext';

export default function PWAPrompt() {
  const {
    isInstallable,
    isInstalled,
    isIOS,
    installApp,
    isOnline,
    offlineReady,
    setOfflineReady,
    needRefresh,
    setNeedRefresh,
    updateServiceWorker,
  } = usePWA();

  const [dismissedInstallBanner, setDismissedInstallBanner] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    // Check if user previously dismissed the install banner in the last 3 days
    const dismissedTime = localStorage.getItem('floodwise_pwa_dismissed');
    if (dismissedTime) {
      const daysPassed = (Date.now() - parseInt(dismissedTime, 10)) / (1000 * 60 * 60 * 24);
      if (daysPassed < 3) {
        setDismissedInstallBanner(true);
      }
    }
  }, []);

  const handleDismissInstall = () => {
    setDismissedInstallBanner(true);
    localStorage.setItem('floodwise_pwa_dismissed', Date.now().toString());
  };

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }
    await installApp();
  };

  return (
    <>
      {/* Offline Status Pill / Banner */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-amber-500/95 dark:bg-amber-600/95 text-white px-4 py-2 rounded-full shadow-lg backdrop-blur-md flex items-center gap-2 text-sm font-medium border border-amber-400"
          >
            <WifiOff className="w-4 h-4 animate-pulse" />
            <span>Offline Mode &mdash; Showing cached telemetry</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline Ready Notification */}
      <AnimatePresence>
        {offlineReady && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-5 right-5 z-50 max-w-sm bg-white dark:bg-zinc-900 border border-green-200 dark:border-green-800/40 rounded-2xl p-4 shadow-xl flex items-start gap-3"
          >
            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-gray-900 dark:text-white">FloodWise Ready Offline</p>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                The portal shell and core assets have been cached for offline availability.
              </p>
            </div>
            <button
              onClick={() => setOfflineReady(false)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Version Ready / Reload Prompt */}
      <AnimatePresence>
        {needRefresh && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-5 right-5 z-50 max-w-sm bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-800/40 rounded-2xl p-4 shadow-2xl flex flex-col gap-3"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-white text-sm">
                  Update Available
                </p>
                <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                  A newer version of FloodWise is ready to load.
                </p>
              </div>
              <button
                onClick={() => setNeedRefresh(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => updateServiceWorker(true)}
                className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md transition-colors"
              >
                Reload &amp; Update
              </button>
              <button
                onClick={() => setNeedRefresh(false)}
                className="py-2 px-3 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-medium transition-colors"
              >
                Later
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Install App Banner */}
      <AnimatePresence>
        {!isInstalled && !dismissedInstallBanner && (isInstallable || isIOS) && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-5 left-5 z-40 max-w-sm bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-gray-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xl flex items-center gap-3.5"
          >
            <img
              src="/floodwise-circle.png"
              alt="FloodWise App"
              className="w-12 h-12 rounded-xl object-contain drop-shadow"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-gray-900 dark:text-white">FloodWise App</span>
                <span className="px-1.5 py-0.2 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-[10px] font-semibold">
                  PWA
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                Fast, offline-ready &amp; native view
              </p>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleInstallClick}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-xl shadow-sm transition-all whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Install
              </button>
              <button
                onClick={handleDismissInstall}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Instructions Modal */}
      <AnimatePresence>
        {showIOSModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative"
            >
              <button
                onClick={() => setShowIOSModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <img src="/floodwise-circle.png" alt="Logo" className="w-10 h-10 rounded-xl" />
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">Install FloodWise on iOS</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Add to your Home Screen</p>
                </div>
              </div>

              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                <div className="flex items-start gap-3 bg-gray-50 dark:bg-zinc-800/60 p-3 rounded-xl">
                  <div className="p-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg shrink-0 mt-0.5">
                    <Share className="w-4 h-4" />
                  </div>
                  <div>
                    <strong className="text-gray-900 dark:text-white">Step 1:</strong> Tap the{' '}
                    <strong>Share</strong> button at the bottom of Safari.
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-gray-50 dark:bg-zinc-800/60 p-3 rounded-xl">
                  <div className="p-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg shrink-0 mt-0.5">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <strong className="text-gray-900 dark:text-white">Step 2:</strong> Scroll down and select{' '}
                    <strong>"Add to Home Screen"</strong>.
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSModal(false)}
                className="w-full mt-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm transition-colors"
              >
                Got It
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
