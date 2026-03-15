import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { io, Socket } from 'socket.io-client';
import { MapPin, Settings, Send, MessageSquare, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Loader2, XCircle, Map } from 'lucide-react';
import L from 'leaflet';

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2-lat1);
  const dLon = deg2rad(lon2-lon1); 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI/180)
}

const RADUZHNYI_LAT = 46.3985;
const RADUZHNYI_LNG = 30.7045;

function MapController({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, 16, { duration: 1.5 });
    }
  }, [center, map]);
  return null;
}

interface Location {
  address: string;
  lat: number;
  lng: number;
  geojson?: any;
}

interface ProcessingTask {
  id: string;
  text: string;
  timestamp: string;
  status: 'processing_ai' | 'processing_geo' | 'found' | 'possibly_found' | 'not_found';
  addressToGeocode?: string;
  matchType?: 'exact' | 'possible';
  reason?: string;
  isSimulated?: boolean;
  locations?: Location[];
  inRaduzhnyiZone?: boolean;
}

export default function App() {
  const [tasks, setTasks] = useState<ProcessingTask[]>([]);
  
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  const [channelId, setChannelId] = useState('povestki');
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [configStatus, setConfigStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  
  const [simulatedText, setSimulatedText] = useState('');
  const [isManualOpen, setIsManualOpen] = useState(false);
  
  const [isFoundOpen, setIsFoundOpen] = useState(true);
  const [isPossiblyFoundOpen, setIsPossiblyFoundOpen] = useState(true);
  const [isRaduzhnyiOpen, setIsRaduzhnyiOpen] = useState(true);
  const [isNotFoundOpen, setIsNotFoundOpen] = useState(false);
  const [selectedCenter, setSelectedCenter] = useState<[number, number] | null>(null);
  
  const currentChannelRef = useRef<string>('');

  const collapseAllGroups = () => {
    setIsFoundOpen(false);
    setIsPossiblyFoundOpen(false);
    setIsRaduzhnyiOpen(false);
    setIsNotFoundOpen(false);
  };

  const wasGeocodingRef = useRef<boolean>(false);

  useEffect(() => {
    const pendingTasks = tasks.filter(t => t.status === 'processing_geo');
    if (pendingTasks.length > 0) {
      wasGeocodingRef.current = true;
    } else if (pendingTasks.length === 0 && wasGeocodingRef.current) {
      wasGeocodingRef.current = false;
      collapseAllGroups();
    }
  }, [tasks]);

  useEffect(() => {
    // Connect to WebSocket server
    const newSocket = io(window.location.origin);
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const fetchAndProcessDay = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    collapseAllGroups();
    setIsConfiguring(true);
    setConfigStatus(null);

    try {
      const cleanChannel = channelId.replace('@', '').trim();
      if (!cleanChannel) throw new Error('Укажите имя канала');
      
      setConfigStatus({ type: 'success', message: `Сбор сообщений из @${cleanChannel}...` });
      
      const res = await fetch(`/api/poll_channel?channel=${encodeURIComponent(cleanChannel)}&last_id=0`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка получения сообщений');
      }
      
      if (!data.messages || data.messages.length === 0) {
        setConfigStatus({ type: 'success', message: 'За сегодня сообщений не найдено.' });
        setIsConfiguring(false);
        return;
      }

      setConfigStatus({ type: 'success', message: `Обработка ${data.messages.length} сообщений ИИ...` });

      const extractRes = await fetch('/api/extract_locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: data.messages.map((m: any) => ({ id: m.id.toString(), text: m.text })) })
      });

      if (!extractRes.ok) {
        const errorData = await extractRes.json();
        throw new Error(errorData.error || 'Ошибка обработки ИИ');
      }

      const extractData = await extractRes.json();
      const aiResults = extractData.results || [];

      const newTasks: ProcessingTask[] = data.messages.map((m: any) => {
        const aiRes = aiResults.find((r: any) => String(r.id) === String(m.id));
        const address = (aiRes?.address && aiRes.address !== 'null') ? aiRes.address : null;
        const possibleAddress = (aiRes?.possible_address && aiRes.possible_address !== 'null') ? aiRes.possible_address : null;
        
        const targetAddress = address || possibleAddress;
        const matchType = address ? 'exact' : (possibleAddress ? 'possible' : undefined);
        
        return {
          id: `msg-${m.id}`,
          text: m.text,
          timestamp: m.timestamp,
          status: targetAddress ? 'processing_geo' : 'not_found',
          addressToGeocode: targetAddress,
          matchType,
          reason: targetAddress ? undefined : 'ИИ не нашел даже примерный адрес',
          isSimulated: false
        };
      });

      setTasks(prev => [...newTasks.reverse(), ...prev]);
      setConfigStatus({ type: 'success', message: `ИИ завершил работу. Ищем координаты...` });
      setTimeout(() => setIsSettingsOpen(false), 3000);
      
    } catch (err: any) {
      setConfigStatus({ type: 'error', message: err.message });
    } finally {
      setIsConfiguring(false);
    }
  };

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulatedText.trim()) return;
    
    collapseAllGroups();
    
    const textToProcess = simulatedText;
    setSimulatedText('');
    
    const lines = textToProcess.split('\n').filter(line => line.trim().length > 0);
    if (lines.length === 0) return;

    const newTasks: ProcessingTask[] = lines.map((text, idx) => ({
      id: `sim-${Date.now()}-${idx}`,
      text: text.trim(),
      timestamp: new Date().toISOString(),
      status: 'processing_ai',
      isSimulated: true
    }));
    
    setTasks(prev => [...newTasks, ...prev]);
    
    try {
      const res = await fetch('/api/extract_locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newTasks })
      });
      
      if (res.ok) {
        const data = await res.json();
        const aiResults = data.results || [];
        
        setTasks(prev => prev.map(t => {
          const isNewTask = newTasks.some(nt => nt.id === t.id);
          if (!isNewTask) return t;

          const aiRes = aiResults.find((r: any) => String(r.id) === String(t.id));
          if (!aiRes) {
            return { ...t, status: 'not_found', reason: 'ИИ не вернул результат для этого сообщения' };
          }

          const address = (aiRes?.address && aiRes.address !== 'null') ? aiRes.address : null;
          const possibleAddress = (aiRes?.possible_address && aiRes.possible_address !== 'null') ? aiRes.possible_address : null;
          
          const targetAddress = address || possibleAddress;
          const matchType = address ? 'exact' : (possibleAddress ? 'possible' : undefined);
          
          return { 
            ...t, 
            status: targetAddress ? 'processing_geo' : 'not_found',
            addressToGeocode: targetAddress,
            matchType,
            reason: targetAddress ? undefined : 'ИИ не нашел даже примерный адрес'
          };
        }));
      } else {
        setTasks(prev => prev.map(t => newTasks.some(nt => nt.id === t.id) ? { ...t, status: 'not_found', reason: 'Ошибка API ИИ' } : t));
      }
    } catch (error) {
      setTasks(prev => prev.map(t => newTasks.some(nt => nt.id === t.id) ? { ...t, status: 'not_found', reason: 'Ошибка сети при запросе к ИИ' } : t));
    }
  };

  const geocodingRef = useRef<boolean>(false);
  const [useNominatim, setUseNominatim] = useState<boolean>(!import.meta.env.VITE_GOOGLE_MAPS_API_KEY);

  useEffect(() => {
    const geocodeNext = async () => {
      if (geocodingRef.current) return;
      
      const pendingTasks = tasks.filter(t => t.status === 'processing_geo');
      if (pendingTasks.length === 0) return;

      geocodingRef.current = true;

      const googleApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

      if (!useNominatim && googleApiKey) {
        // Google Maps Geocoding API (Massive/Batch)
        try {
          // Process up to 10 at a time to avoid hitting rate limits too hard
          const batch = pendingTasks.slice(0, 10);
          
          const promises = batch.map(async (task) => {
            const query = `${task.addressToGeocode}, Одеса, Україна`;
            const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${googleApiKey}`);
            const data = await res.json();
            
            if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'REQUEST_DENIED' || data.status === 'INVALID_REQUEST') {
              throw new Error(`Google API Error: ${data.status}`);
            }
            
            if (data.status === 'OK' && data.results.length > 0) {
              const result = data.results[0];
              const lat = result.geometry.location.lat;
              const lng = result.geometry.location.lng;
              
              const inRaduzhnyiZone = getDistanceFromLatLonInKm(lat, lng, RADUZHNYI_LAT, RADUZHNYI_LNG) <= 10;
              
              return {
                id: task.id,
                success: true,
                location: {
                  address: task.addressToGeocode,
                  lat,
                  lng,
                  geojson: null // Google doesn't provide GeoJSON polygons
                },
                inRaduzhnyiZone
              };
            } else {
              return { id: task.id, success: false, reason: `Google не нашел координаты для: "${task.addressToGeocode}"` };
            }
          });

          const results = await Promise.all(promises);
          
          setTasks(prev => prev.map(t => {
            const res = results.find(r => r.id === t.id);
            if (!res) return t;
            if (res.success && res.location) {
              return {
                ...t,
                status: t.matchType === 'possible' ? 'possibly_found' : 'found',
                locations: [res.location],
                inRaduzhnyiZone: res.inRaduzhnyiZone
              };
            } else {
              return {
                ...t,
                status: 'not_found',
                reason: res.reason || 'Адрес не найден на карте'
              };
            }
          }));
        } catch (err) {
          console.error("Google Geocoding failed, falling back to Nominatim", err);
          setUseNominatim(true); // Fallback to Nominatim
        } finally {
          geocodingRef.current = false;
        }
      } else {
        // Nominatim Sequential Processing (Fallback)
        const nextTask = pendingTasks[0];
        try {
          // Delay to respect Nominatim usage policy (1 request per second)
          await new Promise(resolve => setTimeout(resolve, 1100));

          const query = `${nextTask.addressToGeocode}, Одеса, Україна`;
          const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&polygon_geojson=1`);
          const data = await res.json();

          if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            
            let geojson = data[0].geojson;
            if (geojson && data[0].boundingbox) {
              const [latMin, latMax, lonMin, lonMax] = data[0].boundingbox.map(Number);
              const diag = getDistanceFromLatLonInKm(latMin, lonMin, latMax, lonMax);
              if (diag > 8) { // 8 km threshold for "too big"
                geojson = null;
              }
            }
            
            const inRaduzhnyiZone = getDistanceFromLatLonInKm(lat, lng, RADUZHNYI_LAT, RADUZHNYI_LNG) <= 10;

            const location: Location = {
              address: nextTask.addressToGeocode,
              lat,
              lng,
              geojson
            };
            setTasks(prev => prev.map(t => 
              t.id === nextTask.id ? { 
                ...t, 
                status: t.matchType === 'possible' ? 'possibly_found' : 'found', 
                locations: [location],
                inRaduzhnyiZone
              } : t
            ));
          } else {
            setTasks(prev => prev.map(t => 
              t.id === nextTask.id ? { ...t, status: 'not_found', reason: `Гео-сервис не нашел координаты для: "${nextTask.addressToGeocode}"` } : t
            ));
          }
        } catch (err) {
          console.error('Geocoding error:', err);
          setTasks(prev => prev.map(t => 
            t.id === nextTask.id ? { ...t, status: 'not_found', reason: 'Ошибка при запросе к гео-сервису' } : t
          ));
        } finally {
          geocodingRef.current = false;
        }
      }
    };

    geocodeNext();
  }, [tasks, useNominatim]);

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar */}
      <div className="w-[400px] bg-white border-r border-slate-200 flex flex-col shadow-sm z-10">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div className="flex items-center gap-2 text-indigo-600">
            <MapPin className="w-6 h-6" />
            <div className="flex flex-col">
              <h1 className="font-semibold text-lg text-slate-800 leading-tight">GeoTelegram</h1>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${!useNominatim && import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? 'bg-emerald-400' : 'bg-blue-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${!useNominatim && import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? 'bg-emerald-500' : 'bg-blue-500'}`}></span>
                </span>
                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                  {!useNominatim && import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? 'Google Maps' : 'Nominatim'}
                </span>
              </div>
            </div>
          </div>
          <button 
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`p-2 rounded-full transition-colors ${isSettingsOpen ? 'bg-indigo-100 text-indigo-600' : 'text-slate-500 hover:bg-slate-200'}`}
            title="Настройки канала"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {isSettingsOpen && (
          <div className="p-4 border-b border-slate-200 bg-indigo-50/50">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Отслеживание публичного канала</h2>
            <form onSubmit={fetchAndProcessDay} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Имя канала (публичного)</label>
                <input 
                  type="text" 
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="@odesa_news"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-1">Канал должен быть открытым (public).</p>
              </div>
              <button 
                type="submit" 
                disabled={isConfiguring || !channelId.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 rounded-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isConfiguring ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Обработка...</span>
                  </>
                ) : (
                  'Собрать адреса за день'
                )}
              </button>
              
              {configStatus && (
                <div className={`p-2 text-xs rounded-md flex items-start gap-2 ${configStatus.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{configStatus.message}</span>
                </div>
              )}
            </form>
          </div>
        )}

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tasks.length === 0 ? (
            <div className="text-center text-slate-400 mt-10 flex flex-col items-center">
              <MessageSquare className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">Ожидание сообщений...</p>
            </div>
          ) : (
            <>
              {/* Raduzhnyi Zone Group */}
              <div className="space-y-2">
                <button 
                  onClick={() => setIsRaduzhnyiOpen(!isRaduzhnyiOpen)}
                  className="flex items-center justify-between w-full text-sm font-semibold text-slate-700 bg-indigo-100 px-3 py-2 rounded-lg hover:bg-indigo-200 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Map className="w-4 h-4 text-indigo-600" />
                    <span>Зона Радужный (до 10 км) ({tasks.filter(t => t.inRaduzhnyiZone).length})</span>
                  </div>
                  {isRaduzhnyiOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                
                {isRaduzhnyiOpen && (
                  <div className="space-y-3 pl-1">
                    {tasks.filter(t => t.inRaduzhnyiZone).map((task) => (
                      <div 
                        key={task.id} 
                        className={`bg-white border rounded-xl p-3 shadow-sm transition-colors border-indigo-200 cursor-pointer hover:bg-indigo-50`}
                        onClick={() => {
                          if (task.locations && task.locations.length > 0) {
                            setSelectedCenter([task.locations[0].lat, task.locations[0].lng]);
                          }
                        }}
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between items-start">
                            <div className="text-[10px] font-medium uppercase tracking-wider">
                              <span className="flex items-center gap-1 text-indigo-600"><Map className="w-3 h-3" /> Рядом с Радужным</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              <span>{new Date(task.timestamp).toLocaleTimeString()}</span>
                              {task.isSimulated && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Вручную</span>}
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-3">"{task.text}"</p>
                          {task.locations && task.locations.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-slate-100">
                              {task.locations.map((loc, idx) => (
                                <div key={idx} className="flex items-start gap-1 text-xs text-slate-700 mt-1">
                                  <MapPin className="w-3 h-3 mt-0.5 text-indigo-600 shrink-0" />
                                  <span>{loc.address}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {tasks.filter(t => t.inRaduzhnyiZone).length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-2">Нет адресов в этой зоне</p>
                    )}
                  </div>
                )}
              </div>

              {/* Found Group */}
              <div className="space-y-2">
                <button 
                  onClick={() => setIsFoundOpen(!isFoundOpen)}
                  className="flex items-center justify-between w-full text-sm font-semibold text-slate-700 bg-slate-100 px-3 py-2 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Найдено ({tasks.filter(t => !t.inRaduzhnyiZone && (t.status === 'found' || t.status === 'processing_ai' || (t.status === 'processing_geo' && t.matchType === 'exact'))).length})</span>
                  </div>
                  {isFoundOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                
                {isFoundOpen && (
                  <div className="space-y-3 pl-1">
                    {tasks.filter(t => !t.inRaduzhnyiZone && (t.status === 'found' || t.status === 'processing_ai' || (t.status === 'processing_geo' && t.matchType === 'exact'))).map((task) => (
                      <div 
                        key={task.id} 
                        className={`bg-white border rounded-xl p-3 shadow-sm transition-colors border-emerald-200 ${task.status === 'found' ? 'cursor-pointer hover:bg-emerald-50' : ''}`}
                        onClick={() => {
                          if (task.status === 'found' && task.locations && task.locations.length > 0) {
                            setSelectedCenter([task.locations[0].lat, task.locations[0].lng]);
                          }
                        }}
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between items-start">
                            <div className="text-[10px] font-medium uppercase tracking-wider">
                              {task.status === 'processing_ai' ? (
                                <span className="flex items-center gap-1 text-indigo-600"><Loader2 className="w-3 h-3 animate-spin" /> Анализ ИИ...</span>
                              ) : task.status === 'processing_geo' ? (
                                <span className="flex items-center gap-1 text-amber-600"><Loader2 className="w-3 h-3 animate-spin" /> Поиск координат...</span>
                              ) : (
                                <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3 h-3" /> Найдено</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              <span>{new Date(task.timestamp).toLocaleTimeString()}</span>
                              {task.isSimulated && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Вручную</span>}
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-3">"{task.text}"</p>
                          {task.addressToGeocode && task.status === 'processing_geo' && (
                            <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
                              Адрес: {task.addressToGeocode}
                            </div>
                          )}
                          {task.locations && task.locations.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-slate-100">
                              {task.locations.map((loc, idx) => (
                                <div key={idx} className="flex items-start gap-1 text-xs text-slate-700 mt-1">
                                  <MapPin className="w-3 h-3 mt-0.5 text-emerald-600 shrink-0" />
                                  <span>{loc.address}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {tasks.filter(t => !t.inRaduzhnyiZone && (t.status === 'found' || t.status === 'processing_ai' || (t.status === 'processing_geo' && t.matchType === 'exact'))).length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-2">Нет найденных адресов</p>
                    )}
                  </div>
                )}
              </div>

              {/* Possibly Found Group */}
              <div className="space-y-2">
                <button 
                  onClick={() => setIsPossiblyFoundOpen(!isPossiblyFoundOpen)}
                  className="flex items-center justify-between w-full text-sm font-semibold text-slate-700 bg-slate-100 px-3 py-2 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span>Возможно найдены ({tasks.filter(t => !t.inRaduzhnyiZone && (t.status === 'possibly_found' || (t.status === 'processing_geo' && t.matchType === 'possible'))).length})</span>
                  </div>
                  {isPossiblyFoundOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                
                {isPossiblyFoundOpen && (
                  <div className="space-y-3 pl-1">
                    {tasks.filter(t => !t.inRaduzhnyiZone && (t.status === 'possibly_found' || (t.status === 'processing_geo' && t.matchType === 'possible'))).map((task) => (
                      <div 
                        key={task.id} 
                        className={`bg-white border rounded-xl p-3 shadow-sm transition-colors border-amber-200 ${task.status === 'possibly_found' ? 'cursor-pointer hover:bg-amber-50' : ''}`}
                        onClick={() => {
                          if (task.status === 'possibly_found' && task.locations && task.locations.length > 0) {
                            setSelectedCenter([task.locations[0].lat, task.locations[0].lng]);
                          }
                        }}
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between items-start">
                            <div className="text-[10px] font-medium uppercase tracking-wider">
                              {task.status === 'processing_geo' ? (
                                <span className="flex items-center gap-1 text-amber-600"><Loader2 className="w-3 h-3 animate-spin" /> Поиск координат...</span>
                              ) : (
                                <span className="flex items-center gap-1 text-amber-600"><AlertCircle className="w-3 h-3" /> Возможно найдено</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              <span>{new Date(task.timestamp).toLocaleTimeString()}</span>
                              {task.isSimulated && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Вручную</span>}
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-3">"{task.text}"</p>
                          {task.addressToGeocode && task.status === 'processing_geo' && (
                            <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
                              Предполагаемый адрес: {task.addressToGeocode}
                            </div>
                          )}
                          {task.locations && task.locations.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-slate-100">
                              {task.locations.map((loc, idx) => (
                                <div key={idx} className="flex items-start gap-1 text-xs text-slate-700 mt-1">
                                  <MapPin className="w-3 h-3 mt-0.5 text-amber-600 shrink-0" />
                                  <span>{loc.address}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {tasks.filter(t => !t.inRaduzhnyiZone && (t.status === 'possibly_found' || (t.status === 'processing_geo' && t.matchType === 'possible'))).length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-2">Нет предполагаемых адресов</p>
                    )}
                  </div>
                )}
              </div>

              {/* Not Found Group */}
              <div className="space-y-2">
                <button 
                  onClick={() => setIsNotFoundOpen(!isNotFoundOpen)}
                  className="flex items-center justify-between w-full text-sm font-semibold text-slate-700 bg-slate-100 px-3 py-2 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-slate-400" />
                    <span>Не найдено ({tasks.filter(t => t.status === 'not_found').length})</span>
                  </div>
                  {isNotFoundOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                
                {isNotFoundOpen && (
                  <div className="space-y-3 pl-1">
                    {tasks.filter(t => t.status === 'not_found').map((task) => (
                      <div key={task.id} className="bg-white border rounded-xl p-3 shadow-sm transition-colors border-slate-200 opacity-75">
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between items-start">
                            <div className="text-[10px] font-medium uppercase tracking-wider">
                              <span className="flex items-center gap-1 text-slate-500"><XCircle className="w-3 h-3" /> Не найдено</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              <span>{new Date(task.timestamp).toLocaleTimeString()}</span>
                              {task.isSimulated && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Вручную</span>}
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-3">"{task.text}"</p>
                          {task.reason && (
                            <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-red-500 font-medium">
                              Причина: {task.reason}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {tasks.filter(t => t.status === 'not_found').length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-2">Нет пропущенных сообщений</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Manual Bulk Input */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <button 
            onClick={() => setIsManualOpen(!isManualOpen)}
            className="flex items-center justify-between w-full text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <span>Ручной ввод сообщений</span>
            {isManualOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          
          {isManualOpen && (
            <form onSubmit={handleSimulate} className="flex flex-col gap-2 mt-3">
              <textarea 
                value={simulatedText}
                onChange={(e) => setSimulatedText(e.target.value)}
                placeholder="Вставьте текст сообщений сюда (каждое с новой строки)..."
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none h-20"
              />
              <button 
                type="submit"
                disabled={!simulatedText.trim()}
                className="bg-slate-800 hover:bg-slate-900 text-white py-2 px-4 rounded-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm font-medium"
              >
                <Send className="w-4 h-4" />
                Добавить текст
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative z-0">
        <MapContainer 
          center={[46.4825, 30.7233]} // Odesa
          zoom={12} 
          style={{ height: '100%', width: '100%' }}
        >
          <MapController center={selectedCenter} />
          <TileLayer
            attribution='&copy; <a href="https://www.google.com/maps">Google Maps</a>'
            url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
          />
          {tasks.filter(t => (t.status === 'found' || t.status === 'possibly_found') && t.locations).flatMap(t => 
            t.locations!.map((loc, idx) => (
              <React.Fragment key={`${t.id}-${idx}`}>
                {t.status === 'possibly_found' && loc.geojson && loc.geojson.type !== 'Point' && (
                  <GeoJSON 
                    data={loc.geojson} 
                    style={{ color: '#f59e0b', weight: 6, opacity: 0.5 }} 
                  >
                    <Popup>
                      <div className="text-sm">
                        <p className="font-semibold mb-1">{loc.address}</p>
                        <p className="text-xs text-slate-600">"{t.text}"</p>
                        <p className="text-[10px] text-slate-400 mt-2">{new Date(t.timestamp).toLocaleString()}</p>
                      </div>
                    </Popup>
                  </GeoJSON>
                )}
                <CircleMarker 
                  center={[loc.lat, loc.lng]}
                  radius={8}
                  pathOptions={{
                    color: t.status === 'possibly_found' ? '#f59e0b' : '#3b82f6',
                    fillColor: t.status === 'possibly_found' ? '#f59e0b' : '#3b82f6',
                    fillOpacity: 0.9,
                    weight: 4,
                    opacity: 0.5
                  }}
                >
                  <Popup>
                    <div className="text-sm">
                      <p className="font-semibold mb-1">{loc.address}</p>
                      <p className="text-xs text-slate-600">"{t.text}"</p>
                      <p className="text-[10px] text-slate-400 mt-2">{new Date(t.timestamp).toLocaleString()}</p>
                    </div>
                  </Popup>
                </CircleMarker>
              </React.Fragment>
            ))
          )}
        </MapContainer>
      </div>
    </div>
  );
}
