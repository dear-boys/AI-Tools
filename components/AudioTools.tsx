import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Modality, Blob, LiveSession, LiveServerMessage } from '@google/genai';
import { decode, encode, decodeAudioData, fileToBase64, blobToBase64 } from '../utils';
import Spinner from './Spinner';
import { useTranslation } from '../contexts/LanguageContext';

type AudioTool = 'live' | 'visual' | 'transcribe' | 'tts' | 'script';

const VoiceChat: React.FC = () => {
    const { t } = useTranslation();
    const [isLive, setIsLive] = useState(false);
    const [transcriptions, setTranscriptions] = useState<{user: string, model: string}[]>([]);
    const [error, setError] = useState<string | null>(null);

    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const playingSources = useRef<Set<AudioBufferSourceNode>>(new Set());

    const stopConversation = useCallback(() => {
        if(sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => session.close());
            sessionPromiseRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();
        if (sourceRef.current) sourceRef.current.disconnect();
        if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
        if (outputAudioContextRef.current?.state !== 'closed') outputAudioContextRef.current?.close();
        playingSources.current.forEach(source => source.stop());
        playingSources.current.clear();
        nextStartTimeRef.current = 0;
        setIsLive(false);
    }, []);

    const startConversation = async () => {
        if (isLive) return;
        setIsLive(true); setError(null); setTranscriptions([]);
        
        let currentInputTranscription = '', currentOutputTranscription = '';

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                    systemInstruction: 'You are a helpful AI assistant.',
                    inputAudioTranscription: {}, outputAudioTranscription: {},
                },
                callbacks: {
                    onopen: async () => {
                        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                        sourceRef.current = audioContextRef.current.createMediaStreamSource(streamRef.current);
                        scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current.onaudioprocess = (e) => {
                            const inputData = e.inputBuffer.getChannelData(0);
                            const pcmBlob: Blob = { data: encode(new Uint8Array(new Int16Array(inputData.map(x => x * 32768)).buffer)), mimeType: 'audio/pcm;rate=16000' };
                            sessionPromiseRef.current?.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                        };
                        sourceRef.current.connect(scriptProcessorRef.current);
                        scriptProcessorRef.current.connect(audioContextRef.current.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.inputTranscription) currentInputTranscription += message.serverContent.inputTranscription.text;
                        if (message.serverContent?.outputTranscription) currentOutputTranscription += message.serverContent.outputTranscription.text;
                        if (message.serverContent?.turnComplete) {
                            setTranscriptions(prev => [...prev, {user: currentInputTranscription, model: currentOutputTranscription}]);
                            currentInputTranscription = ''; currentOutputTranscription = '';
                        }
                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio && outputAudioContextRef.current) {
                            const ctx = outputAudioContextRef.current;
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                            const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                            const source = ctx.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(ctx.destination);
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            playingSources.current.add(source);
                            source.onended = () => playingSources.current.delete(source);
                        }
                        if (message.serverContent?.interrupted) {
                            playingSources.current.forEach(source => source.stop());
                            playingSources.current.clear();
                            nextStartTimeRef.current = 0;
                        }
                    },
                    onerror: (e) => { setError(`Live session error: ${e.type}`); stopConversation(); },
                    onclose: () => stopConversation(),
                },
            });
        } catch (e: any) { setError(e.message); stopConversation(); }
    };
    useEffect(() => { return () => stopConversation() }, [stopConversation]);
    return (
        <div className="space-y-4">
            <button onClick={isLive ? stopConversation : startConversation} className={`w-full py-3 text-lg font-bold rounded-lg transition-colors ${isLive ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'} text-white`}>
                {isLive ? t('liveStopButton') : t('liveStartButton')}
            </button>
            {isLive && (<div className="flex items-center justify-center p-4 bg-gray-900/50 rounded-lg"><div className="w-4 h-4 bg-red-500 rounded-full animate-pulse me-2"></div><span className="text-red-400">{t('liveListening')}</span></div>)}
            {error && <p className="text-red-400 text-center">{`${t('error')}: ${error}`}</p>}
            <div className="h-64 overflow-y-auto p-4 bg-gray-900 rounded-lg space-y-4">
                {transcriptions.length === 0 && <p className="text-gray-500 text-center">{t('voiceChatPlaceholder')}</p>}
                {transcriptions.map((t, i) => (<div key={i}><p><strong className="text-purple-300">{t('liveYou')}</strong> {t.user}</p><p><strong className="text-teal-300">{t('liveGemini')}</strong> {t.model}</p></div>))}
            </div>
        </div>
    );
};

