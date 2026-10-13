import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { useTheme } from 'next-themes';
import 'leaflet/dist/leaflet.css';
import roadAttributes from '../lib/roadAttributes.json';

// Fix Leaflet icons
delete L.Icon.Default.prototype._getIconUrl;

const BASE_URL_ROADS_PPS = "https://services5.arcgis.com/2ZRAaoTSJbQ20ceg/arcgis/rest/services/ROAD_ACCESSIBILITY_DUE_TO_FLOOD_WFL1/FeatureServer";
const BASE_URL_RIVERS = "https://services5.arcgis.com/2ZRAaoTSJbQ20ceg/arcgis/rest/services/Rivers_Flood/FeatureServer/0";

const ROAD_LAYERS = [80, 81, 84];
const DISTRICT_ROAD_LAYERS = [0, 1, 3, 89, 71, 72, 73, 94, 95];
const DISTRICT_ROAD_MAP = {
  0: 'Johor Bahru', 1: 'Johor Bahru', 94: 'Johor Bahru',
  3: 'Kota Tinggi', 89: 'Kota Tinggi', 95: 'Kota Tinggi',
  71: 'Segamat', 72: 'Segamat', 73: 'Segamat'
};
const BOUNDARY_LAYERS = [85, 88, 90]; // Segamat, JB, Kota Tinggi
const PPS_LAYER = 97;

// In-memory module-level cache for instant 0ms tab navigation
let memoryGeoCache = null;
let preloadPromise = null;
const CACHE_NAME = 'floodwise-geojson-v1';

async function getCachedData(key) {
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const res = await cache.match(key);
      if (res) return await res.json();
    } catch {
      // ignore
    }
  }
  try {
    const raw = sessionStorage.getItem(`geo_${key}`);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

async function setCachedData(key, data) {
  if (!data) return;
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const response = new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' }
      });
      await cache.put(key, response);
      return;
    } catch {
      // fallback
    }
  }
  try {
    sessionStorage.setItem(`geo_${key}`, JSON.stringify(data));
  } catch {
    // ignore
  }
}

