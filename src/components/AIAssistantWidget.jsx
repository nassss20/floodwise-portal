import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Database, RefreshCw, AlertCircle, ExternalLink, Activity } from 'lucide-react';

export default function AIAssistantWidget({ roadsData, riversData, ppsData }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [report, setReport] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [weather, setWeather] = useState([]);
  const [analysisTime, setAnalysisTime] = useState(null);

  const getWeatherDescription = (code) => {
    if (code === 0) return 'Clear';
    if (code === 1 || code === 2 || code === 3) return 'Cloudy';
    if (code === 45 || code === 48) return 'Fog';
    if (code >= 51 && code <= 57) return 'Drizzle';
    if (code === 61) return 'Light rain';
    if (code === 63) return 'Moderate rain';
    if (code === 65) return 'Heavy rain';
    if (code >= 71 && code <= 77) return 'Snow';
    if (code >= 80 && code <= 82) return 'Rain showers';
    if (code >= 95) return 'Thunderstorm';
    return 'Unknown';
  };

  const generateReport = async () => {
    setIsGenerating(true);
    setErrorMsg(null);
    setReport(null);
    setAnalysisTime(null);
    
    try {
      const apiKey = import.meta.env.VITE_GROQ_API_KEY;
      if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
        throw new Error("API Key missing. Please add VITE_GROQ_API_KEY to your .env file.");
      }

      // Step 1: Fetch External Data
      let weatherDataList = [];
      try {
        const weatherRes = await fetch("https://api.open-meteo.com/v1/forecast?latitude=2.5147,1.7335,1.4927&longitude=102.8158,103.8992,103.7414&current_weather=true");
        if (weatherRes.ok) {
          const data = await weatherRes.json();
          weatherDataList = [
            { location: 'Segamat', temp: data[0].current_weather.temperature, wind: data[0].current_weather.windspeed, desc: getWeatherDescription(data[0].current_weather.weathercode) },
            { location: 'Kota Tinggi', temp: data[1].current_weather.temperature, wind: data[1].current_weather.windspeed, desc: getWeatherDescription(data[1].current_weather.weathercode) },
            { location: 'Johor Bahru', temp: data[2].current_weather.temperature, wind: data[2].current_weather.windspeed, desc: getWeatherDescription(data[2].current_weather.weathercode) }
          ];
          setWeather(weatherDataList);
        }
      } catch (e) {
        console.warn("Failed to fetch weather", e);
      }

      const currentTime = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });

      // Step 2: Prepare Internal Data
      const closedRoads = (roadsData || []).filter(r => r.status !== 'Open').map(r => `${r.road_name} (District: ${r.district || 'Unknown'}, ${r.status}, Depth: ${r.depth}m)`);
      const dangerousRivers = (riversData || []).filter(r => r.Status === 'Danger' || r.Status === 'Warning').map(r => `${r.River_Name} (District: ${r.District || 'Unknown'}, ${r.Status}, Level: ${r.Water_Level}m)`);
      const activePPS = (ppsData || []).filter(p => p.Status === 'Open').map(p => `${p.PPS_Name} (District: ${p.District || 'Unknown'}, Capacity: ${p.Capacity})`);

      // Step 3: Prepare the AI Prompt

      const prompt = `
        You are an AI Flood Crisis Commander for Johor, Malaysia. 
        Your job is to analyze the data and generate clear instructions, next steps, and specific areas to monitor for the local authorities (pihak yang berkuasa) based on the combined cross-agency data (Rivers (JPS), Roads (JKR), and Evacuation Centers (PPS)).
        
        Time of Analysis: ${currentTime}

        External Intelligence (Live Weather):
        ${weatherDataList.length > 0 ? weatherDataList.map(w => `${w.location}: ${w.desc}, ${w.temp}°C, Wind ${w.wind}km/h`).join(' | ') : 'Weather data unavailable.'}
        
        Internal Intelligence:
        Dangerous Rivers: ${dangerousRivers.length > 0 ? dangerousRivers.join(', ') : 'None'}
        Closed Roads: ${closedRoads.length > 0 ? closedRoads.join(', ') : 'None'}
        Active PPS: ${activePPS.length > 0 ? activePPS.join(', ') : 'None'}
        
        Instructions:
        1. Output exactly 3 bullet points defining NEXT STEPS or INSTRUCTIONS for the authorities. Do NOT use introductory text. Start immediately with the bullets.
        2. Use authoritative, direct, and simple vocabulary (e.g., "Deploy teams to...", "Monitor water levels at...", "Prepare PPS at...").
        3. CRITICAL: Only correlate events (rivers, roads, PPS) if they are in the SAME district or geographically connected. 
        4. Integrate the weather forecast to justify the action (e.g., "Due to expected cloudy/rainy weather in Segamat, keep patrol units on standby near closed roads").
        5. Use standard bullet points (-). Do NOT use markdown asterisks (*).
      `;

      // Step 4: Call Groq API
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 4096
        })
      });

      if (!groqRes.ok) {
        const errData = await groqRes.json().catch(() => ({}));
        throw new Error(errData.error?.message || "Failed to generate report from Groq.");
      }

      const result = await groqRes.json();
      console.log("GROQ RAW RESULT:", result);
      
      let responseText = result.choices?.[0]?.message?.content || "No response generated.";
      
      // Remove any `<think>...</think>` blocks which reasoning models output
      let thinkStart = responseText.indexOf('<think>');
      if (thinkStart !== -1) {
        let thinkEnd = responseText.indexOf('</think>', thinkStart);
        if (thinkEnd !== -1) {
          responseText = responseText.substring(0, thinkStart) + responseText.substring(thinkEnd + 8);
        } else {
          // If no closing tag is found, strip everything from <think> to the end
          responseText = responseText.substring(0, thinkStart);
        }
      }
      responseText = responseText.trim();
      
      if (!responseText) {
        responseText = "The AI processed the request but did not generate a final text response. Please try again.";
      }
      
      setAnalysisTime(currentTime);
      
      await typeText(responseText);

    } catch (err) {
      console.error("AI Generation Error:", err);
      if (err.message && (err.message.includes('503') || err.message.includes('demand') || err.message.includes('quota'))) {
        setErrorMsg("The AI Intelligence Server is currently experiencing high demand or rate limits. Please wait a moment and try again.");
      } else {
        setErrorMsg(err.message);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const typeText = async (text) => {
    setReport("");
    let currentText = "";
    const speed = 15; // ms per char
    
    for (let i = 0; i < text.length; i++) {
      currentText += text.charAt(i);
      setReport(currentText);
      await new Promise(r => setTimeout(r, speed));
    }
  };

  return (
    <div className="w-full bg-white dark:bg-zinc-950 border-y border-gray-300 dark:border-zinc-800 relative mb-6">
      <div className="flex flex-col md:flex-row">
        
        {/* Left Side: Controls & Info */}
        <div className="flex-shrink-0 w-full md:w-64 flex flex-col justify-between border-b md:border-b-0 md:border-r border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50 p-5">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-5 h-5 text-blue-600 dark:text-blue-500" />
              <h2 className="text-sm font-bold font-display uppercase tracking-widest text-gray-900 dark:text-white">
                Intelligence
              </h2>
            </div>
            <p className="text-xs font-sans text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
              Automated cross-agency synthesis using internal datasets and external meteorological APIs.
            </p>
          </div>
          
          <button
            onClick={generateReport}
            disabled={isGenerating}
            className="w-full py-2.5 px-4 bg-gray-900 hover:bg-blue-600 dark:bg-white dark:hover:bg-blue-500 text-white dark:text-gray-900 text-xs font-bold font-sans uppercase tracking-wider transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {isGenerating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Terminal className="w-3.5 h-3.5" />
            )}
            {isGenerating ? 'Compiling' : 'Run Analysis'}
          </button>
        </div>

        {/* Right Side: Output */}
        <div className="flex-grow p-5 min-h-[160px] flex flex-col justify-center bg-white dark:bg-zinc-950">
          <AnimatePresence mode="wait">
            {!report && !errorMsg && !isGenerating && (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 text-gray-400 dark:text-zinc-600"
              >
                <Database className="w-5 h-5" />
                <span className="text-sm font-mono uppercase tracking-widest">System Ready. Awaiting Command.</span>
              </motion.div>
            )}

            {isGenerating && !report && (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-4 text-blue-600 dark:text-blue-400"
              >
                <div className="w-3 h-3 bg-blue-600 dark:bg-blue-500 animate-ping"></div>
                <span className="text-sm font-mono tracking-widest uppercase">Analyzing situation...</span>
              </motion.div>
            )}

            {report && (
              <motion.div 
                key="report"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col h-full justify-between"
              >
                <div className="text-gray-900 dark:text-gray-100 font-sans text-sm">
                  <ul className="space-y-3">
                    {report.split('\n').map((line, idx) => {
                      const trimmed = line.trim();
                      if (!trimmed) return null;
                      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
                        return (
                          <motion.li 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2 }}
                            key={idx} 
                            className="flex items-start gap-3"
                          >
                            <span className="text-blue-500 mt-1 flex-shrink-0">
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                                <rect width="8" height="8" />
                              </svg>
                            </span>
                            <span className="leading-relaxed">{trimmed.replace(/^[-*]\s*/, '')}</span>
                          </motion.li>
                        );
                      }
                      return <p key={idx} className="leading-relaxed">{trimmed}</p>;
                    })}
                  </ul>
                </div>
                
                {weather && weather.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="mt-6 flex flex-col gap-3 border-t border-gray-200 dark:border-zinc-800 pt-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest flex items-center gap-1.5">
                        <ExternalLink className="w-3 h-3" /> Met. Data
                      </span>
                      {analysisTime && (
                        <span className="text-[10px] text-gray-400 font-mono uppercase tracking-widest">
                          Generated: {analysisTime}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {weather.map(w => (
                        <span key={w.location} className="text-[11px] font-mono text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-zinc-900 px-2 py-1 border border-gray-200 dark:border-zinc-800">
                          {w.location}: {w.desc}, {w.temp}°C
                        </span>
                      ))}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {errorMsg && (
              <motion.div 
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-red-50 dark:bg-red-950/30 border-l-4 border-red-500 p-4 w-full"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold font-display uppercase tracking-widest text-red-800 dark:text-red-400 mb-1">
                      System Failure
                    </h3>
                    <div className="overflow-y-auto max-h-32 pr-2">
                      <p className="text-xs font-mono text-red-600 dark:text-red-300 break-words whitespace-pre-wrap">
                        {errorMsg}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