const VisualAssistant: React.FC = () => {
    const { t } = useTranslation();
    const [isLive, setIsLive] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const intervalRef = useRef<number | null>(null);
    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    
    const stopSession = useCallback(() => {
        if(intervalRef.current) clearInterval(intervalRef.current);
        if(sessionPromiseRef.current) sessionPromiseRef.current.then(session => session.close());
        if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
        if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();
        if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
        setIsLive(false);
    }, []);

    const startSession = async () => {
        setIsLive(true); setError(null);
        try {
            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            if (videoRef.current) videoRef.current.srcObject = streamRef.current;
            
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: { responseModalities: [Modality.AUDIO] },
                callbacks: {
                    onopen: () => {
                        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                        const source = audioContextRef.current.createMediaStreamSource(streamRef.current!);
                        scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current.onaudioprocess = (e) => {
                            const pcmBlob: Blob = { data: encode(new Uint8Array(new Int16Array(e.inputBuffer.getChannelData(0).map(x => x * 32768)).buffer)), mimeType: 'audio/pcm;rate=16000' };
                            sessionPromiseRef.current?.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                        };
                        source.connect(scriptProcessorRef.current);
                        scriptProcessorRef.current.connect(audioContextRef.current.destination);

                        intervalRef.current = window.setInterval(() => {
                           if (videoRef.current && canvasRef.current) {
                               const ctx = canvasRef.current.getContext('2d');
                               canvasRef.current.width = videoRef.current.videoWidth;
                               canvasRef.current.height = videoRef.current.videoHeight;
                               ctx?.drawImage(videoRef.current, 0, 0, videoRef.current.videoWidth, videoRef.current.videoHeight);
                               canvasRef.current.toBlob(async blob => {
                                   if (blob) {
                                       const base64Data = await blobToBase64(blob);
                                       sessionPromiseRef.current?.then(session => session.sendRealtimeInput({ media: { data: base64Data, mimeType: 'image/jpeg' }}));
                                   }
                               }, 'image/jpeg', 0.8);
                           }
                        }, 1000); // Send frame every second
                    },
                    onmessage: (msg: LiveServerMessage) => { /* Audio output not handled in this simplified example */ },
                    onerror: (e) => { setError(e.type); stopSession(); },
                    onclose: stopSession,
                }
            });
        } catch (e: any) { setError(e.message); stopSession(); }
    };

    useEffect(() => () => stopSession(), [stopSession]);
    return (
        <div className="space-y-4">
             <button onClick={isLive ? stopSession : startSession} className={`w-full py-3 text-lg font-bold rounded-lg transition-colors ${isLive ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'} text-white`}>
                {isLive ? t('liveStopButton') : t('visualStartButton')}
            </button>
            <div className="bg-black rounded-lg overflow-hidden aspect-video">
                 <video ref={videoRef} autoPlay muted className="w-full h-full object-cover" />
            </div>
            {error && <p className="text-red-400 text-center">{`${t('error')}: ${error}`}</p>}
            <canvas ref={canvasRef} className="hidden"></canvas>
        </div>
    );
};

