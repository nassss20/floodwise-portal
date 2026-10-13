import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Trash2, Users, AlertTriangle, CheckCircle2, AlertCircle, User, Mail, UserPlus, Search, Copy, Check, Clock, X, Code2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { fetchRoads, fetchRivers, fetchPPS, updateFeatureStatus, updateRiverFeature } from '../lib/arcgisClient';

export default function Admin() {
  const [logs, setLogs] = useState([]);
  const [roles, setRoles] = useState([]);
  const [preassignedRoles, setPreassignedRoles] = useState([]);
  const [isPreassignedTableMissing, setIsPreassignedTableMissing] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('All');
  
  // Add User modal state
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [addEmailsText, setAddEmailsText] = useState('');
  const [addSelectedRole, setAddSelectedRole] = useState('editor_jkr');
  const [isAddingUsers, setIsAddingUsers] = useState(false);
  const [addUserError, setAddUserError] = useState('');

  // SQL Schema modal state
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Tabs for Logs
  const [activeLogTab, setActiveLogTab] = useState('roads'); // 'roads', 'rivers', 'pps', 'defects'
  
  const [riverLogs, setRiverLogs] = useState([]);
  const [ppsLogs, setPpsLogs] = useState([]);
  const [defectLogs, setDefectLogs] = useState([]);
  const [rivers, setRivers] = useState([]);
  const [ppsFeatures, setPpsFeatures] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  
  // Custom delete modal state
  const [logToDelete, setLogToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Filter state for logs
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  
  // Pagination state for logs
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  
  // We need to fetch roads to map road_name to OBJECTID when undoing
  const [roads, setRoads] = useState([]);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        // Fetch logs
        const { data: logsData, error: logsError } = await supabase
          .from('submission_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        
        if (logsError) throw logsError;
        setLogs(logsData || []);

        const { data: riverData, error: riverError } = await supabase
          .from('river_submission_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        
        if (riverError) throw riverError;
        setRiverLogs(riverData || []);

        const { data: ppsData, error: ppsError } = await supabase
          .from('pps_supplies')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(100);
        
        if (ppsError) throw ppsError;
        setPpsLogs(ppsData || []);

        const { data: defectData, error: defectError } = await supabase
          .from('road_defects_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
          
        if (defectError && defectError.code !== '42P01') {
          console.error(defectError);
        } else {
          setDefectLogs(defectData || []);
        }

        // Fetch user roles
        const { data: rolesData, error: rolesError } = await supabase
          .from('user_roles')
          .select('*')
          .order('created_at', { ascending: false });
          
        if (rolesError) throw rolesError;
        setRoles(rolesData || []);

        // Fetch pre-assigned roles
        try {
          const { data: preData, error: preError } = await supabase
            .from('preassigned_roles')
            .select('*')
            .order('created_at', { ascending: false });
            
          if (preError) {
            if (preError.code === 'PGRST205' || preError.code === '42P01') {
              setIsPreassignedTableMissing(true);
            } else {
              console.warn("Error fetching preassigned_roles:", preError);
            }
          } else {
            setPreassignedRoles(preData || []);
            setIsPreassignedTableMissing(false);
          }
        } catch (err) {
          console.warn("Error querying preassigned_roles:", err);
        }

        // Fetch ArcGIS roads for mapping
        const arcgisRoads = await fetchRoads();
        setRoads(arcgisRoads);
        const arcgisRivers = await fetchRivers();
        setRivers(arcgisRivers);
        const arcgisPps = await fetchPPS();
        setPpsFeatures(arcgisPps);

      } catch (err) {
        console.error("Failed to load admin data:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Filter logs locally
  const getActiveLogs = () => {
    if (activeLogTab === 'roads') return logs;
    if (activeLogTab === 'rivers') return riverLogs;
    if (activeLogTab === 'defects') return defectLogs;
    return ppsLogs;
  };
  
  const filteredLogs = getActiveLogs().filter(log => {
    const searchTarget = activeLogTab === 'roads' ? log.road_name : 
                         activeLogTab === 'rivers' ? log.river_name : 
                         activeLogTab === 'defects' ? log.road_name :
                         log.pps_name;
    const matchesSearch = searchTarget?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const logStatus = activeLogTab === 'pps' 
      ? (ppsFeatures.find(p => p.PPS_Name === log.pps_name)?.Status || 'Unknown') 
      : log.status;
    const matchesStatus = statusFilter === 'All' || logStatus === statusFilter;
    
    let matchesDate = true;
    if (dateFilter) {
      const dateStr = log.created_at || log.updated_at;
      const logDate = dateStr ? dateStr.substring(0, 10) : '';
      matchesDate = logDate === dateFilter;
    }
    
    return matchesSearch && matchesStatus && matchesDate;
  });

  // Pagination logic
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / rowsPerPage));
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFilter]);

  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + rowsPerPage);

  const showStatus = (type, msg) => {
    setStatus(type);
    setStatusMsg(msg);
    setTimeout(() => setStatus(null), 4000);
  };

  const handleUpdateRole = async (userId, newRole) => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('user_id', userId);
        
      if (error) throw error;
      
      setRoles(roles.map(r => r.user_id === userId ? { ...r, role: newRole } : r));
      showStatus('success', 'User role updated successfully');
    } catch (err) {
      console.error(err);
      showStatus('error', err.message);
    }
  };

  const handleUpdatePreassignedRole = async (id, newRole) => {
    try {
      const { error } = await supabase
        .from('preassigned_roles')
        .update({ role: newRole })
        .eq('id', id);
        
      if (error) throw error;
      
      setPreassignedRoles(preassignedRoles.map(r => r.id === id ? { ...r, role: newRole } : r));
      showStatus('success', 'Pre-assigned role updated successfully');
    } catch (err) {
      console.error(err);
      showStatus('error', err.message);
    }
  };

  const handleDeletePreassignedRole = async (id, email) => {
    try {
      const { error } = await supabase
        .from('preassigned_roles')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      
      setPreassignedRoles(preassignedRoles.filter(r => r.id !== id));
      showStatus('success', `Pre-assigned role revoked for ${email}`);
    } catch (err) {
      console.error(err);
      showStatus('error', err.message);
    }
  };

  const parseEmails = (text) => {
    if (!text) return { valid: [], invalid: [] };
    const rawTokens = text
      .split(/[\n,;]+/)
      .map(t => t.trim())
      .filter(Boolean);
      
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid = [];
    const invalid = [];
    const seen = new Set();
    
    for (const token of rawTokens) {
      const lower = token.toLowerCase();
      if (emailRegex.test(lower)) {
        if (!seen.has(lower)) {
          seen.add(lower);
          valid.push(lower);
        }
      } else {
        invalid.push(token);
      }
    }
    return { valid, invalid };
  };

  const handleAddUsersSubmit = async (e) => {
    e.preventDefault();
    setAddUserError('');
    const { valid } = parseEmails(addEmailsText);
    
    if (valid.length === 0) {
      setAddUserError('Please enter at least one valid email address.');
      return;
    }

    setIsAddingUsers(true);
    try {
      for (const email of valid) {
        // 1. Check if user already exists in active roles
        const existingActive = roles.find(r => 
          (r.email && r.email.toLowerCase() === email) || 
          (r.username && r.username.toLowerCase() === email)
        );

        if (existingActive) {
          await supabase
            .from('user_roles')
            .update({ role: addSelectedRole })
            .eq('id', existingActive.id);
        }

        // 2. Upsert into preassigned_roles (for users who haven't logged in yet, or to ensure sync on next login)
        const { error: preErr } = await supabase
          .from('preassigned_roles')
          .upsert({ email, role: addSelectedRole }, { onConflict: 'email' });
          
        if (preErr) {
          if (preErr.code === 'PGRST205' || preErr.code === '42P01') {
            setIsPreassignedTableMissing(true);
            throw new Error("Table 'preassigned_roles' does not exist in Supabase yet. Click 'View Setup SQL' to initialize it.");
          }
          throw preErr;
        }
      }

      // Re-fetch roles
      const { data: refetchedRoles } = await supabase
        .from('user_roles')
        .select('*')
        .order('created_at', { ascending: false });
      if (refetchedRoles) setRoles(refetchedRoles);

      const { data: refetchedPre } = await supabase
        .from('preassigned_roles')
        .select('*')
        .order('created_at', { ascending: false });
      if (refetchedPre) setPreassignedRoles(refetchedPre);

      showStatus('success', `Assigned role "${addSelectedRole}" to ${valid.length} user(s).`);
      setAddEmailsText('');
      setIsAddUserModalOpen(false);
    } catch (err) {
      console.error(err);
      setAddUserError(err.message || 'Failed to assign roles');
    } finally {
      setIsAddingUsers(false);
    }
  };

  // Combined list for display
  const combinedUserList = [
    ...roles.map(r => ({
      ...r,
      isPreassigned: false,
      displayEmail: r.email || r.username || '-',
      searchKey: `${r.email || ''} ${r.username || ''} ${r.user_id || ''}`.toLowerCase(),
    })),
    ...preassignedRoles.map(p => ({
      ...p,
      isPreassigned: true,
      displayEmail: p.email,
      searchKey: `${p.email || ''} preassigned pending`.toLowerCase(),
    }))
  ];

  const filteredUserList = combinedUserList.filter(item => {
    const matchesSearch = !userSearchQuery || item.searchKey.includes(userSearchQuery.toLowerCase().trim());
    
    let matchesFilter = true;
    if (userRoleFilter === 'Active') {
      matchesFilter = !item.isPreassigned;
    } else if (userRoleFilter === 'Pending') {
      matchesFilter = item.isPreassigned;
    } else if (userRoleFilter !== 'All') {
      matchesFilter = item.role === userRoleFilter;
    }

    return matchesSearch && matchesFilter;
  });

  const executeDeleteLog = async () => {
    if (!logToDelete) return;
    
    setIsDeleting(true);

    try {
      const log = logToDelete;
      
      if (activeLogTab === 'roads') {
        const targetRoad = roads.find(r => r.Name === log.road_name);

        if (targetRoad && !targetRoad.isDistrictRoad) {
          const { data: previousLogs, error: prevError } = await supabase
            .from('submission_logs')
            .select('*').eq('road_name', log.road_name).neq('id', log.id).order('created_at', { ascending: false }).limit(1);
          if (prevError) throw prevError;

          let attributesToRevert = { DEPTH: null, Status: null, DAMAGE: null };
          if (previousLogs && previousLogs.length > 0) {
            const prev = previousLogs[0];
            attributesToRevert = { DEPTH: prev.depth, Status: prev.status, DAMAGE: prev.damage };
          }
          await updateFeatureStatus(targetRoad.layerId, targetRoad.OBJECTID, attributesToRevert);
        }
        
        const { data: deleted, error: deleteError } = await supabase.from('submission_logs').delete().eq('id', log.id).select();
        if (deleteError) throw deleteError;
        if (!deleted || deleted.length === 0) throw new Error("Delete failed. You may not have Admin permissions.");
        
        setLogs(logs.filter(l => l.id !== log.id));
        showStatus('success', `Log deleted successfully for ${log.road_name}`);
      
      } else if (activeLogTab === 'rivers') {
        const targetRiver = rivers.find(r => r.River_Name === log.river_name);
        if (!targetRiver) throw new Error("Could not find this river in ArcGIS to revert the status.");

        const { data: previousLogs, error: prevError } = await supabase
          .from('river_submission_logs')
          .select('*').eq('river_name', log.river_name).neq('id', log.id).order('created_at', { ascending: false }).limit(1);
        if (prevError) throw prevError;

        let attributesToRevert = { Status: null, Water_Level: null };
        if (previousLogs && previousLogs.length > 0) {
          const prev = previousLogs[0];
          attributesToRevert = { Status: prev.status, Water_Level: prev.water_level };
        }
        await updateRiverFeature(targetRiver.OBJECTID, attributesToRevert);
        
        const { data: deleted, error: deleteError } = await supabase.from('river_submission_logs').delete().eq('id', log.id).select();
        if (deleteError) throw deleteError;
        if (!deleted || deleted.length === 0) throw new Error("Delete failed. You may not have Admin permissions.");
        
        setRiverLogs(riverLogs.filter(l => l.id !== log.id));
        showStatus('success', `Log deleted and ArcGIS map reverted for ${log.river_name}`);
      
      } else if (activeLogTab === 'pps') {
        const { data: deleted, error: deleteError } = await supabase.from('pps_supplies').delete().eq('id', log.id).select();
        if (deleteError) throw deleteError;
        if (!deleted || deleted.length === 0) throw new Error("Delete failed. You may not have Admin permissions.");
        
        setPpsLogs(ppsLogs.filter(l => l.id !== log.id));
        showStatus('success', `Log deleted successfully for ${log.pps_name}`);
      } else if (activeLogTab === 'defects') {
        const { data: deleted, error: deleteError } = await supabase.from('road_defects_logs').delete().eq('id', log.id).select();
        if (deleteError) throw deleteError;
        if (!deleted || deleted.length === 0) throw new Error("Delete failed. You may not have Admin permissions.");
        
        setDefectLogs(defectLogs.filter(l => l.id !== log.id));
        showStatus('success', `Defect log deleted successfully for ${log.road_name}`);
      }

    } catch (err) {
      console.error(err);
      showStatus('error', err.message);
    } finally {
      setIsDeleting(false);
      setLogToDelete(null);
    }
  };


  return (
    <div className="w-full max-w-5xl mx-auto pb-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
          <ShieldAlert className="text-blue-600 dark:text-blue-400" />
          Admin Dashboard
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage user roles and audit logs. Changes here are destructive.</p>
      </div>

      <AnimatePresence>
        {status === 'success' && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/50 flex items-center gap-3"
          >
            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
            <span className="text-sm font-medium text-green-800 dark:text-green-300">{statusMsg}</span>
          </motion.div>
        )}
        
        {status === 'error' && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <span className="text-sm font-medium text-red-800 dark:text-red-300">{statusMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-8">
        
        {/* User Roles Section */}
        <section className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-5 md:p-6 border-b border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                      Role Management
                    </h2>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                      {roles.length} active{preassignedRoles.length > 0 ? ` • ${preassignedRoles.length} pending` : ''}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Assign and regulate portal permissions for department staff
                  </p>
                </div>
              </div>
            </div>

            {/* Actions & Filters */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search Bar */}
              <div className="relative flex-1 sm:w-56">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search user or email..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-7 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                />
                {userSearchQuery && (
                  <button 
                    onClick={() => setUserSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs px-1 cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Filter Dropdown */}
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="All">All Statuses & Roles</option>
                <option value="Active">Active Users Only</option>
                <option value="Pending">Pending Pre-assigned Only</option>
                <option disabled>──────────</option>
                <option value="viewer">Viewer</option>
                <option value="editor_jkr">Editor (JKR)</option>
                <option value="editor_jkm">Editor (JKM)</option>
                <option value="editor_jps">Editor (JPS)</option>
                <option value="editor">Editor (All)</option>
                <option value="admin">Admin</option>
                <option value="banned">Banned</option>
              </select>

              {/* Add User Button */}
              <button
                onClick={() => setIsAddUserModalOpen(true)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add User
              </button>
            </div>
          </div>

          {/* Table Missing Warning (if SQL schema not yet executed) */}
          {isPreassignedTableMissing && (
            <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/40 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Notice: Pre-assigned roles table not yet initialized in Supabase.</span>
              </div>
              <button 
                onClick={() => setIsSqlModalOpen(true)}
                className="underline font-semibold hover:text-amber-900 dark:hover:text-amber-100 flex items-center gap-1 cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5" /> View Setup SQL
              </button>
            </div>
          )}

          {/* Scrollable Container with Sticky Header */}
          <div className="overflow-x-auto max-h-[380px] overflow-y-auto divide-y divide-gray-200 dark:divide-zinc-800 custom-scrollbar relative">
            <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50/95 dark:bg-zinc-800/95 dark:text-gray-300 sticky top-0 z-10 backdrop-blur-xs border-b border-gray-200 dark:border-zinc-700">
                <tr>
                  <th scope="col" className="px-6 py-3 font-semibold">User / Email</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Assigned Role</th>
                  <th scope="col" className="px-6 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-zinc-800/80">
                {isLoading ? (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <span>Loading user roles...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredUserList.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Users className="w-8 h-8 text-gray-400 opacity-60" />
                        <p className="text-sm font-medium">No users found matching your filters</p>
                        {(userSearchQuery || userRoleFilter !== 'All') && (
                          <button
                            onClick={() => { setUserSearchQuery(''); setUserRoleFilter('All'); }}
                            className="text-xs text-blue-600 hover:underline cursor-pointer"
                          >
                            Clear search filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : filteredUserList.map((item) => {
                  if (item.isPreassigned) {
                    // Pending Pre-assigned User
                    return (
                      <tr key={`pre-${item.id}`} className="bg-amber-50/20 dark:bg-amber-950/10 hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition-colors">
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                              <Mail className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white text-sm">
                                {item.email}
                              </div>
                              <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                                <Clock className="w-3 h-3" />
                                Pre-assigned (Awaiting login)
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3.5">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                            Pre-assigned
                          </span>
                        </td>
                        <td className="px-6 py-3.5">
                          <select
                            value={item.role}
                            onChange={(e) => handleUpdatePreassignedRole(item.id, e.target.value)}
                            className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="viewer">Viewer (Read-only)</option>
                            <option value="editor_jkr">Editor (JKR) - Road Only</option>
                            <option value="editor_jkm">Editor (JKM) - PPS Only</option>
                            <option value="editor_jps">Editor (JPS) - Water Level Only</option>
                            <option value="editor">Editor (All)</option>
                            <option value="admin">Admin (Full Access)</option>
                          </select>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-gray-400">Auto-saved</span>
                            <button
                              onClick={() => handleDeletePreassignedRole(item.id, item.email)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors cursor-pointer"
                              title="Revoke pre-assigned role"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  // Active Registered User
                  return (
                    <tr key={`act-${item.id}`} className="bg-white dark:bg-zinc-900 hover:bg-gray-50/60 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white text-sm">
                              {item.email || item.username || item.user_id}
                            </div>
                            <div className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
                              ID: {item.user_id?.substring(0, 12)}...
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Active
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <select
                          value={item.role}
                          onChange={(e) => handleUpdateRole(item.user_id, e.target.value)}
                          disabled={item.user_id === '0875d7d7-3878-40df-9fe6-30a853c677a1'}
                          className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-zinc-700 rounded-lg bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="viewer">Viewer (Read-only)</option>
                          <option value="editor_jkr">Editor (JKR) - Road Only</option>
                          <option value="editor_jkm">Editor (JKM) - PPS Only</option>
                          <option value="editor_jps">Editor (JPS) - Water Level Only</option>
                          <option value="editor">Editor (All)</option>
                          <option value="admin">Admin (Full Access)</option>
                          <option value="banned">Banned (No Access)</option>
                        </select>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <span className="text-xs text-gray-400">Auto-saved</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="px-6 py-3 border-t border-gray-200 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-900/60 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              Showing <span className="font-semibold text-gray-700 dark:text-gray-300">{filteredUserList.length}</span> user(s)
              {userSearchQuery || userRoleFilter !== 'All' ? ' (filtered)' : ''}
            </span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                {roles.length} Active
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                {preassignedRoles.length} Pre-assigned
              </span>
            </div>
          </div>
        </section>

        {/* Logs Deletion Section */}
        <section className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-zinc-800 bg-red-50/30 dark:bg-red-900/10">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Manage Submissions (Danger Zone)
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Deleting a log will automatically revert the ArcGIS map to the road's previous state.</p>
            
            <div className="flex gap-4 mt-6 border-b border-gray-200 dark:border-zinc-800 pb-0">
              <button 
                onClick={() => { setActiveLogTab('roads'); setCurrentPage(1); }}
                className={`text-sm font-medium px-4 py-2 border-b-2 transition-colors ${activeLogTab === 'roads' ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
              >
                Road Logs
              </button>
              <button 
                onClick={() => { setActiveLogTab('rivers'); setCurrentPage(1); }}
                className={`text-sm font-medium px-4 py-2 border-b-2 transition-colors ${activeLogTab === 'rivers' ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
              >
                River Logs
              </button>
              <button 
                onClick={() => { setActiveLogTab('pps'); setCurrentPage(1); }}
                className={`text-sm font-medium px-4 py-2 border-b-2 transition-colors ${activeLogTab === 'pps' ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
              >
                PPS Supplies
              </button>
              <button 
                onClick={() => { setActiveLogTab('defects'); setCurrentPage(1); }}
                className={`text-sm font-medium px-4 py-2 border-b-2 transition-colors ${activeLogTab === 'defects' ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
              >
                Road Defects
              </button>
            </div>
          </div>
          
          {/* Filters */}
          <div className="px-6 py-4 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 flex flex-col sm:flex-row flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <input 
                type="text" 
                placeholder="Search by road name..."
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
                {activeLogTab === 'roads' && (
                  <>
                    <option value="Open">Open</option>
                    <option value="Heavy Vehicles Only">Heavy Vehicles Only</option>
                    <option value="Closed">Closed</option>
                    <option value="Pending Assessment">Pending Assessment</option>
                  </>
                )}
                {activeLogTab === 'rivers' && (
                  <>
                    <option value="Normal">Normal</option>
                    <option value="Alert">Alert</option>
                    <option value="Warning">Warning</option>
                    <option value="Danger">Danger</option>
                  </>
                )}
                {activeLogTab === 'pps' && (
                  <>
                    <option value="Active">Active</option>
                    <option value="Standby">Standby</option>
                    <option value="Closed">Closed</option>
                  </>
                )}
                {activeLogTab === 'defects' && (
                  <>
                    <option value="Ongoing">Ongoing</option>
                    <option value="Completed">Completed</option>
                  </>
                )}
              </select>
            </div>
            <div className="w-full sm:w-auto">
              <input 
                type="date" 
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 dark:border-zinc-700 rounded-lg bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
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
            <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-zinc-800/50 dark:text-gray-300">
                <tr>
                  <th scope="col" className="px-6 py-4 font-semibold">Date</th>
                  <th scope="col" className="px-6 py-4 font-semibold">{activeLogTab === 'roads' || activeLogTab === 'defects' ? 'Road' : activeLogTab === 'rivers' ? 'River' : 'PPS Name'}</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Status</th>
                  <th scope="col" className="px-6 py-4 font-semibold">{activeLogTab === 'pps' ? 'Updated By' : 'Submitter'}</th>
                  <th scope="col" className="px-6 py-4 font-semibold text-right">{activeLogTab === 'pps' || activeLogTab === 'defects' ? 'Delete' : 'Delete & Revert'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-zinc-800/80">
                {isLoading ? (
                  <tr><td colSpan="5" className="p-6 text-center">Loading...</td></tr>
                ) : paginatedLogs.length === 0 ? (
                  <tr><td colSpan="5" className="p-6 text-center">No logs found matching your filters.</td></tr>
                ) : paginatedLogs.map((log) => (
                  <tr key={log.id} className="bg-white dark:bg-zinc-900 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">{new Date(log.created_at || log.updated_at).toLocaleString('en-MY')}</td>
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{activeLogTab === 'roads' || activeLogTab === 'defects' ? log.road_name : activeLogTab === 'rivers' ? log.river_name : log.pps_name}</td>
                    <td className="px-6 py-4">
                      {activeLogTab === 'pps' 
                        ? (ppsFeatures.find(p => p.PPS_Name === log.pps_name)?.Status || '-') 
                        : log.status}
                    </td>
                    <td className="px-6 py-4">
                      {activeLogTab === 'pps' ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-gray-900 dark:text-white font-medium text-sm">
                            <User className="w-4 h-4 text-gray-400" />
                            {log.last_updated_by || '-'}
                          </div>
                          <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                            <Mail className="w-3.5 h-3.5 shrink-0" />
                            {log.last_updated_email || '-'}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-gray-900 dark:text-white font-medium text-sm">
                            <User className="w-4 h-4 text-gray-400" />
                            {log.submitted_by_name || '-'}
                          </div>
                          <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                            <Mail className="w-3.5 h-3.5 shrink-0" />
                            {log.submitted_by_email || '-'}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => setLogToDelete(log)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        title="Delete this log"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50 flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Showing <span className="font-semibold text-gray-900 dark:text-white">{(currentPage - 1) * rowsPerPage + 1}</span> to <span className="font-semibold text-gray-900 dark:text-white">{Math.min(currentPage * rowsPerPage, filteredLogs.length)}</span> of <span className="font-semibold text-gray-900 dark:text-white">{filteredLogs.length}</span> entries
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <div className="px-2 text-sm text-gray-600 dark:text-gray-400">
                  Page {currentPage} of {totalPages}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>

      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {logToDelete && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDeleting && setLogToDelete(null)}
              className="fixed inset-0 z-40 bg-black/60"
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden pointer-events-auto border border-gray-200 dark:border-zinc-800"
              >
                <div className="p-6 text-center">
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Delete Submission?</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                    Are you sure you want to delete the log for <span className="font-semibold text-gray-900 dark:text-white">{logToDelete.road_name || logToDelete.river_name || logToDelete.pps_name}</span>? {(activeLogTab === 'roads' || activeLogTab === 'rivers') && 'This will permanently undo the status change on the live ArcGIS map.'}
                  </p>
                  
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => setLogToDelete(null)}
                      disabled={isDeleting}
                      className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={executeDeleteLog}
                      disabled={isDeleting}
                      className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {isDeleting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Deleting...
                        </>
                      ) : (
                        'Yes, Delete'
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Add Users Modal */}
      <AnimatePresence>
        {isAddUserModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isAddingUsers && setIsAddUserModalOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs"
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto border border-gray-200 dark:border-zinc-800"
              >
                <div className="p-5 md:p-6 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between bg-gray-50/50 dark:bg-zinc-900/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl">
                      <UserPlus className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base md:text-lg font-bold text-gray-900 dark:text-white">
                        Add User & Assign Roles
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Paste email addresses and assign portal permissions
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsAddUserModalOpen(false)}
                    disabled={isAddingUsers}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleAddUsersSubmit} className="p-5 md:p-6 space-y-4">
                  {addUserError && (
                    <div className="p-3 text-xs bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 rounded-xl flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{addUserError}</span>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        User Email Address(es)
                      </label>
                      {addEmailsText.trim() && (() => {
                        const { valid, invalid } = parseEmails(addEmailsText);
                        return (
                          <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                            {valid.length} valid email{valid.length === 1 ? '' : 's'}
                            {invalid.length > 0 && ` (${invalid.length} invalid line${invalid.length === 1 ? '' : 's'})`}
                          </span>
                        );
                      })()}
                    </div>
                    <textarea
                      rows={5}
                      value={addEmailsText}
                      onChange={(e) => setAddEmailsText(e.target.value)}
                      placeholder={`officer1@jkr.gov.my\nofficer2@jps.gov.my\nrelief.team@jkm.gov.my`}
                      className="w-full p-3 text-xs font-mono rounded-xl border border-gray-300 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-800/50 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all resize-y custom-scrollbar"
                    />
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                      Supports multiple lines (one email per line) or comma-separated emails.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      Role to Assign
                    </label>
                    <select
                      value={addSelectedRole}
                      onChange={(e) => setAddSelectedRole(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    >
                      <option value="editor_jkr">Editor (JKR) - Road Status & Closures Only</option>
                      <option value="editor_jkm">Editor (JKM) - PPS Shelters & Supplies Only</option>
                      <option value="editor_jps">Editor (JPS) - River Water Levels Only</option>
                      <option value="editor">Editor (All Domains)</option>
                      <option value="admin">Admin - Full System & Role Control</option>
                      <option value="viewer">Viewer - Read-only Map & Analytics</option>
                    </select>
                  </div>

                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200/60 dark:border-blue-900/40 rounded-xl text-xs text-blue-800 dark:text-blue-300">
                    <p className="font-semibold flex items-center gap-1.5 mb-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      Automatic Role Assignment
                    </p>
                    <p className="text-[11px] leading-relaxed text-blue-700/80 dark:text-blue-300/80">
                      If the user already registered, their role updates instantly. If not yet registered, the role will be automatically granted the moment they sign in with this email.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddUserModalOpen(false)}
                      disabled={isAddingUsers}
                      className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-semibold hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isAddingUsers || parseEmails(addEmailsText).valid.length === 0}
                      className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isAddingUsers ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          <span>Assigning...</span>
                        </>
                      ) : (
                        `Assign Roles (${parseEmails(addEmailsText).valid.length || 0})`
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* SQL Setup Modal */}
      <AnimatePresence>
        {isSqlModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSqlModalOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs"
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full max-w-xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto border border-gray-200 dark:border-zinc-800"
              >
                <div className="p-5 md:p-6 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between bg-gray-50/50 dark:bg-zinc-900/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-xl">
                      <Code2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base md:text-lg font-bold text-gray-900 dark:text-white">
                        Database Schema Setup
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Run this SQL snippet in your Supabase Dashboard SQL Editor
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsSqlModalOpen(false)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 md:p-6 space-y-4">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    To enable pre-assigning roles before users log in, run this script once in your Supabase SQL Editor:
                  </p>
                  
                  <div className="relative">
                    <pre className="p-4 rounded-xl bg-zinc-950 text-zinc-100 font-mono text-[11px] overflow-x-auto max-h-60 custom-scrollbar border border-zinc-800">
{`ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS email TEXT;

CREATE TABLE IF NOT EXISTS public.preassigned_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.preassigned_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON public.preassigned_roles
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON public.preassigned_roles
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON public.preassigned_roles
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON public.preassigned_roles
    FOR DELETE USING (auth.role() = 'authenticated');`}
                    </pre>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS email TEXT;\n\nCREATE TABLE IF NOT EXISTS public.preassigned_roles (\n    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,\n    email TEXT UNIQUE NOT NULL,\n    role TEXT NOT NULL DEFAULT 'viewer',\n    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL\n);\n\nALTER TABLE public.preassigned_roles ENABLE ROW LEVEL SECURITY;\n\nCREATE POLICY "Enable read access for authenticated users" ON public.preassigned_roles\n    FOR SELECT USING (auth.role() = 'authenticated');\n\nCREATE POLICY "Enable insert for authenticated users" ON public.preassigned_roles\n    FOR INSERT WITH CHECK (auth.role() = 'authenticated');\n\nCREATE POLICY "Enable update for authenticated users" ON public.preassigned_roles\n    FOR UPDATE USING (auth.role() = 'authenticated');\n\nCREATE POLICY "Enable delete for authenticated users" ON public.preassigned_roles\n    FOR DELETE USING (auth.role() = 'authenticated');`);
                        setCopiedSql(true);
                        setTimeout(() => setCopiedSql(false), 2500);
                      }}
                      className="absolute top-2.5 right-2.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedSql ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedSql ? 'Copied!' : 'Copy SQL'}
                    </button>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => setIsSqlModalOpen(false)}
                      className="px-4 py-2 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}