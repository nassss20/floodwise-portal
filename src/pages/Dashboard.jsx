import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Map, AlertTriangle, Filter, Database, Droplets, MapPin, Search, ChevronLeft, ChevronRight, Tent, CheckCircle2, Clock, User, Mail, Navigation, Info, Plus, Package, Settings } from 'lucide-react';
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import DataEntryModal from "../components/DataEntryModal";
import WelcomeModal from "../components/WelcomeModal";
import AIAssistantWidget from "../components/AIAssistantWidget";
import ArcGISLeafletMap from "../components/ArcGISLeafletMap";
import MapDashboardOverlays from "../components/MapDashboardOverlays";
import { fetchPPS, fetchRivers } from "../lib/arcgisClient";
import roadAttributes from '../lib/roadAttributes.json';

const renderSupplies = (suppliesString, colorClass) => {
  if (!suppliesString || suppliesString === '-') return <span className="text-gray-400 italic">None</span>;

  let items = [];
  try {
    items = JSON.parse(suppliesString);
    if (!Array.isArray(items)) throw new Error('Not array');
  } catch {
    items = [suppliesString]; // fallback for legacy plain text data
  }

  if (items.length === 0) return <span className="text-gray-400 italic">None</span>;

  return (
    <ul className="space-y-1">
      {items.map((item, idx) => (
        <li key={idx} className={`flex items-start gap-2 ${colorClass || 'text-gray-900 dark:text-white'}`}>
          <span className="mt-1 text-xs shrink-0">•</span>
          <span className="text-sm">{item}</span>
        </li>
      ))}
    </ul>
  );
};