const AudioTranscriber: React.FC = () => {
    const { t } = useTranslation();
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [transcription, setTranscription] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setAudioFile(e.target.files[0]); setTranscription('');
        }
    };
    const handleTranscribe = async () => {
        if (!audioFile || isLoading) return;
        setIsLoading(true); setError(null);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const base64Data = await fileToBase64(audioFile);
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: { parts: [ { inlineData: { data: base64Data, mimeType: audioFile.type } }, { text: "Transcribe this audio file." } ] }
            });
            setTranscription(response.text);
        } catch (e: any) { setError(e.message); } finally { setIsLoading(false); }
    };
    return (
        <div className="space-y-4">
            <label className="block mb-2 text-sm font-medium text-gray-300">{t('transcribeUploadLabel')}</label>
            <input type="file" accept="audio/*" onChange={handleFileChange} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 rtl:file:ml-4 rtl:file:mr-0"/>
            <button onClick={handleTranscribe} disabled={!audioFile || isLoading} className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors">
                {isLoading ? <Spinner /> : t('transcribeButton')}
            </button>
            {error && <p className="text-red-400 text-center">{`${t('error')}: ${error}`}</p>}
            {transcription && (
                <div className="p-4 bg-gray-900 rounded-lg">
                    <h3 className="font-bold text-lg mb-2 text-purple-300">{t('transcriptionTitle')}</h3>
                    <p className="whitespace-pre-wrap">{transcription}</p>
                </div>
            )}
        </div>
    );
};

const TextToSpeech: React.FC<{isMultiSpeaker: boolean}> = ({ isMultiSpeaker }) => {
    const { t } = useTranslation();
    const [text, setText] = useState(isMultiSpeaker ? "Joe: How's it going today Jane?\nJane: Not too bad, how about you?" : "");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    const handleSpeak = async () => {
        if (!text || isLoading) return;
        setIsLoading(true); setError(null);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const payload: any = {
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ parts: [{ text: text }] }],
                config: { responseModalities: [Modality.AUDIO] }
            };

            if (isMultiSpeaker) {
                payload.config.speechConfig = { multiSpeakerVoiceConfig: { speakerVoiceConfigs: [
                    { speaker: 'Joe', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                    { speaker: 'Jane', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
                ]}};
            } else {
                payload.config.speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } };
            }

            const response = await ai.models.generateContent(payload);
            const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
                if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                }
                const ctx = audioContextRef.current;
                const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                source.start();
            } else { throw new Error("No audio data received from API."); }
        } catch (e: any) { setError(e.message); } finally { setIsLoading(false); }
    };
    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-400">{isMultiSpeaker ? t('scriptReaderDescription') : t('ttsDescription')}</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={isMultiSpeaker ? 8: 4} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white" placeholder={isMultiSpeaker ? t('scriptReaderPlaceholder') : t('ttsPlaceholder')}></textarea>
            <button onClick={handleSpeak} disabled={!text || isLoading} className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors">
                {isLoading ? <Spinner /> : t('ttsSpeakButton')}
            </button>
            {error && <p className="text-red-400 text-center">{`${t('error')}: ${error}`}</p>}
        </div>
    );
};

const AudioTools: React.FC = () => {
  const { t } = useTranslation();
  const [activeTool, setActiveTool] = useState<AudioTool>('live');

  const renderActiveTool = () => {
    switch (activeTool) {
      case 'live': return <VoiceChat />;
      case 'visual': return <VisualAssistant />;
      case 'transcribe': return <AudioTranscriber />;
      case 'tts': return <TextToSpeech isMultiSpeaker={false} />;
      case 'script': return <TextToSpeech isMultiSpeaker={true} />;
      default: return null;
    }
  };
  
  const toolConfig = [
      { id: 'live', name: t('audioToolVoiceChat') },
      { id: 'visual', name: t('audioToolVisualAssistant') },
      { id: 'transcribe', name: t('audioToolTranscribe') },
      { id: 'tts', name: t('audioToolTTS') },
      { id: 'script', name: t('audioToolScriptReader') },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-800/50 rounded-lg shadow-xl">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-purple-300">{t('audioToolsTitle')}</h2>
        <div className="mt-2 flex flex-nowrap gap-1 border border-gray-600 rounded-lg p-1 bg-gray-900 max-w-full overflow-x-auto">
            {toolConfig.map(tool => (
              <button key={tool.id} onClick={() => setActiveTool(tool.id as AudioTool)} className={`px-3 py-1 text-sm rounded-md transition-colors whitespace-nowrap ${activeTool === tool.id ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>{tool.name}</button>
            ))}
        </div>
      </div>
      <div className="flex-1 p-4 overflow-y-auto">
        {renderActiveTool()}
      </div>
    </div>
  );
};

export default AudioTools;