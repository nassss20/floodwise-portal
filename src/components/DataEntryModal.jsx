import { useState, useEffect } from 'react';
import { Database, Save, CheckCircle2, AlertCircle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Select from 'react-select';
import { fetchRoads, fetchPPS, fetchRivers, updateFeatureStatus, updateRiverFeature } from '../lib/arcgisClient';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import roadAttributes from '../lib/roadAttributes.json';

export default function DataEntryModal({ isOpen, onClose }) {
  const { user, canEditRoads, canEditRivers, canEditPPS } = useAuth();

  // Tab/Type selection
  const [entryType, setEntryType] = useState('Road'); // 'Road', 'River' or 'PPS'
  const [selectedDistrict, setSelectedDistrict] = useState(''); // 'Segamat', 'Kota Tinggi', 'Johor Bahru'

  // Data sources
  const [roads, setRoads] = useState([]);
  const [ppsList, setPpsList] = useState([]);
  const [rivers, setRivers] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Selected feature
  const [selectedFeatureId, setSelectedFeatureId] = useState('');
  const [selectedFeatureData, setSelectedFeatureData] = useState(null);

  // Form Fields - Road
  const [floodDepth, setFloodDepth] = useState('');
  const [roadStatus, setRoadStatus] = useState('');
  const [damageType, setDamageType] = useState('');
  
  // Form Fields - Road Metadata Overrides
  const [typeOfRoad, setTypeOfRoad] = useState('');
  const [routeNo, setRouteNo] = useState('');

  // Form Fields - River
  const [waterLevel, setWaterLevel] = useState('');
  const [riverStatus, setRiverStatus] = useState('');
  const [riverNote, setRiverNote] = useState('');

  // Fetch username for prefilling
  const [username, setUsername] = useState('');
  useEffect(() => {
    if (user) {
      supabase
        .from('user_roles')
        .select('username')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data && data.username) {
            setUsername(data.username);
            setSubmittedByName(data.username);
          }
        });
    }
  }, [user]);

  // Form Fields - PPS
  const [ppsCapacity, setPpsCapacity] = useState('');
  const [ppsStatus, setPpsStatus] = useState('');
  const [suppliesHave, setSuppliesHave] = useState(['']);
  const [suppliesNeed, setSuppliesNeed] = useState(['']);

  // Form Fields - Road Defects
  const [defectTypes, setDefectTypes] = useState([]);
  const [defectCauses, setDefectCauses] = useState([]);
  const [otherDefectType, setOtherDefectType] = useState('');
  const [otherDefectCause, setOtherDefectCause] = useState('');
  const [defectStatus, setDefectStatus] = useState('');
  const [defectNotes, setDefectNotes] = useState('');

  // General Fields
  const [submittedByName, setSubmittedByName] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Dropdown constants
  const DEFECT_TYPES = [
    "Potholes (Lubang)",
    "Cracking / Hairline Cracking (Retak / Retak Rerambut)",
    "Surface Deformations - Depression (Mendapan Permukaan)",
    "Surface Deformations - Shoving (Terasakan Permukaan)",
    "Surface Deformations - Corrugation (Permukaan Beralun)"
  ];

  const DEFECT_CAUSES = [
    "Flood (Banjir)",
    "Overloading / High Traffic Load (Muatan Berlebihan / Beban Trafik Tinggi)",
    "Base/Foundation Structure Issues (Isu Struktur Asas / Pavemen Sedia Ada Lemah)",
    "Paving Material Design (Reka Bentuk Bahan Turapan)",
    "Quality of Material / Quality of Work (Kualiti Bahan Turapan / Kualiti Kerja)",
    "Third Party Interference (Pihak Ketiga)",
    "Aging / Premix Lifespan (Jangka Masa Premix Yang Lama)",
    "Low-lying Area (Lokasi Kawasan Rendah)"
  ];

  // Fetch data when modal opens
  useEffect(() => {
    if (!isOpen) return;

    async function loadData() {
      setIsLoadingData(true);
      try {
        const [roadData, ppsData, riverData] = await Promise.all([
          fetchRoads(),
          fetchPPS(),
          fetchRivers()
        ]);
        setRoads(roadData);
        setPpsList(ppsData);
        setRivers(riverData);
      } catch (err) {
        console.error("Failed to load map data", err);
        setErrorMsg("Failed to load data from the Map Server.");
      } finally {
        setIsLoadingData(false);
      }
    }

    if (roads.length === 0 || ppsList.length === 0 || rivers.length === 0) {
      loadData();
    }

    if (isOpen) {
      if (canEditRoads) setEntryType('Road');
      else if (canEditRivers) setEntryType('River');
      else if (canEditPPS) setEntryType('PPS');
    }
  }, [isOpen, canEditRoads, canEditRivers, canEditPPS]); // Only reload if opened and empty

  // When type or district changes, clear selection
  useEffect(() => {
    setSelectedFeatureId('');
  }, [entryType, selectedDistrict]);

  // When a feature is selected from the dropdown, update the auto-fill fields
  useEffect(() => {
    if (!selectedFeatureId) {
      setSelectedFeatureData(null);
      setFloodDepth('');
      setRoadStatus('');
      setDamageType('');
      setTypeOfRoad('');
      setRouteNo('');
      setWaterLevel('');
      setRiverStatus('');
      setRiverNote('');
      setPpsCapacity('');
      setPpsStatus('');
      setSuppliesHave(['']);
      setSuppliesNeed(['']);
      return;
    }

    if (entryType === 'Road') {
      const road = roads.find(r => r.isDistrictRoad ? r.Name === selectedFeatureId : `${r.layerId}_${r.OBJECTID}` === selectedFeatureId);
      if (road) {
        setSelectedFeatureData(road);
        setFloodDepth(road.DEPTH !== null && road.DEPTH !== undefined ? road.DEPTH.toString() : '');
        setRoadStatus(road.Status || '');
        setDamageType(road.DAMAGE || '');
        const roadAttr = roadAttributes[road.Name?.toUpperCase()] || {};
        setTypeOfRoad(roadAttr.type_of_road || '');
        setRouteNo(roadAttr.route_no || '');
      }
    } else if (entryType === 'Road Defect') {
      const road = roads.find(r => r.isDistrictRoad ? r.Name === selectedFeatureId : `${r.layerId}_${r.OBJECTID}` === selectedFeatureId);
      if (road) {
        setSelectedFeatureData(road);
        setDefectTypes([]);
        setDefectCauses([]);
        setOtherDefectType('');
        setOtherDefectCause('');
        setDefectStatus('');
        setDefectNotes('');
        const roadAttr = roadAttributes[road.Name?.toUpperCase()] || {};
        setTypeOfRoad(roadAttr.type_of_road || '');
        setRouteNo(roadAttr.route_no || '');
      }
    } else if (entryType === 'River') {
      const river = rivers.find(r => `${r.layerId}_${r.OBJECTID}` === selectedFeatureId);
      if (river) {
        setSelectedFeatureData(river);
        setWaterLevel(river.Water_Level !== null && river.Water_Level !== undefined ? river.Water_Level.toString() : '');
        setRiverStatus(river.Status || '');
        // Fetch note if there's any from Supabase
        supabase
          .from('submission_logs')
          .select('damage') // using damage field as note for river
          .eq('road_name', river.River_Name) // using road_name field as river_name
          .eq('status', river.Status || '')
          .order('created_at', { ascending: false })
          .limit(1)
          .then(({ data }) => {
            if (data && data.length > 0) {
              setRiverNote(data[0].damage || '');
            } else {
              setRiverNote('');
            }
          });
      }
    } else {
      const pps = ppsList.find(p => `${p.layerId}_${p.OBJECTID}` === selectedFeatureId);
      if (pps) {
        setSelectedFeatureData(pps);
        setPpsCapacity(pps.Capacity !== null && pps.Capacity !== undefined ? pps.Capacity.toString() : '');
        setPpsStatus(pps.Status || '');

        // Fetch existing have/need from Supabase if we want to pre-fill it
        supabase
          .from('pps_supplies')
          .select('*')
          .eq('pps_name', pps.PPS_Name)
          .single()
          .then(({ data }) => {
            if (data) {
              try { setSuppliesHave(JSON.parse(data.supplies_have) || ['']); } catch { setSuppliesHave(data.supplies_have ? [data.supplies_have] : ['']); }
              try { setSuppliesNeed(JSON.parse(data.supplies_need) || ['']); } catch { setSuppliesNeed(data.supplies_need ? [data.supplies_need] : ['']); }
            } else {
              setSuppliesHave(['']);
              setSuppliesNeed(['']);
            }
          });
      }
    }
  }, [selectedFeatureId, entryType, roads, ppsList, rivers]);

  // Auto-update road status based on flood depth rules
  useEffect(() => {
    if (entryType === 'Road' && floodDepth !== '') {
      const depth = parseFloat(floodDepth);
      if (!isNaN(depth)) {
        if (depth < 0.3) {
          setRoadStatus('Open');
        } else if (depth >= 0.3 && depth <= 0.8) {
          setRoadStatus('Heavy Vehicles Only');
        } else if (depth > 0.8) {
          setRoadStatus('Closed');
        }
      }
    }
  }, [floodDepth, entryType]);

  // Auto-suggest river status based on water level benchmark when user types depth
  const handleWaterLevelChange = (val) => {
    setWaterLevel(val);
    if (val !== '') {
      const level = parseFloat(val);
      if (!isNaN(level)) {
        if (level <= 34.00) {
          setRiverStatus('Normal');
        } else if (level > 34.00 && level <= 36.10) {
          setRiverStatus('Alert');
        } else if (level > 36.10 && level <= 37.30) {
          setRiverStatus('Warning');
        } else if (level > 37.30) {
          setRiverStatus('Danger');
        }
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFeatureId || !selectedFeatureData) return;

    setIsSubmitting(true);
    setSubmitStatus(null);
    setErrorMsg('');

    try {
      if (entryType === 'Road') {
        // ROAD UPDATE
        const attributes = {
          DEPTH: floodDepth === '' || isNaN(parseFloat(floodDepth)) ? null : parseFloat(floodDepth),
          Status: roadStatus || null,
          DAMAGE: damageType || null,
        };

        // 1. Update ArcGIS ONLY if it's a standard telemetry road
        if (!selectedFeatureData.isDistrictRoad) {
          const actualObjectId = parseInt(selectedFeatureId.split('_').pop());
          await updateFeatureStatus(selectedFeatureData.layerId, actualObjectId, attributes);
        }

        // 2. Log to Supabase submission_logs
        await supabase.from('submission_logs').insert([{
          road_name: selectedFeatureData.Name || 'Unknown Road',
          district: selectedFeatureData.DISTRICT || null,
          status: roadStatus || null,
          depth: attributes.DEPTH,
          damage: damageType || null,
          type_of_road: typeOfRoad || null,
          route_no: routeNo || null,
          submitted_by_name: submittedByName,
          submitted_by_email: user?.email || 'Unknown',
          user_id: user?.id
        }]);

      } else if (entryType === 'Road Defect') {
        // ROAD DEFECT UPDATE
        
        // Ensure "Others" values are provided if selected
        const finalOtherType = defectTypes.includes('Others (Lain-lain)') ? otherDefectType : null;
        const finalOtherCause = defectCauses.includes('Others (Lain-lain)') ? otherDefectCause : null;
        
        // Log to Supabase road_defects_logs
        await supabase.from('road_defects_logs').insert([{
          road_name: selectedFeatureData.Name || 'Unknown Road',
          district: selectedFeatureData.DISTRICT || null,
          defect_types: defectTypes,
          defect_causes: defectCauses,
          other_defect_type: finalOtherType,
          other_defect_cause: finalOtherCause,
          status: defectStatus || null,
          notes: defectNotes || null,
          type_of_road: typeOfRoad || null,
          route_no: routeNo || null,
          submitted_by_name: submittedByName,
          submitted_by_email: user?.email || 'Unknown',
          user_id: user?.id
        }]);

        // Note: For Road Defects, we do not update ArcGIS directly because ArcGIS currently only holds Flood data.
        // The dashboard Map will fetch and display these directly from Supabase instead.

      } else if (entryType === 'River') {
        // RIVER UPDATE
        const attributes = {
          Water_Level: waterLevel === '' || isNaN(parseFloat(waterLevel)) ? null : parseFloat(waterLevel),
          Status: riverStatus || null,
        };

        // 1. Update ArcGIS
        const actualObjectId = parseInt(selectedFeatureId.split('_').pop());
        await updateRiverFeature(actualObjectId, attributes);

        // 2. Log to Supabase river_submission_logs
        await supabase.from('river_submission_logs').insert([{
          river_name: selectedFeatureData.River_Name || 'Unknown River',
          district: selectedFeatureData.District || null,
          status: riverStatus || null,
          water_level: attributes.Water_Level,
          notes: riverNote || null,
          submitted_by_name: submittedByName,
          submitted_by_email: user?.email || 'Unknown',
          user_id: user?.id
        }]);

      } else {
        // PPS UPDATE
        const attributes = {
          Capacity: ppsCapacity === '' || isNaN(parseInt(ppsCapacity)) ? null : parseInt(ppsCapacity),
          Status: ppsStatus || null,
        };

        // 1. Update ArcGIS
        const actualObjectId = parseInt(selectedFeatureId.split('_').pop());
        await updateFeatureStatus(selectedFeatureData.layerId, actualObjectId, attributes);

        // 2. Upsert Have/Need to Supabase pps_supplies
        const { error: dbError } = await supabase.from('pps_supplies').upsert({
          pps_name: selectedFeatureData.PPS_Name,
          supplies_have: JSON.stringify(suppliesHave.filter(item => item.trim() !== '')),
          supplies_need: JSON.stringify(suppliesNeed.filter(item => item.trim() !== '')),
          last_updated_by: submittedByName,
          last_updated_email: user?.email || 'Unknown',
          updated_at: new Date().toISOString()
        }, { onConflict: 'pps_name' });

        if (dbError) throw dbError;
      }

      setSubmitStatus('success');

      setTimeout(() => {
        setSubmitStatus(null);
        onClose();
        setSelectedFeatureId('');
      }, 2000);

    } catch (err) {
      console.error(err);
      setSubmitStatus('error');
      setErrorMsg(err.message || 'An error occurred while updating.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter options based on selected district
  const getOptions = () => {
    if (entryType === 'Road' || entryType === 'Road Defect') {
      let filtered = roads;
      if (selectedDistrict) {
        filtered = filtered.filter(r => r.DISTRICT?.toUpperCase() === selectedDistrict.toUpperCase());
      }
      const rawOptions = filtered.map(road => {
        return {
          value: road.isDistrictRoad ? road.Name : `${road.layerId}_${road.OBJECTID}`,
          label: `${road.Route_No ? `${road.Route_No} - ` : ''}${road.Name}`
        };
      });
      return Array.from(new Map(rawOptions.map(opt => [opt.label.trim().toLowerCase(), opt])).values())
        .sort((a, b) => a.label.localeCompare(b.label));
    } else if (entryType === 'River') {
      let filtered = rivers;
      if (selectedDistrict) {
        filtered = filtered.filter(r => r.District?.toUpperCase() === selectedDistrict.toUpperCase());
      }
      return filtered.map(river => ({
        value: `${river.layerId}_${river.OBJECTID}`,
        label: river.River_Name
      }));
    } else {
      let filtered = ppsList;
      if (selectedDistrict) {
        filtered = filtered.filter(p => p.District?.toUpperCase() === selectedDistrict.toUpperCase());
      }
      return filtered.map(pps => ({
        value: `${pps.layerId}_${pps.OBJECTID}`,
        label: `${pps.PPS_Name} (${pps.PPS_Type || 'Unknown'})`
      }));
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-black/60"
          />

          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 overflow-y-auto pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden relative pointer-events-auto max-h-[90vh] flex flex-col"
            >
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-500"></div>

              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-zinc-800 shrink-0">
                <div className="flex items-center gap-2">
                  <Database className="text-blue-600 dark:text-blue-400 w-5 h-5" />
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Update Map Data</h2>
                </div>
                <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto p-6">
                <form onSubmit={handleSubmit} id="data-entry-form" className="flex flex-col gap-6">

                  {/* Feature Selection */}
                  <div className="space-y-4">

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Type Toggle */}
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Feature Type</label>
                        <select
                          value={entryType}
                          onChange={(e) => setEntryType(e.target.value)}
                          className="block w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 focus:ring-2 focus:ring-blue-500"
                        >
                          {canEditRoads && <option value="Road">Road Networks (Flood Status)</option>}
                          {canEditRoads && <option value="Road Defect">Road Networks (Defect Status)</option>}
                          {canEditPPS && <option value="PPS">PPS (Evacuation Center)</option>}
                          {canEditRivers && <option value="River">River Water Levels</option>}
                        </select>
                      </div>

                      {/* District Selection */}
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">District Filter (Optional)</label>
                        <select
                          value={selectedDistrict}
                          onChange={(e) => setSelectedDistrict(e.target.value)}
                          className="block w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">All Districts</option>
                          <option value="Segamat">Segamat</option>
                          <option value="Kota Tinggi">Kota Tinggi</option>
                          <option value="Johor Bahru">Johor Bahru</option>
                        </select>
                      </div>

                      {/* Name Selection */}
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Select {entryType} *</label>
                        <Select
                          options={getOptions()}
                          value={selectedFeatureId ? {
                            value: selectedFeatureId,
                            label: (entryType === 'Road' || entryType === 'Road Defect')
                              ? (selectedFeatureData ? `${selectedFeatureData.Route_No ? `${selectedFeatureData.Route_No} - ` : ''}${selectedFeatureData.Name}` : '')
                              : entryType === 'River'
                                ? (selectedFeatureData ? selectedFeatureData.River_Name : '')
                                : (selectedFeatureData ? `${selectedFeatureData.PPS_Name} (${selectedFeatureData.PPS_Type || 'Unknown'})` : '')
                          } : null}
                          onChange={(option) => setSelectedFeatureId(option ? option.value : '')}
                          isDisabled={isLoadingData || isSubmitting}
                          placeholder={isLoadingData ? "Loading..." : `-- Search or Select a ${entryType} --`}
                          isClearable
                          isSearchable
                          styles={{
                            control: (baseStyles) => ({
                              ...baseStyles,
                              borderRadius: '0.5rem',
                              borderColor: 'rgb(209 213 219)',
                              padding: '0.15rem',
                            }),
                            menuPortal: base => ({ ...base, zIndex: 9999 })
                          }}
                          menuPortalTarget={document.body}
                        />
                      </div>
                    </div>
                    
                    {/* Metadata Overrides */}
                    {(entryType === 'Road' || entryType === 'Road Defect') && selectedFeatureId && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Type of Road</label>
                          <select
                            value={typeOfRoad}
                            onChange={(e) => setTypeOfRoad(e.target.value)}
                            disabled={isSubmitting}
                            className="block w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700"
                          >
                            <option value="">Unclassified</option>
                            <option value="Federal Road">Federal Road</option>
                            <option value="State Road">State Road</option>
                            <option value="Residential">Residential</option>
                            <option value="Others">Others</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Route No (Optional)</label>
                          <input
                            type="text"
                            value={routeNo}
                            onChange={(e) => setRouteNo(e.target.value)}
                            disabled={isSubmitting}
                            placeholder="e.g. FT003 or J32"
                            className="block w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Update Details */}
                  <div className="space-y-4 pt-2">

                    {entryType === 'Road' ? (
                      // --- ROAD FORM ---
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Flood Depth (meters)</label>
                          <input
                            type="number" step="0.01" value={floodDepth} onChange={(e) => setFloodDepth(e.target.value)}
                            disabled={!selectedFeatureId || isSubmitting} placeholder="e.g. 1.5"
                            className="block w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Map Status *</label>
                          <select
                            required disabled={!selectedFeatureId || isSubmitting} value={roadStatus} onChange={(e) => setRoadStatus(e.target.value)}
                            className="block w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700"
                          >
                            <option value="">-- Select Status --</option>
                            <option value="Open">Open</option>
                            <option value="Heavy Vehicles Only">Heavy Vehicles Only</option>
                            <option value="Closed">Closed</option>
                            <option value="Pending Assessment">Pending Assessment</option>
                          </select>
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Damage Description (Optional)</label>
                          <textarea
                            rows={2} disabled={!selectedFeatureId || isSubmitting} value={damageType} onChange={(e) => setDamageType(e.target.value)}
                            className="block w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 resize-none"
                            placeholder="E.g., Potholes, washed out shoulder..."
                          />
                        </div>
                      </div>
                    ) : entryType === 'Road Defect' ? (
                      // --- ROAD DEFECT FORM ---
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Defect Types *</label>
                          <div className="grid grid-cols-1 gap-2 border p-3 rounded-lg bg-gray-50 dark:bg-zinc-800/50 border-gray-200 dark:border-zinc-700 max-h-48 overflow-y-auto">
                            {DEFECT_TYPES.map(type => (
                              <label key={type} className="flex items-start gap-2">
                                <input 
                                  type="checkbox" 
                                  className="mt-1 shrink-0 rounded text-blue-600 focus:ring-blue-500 bg-white border-gray-300 dark:bg-zinc-700 dark:border-zinc-600"
                                  checked={defectTypes.includes(type)}
                                  onChange={(e) => {
                                    if (e.target.checked) setDefectTypes([...defectTypes, type]);
                                    else setDefectTypes(defectTypes.filter(t => t !== type));
                                  }}
                                  disabled={!selectedFeatureId || isSubmitting}
                                />
                                <span className="text-sm text-gray-700 dark:text-gray-300">{type}</span>
                              </label>
                            ))}
                            <label className="flex items-start gap-2">
                              <input 
                                type="checkbox" 
                                className="mt-1 shrink-0 rounded text-blue-600 focus:ring-blue-500 bg-white border-gray-300 dark:bg-zinc-700 dark:border-zinc-600"
                                checked={defectTypes.includes('Others (Lain-lain)')}
                                onChange={(e) => {
                                  if (e.target.checked) setDefectTypes([...defectTypes, 'Others (Lain-lain)']);
                                  else setDefectTypes(defectTypes.filter(t => t !== 'Others (Lain-lain)'));
                                }}
                                disabled={!selectedFeatureId || isSubmitting}
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-300">Others (Lain-lain)</span>
                            </label>
                          </div>
                          {defectTypes.includes('Others (Lain-lain)') && (
                            <input 
                              type="text" 
                              required 
                              placeholder="Specify other defect type..."
                              value={otherDefectType}
                              onChange={(e) => setOtherDefectType(e.target.value)}
                              disabled={!selectedFeatureId || isSubmitting}
                              className="mt-2 block w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 text-sm"
                            />
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Causes of Defect *</label>
                          <div className="grid grid-cols-1 gap-2 border p-3 rounded-lg bg-gray-50 dark:bg-zinc-800/50 border-gray-200 dark:border-zinc-700 max-h-48 overflow-y-auto">
                            {DEFECT_CAUSES.map(cause => (
                              <label key={cause} className="flex items-start gap-2">
                                <input 
                                  type="checkbox" 
                                  className="mt-1 shrink-0 rounded text-blue-600 focus:ring-blue-500 bg-white border-gray-300 dark:bg-zinc-700 dark:border-zinc-600"
                                  checked={defectCauses.includes(cause)}
                                  onChange={(e) => {
                                    if (e.target.checked) setDefectCauses([...defectCauses, cause]);
                                    else setDefectCauses(defectCauses.filter(c => c !== cause));
                                  }}
                                  disabled={!selectedFeatureId || isSubmitting}
                                />
                                <span className="text-sm text-gray-700 dark:text-gray-300">{cause}</span>
                              </label>
                            ))}
                            <label className="flex items-start gap-2">
                              <input 
                                type="checkbox" 
                                className="mt-1 shrink-0 rounded text-blue-600 focus:ring-blue-500 bg-white border-gray-300 dark:bg-zinc-700 dark:border-zinc-600"
                                checked={defectCauses.includes('Others (Lain-lain)')}
                                onChange={(e) => {
                                  if (e.target.checked) setDefectCauses([...defectCauses, 'Others (Lain-lain)']);
                                  else setDefectCauses(defectCauses.filter(c => c !== 'Others (Lain-lain)'));
                                }}
                                disabled={!selectedFeatureId || isSubmitting}
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-300">Others (Lain-lain)</span>
                            </label>
                          </div>
                          {defectCauses.includes('Others (Lain-lain)') && (
                            <input 
                              type="text" 
                              required 
                              placeholder="Specify other defect cause..."
                              value={otherDefectCause}
                              onChange={(e) => setOtherDefectCause(e.target.value)}
                              disabled={!selectedFeatureId || isSubmitting}
                              className="mt-2 block w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 text-sm"
                            />
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Defect Status *</label>
                            <select
                              required disabled={!selectedFeatureId || isSubmitting} value={defectStatus} onChange={(e) => setDefectStatus(e.target.value)}
                              className="block w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700"
                            >
                              <option value="">-- Select Status --</option>
                              <option value="Ongoing">Ongoing (Dalam Tindakan)</option>
                              <option value="Completed">Completed (Selesai)</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Additional Notes (Optional)</label>
                          <textarea
                            rows={2} disabled={!selectedFeatureId || isSubmitting} value={defectNotes} onChange={(e) => setDefectNotes(e.target.value)}
                            className="block w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 resize-none"
                            placeholder="E.g., Temporary patching done, pending permanent premix..."
                          />
                        </div>
                      </div>
                    ) : entryType === 'River' ? (
                      // --- RIVER FORM ---
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Water Level (meters) *</label>
                            <span className="text-[11px] text-gray-400 dark:text-gray-500">Auto-suggests</span>
                          </div>
                          <input
                            type="number" step="0.01" required value={waterLevel} onChange={(e) => handleWaterLevelChange(e.target.value)}
                            disabled={!selectedFeatureId || isSubmitting} placeholder="e.g. 35.50"
                            className="block w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">River Status *</label>
                            <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">Customizable</span>
                          </div>
                          <select
                            required 
                            disabled={!selectedFeatureId || isSubmitting} 
                            value={riverStatus} 
                            onChange={(e) => setRiverStatus(e.target.value)}
                            className="block w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">-- Select Status --</option>
                            <option value="Normal">Normal (Safe / Baseline)</option>
                            <option value="Alert">Alert (Waspada)</option>
                            <option value="Warning">Warning (Amaran)</option>
                            <option value="Danger">Danger (Bahaya)</option>
                          </select>
                        </div>

                        {riverStatus && (
                          <div className="md:col-span-2 p-3 rounded-lg border flex items-start gap-3 bg-gray-50 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                            {riverStatus === 'Normal' && <div className="text-green-500 mt-0.5"><CheckCircle2 className="w-5 h-5" /></div>}
                            {riverStatus === 'Alert' && <div className="text-yellow-500 mt-0.5"><AlertCircle className="w-5 h-5" /></div>}
                            {riverStatus === 'Warning' && <div className="text-orange-500 mt-0.5"><AlertCircle className="w-5 h-5" /></div>}
                            {riverStatus === 'Danger' && <div className="text-red-500 mt-0.5"><AlertCircle className="w-5 h-5" /></div>}

                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <h4 className={`font-semibold text-sm ${
                                  riverStatus === 'Normal' ? 'text-green-700 dark:text-green-400' :
                                  riverStatus === 'Alert' ? 'text-yellow-700 dark:text-yellow-400' :
                                  riverStatus === 'Warning' ? 'text-orange-700 dark:text-orange-400' :
                                  'text-red-700 dark:text-red-400'
                                }`}>
                                  {riverStatus} Stage
                                </h4>
                                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                  Applies to map telemetry & AI
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                                {riverStatus === 'Normal' && "The river flow is safe and within expected baseline depth."}
                                {riverStatus === 'Alert' && "Water rises significantly above normal; monitoring activated."}
                                {riverStatus === 'Warning' && "Water approaches bankfull stage; localized overflow possible."}
                                {riverStatus === 'Danger' && "Critical overtopping threshold; flood evacuation required."}
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Additional Notes (Optional)</label>
                          <textarea
                            rows={2} disabled={!selectedFeatureId || isSubmitting} value={riverNote} onChange={(e) => setRiverNote(e.target.value)}
                            className="block w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 resize-none text-gray-900 dark:text-white"
                            placeholder="E.g., Debris observed, station gauge threshold adjusted, rain continuing..."
                          />
                        </div>
                      </div>
                    ) : (
                      // --- PPS FORM ---
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Capacity (Pax)</label>
                          <input
                            type="number" value={ppsCapacity} onChange={(e) => setPpsCapacity(e.target.value)}
                            disabled={!selectedFeatureId || isSubmitting} placeholder="e.g. 500"
                            className="block w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Map Status *</label>
                          <select
                            required disabled={!selectedFeatureId || isSubmitting} value={ppsStatus} onChange={(e) => setPpsStatus(e.target.value)}
                            className="block w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700"
                          >
                            <option value="">-- Select Status --</option>
                            <option value="Standby">Standby</option>
                            <option value="Active">Active</option>
                            <option value="Closed">Closed</option>
                          </select>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 text-blue-600 dark:text-blue-400 flex justify-between items-center">
                            Supplies Available
                            <button type="button" onClick={() => setSuppliesHave([...suppliesHave, ''])} className="text-xs font-semibold px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded hover:bg-blue-200 transition-colors">+ Add Item</button>
                          </label>
                          <div className="space-y-2">
                            {suppliesHave.map((item, idx) => (
                              <div key={`have-${idx}`} className="flex gap-2 items-start">
                                <span className="mt-2.5 text-blue-400 text-xs shrink-0">•</span>
                                <input
                                  type="text" disabled={!selectedFeatureId || isSubmitting} value={item}
                                  onChange={(e) => {
                                    const newArr = [...suppliesHave];
                                    newArr[idx] = e.target.value;
                                    setSuppliesHave(newArr);
                                  }}
                                  className="block w-full px-3 py-2 border rounded-lg bg-blue-50/50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-900/30 focus:ring-blue-500 text-sm"
                                  placeholder="E.g., 200 bottles of water"
                                />
                                <button type="button" onClick={() => setSuppliesHave(suppliesHave.filter((_, i) => i !== idx))} className="mt-1 p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors shrink-0">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                            {suppliesHave.length === 0 && (
                              <div className="text-sm text-gray-500 italic px-4 py-2 border border-dashed border-gray-300 dark:border-zinc-700 rounded-lg text-center">No supplies listed.</div>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 text-orange-600 dark:text-orange-400 flex justify-between items-center">
                            Supplies Required
                            <button type="button" onClick={() => setSuppliesNeed([...suppliesNeed, ''])} className="text-xs font-semibold px-2 py-1 bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 rounded hover:bg-orange-200 transition-colors">+ Add Item</button>
                          </label>
                          <div className="space-y-2">
                            {suppliesNeed.map((item, idx) => (
                              <div key={`need-${idx}`} className="flex gap-2 items-start">
                                <span className="mt-2.5 text-orange-400 text-xs shrink-0">•</span>
                                <input
                                  type="text" disabled={!selectedFeatureId || isSubmitting} value={item}
                                  onChange={(e) => {
                                    const newArr = [...suppliesNeed];
                                    newArr[idx] = e.target.value;
                                    setSuppliesNeed(newArr);
                                  }}
                                  className="block w-full px-3 py-2 border rounded-lg bg-orange-50/50 border-orange-200 dark:bg-orange-900/10 dark:border-orange-900/30 focus:ring-orange-500 text-sm"
                                  placeholder="E.g., Need 50 sleeping bags"
                                />
                                <button type="button" onClick={() => setSuppliesNeed(suppliesNeed.filter((_, i) => i !== idx))} className="mt-1 p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors shrink-0">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                            {suppliesNeed.length === 0 && (
                              <div className="text-sm text-gray-500 italic px-4 py-2 border border-dashed border-gray-300 dark:border-zinc-700 rounded-lg text-center">No supplies needed.</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5 mt-4">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Name *</label>
                      <input
                        type="text" required value={submittedByName} onChange={(e) => setSubmittedByName(e.target.value)}
                        disabled={isSubmitting} placeholder="e.g. Mohamad"
                        className="block w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700"
                      />
                    </div>
                  </div>
                </form>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex-1 w-full">
                  <AnimatePresence mode="wait">
                    {submitStatus === 'success' && (
                      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="text-sm font-medium">Successfully updated!</span>
                      </motion.div>
                    )}
                    {submitStatus === 'error' && (
                      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex items-center gap-2 text-red-600">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <span className="text-sm font-medium leading-tight">{errorMsg}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button type="button" onClick={onClose} disabled={isSubmitting} className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium border rounded-lg hover:bg-gray-50 disabled:opacity-50">
                    Cancel
                  </button>
                  <button type="submit" form="data-entry-form" disabled={isSubmitting || !selectedFeatureId} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-60 shadow-sm">
                    {isSubmitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Save className="w-4 h-4" />}
                    {isSubmitting ? 'Updating...' : 'Submit Update'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