export default function Dashboard() {
  const dashboardUrl = "https://geouitm.maps.arcgis.com/apps/dashboards/448d73b6469e46b58f3ea80689d3d4ee";
  const { user, userRole, isEditor, isFirstTimeLogin, clearFirstTimeLogin, canViewRoads, canViewRivers, canViewPPS } = useAuth();

  // Tab State
  const [activeTab, setActiveTab] = useState(() => {
    if (userRole === 'editor_jkm') return 'pps';
    if (userRole === 'editor_jps') return 'rivers';
    return 'roads';
  });
  const [hasSetInitialTab, setHasSetInitialTab] = useState(false);

  // Roads State
  const [logs, setLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  // River Logs State
  const [riverLogs, setRiverLogs] = useState([]);
  const [isLoadingRiverLogs, setIsLoadingRiverLogs] = useState(true);

  // Defect Logs State
  const [defectLogs, setDefectLogs] = useState([]);
  const [isLoadingDefectLogs, setIsLoadingDefectLogs] = useState(true);

  // Map Mode State
  const [mapMode, setMapMode] = useState('flood'); // 'flood' or 'defects'

  // PPS State
  const [ppsData, setPpsData] = useState([]);
  const [isLoadingPps, setIsLoadingPps] = useState(true);

  // Rivers State
  const [riversData, setRiversData] = useState([]);
  const [isLoadingRivers, setIsLoadingRivers] = useState(true);
  const [riversSubTab, setRiversSubTab] = useState('live'); // 'live' or 'updates'
  const [refreshRiversTrigger, setRefreshRiversTrigger] = useState(0);

  // Map Selection State
  const [selectedFeature, setSelectedFeature] = useState(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Set default initial tab on load based on agency role
  useEffect(() => {
    if (userRole && !hasSetInitialTab) {
      if (userRole === 'editor_jkm') setActiveTab('pps');
      else if (userRole === 'editor_jps') setActiveTab('rivers');
      setHasSetInitialTab(true);
    }
  }, [userRole, hasSetInitialTab]);

  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  useEffect(() => {
    if (isFirstTimeLogin) {
      setShowWelcomeModal(true);
    }
  }, [isFirstTimeLogin]);

  const handleCloseWelcomeModal = () => {
    setShowWelcomeModal(false);
    clearFirstTimeLogin();
  };

  // Load Road Logs
  useEffect(() => {
    async function fetchLogs() {
      try {
        const { data, error } = await supabase
          .from('submission_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        setLogs(data || []);
      } catch (err) {
        console.error("Error fetching logs:", err);
      } finally {
        setIsLoadingLogs(false);
      }
    }

    fetchLogs();

    const subscription = supabase
      .channel('public:submission_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'submission_logs' }, payload => {
        setLogs(current => [payload.new, ...current].slice(0, 50));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  // Load River Logs
  useEffect(() => {
    async function fetchRiverLogs() {
      try {
        const { data, error } = await supabase
          .from('river_submission_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          // If the table doesn't exist yet, this will error safely
          console.warn("River logs table might not exist yet:", error);
          return;
        }
        setRiverLogs(data || []);
      } catch (err) {
        console.error("Error fetching river logs:", err);
      } finally {
        setIsLoadingRiverLogs(false);
      }
    }

    fetchRiverLogs();

    const subscription = supabase
      .channel('public:river_submission_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'river_submission_logs' }, payload => {
        setRiverLogs(current => [payload.new, ...current].slice(0, 50));
        setRefreshRiversTrigger(prev => prev + 1); // Auto-refresh live telemetry map data
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  // Load Defect Logs
  useEffect(() => {
    async function fetchDefectLogs() {
      try {
        const { data, error } = await supabase
          .from('road_defects_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          console.warn("Road defects logs table might not exist yet:", error);
          return;
        }
        setDefectLogs(data || []);
      } catch (err) {
        console.error("Error fetching defect logs:", err);
      } finally {
        setIsLoadingDefectLogs(false);
      }
    }

    fetchDefectLogs();

    const subscription = supabase
      .channel('public:road_defects_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'road_defects_logs' }, payload => {
        setDefectLogs(current => [payload.new, ...current].slice(0, 50));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  // Load PPS Data
  useEffect(() => {
    async function loadPpsData() {
      try {
        setIsLoadingPps(true);
        // 1. Fetch live PPS from ArcGIS
        const arcgisPps = await fetchPPS();

        // 2. Fetch logistics from Supabase
        const { data: logistics, error } = await supabase
          .from('pps_supplies')
          .select('*');

        if (error) throw error;

        // 3. Merge them
        const merged = arcgisPps.map(pps => {
          const log = logistics?.find(l => l.pps_name === pps.PPS_Name);
          return {
            ...pps,
            supplies_have: log?.supplies_have || '-',
            supplies_need: log?.supplies_need || '-',
            last_updated: log?.updated_at || null,
            last_updated_by: log?.last_updated_by || null,
            last_updated_email: log?.last_updated_email || null
          };
        });

        console.log("Merged PPS Data:", merged);
        setPpsData(merged);
      } catch (err) {
        console.error("Error fetching PPS data:", err);
      } finally {
        setIsLoadingPps(false);
      }
    }

    loadPpsData();

    // Subscribe to PPS logistics updates
    const ppsSub = supabase
      .channel('public:pps_supplies')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pps_supplies' }, () => {
        loadPpsData(); // Reload all when changed
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ppsSub);
    }
  }, []);

  // Load Rivers Data
  useEffect(() => {
    async function loadRiversData() {
      try {
        if (refreshRiversTrigger === 0) setIsLoadingRivers(true);
        const arcgisRivers = await fetchRivers();
        setRiversData(arcgisRivers);
      } catch (err) {
        console.error("Error fetching Rivers data:", err);
      } finally {
        setIsLoadingRivers(false);
      }
    }
    loadRiversData();
  }, [refreshRiversTrigger]);

  // Format date helper
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-MY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  // Filter logs locally (Roads)
  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.road_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' || log.status === statusFilter;
    let matchesDate = true;
    if (dateFilter) {
      const logDate = log.created_at ? log.created_at.substring(0, 10) : '';
      matchesDate = logDate === dateFilter;
    }
    return matchesSearch && matchesStatus && matchesDate;
  });

  // Filter Defect Logs locally
  const filteredDefectLogs = defectLogs.filter(log => {
    const matchesSearch = log.road_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' || log.status === statusFilter;
    let matchesDate = true;
    if (dateFilter) {
      const logDate = log.created_at ? log.created_at.substring(0, 10) : '';
      matchesDate = logDate === dateFilter;
    }
    return matchesSearch && matchesStatus && matchesDate;
  });

  // Filter PPS Data
  const filteredPps = ppsData.filter(pps => {
    const matchesSearch = (pps.PPS_Name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pps.District?.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'All' || pps.Status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Filter Rivers Data
  const filteredRivers = riversData.filter(river => {
    const matchesSearch = (river.River_Name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      river.District?.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'All' || river.Status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Filter River Logs
  const filteredRiverLogs = riverLogs.filter(log => {
    const matchesSearch = log.river_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' || log.status === statusFilter;
    let matchesDate = true;
    if (dateFilter) {
      const logDate = log.created_at ? log.created_at.substring(0, 10) : '';
      matchesDate = logDate === dateFilter;
    }
    return matchesSearch && matchesStatus && matchesDate;
  });

  const totalPages = Math.ceil(
    (activeTab === 'roads' ? filteredLogs.length :
      activeTab === 'road_defects' ? filteredDefectLogs.length :
        activeTab === 'pps' ? filteredPps.length :
          riversSubTab === 'updates' ? filteredRiverLogs.length : filteredRivers.length) / rowsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFilter, activeTab]);

  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + rowsPerPage);
  const paginatedDefectLogs = filteredDefectLogs.slice(startIndex, startIndex + rowsPerPage);
  const paginatedPps = filteredPps.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const paginatedRivers = filteredRivers.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const paginatedRiverLogs = filteredRiverLogs.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full h-full flex flex-col gap-4"
    >
      <div className="flex justify-between items-center mb-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Dashboard Overview</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Flood status and road accessibility in Johor.</p>
        </div>
        <div className="flex items-center bg-gray-100 dark:bg-zinc-800 rounded-lg p-1 border border-gray-200 dark:border-zinc-700 shadow-sm">
          <button
            onClick={() => { setMapMode('flood'); if (activeTab === 'road_defects') setActiveTab('roads'); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${mapMode === 'flood' ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
          >
            <Droplets className="w-4 h-4" />
            Flood Status
          </button>
          <button
            onClick={() => { setMapMode('defects'); if (activeTab === 'roads') setActiveTab('road_defects'); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${mapMode === 'defects' ? 'bg-white dark:bg-zinc-700 text-orange-600 dark:text-orange-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
          >
            <AlertTriangle className="w-4 h-4" />
            Road Defects
          </button>
        </div>
      </div>

      <div className="w-full flex-1 min-h-[65vh] bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-lg overflow-hidden relative">
        <ArcGISLeafletMap 
          roadsLogs={logs} 
          defectLogs={defectLogs}
          riverLogs={riverLogs} 
          ppsData={ppsData}
          selectedFeature={selectedFeature} 
          mapMode={mapMode}
        />
        <MapDashboardOverlays
          roadsLogs={logs}
          defectLogs={defectLogs}
          ppsData={ppsData}
          riversData={riversData}
          onFeatureSelect={setSelectedFeature}
          mapMode={mapMode}
        />

        {/*
        <div className="absolute inset-0 bg-gray-50 dark:bg-zinc-900/50 flex flex-col items-center justify-center -z-10">
          <Map className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3 animate-pulse" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">Loading Map Data...</p>
        </div>
        <iframe
          src={dashboardUrl}
          className="w-full h-full border-none z-10 absolute inset-0"
          title="ArcGIS Dashboard"
          allowFullScreen
        />
        */}
      </div>

      <div className="mt-6">
        <AIAssistantWidget roadsData={logs} riversData={riversData} ppsData={ppsData} />
      </div>

      {/* Audit Logs Section */}
      <div className="w-full mt-6 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden flex flex-col">

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50 pt-2 px-6 gap-6">
          {canViewRoads && (
            <>
              <button
                onClick={() => { setActiveTab('roads'); setMapMode('flood'); setStatusFilter('All'); setCurrentPage(1); }}
                className={`pb-3 pt-3 flex items-center gap-2 font-semibold text-sm border-b-2 transition-colors ${activeTab === 'roads'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
              >
                <Navigation className="w-4 h-4" />
                Road Flood Updates
              </button>
              <button
                onClick={() => { setActiveTab('road_defects'); setMapMode('defects'); setStatusFilter('All'); setCurrentPage(1); }}
                className={`pb-3 pt-3 flex items-center gap-2 font-semibold text-sm border-b-2 transition-colors ${activeTab === 'road_defects'
                  ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
              >
                <AlertTriangle className="w-4 h-4" />
                Road Defects
              </button>
            </>
          )}
          {canViewPPS && (
            <button
              onClick={() => { setActiveTab('pps'); setMapMode('flood'); setStatusFilter('All'); setCurrentPage(1); }}
              className={`pb-3 pt-3 flex items-center gap-2 font-semibold text-sm border-b-2 transition-colors ${activeTab === 'pps'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
            >
              <Tent className="w-4 h-4" />
              PPS Logistics
            </button>
          )}
          {canViewRivers && (
            <button
              onClick={() => { setActiveTab('rivers'); setMapMode('flood'); setStatusFilter('All'); setCurrentPage(1); }}
              className={`pb-3 pt-3 flex items-center gap-2 font-semibold text-sm border-b-2 transition-colors ${activeTab === 'rivers'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
            >
              <Droplets className="w-4 h-4" />
              River Levels
            </button>
          )}
        </div>

        {/* Header Info */}
        <div className="px-6 py-4 flex justify-between items-center border-b border-gray-200 dark:border-zinc-800">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              {activeTab === 'roads' ? (
                <><Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Flood Data Entry History</>
              ) : activeTab === 'road_defects' ? (
                <><AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" /> Road Defects History</>
              ) : activeTab === 'pps' ? (
                <><Package className="w-5 h-5 text-purple-600 dark:text-purple-400" /> Pusat Pemindahan Sementara (PPS)</>
              ) : (
                <><Droplets className="w-5 h-5 text-cyan-600 dark:text-cyan-400" /> River Water Levels</>
              )}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {activeTab === 'roads'
                ? "Recent flood status updates submitted through the portal."
                : activeTab === 'road_defects'
                  ? "Recent road defect logs submitted by JKR."
                  : activeTab === 'pps'
                    ? "Live logistics and supply status for all evacuation centers."
                    : "Live telemetry and status for monitored rivers."
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Live Sync</span>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 flex flex-col sm:flex-row flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder={
                activeTab === 'roads' || activeTab === 'road_defects'
                  ? "Search by road name..."
                  : activeTab === 'pps'
                    ? "Search by PPS name or district..."
                    : "Search by river name or district..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-zinc-700 rounded-lg bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 dark:border-zinc-700 rounded-lg bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Statuses</option>
              {activeTab === 'roads' ? (
                <>
                  <option value="Open">Open</option>
                  <option value="Heavy Vehicles Only">Heavy Vehicles Only</option>
                  <option value="Closed">Closed</option>
                  <option value="Pending Assessment">Pending Assessment</option>
                </>
              ) : activeTab === 'road_defects' ? (
                <>
                  <option value="Ongoing">Ongoing</option>
                  <option value="Completed">Completed</option>
                </>
              ) : activeTab === 'pps' ? (
                <>
                  <option value="Standby">Standby</option>
                  <option value="Active">Active</option>
                  <option value="Closed">Closed</option>
                </>
              ) : (
                <>
                  <option value="Normal">Normal</option>
                  <option value="Alert">Alert</option>
                  <option value="Warning">Warning</option>
                  <option value="Danger">Danger</option>
                </>
              )}
            </select>
          </div>
          {(activeTab === 'roads' || activeTab === 'road_defects') && (
            <div className="w-full sm:w-auto">
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 dark:border-zinc-700 rounded-lg bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          {(searchQuery || statusFilter !== 'All' || dateFilter) && (
            <div className="w-full sm:w-auto flex items-center">
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('All');
                  setDateFilter('');
                }}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          {activeTab === 'roads' ? (
            <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-zinc-800/50 dark:text-gray-300">
                <tr>
                  <th scope="col" className="px-6 py-4 font-semibold">Timestamp</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Road Name</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Official Status</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Depth (m)</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Submitted By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-zinc-800/80">
                {isLoadingLogs ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-8 text-center">Loading...</td>
                  </tr>
                ) : paginatedLogs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500">No entries found</td>
                  </tr>
                ) : (
                  paginatedLogs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        setSelectedFeature({ type: 'road', name: log.road_name, district: log.district, ts: Date.now() });
                        setMapMode('flood');
                      }}
                      className="bg-white dark:bg-zinc-900 hover:bg-blue-50/50 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-gray-300 font-medium">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
                          <Navigation className="w-4 h-4 text-cyan-500" />
                          {log.road_name}
                        </div>
                        {(() => {
                          const roadAttr = roadAttributes[log.road_name?.toUpperCase()] || {};
                          const typeStr = log.type_of_road || roadAttr.type_of_road || 'Unknown';
                          const routeStr = log.route_no || roadAttr.route_no ? ` (${log.route_no || roadAttr.route_no})` : '';
                          return (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 pl-6 font-medium">
                              {typeStr}{routeStr}
                            </div>
                          );
                        })()}
                        {log.district && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 pl-6">
                            District: {log.district}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${log.status === 'Open' ? 'bg-green-50 text-green-700 border-green-200' :
                          log.status === 'Closed' ? 'bg-red-50 text-red-700 border-red-200' :
                            log.status === 'Heavy Vehicles Only' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                              'bg-orange-50 text-orange-700 border-orange-200'
                          }`}>
                          {log.status || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {log.depth !== null ? (
                          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium">
                            <Droplets className="w-4 h-4" />
                            {log.depth}
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-gray-900 dark:text-white font-medium text-sm">
                            <User className="w-4 h-4 text-gray-400" />
                            {log.submitted_by_name}
                          </div>
                          <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                            <Mail className="w-3.5 h-3.5" />
                            {log.submitted_by_email}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : activeTab === 'road_defects' ? (
            <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-zinc-800/50 dark:text-gray-300">
                <tr>
                  <th scope="col" className="px-6 py-4 font-semibold">Timestamp</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Road Name</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Defect Status</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Defect Types</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Defect Causes</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Notes</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Submitted By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-zinc-800/80">
                {isLoadingDefectLogs ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-8 text-center">Loading defects...</td>
                  </tr>
                ) : paginatedDefectLogs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500">No defect entries found</td>
                  </tr>
                ) : (
                  paginatedDefectLogs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        setSelectedFeature({ type: 'road', name: log.road_name, district: log.district, ts: Date.now() });
                        setMapMode('defects');
                      }}
                      className="bg-white dark:bg-zinc-900 hover:bg-orange-50/50 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-gray-300 font-medium">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
                          <Navigation className="w-4 h-4 text-cyan-500" />
                          {log.road_name}
                        </div>
                        {(() => {
                          const roadAttr = roadAttributes[log.road_name?.toUpperCase()] || {};
                          const typeStr = log.type_of_road || roadAttr.type_of_road || 'Unknown';
                          const routeStr = log.route_no || roadAttr.route_no ? ` (${log.route_no || roadAttr.route_no})` : '';
                          return (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 pl-6 font-medium">
                              {typeStr}{routeStr}
                            </div>
                          );
                        })()}
                        {log.district && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 pl-6">
                            District: {log.district}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${log.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' :
                          'bg-orange-50 text-orange-700 border-orange-200'
                          }`}>
                          {log.status || 'Ongoing'}
                        </span>
                      </td>
                      <td className="px-6 py-4 align-top">
                        {log.defect_types && log.defect_types.length > 0 ? (
                          <ul className="list-disc pl-4 text-xs">
                            {log.defect_types.filter(t => t !== 'Others (Lain-lain)').map((t, i) => <li key={i}>{t}</li>)}
                            {log.other_defect_type && <li>{log.other_defect_type}</li>}
                          </ul>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 align-top">
                        {log.defect_causes && log.defect_causes.length > 0 ? (
                          <ul className="list-disc pl-4 text-xs">
                            {log.defect_causes.filter(c => c !== 'Others (Lain-lain)').map((c, i) => <li key={i}>{c}</li>)}
                            {log.other_defect_cause && <li>{log.other_defect_cause}</li>}
                          </ul>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 align-top max-w-[150px]">
                        {log.notes ? (
                          <div className="text-xs italic text-gray-500 truncate whitespace-normal">"{log.notes}"</div>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-gray-900 dark:text-white font-medium text-sm">
                            <User className="w-4 h-4 text-gray-400" />
                            {log.submitted_by_name}
                          </div>
                          <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                            <Mail className="w-3.5 h-3.5" />
                            {log.submitted_by_email}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : activeTab === 'pps' ? (
            <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-zinc-800/50 dark:text-gray-300">
                <tr>
                  <th scope="col" className="px-6 py-4 font-semibold">PPS Name & Location</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Official Status</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Supplies Available</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Supplies Required</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Last Updated</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Updated By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-zinc-800/80">
                {isLoadingPps ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center">Loading PPS...</td>
                  </tr>
                ) : paginatedPps.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-12 text-center text-gray-500">No PPS found</td>
                  </tr>
                ) : (
                  paginatedPps.map((pps, idx) => (
                    <tr
                      key={pps.OBJECTID || idx}
                      onClick={() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        setSelectedFeature({ type: 'pps', name: pps.PPS_Name, ts: Date.now() });
                        setMapMode('flood');
                      }}
                      className="bg-white dark:bg-zinc-900 hover:bg-blue-50/50 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
                          <Tent className="w-4 h-4 text-purple-500" />
                          {pps.PPS_Name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 pl-6">
                          Type: {pps.PPS_Type || 'Unknown'} | District: {pps.District} | Cap: {pps.Capacity || 'Unknown'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${pps.Status === 'Standby' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          pps.Status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' :
                            pps.Status === 'Closed' ? 'bg-red-50 text-red-700 border-red-200' :
                              'bg-gray-50 text-gray-700 border-gray-200'
                          }`}>
                          {pps.Status || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        {renderSupplies(pps.supplies_have)}
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        {renderSupplies(pps.supplies_need, "text-orange-600 dark:text-orange-400")}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-300">
                        {pps.last_updated ? formatDate(pps.last_updated) : <span className="text-gray-400 italic">-</span>}
                      </td>
                      <td className="px-6 py-4">
                        {pps.last_updated_by ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 text-gray-900 dark:text-white font-medium text-sm">
                              <User className="w-4 h-4 text-gray-400" />
                              {pps.last_updated_by}
                            </div>
                            <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                              <Mail className="w-3.5 h-3.5" />
                              {pps.last_updated_email}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <>
              <div className="px-6 py-3 border-b border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/30 flex gap-4">
                <button
                  onClick={() => { setRiversSubTab('live'); setSearchQuery(''); }}
                  className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${riversSubTab === 'live' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
                >
                  Live Telemetry
                </button>
                <button
                  onClick={() => setRiversSubTab('updates')}
                  className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${riversSubTab === 'updates' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
                >
                  Recent Updates
                </button>
              </div>
              {riversSubTab === 'live' ? (
                <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-zinc-800/50 dark:text-gray-300">
                    <tr>
                      <th scope="col" className="px-6 py-4 font-semibold">River Name & Location</th>
                      <th scope="col" className="px-6 py-4 font-semibold">Status</th>
                      <th scope="col" className="px-6 py-4 font-semibold">Water Level (m)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-zinc-800/80">
                    {isLoadingRivers ? (
                      <tr>
                        <td colSpan="3" className="px-6 py-8 text-center">Loading Rivers...</td>
                      </tr>
                    ) : paginatedRivers.length === 0 ? (
                      <tr>
                        <td colSpan="3" className="px-6 py-12 text-center text-gray-500">No rivers found</td>
                      </tr>
                    ) : (
                      paginatedRivers.map((river, idx) => (
                        <tr
                          key={river.OBJECTID || idx}
                          onClick={() => {
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                            setSelectedFeature({ type: 'river', name: river.River_Name, ts: Date.now() });
                            setMapMode('flood');
                          }}
                          className="bg-white dark:bg-zinc-900 hover:bg-blue-50/50 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
                              <Droplets className="w-4 h-4 text-cyan-500" />
                              <button
                                onClick={() => { setRiversSubTab('updates'); setSearchQuery(river.River_Name); }}
                                className="hover:text-blue-600 hover:underline transition-colors text-left"
                                title="View recent updates"
                              >
                                {river.River_Name}
                              </button>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 pl-6">
                              District: {river.District}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${river.Status === 'Normal' ? 'bg-green-50 text-green-700 border-green-200' :
                              river.Status === 'Alert' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                river.Status === 'Warning' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                  river.Status === 'Danger' ? 'bg-red-50 text-red-700 border-red-200' :
                                    'bg-gray-50 text-gray-700 border-gray-200'
                              }`}>
                              {river.Status || 'Unknown'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {river.Water_Level !== null ? (
                              <div className="font-medium text-gray-900 dark:text-gray-300">
                                {river.Water_Level.toFixed(2)}
                              </div>
                            ) : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-zinc-800">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-zinc-800/50 dark:text-gray-300">
                    <tr>
                      <th scope="col" className="px-6 py-4 font-semibold">Timestamp</th>
                      <th scope="col" className="px-6 py-4 font-semibold">River Name</th>
                      <th scope="col" className="px-6 py-4 font-semibold">Status</th>
                      <th scope="col" className="px-6 py-4 font-semibold">Water Level</th>
                      <th scope="col" className="px-6 py-4 font-semibold">Notes</th>
                      <th scope="col" className="px-6 py-4 font-semibold">Submitted By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-zinc-800/80">
                    {isLoadingRiverLogs ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-8 text-center">Loading updates...</td>
                      </tr>
                    ) : paginatedRiverLogs.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-12 text-center text-gray-500">No river updates found</td>
                      </tr>
                    ) : (
                      paginatedRiverLogs.map((log) => (
                        <tr
                          key={log.id}
                          onClick={() => {
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                            setSelectedFeature({ type: 'river', name: log.river_name, ts: Date.now() });
                            setMapMode('flood');
                          }}
                          className="bg-white dark:bg-zinc-900 hover:bg-blue-50/50 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-gray-300 font-medium">
                            {formatDate(log.created_at)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
                              <Droplets className="w-4 h-4 text-cyan-500" />
                              {log.river_name}
                            </div>
                            {log.district && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 pl-6">
                                District: {log.district}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${log.status === 'Normal' ? 'bg-green-50 text-green-700 border-green-200' :
                              log.status === 'Alert' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                log.status === 'Warning' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                  log.status === 'Danger' ? 'bg-red-50 text-red-700 border-red-200' :
                                    'bg-gray-50 text-gray-700 border-gray-200'
                              }`}>
                              {log.status || 'Unknown'}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-300">
                            {log.water_level !== null ? log.water_level : '-'}
                          </td>
                          <td className="px-6 py-4 max-w-xs truncate" title={log.notes}>
                            {log.notes || '-'}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5 text-gray-900 dark:text-white font-medium text-sm">
                                <User className="w-4 h-4 text-gray-400" />
                                {log.submitted_by_name}
                              </div>
                              <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                                <Mail className="w-3.5 h-3.5" />
                                {log.submitted_by_email}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50 flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Showing <span className="font-semibold text-gray-900 dark:text-white">{(currentPage - 1) * rowsPerPage + 1}</span> to <span className="font-semibold text-gray-900 dark:text-white">{Math.min(currentPage * rowsPerPage, activeTab === 'roads' ? filteredLogs.length : activeTab === 'pps' ? filteredPps.length : riversSubTab === 'updates' ? filteredRiverLogs.length : filteredRivers.length)}</span> entries
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-sm font-medium rounded-md border bg-white dark:bg-zinc-800 transition-colors"
              >
                Previous
              </button>
              <div className="px-2 text-sm text-gray-600">Page {currentPage} of {totalPages}</div>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-sm font-medium rounded-md border bg-white dark:bg-zinc-800 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {isEditor && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsModalOpen(true)}
          className="fixed bottom-8 right-8 z-40 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg shadow-blue-900/20 flex items-center gap-2 group transition-colors"
        >
          <Settings className="w-6 h-6" />
          <span className="font-semibold pr-2 max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 ease-in-out whitespace-nowrap">
            Update Map Data
          </span>
        </motion.button>
      )}

      <DataEntryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <WelcomeModal
        isOpen={showWelcomeModal}
        onClose={handleCloseWelcomeModal}
      />
    </motion.div>
  );
}
