import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import Spinner from './Spinner';
import type { GroundingChunk } from '../types';
import { useTranslation } from '../contexts/LanguageContext';

// --- Type definitions ---
interface SpeechRecognition extends EventTarget { continuous: boolean; interimResults: boolean; lang: string; onend: (() => void) | null; onerror: ((event: any) => void) | null; onresult: ((event: any) => void) | null; start(): void; stop(): void; }
type TextTool = 'generate' | 'think' | 'superthink' | 'web' | 'maps' | 'smarthome' | 'structure';
type GenModel = 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-flash-lite-latest';
type LightState = { on: boolean; brightness: number; color: string; };

// --- Icons ---
const MicIcon: React.FC<{ className?: string }> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className || "h-6 w-6"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>);
const StopIcon: React.FC<{ className?: string }> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className || "h-6 w-6"} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>);
const LightbulbIcon: React.FC<{ on: boolean }> = ({ on }) => (<svg xmlns="http://www.w3.org/2000/svg" className={`w-16 h-16 transition-colors ${on ? 'text-yellow-300' : 'text-gray-600'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 3.05 1.68 5.65 4 6.69V17a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1.31c2.32-1.04 4-3.64 4-6.69a7 7 0 0 0-7-7zm-3 10a1 1 0 0 1-1-1a4 4 0 1 1 8 0a1 1 0 0 1-1 1H9zM12 20a1 1 0 0 0-1 1v1h2v-1a1 1 0 0 0-1-1z"/></svg>);


const SmartHomeTool: React.FC = () => {
    const { t } = useTranslation();
    const [prompt, setPrompt] = useState('');
    const [lightState, setLightState] = useState<LightState>({ on: false, brightness: 50, color: 'white' });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastCall, setLastCall] = useState<any>(null);

    const controlLight = (brightness: number, colorTemperature: string) => {
        const isOn = brightness > 0;
        setLightState({ on: isOn, brightness, color: colorTemperature });
        return "OK, the light has been adjusted.";
    };

    const handleSubmit = async () => {
        setIsLoading(true); setError(null); setLastCall(null);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const controlLightFunc: FunctionDeclaration = {
                name: 'controlLight', parameters: { type: Type.OBJECT, description: 'Set brightness and color of a light.', properties: { brightness: { type: Type.NUMBER, description: 'Light level from 0 to 100.'}, colorTemperature: { type: Type.STRING, description: 'Color like `daylight`, `cool` or `warm`.'}}, required: ['brightness', 'colorTemperature'],},
            };
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { tools: [{functionDeclarations: [controlLightFunc]}]}});

            const fc = response.functionCalls?.[0];
            if (fc) {
                setLastCall(fc);
                controlLight(fc.args.brightness, fc.args.colorTemperature);
            }
        } catch(e: any) { setError(e.message); }
        finally { setIsLoading(false); }
    };

    return (
        <div className="space-y-4">
             <p className="text-sm text-gray-400">{t('textToolDescriptionSmartHome')}</p>
             <textarea rows={3} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={t('smartHomePlaceholder')} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white" />
             <button onClick={handleSubmit} disabled={isLoading || !prompt} className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-500">{isLoading ? <Spinner /> : t('submitButton')}</button>
             {error && <p className="text-red-400">{error}</p>}
             <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="p-6 bg-gray-900 rounded-lg flex flex-col items-center justify-center">
                    <LightbulbIcon on={lightState.on} />
                    <p className="mt-2 font-bold text-lg">{lightState.on ? `${t('lightOn')} - ${lightState.brightness}%` : t('lightOff')}</p>
                    <p className="text-sm text-gray-400">{lightState.on ? `${t('lightColor')}: ${lightState.color}` : ''}</p>
                </div>
                {lastCall && <div className="flex-1 p-4 bg-gray-800 rounded-lg"><h4 className="font-bold text-purple-300">{t('lastCallTitle')}</h4><pre className="text-sm whitespace-pre-wrap"><code>{JSON.stringify(lastCall, null, 2)}</code></pre></div>}
             </div>
        </div>
    )
}

const DataStructureTool: React.FC = () => {
    const { t } = useTranslation();
    const [text, setText] = useState('1 cup flour, 2 eggs, 1/2 cup sugar. Mix and bake at 350F for 20 mins.');
    const [result, setResult] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const recipeSchema = {
        type: Type.OBJECT,
        properties: {
          recipeName: { type: Type.STRING, description: 'Name of the recipe.' },
          ingredients: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, amount: { type: Type.STRING } } } },
          instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
    };

    const handleSubmit = async () => {
        setIsLoading(true); setError(null); setResult(null);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: `Extract the recipe from this text: ${text}`,
                config: { responseMimeType: "application/json", responseSchema: recipeSchema },
            });
            setResult(JSON.parse(response.text));
        } catch (e: any) { setError(e.message); }
        finally { setIsLoading(false); }
    };

    return (
        <div className="space-y-4">
             <p className="text-sm text-gray-400">{t('textToolDescriptionStructure')}</p>
             <textarea rows={5} value={text} onChange={e => setText(e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white" />
             <button onClick={handleSubmit} disabled={isLoading || !text} className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-500">{isLoading ? <Spinner /> : t('structureButton')}</button>
             {error && <p className="text-red-400">{error}</p>}
             {result && <div className="p-4 bg-gray-800 rounded-lg"><h4 className="font-bold text-purple-300">{t('structuredResultTitle')}</h4><pre className="text-sm whitespace-pre-wrap"><code>{JSON.stringify(result, null, 2)}</code></pre></div>}
        </div>
    );
};


const TextTools: React.FC = () => {
  const { t, language } = useTranslation();
  const [activeTool, setActiveTool] = useState<TextTool>('generate');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<GenModel>('gemini-2.5-flash');
  const [result, setResult] = useState('');
  const [groundingChunks, setGroundingChunks] = useState<GroundingChunk[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(false);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    setPrompt(''); setResult(''); setGroundingChunks([]); setError(null);
  }, [activeTool]);

  useEffect(() => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
        setSpeechRecognitionSupported(true);
        const recognitionInstance: SpeechRecognition = new SpeechRecognitionAPI();
        recognitionInstance.continuous = false; recognitionInstance.interimResults = true;
        recognitionInstance.lang = language === 'fa' ? 'fa-IR' : 'en-US';
        recognitionInstance.onresult = (event) => setPrompt(Array.from(event.results).map(result => result[0].transcript).join(''));
        recognitionInstance.onerror = (event) => { if (event.error !== 'no-speech') setError(`${t('speechRecognitionError')}: ${event.error}`); setIsRecording(false); };
        recognitionInstance.onend = () => setIsRecording(false);
        recognitionRef.current = recognitionInstance;
    }
  }, [language, t]);

  const handleToggleRecording = () => {
    if (!recognitionRef.current) return;
    if (isRecording) recognitionRef.current.stop();
    else {
        setPrompt(''); setError(null);
        try { recognitionRef.current.start(); setIsRecording(true); } 
        catch (e: any) { setError(`${t('couldNotStartRecording')}: ${e.message}`); setIsRecording(false); }
    }
  };

  const handleSubmit = async () => {
    if (!prompt || isLoading) return;
    setIsLoading(true); setError(null); setResult(''); setGroundingChunks([]);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        let response;
        if (activeTool === 'generate') {
            const stream = await ai.models.generateContentStream({ model, contents: prompt });
            let accumulatedText = '';
            for await (const chunk of stream) {
              accumulatedText += chunk.text;
              setResult(accumulatedText);
            }
            return;
        }

        switch (activeTool) {
            case 'think': response = await ai.models.generateContent({ model: 'gemini-2.5-pro', contents: prompt, config: { thinkingConfig: { thinkingBudget: 32768 } } }); break;
            case 'superthink': response = await ai.models.generateContent({ model: 'gemini-2.5-pro', contents: prompt, config: { tools: [{ googleSearch: {} }], thinkingConfig: { thinkingBudget: 32768 } } }); break;
            case 'web': response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { tools: [{ googleSearch: {} }] } }); break;
            case 'maps':
                const position: GeolocationPosition = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject));
                response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { tools: [{ googleMaps: {} }] }, toolConfig: { retrievalConfig: { latLng: { latitude: position.coords.latitude, longitude: position.coords.longitude } } } });
                break;
        }
        setResult(response.text);
        if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
            setGroundingChunks(response.candidates[0].groundingMetadata.groundingChunks);
        }
    } catch (e: any) { setError(e.message); } finally { setIsLoading(false); }
  };
  
  const getToolDescription = () => ({
      'generate': t('textToolDescriptionGenerate'), 'think': t('textToolDescriptionThink'), 'superthink': t('textToolDescriptionSuperThink'),
      'web': t('textToolDescriptionWeb'), 'maps': t('textToolDescriptionMaps'), 'smarthome': '', 'structure': ''
  })[activeTool];

  const toolConfig = [
      { id: 'generate', name: t('textToolGenerate') }, { id: 'think', name: t('textToolThink') }, { id: 'superthink', name: t('textToolSuperThink') },
      { id: 'web', name: t('textToolWeb') }, { id: 'maps', name: t('textToolMaps') }, { id: 'smarthome', name: t('textToolSmartHome') }, { id: 'structure', name: t('textToolStructure') },
  ];

  const renderActiveTool = () => {
    if (activeTool === 'smarthome') return <SmartHomeTool />;
    if (activeTool === 'structure') return <DataStructureTool />;
    
    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-400">{getToolDescription()}</p>
            {activeTool === 'generate' && (
                <div>
                    <label htmlFor="model-select" className="block mb-2 text-sm font-medium text-gray-300">{t('modelSelectLabel')}</label>
                    <select id="model-select" value={model} onChange={e => setModel(e.target.value as GenModel)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white">
                        <option value="gemini-2.5-flash">{t('modelFlash')}</option> <option value="gemini-flash-lite-latest">{t('modelFlashLite')}</option> <option value="gemini-2.5-pro">{t('modelPro')}</option>
                    </select>
                </div>
            )}
            <div>
                <label htmlFor="text-prompt" className="block mb-2 text-sm font-medium text-gray-300">{t('promptLabel')}</label>
                <div className="relative">
                    <textarea id="text-prompt" rows={5} value={prompt} onChange={e => setPrompt(e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white ps-2 pe-12" placeholder={t('promptPlaceholder')} disabled={isLoading || isRecording} />
                    <button onClick={handleToggleRecording} disabled={isLoading || !speechRecognitionSupported} title={speechRecognitionSupported ? (isRecording ? t('stopRecording') : t('startRecording')) : t('speechRecognitionNotSupported')} className={`absolute right-2.5 top-3 p-2.5 rounded-full transition-colors ${ isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-purple-600 text-white hover:bg-purple-700' } disabled:bg-gray-600 disabled:cursor-not-allowed rtl:left-2.5 rtl:right-auto`} aria-label={isRecording ? t('stopRecording') : t('startRecording')}>
                        {isRecording ? <StopIcon className="h-5 w-5" /> : <MicIcon className="h-5 w-5" />}
                    </button>
                </div>
            </div>
            <button onClick={handleSubmit} disabled={isLoading || !prompt} className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-500">{isLoading ? <Spinner /> : t('submitButton')}</button>
            <div className="mt-6 flex-1 bg-gray-900/50 p-4 rounded-lg min-h-[10rem]">
                <h3 className="font-bold text-lg mb-2 text-purple-300">{t('resultTitle')}</h3>
                {isLoading && !result && <Spinner />} {error && <p className="text-red-400">{`${t('error')}: ${error}`}</p>}
                {result && <div className="prose prose-invert max-w-none text-gray-200 whitespace-pre-wrap">{result}</div>}
                {groundingChunks.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                        <h4 className="font-semibold text-md mb-2 text-gray-300">{t('sourcesTitle')}</h4>
                        <ul className="list-disc list-inside space-y-1">
                            {groundingChunks.map((chunk, index) => (<li key={index} className="text-sm">{chunk.web && <a href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">{chunk.web.title}</a>}{chunk.maps && <a href={chunk.maps.uri} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">{chunk.maps.title}</a>}</li>))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-800/50 rounded-lg shadow-xl">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-purple-300">{t('textToolsTitle')}</h2>
        <div className="mt-2 flex flex-nowrap gap-1 border border-gray-600 rounded-lg p-1 bg-gray-900 max-w-full overflow-x-auto">
            {toolConfig.map(tool => (
                <button key={tool.id} onClick={() => setActiveTool(tool.id as TextTool)} className={`px-3 py-1 text-sm rounded-md transition-colors whitespace-nowrap ${activeTool === tool.id ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>{tool.name}</button>
            ))}
        </div>
      </div>
      <div className="flex-1 p-4 overflow-y-auto">{renderActiveTool()}</div>
    </div>
  );
};

export default TextTools;