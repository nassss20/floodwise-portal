import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, WifiOff, X, CheckCircle2 } from 'lucide-react';
import { usePWA } from '../context/PWAContext';

export default function PWAPrompt() {
  const {
    isOnline,
    offlineReady,
    setOfflineReady,
    needRefresh,
    setNeedRefresh,
    updateServiceWorker,
  } = usePWA();

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
    </>
  );
}
