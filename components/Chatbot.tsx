import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';
import { GoogleGenAI, Chat, GenerateContentResponse } from '@google/genai';
import { useTranslation } from '../contexts/LanguageContext';

// Add type definitions for Web Speech API
interface SpeechRecognitionAlternative { readonly transcript: string; }
interface SpeechRecognitionResult { readonly length: number; [index: number]: SpeechRecognitionAlternative; item(index: number): SpeechRecognitionAlternative; }
interface SpeechRecognitionResultList { readonly length: number; [index: number]: SpeechRecognitionResult; item(index: number): SpeechRecognitionResult; }
interface SpeechRecognitionEvent extends Event { readonly results: SpeechRecognitionResultList; }
interface SpeechRecognitionErrorEvent extends Event { readonly error: string; }
interface SpeechRecognition extends EventTarget { continuous: boolean; interimResults: boolean; lang: string; onend: (() => void) | null; onerror: ((event: SpeechRecognitionErrorEvent) => void) | null; onresult: ((event: SpeechRecognitionEvent) => void) | null; start(): void; stop(): void; }

// --- ICONS ---
const MicIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className || "h-6 w-6"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);

const StopIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className || "h-6 w-6"} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

const SendIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className || "h-6 w-6"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
);

const GeminiLogo: React.FC = () => (
  <svg width="80" height="80" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="opacity-70">
    <defs>
        <linearGradient id="gemini-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{stopColor: '#8E44AD', stopOpacity: 1}} />
            <stop offset="100%" style={{stopColor: '#3498DB', stopOpacity: 1}} />
        </linearGradient>
    </defs>
    <path fill="url(#gemini-gradient)" d="M12 2.25a.75.75 0 0 1 .75.75v5.06l3.2-3.2a.75.75 0 0 1 1.06 1.06l-3.2 3.2h5.06a.75.75 0 0 1 0 1.5H13.81l3.2 3.2a.75.75 0 1 1-1.06 1.06l-3.2-3.2v5.06a.75.75 0 0 1-1.5 0v-5.06l-3.2 3.2a.75.75 0 1 1-1.06-1.06l3.2-3.2H4.75a.75.75 0 0 1 0-1.5h5.06l-3.2-3.2a.75.75 0 0 1 1.06-1.06l3.2 3.2V3a.75.75 0 0 1 .75-.75Z" />
</svg>
);

const GeminiMessageIcon: React.FC = () => (
    <div className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-400 mr-3 rtl:ml-3 rtl:mr-0">
         <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="white" d="M12 2.25a.75.75 0 0 1 .75.75v5.06l3.2-3.2a.75.75 0 0 1 1.06 1.06l-3.2 3.2h5.06a.75.75 0 0 1 0 1.5H13.81l3.2 3.2a.75.75 0 1 1-1.06 1.06l-3.2-3.2v5.06a.75.75 0 0 1-1.5 0v-5.06l-3.2 3.2a.75.75 0 1 1-1.06-1.06l3.2-3.2H4.75a.75.75 0 0 1 0-1.5h5.06l-3.2-3.2a.75.75 0 0 1 1.06-1.06l3.2 3.2V3a.75.75 0 0 1 .75-.75Z" />
        </svg>
    </div>
);

// --- UI COMPONENTS ---
const TypingIndicator: React.FC = () => (
    <div className="flex items-center space-x-1.5 rtl:space-x-reverse">
        <div className="w-2 h-2 bg-purple-300 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
        <div className="w-2 h-2 bg-purple-300 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
        <div className="w-2 h-2 bg-purple-300 rounded-full animate-pulse"></div>
    </div>
);

