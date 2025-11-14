import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { useTranslation } from '../contexts/LanguageContext';
import { decode, decodeAudioData } from '../utils';
import Spinner from './Spinner';

// --- Type definitions for SpeechRecognition ---
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: any) => void) | null;
  onresult: ((event: any) => void) | null;
  start(): void;
  stop(): void;
}

// --- Icons ---
const MicIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className || "h-6 w-6"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);

const VolumeUpIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className || "h-6 w-6"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    </svg>
);

const ClipboardCopyIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className || "h-6 w-6"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const languages = [
    { code: 'en', name: 'English' }, { code: 'es', name: 'Español' }, { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' }, { code: 'it', name: 'Italiano' }, { code: 'pt', name: 'Português' },
    { code: 'nl', name: 'Nederlands' }, { code: 'ru', name: 'Русский' }, { code: 'ja', name: '日本語' },
    { code: 'ko', name: '한국어' }, { code: 'zh', name: '中文' }, { code: 'ar', name: 'العربية' },
    { code: 'hi', name: 'हिन्दी' }, { code: 'fa', name: 'فارسی' }
];

const TranslateTool: React.FC = () => {
  const { t, language } = useTranslation();
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [targetLang, setTargetLang] = useState('es');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoadingTranslation, setIsLoadingTranslation] = useState(false);
  const [isLoadingTTS, setIsLoadingTTS] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      const recognitionInstance: SpeechRecognition = new SpeechRecognitionAPI();
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = language === 'fa' ? 'fa-IR' : 'en-US';
      
      recognitionInstance.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        setSourceText(finalTranscript + interimTranscript);
      };
      
      recognitionInstance.onerror = (event) => {
        if (event.error !== 'no-speech') setError(`${t('speechRecognitionError')}: ${event.error}`);
        setIsRecording(false);
      };

      recognitionInstance.onend = () => {
        setIsRecording(false);
      };
      
      recognitionRef.current = recognitionInstance;
    }
  }, [language, t]);

  const handleTranslate = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setIsLoadingTranslation(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const targetLanguageName = languages.find(l => l.code === targetLang)?.name || targetLang;
      const prompt = `Detect the language of the following text and translate it to ${targetLanguageName}. Provide only the translation, with no additional commentary or explanation.\n\nText: "${text}"`;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      setTranslatedText(response.text);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoadingTranslation(false);
    }
  }, [targetLang]);

  useEffect(() => {
    if (!isRecording && sourceText) {
      handleTranslate(sourceText);
    }
  }, [isRecording, sourceText, handleTranslate]);


  const handleToggleRecording = () => {
    if (!recognitionRef.current) {
        setError(t('speechRecognitionNotSupported'));
        return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      setSourceText('');
      setTranslatedText('');
      setError(null);
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (e: any) {
        setError(`${t('couldNotStartRecording')}: ${e.message}`);
        setIsRecording(false);
      }
    }
  };

  const handleSpeak = async () => {
    if (!translatedText || isLoadingTTS) return;
    setIsLoadingTTS(true);
    setError(null);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: translatedText }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
            },
        });
        
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
    } catch (e: any) {
        setError(e.message);
    } finally {
        setIsLoadingTTS(false);
    }
  };

  const handleCopy = () => {
    if (!translatedText) return;
    navigator.clipboard.writeText(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-gray-800/50 rounded-lg shadow-xl">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-purple-300">{t('translateToolTitle')}</h2>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-4 p-4 overflow-y-auto">
        {/* Source Language Panel */}
        <div className="flex-1 flex flex-col bg-gray-900/50 rounded-lg p-4">
            <label className="block mb-2 text-sm font-medium text-gray-300">{t('translateFrom')}: <span className="text-purple-400 font-semibold">{t('translateDetectLanguage')}</span></label>
            <textarea
                className="flex-1 w-full p-3 bg-gray-800/60 border border-gray-700 rounded-lg focus:outline-none text-white text-lg resize-none"
                value={sourceText}
                placeholder={t('translateSourceTextPlaceholder')}
                readOnly
            />
        </div>

        {/* Target Language Panel */}
        <div className="flex-1 flex flex-col bg-gray-900/50 rounded-lg p-4">
            <label htmlFor="target-lang" className="block mb-2 text-sm font-medium text-gray-300">{t('translateTo')}:</label>
            <select
                id="target-lang"
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="w-full p-2 mb-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
            >
                {languages.map(lang => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
            </select>
            <div className="relative flex-1">
                <textarea
                    className="w-full h-full p-3 bg-gray-800/60 border border-gray-700 rounded-lg focus:outline-none text-white text-lg resize-none"
                    value={translatedText}
                    placeholder={isLoadingTranslation ? '' : t('translateTargetTextPlaceholder')}
                    readOnly
                />
                {isLoadingTranslation && <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>}
            </div>
             <div className="mt-2 flex items-center gap-2">
                <button onClick={handleSpeak} disabled={!translatedText || isLoadingTTS} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-600 transition-colors">
                    {isLoadingTTS ? <Spinner/> : <VolumeUpIcon className="h-5 w-5"/>}
                    <span>{t('translateSpeakButton')}</span>
                </button>
                <button onClick={handleCopy} disabled={!translatedText} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 transition-colors">
                    <ClipboardCopyIcon className="h-5 w-5" />
                    <span>{copied ? t('translateCopied') : t('translateCopyButton')}</span>
                </button>
            </div>
        </div>
      </div>
      
      <div className="p-4 bg-gray-800/60 rounded-b-lg border-t border-gray-700/50 flex flex-col items-center">
        {error && <p className="text-red-400 mb-2">{`${t('error')}: ${error}`}</p>}
        <button
            onClick={handleToggleRecording}
            title={isRecording ? t('stopRecording') : t('startRecording')}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ease-in-out transform hover:scale-105 ${
                isRecording
                ? 'bg-red-600 text-white animate-pulse shadow-lg shadow-red-500/50'
                : 'bg-purple-600 text-white shadow-lg shadow-purple-500/50'
            }`}
            disabled={!recognitionRef.current}
        >
            <MicIcon className="w-10 h-10" />
        </button>
      </div>

    </div>
  );
};

export default TranslateTool;