async function fetchSingleGeoJSON(url, cacheKey) {
  const cached = await getCachedData(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    f: "geojson"
  });

  try {
    const res = await fetch(`${url}/query?${params.toString()}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.features) {
      setCachedData(cacheKey, json);
    }
    return json;
  } catch (err) {
    console.error("Failed to fetch GeoJSON from:", url, err);
    return null;
  }
}

export async function preloadGeoData() {
  if (memoryGeoCache) return memoryGeoCache;
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    try {
      // 1. Check persistent browser cache for all 4 parts
      const [cRivers, cPps, cRoads, cBoundaries] = await Promise.all([
        getCachedData('rivers'),
        getCachedData('pps'),
        getCachedData('roads'),
        getCachedData('boundaries')
      ]);

      if (cRivers && cPps && cRoads && cBoundaries) {
        memoryGeoCache = {
          rivers: cRivers,
          pps: cPps,
          roads: cRoads,
          boundaries: cBoundaries
        };
      }

      // 2. Fetch all layers in parallel (Promise.all - no sequential waterfall!)
      const [riversData, ppsData, ...otherData] = await Promise.all([
        fetchSingleGeoJSON(BASE_URL_RIVERS, 'rivers'),
        fetchSingleGeoJSON(`${BASE_URL_ROADS_PPS}/${PPS_LAYER}`, 'pps'),
        ...ROAD_LAYERS.map(id => fetchSingleGeoJSON(`${BASE_URL_ROADS_PPS}/${id}`, `road_${id}`)),
        ...BOUNDARY_LAYERS.map(id => fetchSingleGeoJSON(`${BASE_URL_ROADS_PPS}/${id}`, `boundary_${id}`))
      ]);

      const rawRoads = otherData.slice(0, ROAD_LAYERS.length);
      const rawBoundaries = otherData.slice(ROAD_LAYERS.length);

      const roadsDataArray = [];
      rawRoads.forEach(data => {
        if (data && data.features) {
          data.features.forEach(f => {
            let dist = f.properties.DISTRICT || f.properties.District || f.properties.district;
            if (dist) {
              f.properties.DISTRICT = dist.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            }
          });
          roadsDataArray.push(data);
        }
      });

      const boundariesDataArray = rawBoundaries.filter(Boolean);

      const resolved = {
        rivers: riversData || memoryGeoCache?.rivers || null,
        pps: ppsData || memoryGeoCache?.pps || null,
        roads: roadsDataArray.length ? roadsDataArray : (memoryGeoCache?.roads || []),
        boundaries: boundariesDataArray.length ? boundariesDataArray : (memoryGeoCache?.boundaries || [])
      };

      memoryGeoCache = resolved;
      setCachedData('rivers', resolved.rivers);
      setCachedData('pps', resolved.pps);
      setCachedData('roads', resolved.roads);
      setCachedData('boundaries', resolved.boundaries);

      return resolved;
    } catch (e) {
      console.error("Error in preloadGeoData:", e);
      return memoryGeoCache;
    } finally {
      preloadPromise = null;
    }
  })();

  return preloadPromise;
}

function MapUpdater() {
  const map = useMap();
  useEffect(() => {
    // Leaflet needs to recalculate its container size if rendered inside complex flex/grid layouts.
    // A small timeout ensures the DOM has settled before invalidating size.
    const timeout = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timeout);
  }, [map]);
  return null;
}

function MapController({ selectedFeature, layerRefs, activePinnedKeyRef }) {
  const map = useMap();
  useEffect(() => {
    if (!selectedFeature) return;
    const key = `${selectedFeature.type}-${selectedFeature.name}`;
    const layers = layerRefs.current[key];
    if (layers && layers.length > 0) {
      let targetLayer = layers[0];

      if (layers[0].getBounds) {
        // Find the largest segment to zoom to, avoiding massive bounding boxes for disconnected bits
        let maxArea = 0;
        
        layers.forEach(l => {
          if (l.getBounds) {
            // If the table click has a specific district, skip segments that belong to a different district
            if (selectedFeature.district) {
              const layerDist = l.feature?.properties?.DISTRICT || l.feature?.properties?.District || l.feature?.properties?.district;
              if (layerDist && layerDist.toUpperCase() !== selectedFeature.district.toUpperCase()) {
                return;
              }
            }

            const bounds = l.getBounds();
            const area = Math.abs(bounds.getNorth() - bounds.getSouth()) * Math.abs(bounds.getEast() - bounds.getWest());
            if (area > maxArea) {
              maxArea = area;
              targetLayer = l;
            }
          }
        });
      }

      // Mark pinned key immediately
      if (activePinnedKeyRef) {
        activePinnedKeyRef.current = key;
      }
      layers.forEach(l => { l._isClicked = true; });
      targetLayer._isClicked = true;

      const openPopupAndPin = () => {
        if (!targetLayer) return;
        if (activePinnedKeyRef) {
          activePinnedKeyRef.current = key;
        }
        layers.forEach(l => { l._isClicked = true; });
        targetLayer._isClicked = true;

        const popupLatLng = targetLayer.getBounds 
          ? targetLayer.getBounds().getCenter() 
          : (targetLayer.getLatLng ? targetLayer.getLatLng() : null);

        if (popupLatLng) {
          targetLayer.openPopup(popupLatLng);
        } else {
          targetLayer.openPopup();
        }
      };

      let animationFinished = false;
      const onMoveEnd = () => {
        if (animationFinished) return;
        animationFinished = true;
        map.off('moveend', onMoveEnd);
        setTimeout(openPopupAndPin, 60);
      };

      map.on('moveend', onMoveEnd);

      if (targetLayer.getBounds) {
        map.flyToBounds(targetLayer.getBounds(), { padding: [50, 50], maxZoom: 15, duration: 1.2 });
      } else if (targetLayer.getLatLng) {
        map.flyTo(targetLayer.getLatLng(), 15, { duration: 1.2 });
      }

      // Fallback timer: in case the map was already centered at or near the target bounds and moveend doesn't fire
      const fallbackTimer = setTimeout(() => {
        if (!animationFinished) {
          animationFinished = true;
          map.off('moveend', onMoveEnd);
          openPopupAndPin();
        }
      }, 1300);

      return () => {
        map.off('moveend', onMoveEnd);
        clearTimeout(fallbackTimer);
      };
    }
  }, [selectedFeature, map, layerRefs, activePinnedKeyRef]);
  return null;
}

export default function ArcGISLeafletMap({ roadsLogs = [], defectLogs = [], riverLogs = [], ppsData = [], selectedFeature = null, mapMode = 'flood' }) {
  const layerRefs = useRef({});
  const activePinnedKeyRef = useRef(null);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(true);
  const attemptedRoads = useRef(new Set());
  
  // Instant initial state: if cached, map renders immediately on first frame!
  const [geoData, setGeoData] = useState(() => memoryGeoCache || {
    rivers: null,
    roads: [],
    boundaries: [],
    pps: null
  });

  useEffect(() => {
    let isCancelled = false;

    // 1. If memory cache already exists, apply immediately (0 ms)
    if (memoryGeoCache) {
      setGeoData(memoryGeoCache);
    } else {
      // 2. Otherwise load persistent browser cache in < 15ms
      Promise.all([
        getCachedData('rivers'),
        getCachedData('pps'),
        getCachedData('roads'),
        getCachedData('boundaries')
      ]).then(([cRivers, cPps, cRoads, cBoundaries]) => {
        if (!isCancelled && cRivers && cPps && cRoads && cBoundaries) {
          const quick = { rivers: cRivers, pps: cPps, roads: cRoads, boundaries: cBoundaries };
          memoryGeoCache = quick;
          setGeoData(quick);
        }
      });
    }

    // 3. Parallel fetch fresh telemetry / update cache in background
    preloadGeoData().then((freshData) => {
      if (!isCancelled && freshData) {
        setGeoData(freshData);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  // Visual stacking order for roads
  useEffect(() => {
    if (!geoData.roads.length || !mounted) return;
    
    const openLayers = [];
    const pendingLayers = [];
    const heavyLayers = [];
    const closedLayers = [];

    Object.keys(layerRefs.current).forEach(key => {
      if (key.startsWith('road-')) {
        const name = key.replace('road-', '');
        const layers = layerRefs.current[key];
        
        layers.forEach(layer => {
          if (!layer.feature) return;
          
          if (mapMode === 'defects') {
            const defectLog = defectLogs?.find(log => log.road_name === name);
            const status = defectLog ? defectLog.status : 'None';
            if (status === 'Ongoing') closedLayers.push(layer); // use closedLayers as the top priority array
            else openLayers.push(layer);
          } else {
            const roadLog = roadsLogs?.find(log => log.road_name === name);
            const status = roadLog ? roadLog.status : (layer.feature.properties.Status || layer.feature.properties.STATUS);
            if (status === 'Closed') closedLayers.push(layer);
            else if (status === 'Heavy Vehicles Only') heavyLayers.push(layer);
            else if (status === 'Pending Assessment') pendingLayers.push(layer);
            else openLayers.push(layer);
          }
        });
      }
    });

    // In Leaflet, calling bringToFront() moves the SVG element to the end of the DOM.
    // By calling it in order of priority, the last one called stays on top!
    openLayers.forEach(l => l.bringToFront && l.bringToFront());
    pendingLayers.forEach(l => l.bringToFront && l.bringToFront());
    heavyLayers.forEach(l => l.bringToFront && l.bringToFront());
    closedLayers.forEach(l => l.bringToFront && l.bringToFront());

  }, [roadsLogs, defectLogs, geoData.roads, mapMode, mounted]);

  // Dynamically fetch missing district roads if they are logged
  useEffect(() => {
    if (!geoData.roads.length || !roadsLogs.length || !mounted) return;
    
    const loadedRoadNames = new Set();
    geoData.roads.forEach(layerData => {
      if (layerData.features) {
        layerData.features.forEach(f => {
          if (f.properties.Name) loadedRoadNames.add(f.properties.Name);
          if (f.properties.NAME) loadedRoadNames.add(f.properties.NAME);
        });
      }
    });

    const missingRoads = new Set();
    
    // Check missing from roadsLogs
    roadsLogs.forEach(log => {
      if (!loadedRoadNames.has(log.road_name) && !attemptedRoads.current.has(log.road_name)) {
        missingRoads.add(log.road_name);
        attemptedRoads.current.add(log.road_name);
      }
    });

    // Check missing from defectLogs
    defectLogs.forEach(log => {
      if (!loadedRoadNames.has(log.road_name) && !attemptedRoads.current.has(log.road_name)) {
        missingRoads.add(log.road_name);
        attemptedRoads.current.add(log.road_name);
      }
    });

    if (missingRoads.size === 0) return;

    const fetchMissingRoads = async () => {
      const namesArray = Array.from(missingRoads).map(n => `'${n.replace(/'/g, "''")}'`).join(',');
      const whereClause = `NAME IN (${namesArray})`;
      
      const fetchPromises = DISTRICT_ROAD_LAYERS.map(async (layerId) => {
        const url = `${BASE_URL_ROADS_PPS}/${layerId}/query?where=${encodeURIComponent(whereClause)}&outFields=*&f=geojson`;
        try {
          const res = await fetch(url);
          const data = await res.json();
          if (data && data.features && data.features.length > 0) {
            data.features.forEach(f => f.properties.DISTRICT = DISTRICT_ROAD_MAP[layerId]);
            return data;
          }
        } catch (e) {
          console.error("Failed to fetch district layer", layerId, e);
        }
        return null;
      });

      const results = await Promise.all(fetchPromises);
      const validResults = results.filter(r => r !== null);
      
      if (validResults.length > 0) {
        setGeoData(prev => ({
          ...prev,
          roads: [...prev.roads, ...validResults]
        }));
      }
    };

    fetchMissingRoads();
  }, [roadsLogs, defectLogs, geoData.roads, mounted]);

  if (!mounted) return null;
  const isDark = resolvedTheme === 'dark';

  // Styling logic based on ArcGIS pitemx rules
  const getRiverStyle = (feature) => {
    const name = feature.properties.River_Name;
    const riverLog = riverLogs?.find(log => log.river_name === name);
    const status = riverLog ? riverLog.status : feature.properties.Status;

    let color = '#06b6d4'; // Cyan (Safe/Normal) instead of green to look more like water
    if (status === 'Alert') color = '#eab308'; // Yellow
    if (status === 'Warning') color = '#f97316'; // Orange
    if (status === 'Danger') color = '#ef4444'; // Red

    // Make rivers distinct: thicker, softer opacity, and add a custom CSS class for glowing
    return { color, weight: 6, opacity: 0.6, lineCap: 'round', lineJoin: 'round', className: 'river-glow' };
  };

  const getBoundaryStyle = () => {
    return {
      color: isDark ? '#4b5563' : '#9ca3af',
      weight: 2,
      dashArray: '4, 4',
      fillColor: isDark ? '#3b82f6' : '#2563eb',
      fillOpacity: 0.05
    };
  };

  const getRoadStyle = (feature) => {
    const name = feature.properties.Name || feature.properties.NAME;
    
    if (mapMode === 'defects') {
      const defectLog = defectLogs?.find(log => log.road_name === name);
      if (!defectLog) {
        return { color: isDark ? '#4b5563' : '#d1d5db', weight: 2, opacity: 0.4, dashArray: '5, 5' }; // Light grey / less prominent
      }
      
      const status = defectLog.status;
      let color = '#22c55e'; // Completed -> Green
      if (status === 'Ongoing') color = '#f97316'; // Ongoing -> Orange
      
      return { color, weight: 4, opacity: 1.0, dashArray: '5, 5' };
    } else {
      const roadLog = roadsLogs?.find(log => log.road_name === name);
      const status = roadLog ? roadLog.status : (feature.properties.Status || feature.properties.STATUS);
      
      let color = '#22c55e'; // Open / Default
      if (status === 'Closed') color = '#ef4444'; // Red
      if (status === 'Heavy Vehicles Only') color = '#eab308'; // Yellow
      if (status === 'Pending Assessment') color = '#f97316'; // Orange

      return { color, weight: 3, opacity: 1.0, dashArray: '5, 5' }; // Roads dashed to separate from continuous rivers
    }
  };

  const getPpsMarker = (feature, latlng) => {
    const name = feature.properties.PPS_Name;
    const liveData = ppsData?.find(p => p.PPS_Name === name);
    const status = liveData ? liveData.Status : feature.properties.Status;
    const type = feature.properties.PPS_Type?.toLowerCase() || '';

    let colorClass = 'bg-gray-400';
    let borderClass = 'border-gray-500';

    if (status === 'Active') {
      colorClass = 'bg-green-500';
      borderClass = 'border-green-600';
    } else if (status === 'Standby') {
      colorClass = 'bg-blue-500';
      borderClass = 'border-blue-600';
    }

    const schoolSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 8-4 8 4"/><path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/><path d="M14 22v-4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4"/><path d="M18 5v17"/><path d="M6 5v17"/><circle cx="12" cy="9" r="2"/></svg>`;
    const hallSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`;
    
    const iconSvg = type.includes('school') ? schoolSvg : hallSvg;

    const html = `
      <div class="w-6 h-6 rounded-full flex items-center justify-center ${colorClass} border-2 ${borderClass} shadow-md shadow-black/50">
        ${iconSvg}
      </div>
    `;

    return L.marker(latlng, {
      icon: L.divIcon({
        className: 'bg-transparent border-none',
        html,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      })
    });
  };

  // Calculate center coordinates of a Leaflet layer or GeoJSON feature
  const getLayerCenter = (layer, feature) => {
    try {
      if (layer.getBounds) {
        const c = layer.getBounds().getCenter();
        if (c && !isNaN(c.lat) && !isNaN(c.lng)) {
          return { lat: c.lat.toFixed(6), lng: c.lng.toFixed(6) };
        }
      }
      if (layer.getLatLng) {
        const c = layer.getLatLng();
        if (c && !isNaN(c.lat) && !isNaN(c.lng)) {
          return { lat: c.lat.toFixed(6), lng: c.lng.toFixed(6) };
        }
      }
      if (feature?.geometry?.coordinates) {
        const coords = feature.geometry.coordinates;
        if (feature.geometry.type === 'Point') {
          return { lat: coords[1].toFixed(6), lng: coords[0].toFixed(6) };
        }
        if (feature.geometry.type === 'LineString' && coords.length > 0) {
          const mid = coords[Math.floor(coords.length / 2)];
          return { lat: mid[1].toFixed(6), lng: mid[0].toFixed(6) };
        }
        if (feature.geometry.type === 'MultiLineString' && coords[0]?.length > 0) {
          const mid = coords[0][Math.floor(coords[0].length / 2)];
          return { lat: mid[1].toFixed(6), lng: mid[0].toFixed(6) };
        }
      }
    } catch {
      // ignore
    }
    return null;
  };

  // Google Maps icon generator (compact button positioned beside the name)
  const getGoogleMapsIconHtml = (lat, lng) => {
    if (!lat || !lng) return '';
    const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    return `
      <a 
        href="${gmapsUrl}" 
        target="_blank" 
        rel="noopener noreferrer" 
        title="Open in Google Maps" 
        aria-label="Open in Google Maps"
        style="
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          background-color: #2563eb;
          color: #ffffff !important;
          text-decoration: none !important;
          flex-shrink: 0;
          cursor: pointer;
          box-shadow: 0 1px 2px rgba(0,0,0,0.15);
          transition: transform 0.15s ease, background-color 0.15s ease;
        "
        onmouseover="this.style.backgroundColor='#1d4ed8'; this.style.transform='scale(1.1)';"
        onmouseout="this.style.backgroundColor='#2563eb'; this.style.transform='scale(1)';"
        onclick="event.stopPropagation();"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </a>
    `;
  };

  // Tooltip bindings
  const onEachRiver = (feature, layer) => {
    if (feature.properties) {
      const name = feature.properties.River_Name;
      if (!layerRefs.current[`river-${name}`]) layerRefs.current[`river-${name}`] = [];
      layerRefs.current[`river-${name}`].push(layer);
      
      const riverLog = riverLogs?.find(log => log.river_name === name);
      const status = riverLog ? riverLog.status : feature.properties.Status;
      const coords = getLayerCenter(layer, feature);
      const gmapsIcon = coords ? getGoogleMapsIconHtml(coords.lat, coords.lng) : '';

      // Clickable popup for details
      layer.bindPopup(`
        <div class="font-sans text-xs min-w-[170px]">
          <div class="flex items-center justify-between border-b border-gray-600/40 pb-1.5 mb-1.5 gap-2">
            <strong class="text-sm font-bold text-cyan-600 dark:text-cyan-400">${name}</strong>
            ${gmapsIcon}
          </div>
          Water Level: ${feature.properties.Water_Level?.toFixed(2)}m<br/>
          Status: ${status}
        </div>
      `, { className: 'custom-popup' });

      layer.on('mouseover', function(e) {
        if (activePinnedKeyRef.current && activePinnedKeyRef.current !== `river-${name}`) return;
        if (!this._isClicked) {
          const c = e?.latlng || (this.getBounds ? this.getBounds().getCenter() : null);
          if (c) this.openPopup(c);
          else this.openPopup();
        }
      });
      layer.on('mouseout', function() {
        if (activePinnedKeyRef.current) return;
        if (!this._isClicked) this.closePopup();
      });
      layer.on('click', function(e) {
        const key = `river-${name}`;
        activePinnedKeyRef.current = key;
        if (layerRefs.current[key]) {
          layerRefs.current[key].forEach(l => { l._isClicked = true; });
        }
        this._isClicked = true;
        this.openPopup(e?.latlng);
      });
      layer.on('popupclose', function() {
        const key = `river-${name}`;
        if (activePinnedKeyRef.current === key) {
          activePinnedKeyRef.current = null;
        }
        if (layerRefs.current[key]) {
          layerRefs.current[key].forEach(l => { l._isClicked = false; });
        }
        this._isClicked = false;
      });
    }
  };

  const onEachRoad = (feature, layer) => {
    if (feature.properties) {
      const name = feature.properties.Name || feature.properties.NAME;
      if (!layerRefs.current[`road-${name}`]) layerRefs.current[`road-${name}`] = [];
      layerRefs.current[`road-${name}`].push(layer);

      const coords = getLayerCenter(layer, feature);
      const gmapsIcon = coords ? getGoogleMapsIconHtml(coords.lat, coords.lng) : '';

      if (mapMode === 'defects') {
        const defectLog = defectLogs?.find(log => log.road_name === name);
        const roadAttr = roadAttributes[name?.toUpperCase()] || {};
        const typeStr = defectLog?.type_of_road || roadAttr.type_of_road || 'Unknown';
        const routeStr = defectLog?.route_no || roadAttr.route_no ? ` (${defectLog?.route_no || roadAttr.route_no})` : '';

        if (defectLog) {
          const types = defectLog.defect_types?.filter(t => t !== 'Others (Lain-lain)') || [];
          if (defectLog.other_defect_type) types.push(defectLog.other_defect_type);
          const typesHtml = types.length > 0 ? `<ul class="list-disc pl-4 mt-1 mb-2">${types.map(t => `<li>${t}</li>`).join('')}</ul>` : '<span>-</span>';

          const causes = defectLog.defect_causes?.filter(c => c !== 'Others (Lain-lain)') || [];
          if (defectLog.other_defect_cause) causes.push(defectLog.other_defect_cause);
          const causesHtml = causes.length > 0 ? `<ul class="list-disc pl-4 mt-1">${causes.map(c => `<li>${c}</li>`).join('')}</ul>` : '<span>-</span>';

          layer.bindPopup(`
            <div class="font-sans text-xs min-w-[210px]">
              <div class="flex items-center justify-between border-b border-gray-600/40 pb-1.5 mb-1.5 gap-2">
                <strong class="text-sm font-bold text-orange-600">${name}</strong>
                ${gmapsIcon}
              </div>
              <div class="mb-1 text-gray-500">${typeStr}${routeStr}</div>
              <div class="mb-1"><span class="font-semibold">Status:</span> ${defectLog.status || 'Ongoing'}</div>
              <div class="mb-1"><span class="font-semibold block">Types:</span> ${typesHtml}</div>
              <div><span class="font-semibold block">Causes:</span> ${causesHtml}</div>
              ${defectLog.notes ? `<div class="mt-2 pt-2 border-t border-gray-200"><span class="font-semibold block">Notes:</span> <span class="italic text-gray-600">"${defectLog.notes}"</span></div>` : ''}
            </div>
          `, { className: 'custom-popup' });
        } else {
          layer.bindPopup(`
            <div class="font-sans text-xs min-w-[170px]">
              <div class="flex items-center justify-between border-b border-gray-600/40 pb-1.5 mb-1.5 gap-2">
                <strong class="text-sm font-bold text-gray-900 dark:text-white">${name}</strong>
                ${gmapsIcon}
              </div>
              <div class="mb-1 text-gray-500">${typeStr}${routeStr}</div>
              <div class="text-gray-500 italic">No defects reported.</div>
            </div>
          `, { className: 'custom-popup' });
        }
      } else {
        const roadLog = roadsLogs?.find(log => log.road_name === name);
        const roadAttr = roadAttributes[name?.toUpperCase()] || {};
        const typeStr = roadLog?.type_of_road || roadAttr.type_of_road || 'Unknown';
        const routeStr = roadLog?.route_no || roadAttr.route_no ? ` (${roadLog?.route_no || roadAttr.route_no})` : '';

        const status = roadLog ? roadLog.status : (feature.properties.Status || feature.properties.STATUS);
        const depthRaw = roadLog?.depth !== undefined ? roadLog.depth : feature.properties.DEPTH;
        const depthStr = depthRaw !== null && depthRaw !== undefined ? `${parseFloat(depthRaw).toFixed(2)}m` : 'N/A';

        layer.bindPopup(`
          <div class="font-sans text-xs min-w-[170px]">
            <div class="flex items-center justify-between border-b border-gray-600/40 pb-1.5 mb-1.5 gap-2">
              <strong class="text-sm font-bold text-gray-900 dark:text-white">${name}</strong>
              ${gmapsIcon}
            </div>
            <div class="mb-1 text-gray-500">${typeStr}${routeStr}</div>
            <div class="mb-1"><span class="font-semibold">Status:</span> ${status}</div>
            <div><span class="font-semibold">Water Depth:</span> ${depthStr}</div>
          </div>
        `, { className: 'custom-popup' });
      }

      layer.on('mouseover', function(e) {
        if (activePinnedKeyRef.current && activePinnedKeyRef.current !== `road-${name}`) return;
        if (!this._isClicked) {
          const c = e?.latlng || (this.getBounds ? this.getBounds().getCenter() : null);
          if (c) this.openPopup(c);
          else this.openPopup();
        }
      });
      layer.on('mouseout', function() {
        if (activePinnedKeyRef.current) return;
        if (!this._isClicked) this.closePopup();
      });
      layer.on('click', function(e) {
        const key = `road-${name}`;
        activePinnedKeyRef.current = key;
        if (layerRefs.current[key]) {
          layerRefs.current[key].forEach(l => { l._isClicked = true; });
        }
        this._isClicked = true;
        this.openPopup(e?.latlng);
      });
      layer.on('popupclose', function() {
        const key = `road-${name}`;
        if (activePinnedKeyRef.current === key) {
          activePinnedKeyRef.current = null;
        }
        if (layerRefs.current[key]) {
          layerRefs.current[key].forEach(l => { l._isClicked = false; });
        }
        this._isClicked = false;
      });
    }
  };

  const onEachPPS = (feature, layer) => {
    if (feature.properties) {
      const name = feature.properties.PPS_Name;
      if (!layerRefs.current[`pps-${name}`]) layerRefs.current[`pps-${name}`] = [];
      layerRefs.current[`pps-${name}`].push(layer);

      const liveData = ppsData?.find(p => p.PPS_Name === name);
      const status = liveData ? liveData.Status : feature.properties.Status;
      const capacity = liveData ? liveData.Capacity : feature.properties.Capacity;
      const coords = getLayerCenter(layer, feature);
      const gmapsIcon = coords ? getGoogleMapsIconHtml(coords.lat, coords.lng) : '';

      layer.bindPopup(`
        <div class="font-sans text-xs min-w-[170px]">
          <div class="flex items-center justify-between border-b border-gray-600/40 pb-1.5 mb-1.5 gap-2">
            <strong class="text-sm font-bold text-purple-600 dark:text-purple-400">${name}</strong>
            ${gmapsIcon}
          </div>
          Status: ${status}<br/>
          Capacity: ${capacity || 'N/A'}
        </div>
      `, { className: 'custom-popup' });

      layer.on('mouseover', function() {
        if (activePinnedKeyRef.current && activePinnedKeyRef.current !== `pps-${name}`) return;
        if (!this._isClicked) this.openPopup();
      });
      layer.on('mouseout', function() {
        if (activePinnedKeyRef.current) return;
        if (!this._isClicked) this.closePopup();
      });
      layer.on('click', function() {
        const key = `pps-${name}`;
        activePinnedKeyRef.current = key;
        if (layerRefs.current[key]) {
          layerRefs.current[key].forEach(l => { l._isClicked = true; });
        }
        this._isClicked = true;
        this.openPopup();
      });
      layer.on('popupclose', function() {
        const key = `pps-${name}`;
        if (activePinnedKeyRef.current === key) {
          activePinnedKeyRef.current = null;
        }
        if (layerRefs.current[key]) {
          layerRefs.current[key].forEach(l => { l._isClicked = false; });
        }
        this._isClicked = false;
      });
    }
  };

  return (
    <div className="absolute inset-0 z-10 group/map rounded-xl overflow-hidden shadow-lg border border-gray-200 dark:border-zinc-800">
      
      {/* Loading Overlay */}
      {(!geoData.rivers && !geoData.pps) && (
        <div className="absolute inset-0 bg-gray-50 dark:bg-zinc-900/50 flex flex-col items-center justify-center z-20 pointer-events-none backdrop-blur-sm transition-opacity duration-300">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-gray-500 dark:text-gray-400 font-medium font-sans">Syncing ArcGIS Telemetry...</p>
        </div>
      )}

      {/* Subtle scanline overlay for the fintech feel, matching BackgroundMap */}
      <div className={`absolute inset-0 z-20 pointer-events-none opacity-[0.03] bg-[length:100%_4px] ${isDark ? 'bg-[linear-gradient(transparent_50%,rgba(0,0,0,1)_50%)]' : 'bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.5)_50%)]'}`} />

      <MapContainer 
        center={[1.9, 103.5]} 
        zoom={9}
        zoomControl={false}
        className="w-full h-full"
      >
        <ZoomControl position="bottomleft" />
        <TileLayer
          key={isDark ? 'dark' : 'light'}
          url={isDark
            ? "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
          }
          attribution="&copy; Esri"
        />
        
        <MapUpdater />
        <MapController selectedFeature={selectedFeature} layerRefs={layerRefs} activePinnedKeyRef={activePinnedKeyRef} />

        {geoData.boundaries.map((boundaryLayerData, idx) => (
          <GeoJSON 
            key={`boundary-layer-${idx}`}
            data={boundaryLayerData}
            style={getBoundaryStyle}
            interactive={false}
          />
        ))}

        {geoData.rivers && mapMode === 'flood' && (
          <GeoJSON 
            key={`river-layer-${mapMode}-${riverLogs?.length}`}
            data={geoData.rivers} 
            style={getRiverStyle}
            onEachFeature={onEachRiver}
          />
        )}

        {geoData.roads.map((roadLayerData, idx) => (
          <GeoJSON 
            key={`road-layer-${idx}-${mapMode}-${defectLogs.length}-${roadsLogs.length}`}
            data={roadLayerData}
            style={getRoadStyle}
            onEachFeature={onEachRoad}
          />
        ))}

        {geoData.pps && mapMode === 'flood' && (
          <GeoJSON 
            key={`pps-layer-${ppsData?.map(p => p.Status).join('-') || geoData.pps.features.length}`}
            data={geoData.pps} 
            pointToLayer={getPpsMarker}
            onEachFeature={onEachPPS}
          />
        )}
      </MapContainer>
    </div>
  );
}