const Chatbot: React.FC = () => {
  const { t, language } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(false);
  
  const chatRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);
  
  useEffect(() => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      chatRef.current = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: { systemInstruction: 'You are a helpful and friendly assistant. Keep your responses concise and informative.' },
      });
    } catch (e: any) { setError(e.message); }

    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
        setSpeechRecognitionSupported(true);
        const recognitionInstance: SpeechRecognition = new SpeechRecognitionAPI();
        recognitionInstance.continuous = false;
        recognitionInstance.interimResults = true;
        recognitionInstance.lang = language === 'fa' ? 'fa-IR' : 'en-US';
        recognitionInstance.onresult = (event) => setInput(Array.from(event.results).map(result => result[0].transcript).join(''));
        recognitionInstance.onerror = (event) => {
            if (event.error !== 'no-speech') setError(`${t('speechRecognitionError')}: ${event.error}`);
            setIsRecording(false);
        };
        recognitionInstance.onend = () => setIsRecording(false);
        recognitionRef.current = recognitionInstance;
    } else {
        setSpeechRecognitionSupported(false);
    }
  }, [language, t]);

  const handleToggleRecording = () => {
    if (!recognitionRef.current) return;
    if (isRecording) recognitionRef.current.stop();
    else {
        setInput('');
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

  const handleSend = async () => {
    if (!input.trim() || isLoading || !chatRef.current) return;

    const userMessage: ChatMessage = { role: 'user', text: input };
    const modelPlaceholder: ChatMessage = { role: 'model', text: '' };
    setMessages((prev) => [...prev, userMessage, modelPlaceholder]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const stream = await chatRef.current.sendMessageStream({ message: input });
      let accumulatedText = '';

      for await (const chunk of stream) {
        accumulatedText += chunk.text;
        setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = { role: 'model', text: accumulatedText };
            return newMessages;
        });
      }
    } catch (e: any) {
      setError(e.message);
      // Remove placeholder on error
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-800/50 rounded-lg shadow-xl">
      <div className="flex-1 p-4 overflow-y-auto">
        {messages.length === 0 && !isLoading && (
          <div className="flex h-full flex-col justify-center items-center text-gray-500">
            <GeminiLogo />
            <p className="mt-4 text-xl font-semibold">{t('chatbotWelcome')}</p>
            <p className="text-gray-400">{t('chatbotWelcomeSub')}</p>
          </div>
        )}
        <div className="space-y-6">
          {messages.map((msg, index) => {
            if (msg.role === 'model' && msg.text === '' && isLoading) {
              return (
                <div key={index} className="flex items-start animate-fade-in-up">
                  <GeminiMessageIcon />
                  <div className="max-w-lg p-3 px-4 rounded-2xl bg-gray-700 text-gray-200 rounded-bl-none rtl:rounded-br-none rtl:rounded-bl-2xl">
                    <TypingIndicator />
                  </div>
                </div>
              );
            }
            return (
               <div key={index} className={`flex items-start animate-fade-in-up ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'model' && <GeminiMessageIcon />}
                  <div className={`max-w-lg p-3 px-4 rounded-2xl ${msg.role === 'user' ? 'bg-gradient-to-br from-purple-600 to-blue-500 text-white rounded-br-none rtl:rounded-bl-none rtl:rounded-br-2xl' : 'bg-gray-700 text-gray-200 rounded-bl-none rtl:rounded-br-none rtl:rounded-bl-2xl'}`}>
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>
       {error && <div className="p-4 text-red-400 border-t border-gray-700/50">{`${t('error')}: ${error}`}</div>}
      <div className="p-4 bg-gray-800/60 rounded-b-lg">
        <div className="flex items-center space-x-2 rtl:space-x-reverse bg-gray-900/50 rounded-lg p-1.5 shadow-inner">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder={t('chatbotInputPlaceholder')}
            className="flex-1 p-2 bg-transparent focus:outline-none text-white placeholder-gray-500"
            disabled={isLoading || isRecording}
          />
          <button
            onClick={handleToggleRecording}
            disabled={isLoading || !speechRecognitionSupported}
            title={speechRecognitionSupported ? (isRecording ? t('stopRecording') : t('startRecording')) : t('speechRecognitionNotSupported')}
            className={`p-2.5 rounded-full transition-colors ${ isRecording ? 'bg-red-600 text-white animate-pulse' : 'text-gray-500 hover:bg-purple-600 hover:text-white' } disabled:text-gray-600 disabled:cursor-not-allowed`}
            aria-label={isRecording ? t('stopRecording') : t('startRecording')}
          >
            {isRecording ? <StopIcon className="h-5 w-5" /> : <MicIcon className="h-5 w-5" />}
          </button>
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="p-2.5 bg-purple-600 text-white rounded-full hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all"
             aria-label={t('sendButton')}
          >
            <SendIcon className="h-5 w-5"/>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;