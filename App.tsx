import React, { useState } from 'react';
import { Tool } from './types';
import Chatbot from './components/Chatbot';
import ImageTools from './components/ImageTools';
import VideoTools from './components/VideoTools';
import AudioTools from './components/AudioTools';
import TextTools from './components/TextTools';
import TranslateTool from './components/TranslateTool';
import { useTranslation } from './contexts/LanguageContext';

const App: React.FC = () => {
  const [activeTool, setActiveTool] = useState<Tool>(Tool.Chat);
  const { language, setLanguage, t } = useTranslation();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'fa' : 'en');
  };

  const renderActiveTool = () => {
    switch (activeTool) {
      case Tool.Chat:
        return <Chatbot />;
      case Tool.Image:
        return <ImageTools />;
      case Tool.Video:
        return <VideoTools />;
      case Tool.Audio:
        return <AudioTools />;
      case Tool.Text:
        return <TextTools />;
      case Tool.Translate:
        return <TranslateTool />;
      default:
        return <Chatbot />;
    }
  };

  const toolConfig = [
    { id: Tool.Chat, name: t('navChat'), icon: <MessageSquareIcon /> },
    { id: Tool.Text, name: t('navText'), icon: <FileTextIcon /> },
    { id: Tool.Image, name: t('navImage'), icon: <ImageIcon /> },
    { id: Tool.Video, name: t('navVideo'), icon: <VideoIcon /> },
    { id: Tool.Audio, name: t('navAudio'), icon: <MicIcon /> },
    { id: Tool.Translate, name: t('navTranslate'), icon: <TranslateIcon /> },
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
      <header className="flex items-center justify-between p-4 bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 shadow-lg shrink-0">
        <div className="flex items-center">
           <GoogleIcon />
           <div className="ms-3 flex flex-col">
             <h1 className="text-xl font-bold text-purple-300 leading-tight">{t('appTitle')}</h1>
             <p className="text-xs text-gray-400">Credit by : Emin .H .M</p>
             <a href="https://t.me/Emin_h_m" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-purple-300 hover:underline transition-colors">
                Telegram Contact
             </a>
           </div>
        </div>
        
        <nav className="hidden md:flex items-center gap-1">
          {toolConfig.map(tool => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={`flex items-center px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                activeTool === tool.id
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {tool.icon}
              <span className="ms-1.5">{tool.name}</span>
            </button>
          ))}
        </nav>

        <div>
            <button
              onClick={toggleLanguage}
              className="flex items-center p-2 rounded-lg transition-colors text-gray-400 hover:bg-gray-800 hover:text-white"
              aria-label={t('languageToggle')}
              title={t('languageToggle')}
            >
              <GlobeIcon />
              <span className="ms-2 font-medium text-sm">{language === 'en' ? 'فارسی' : 'English'}</span>
            </button>
        </div>
      </header>

      {/* Mobile Navigation */}
      <nav className="md:hidden flex items-center justify-center gap-2 p-2 bg-gray-900 border-b border-gray-800 overflow-x-auto">
          {toolConfig.map(tool => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={`flex flex-col items-center px-3 py-1.5 rounded-lg transition-colors text-xs font-medium shrink-0 ${
                activeTool === tool.id
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {tool.icon}
              <span className="mt-1">{tool.name}</span>
            </button>
          ))}
      </nav>

      <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
        {renderActiveTool()}
      </main>
    </div>
  );
};

// SVG Icons
const GoogleIcon: React.FC = () => (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25C22.56 11.45 22.49 10.65 22.36 9.87H12V14.26H18.15C17.84 15.82 17.06 17.12 15.75 17.98V20.61H19.5C21.43 18.79 22.56 15.81 22.56 12.25Z" fill="#4285F4"/>
      <path d="M12 23C15.24 23 17.98 21.94 19.92 20.18L15.75 17.98C14.79 18.62 13.51 19.04 12 19.04C9.13 19.04 6.69 17.29 5.83 14.86H1.94V17.55C3.88 20.88 7.66 23 12 23Z" fill="#34A853"/>
      <path d="M5.83 14.86C5.6 14.19 5.46 13.48 5.46 12.75C5.46 12.02 5.6 11.31 5.83 10.64V7.95H1.94C1.22 9.29 0.81 10.82 0.81 12.75C0.81 14.68 1.22 16.21 1.94 17.55L5.83 14.86Z" fill="#FBBC05"/>
      <path d="M12 5.96C13.68 5.96 15.04 6.6 15.93 7.45L19.59 4.11C17.9 2.5 15.24 1.5 12 1.5C7.66 1.5 3.88 3.62 1.94 6.95L5.83 9.64C6.69 7.21 9.13 5.96 12 5.96Z" fill="#EA4335"/>
    </svg>
);
const GlobeIcon: React.FC = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9V3m0 18a9 9 0 00-9-9m-9 9h18"></path>
    </svg>
);
const MessageSquareIcon: React.FC = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"></path></svg>
);
const ImageIcon: React.FC = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><circle cx="12" cy="13" r="3"></circle></svg>
);
const VideoIcon: React.FC = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
);
const MicIcon: React.FC = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
);
const FileTextIcon: React.FC = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
);
const TranslateIcon: React.FC = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5L6 9H2v6h4l5 4V5z"/>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5h5m-2.5 0v14m-3-6.5h7"/>
    </svg>
);


export default App;