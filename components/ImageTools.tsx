import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { fileToBase64 } from '../utils';
import Spinner from './Spinner';
import { useTranslation } from '../contexts/LanguageContext';

// Add type definitions for Web Speech API
interface SpeechRecognitionAlternative {
  readonly transcript: string;
}
interface SpeechRecognitionResult {
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
  item(index: number): SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
  item(index: number): SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
}

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

type ImageTool = 'generate' | 'edit' | 'stylize' | 'analyze' | 'recognize';
type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

const ImageTools: React.FC = () => {
  const { t, language } = useTranslation();
  const [activeTool, setActiveTool] = useState<ImageTool>('generate');
  const [prompt, setPrompt] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [isRecording, setIsRecording] = useState(false);
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(false);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  
  // Reset inputs when tool changes for better UX
  useEffect(() => {
    setPrompt('');
    setImageFile(null);
    setOriginalImageUrl(null);
    setGeneratedImageUrl(null);
    setAnalysisResult('');
    setError(null);
    setIsLoading(false);
  }, [activeTool]);

  useEffect(() => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
        setSpeechRecognitionSupported(true);
        const recognitionInstance: SpeechRecognition = new SpeechRecognitionAPI();
        recognitionInstance.continuous = false;
        recognitionInstance.interimResults = true;
        recognitionInstance.lang = language === 'fa' ? 'fa-IR' : 'en-US';

        recognitionInstance.onresult = (event) => {
            const transcript = Array.from(event.results).map(result => result[0].transcript).join('');
            setPrompt(transcript);
        };

        recognitionInstance.onerror = (event) => {
            if (event.error !== 'no-speech') {
              setError(`${t('speechRecognitionError')}: ${event.error}`);
            }
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

    if (isRecording) {
        recognitionRef.current.stop();
    } else {
        setPrompt('');
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setOriginalImageUrl(URL.createObjectURL(file));
      setGeneratedImageUrl(null);
      setAnalysisResult('');
    }
  };

  const handleSubmit = async () => {
    const needsPrompt = activeTool === 'generate' || activeTool === 'edit' || activeTool === 'stylize' || activeTool === 'analyze';
    if (needsPrompt && !prompt) {
      setError(t('errorPromptRequired'));
      return;
    }
    if ((activeTool !== 'generate') && !imageFile) {
        setError(t('errorUploadImage'));
        return;
    }
    
    setIsLoading(true);
    setError(null);
    setGeneratedImageUrl(null);
    setAnalysisResult('');
    
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

        if (activeTool === 'generate') {
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio: aspectRatio },
            });
            const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
            setGeneratedImageUrl(`data:image/jpeg;base64,${base64ImageBytes}`);
        } else if ((activeTool === 'edit' || activeTool === 'stylize') && imageFile) {
            const base64Data = await fileToBase64(imageFile);
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [ { inlineData: { data: base64Data, mimeType: imageFile.type } }, { text: prompt } ]},
                config: { responseModalities: [Modality.IMAGE] },
            });
            const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (imagePart?.inlineData) {
                setGeneratedImageUrl(`data:image/png;base64,${imagePart.inlineData.data}`);
            } else {
                setError("Could not process the image. The model didn't return an image.");
            }
        } else if ((activeTool === 'analyze' || activeTool === 'recognize') && imageFile) {
            const base64Data = await fileToBase64(imageFile);
            const finalPrompt = activeTool === 'recognize'
                ? t('recognizeInternalPrompt')
                : prompt;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: { parts: [ { inlineData: { data: base64Data, mimeType: imageFile.type } }, { text: finalPrompt } ]},
            });
            setAnalysisResult(response.text);
        }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const renderToolUI = () => {
    const getPromptLabel = () => {
        switch (activeTool) {
            case 'generate': return t('promptLabelGenerate');
            case 'edit': return t('promptLabelEdit');
            case 'stylize': return t('promptLabelStylize');
            case 'analyze': return t('promptLabelAnalyze');
            default: return '';
        }
    };
    
    const getPlaceholder = () => {
         switch (activeTool) {
            case 'generate': return t('promptPlaceholderGenerate');
            case 'edit': return t('promptPlaceholderEdit');
            case 'stylize': return t('promptPlaceholderStylize');
            case 'analyze': return t('promptPlaceholderAnalyze');
            default: return '';
        }
    }

    const stylizeExamples = [
      { key: 'stylizeExample1', text: t('stylizeExample1') },
      { key: 'stylizeExample2', text: t('stylizeExample2') },
      { key: 'stylizeExample3', text: t('stylizeExample3') },
      { key: 'stylizeExample4', text: t('stylizeExample4') },
    ];

    return (
        <div className="space-y-4">
            {(activeTool !== 'generate') && (
                <div>
                    <label className="block mb-2 text-sm font-medium text-gray-300">{t('uploadImageLabel')}</label>
                    <input type="file" accept="image/*" onChange={handleFileChange} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 rtl:file:ml-4 rtl:file:mr-0"/>
                </div>
            )}
            { activeTool !== 'recognize' && 
              <div>
                  <label htmlFor="prompt" className="block mb-2 text-sm font-medium text-gray-300">
                      {getPromptLabel()}
                  </label>
                  <div className="relative">
                      <textarea 
                          id="prompt" 
                          rows={3} 
                          value={prompt} 
                          onChange={(e) => setPrompt(e.target.value)} 
                          className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white ps-2 pe-12" 
                          placeholder={getPlaceholder()}
                          disabled={isLoading || isRecording}
                      />
                      <button
                          onClick={handleToggleRecording}
                          disabled={isLoading || !speechRecognitionSupported}
                          title={speechRecognitionSupported ? (isRecording ? t('stopRecording') : t('startRecording')) : t('speechRecognitionNotSupported')}
                          className={`absolute right-2.5 top-3 p-2.5 rounded-full transition-colors ${ isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-purple-600 text-white hover:bg-purple-700' } disabled:bg-gray-600 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-purple-500 rtl:left-2.5 rtl:right-auto`}
                          aria-label={isRecording ? t('stopRecording') : t('startRecording')}
                      >
                          {isRecording ? <StopIcon className="h-5 w-5" /> : <MicIcon className="h-5 w-5" />}
                      </button>
                  </div>

                  {activeTool === 'stylize' && (
                      <div className="mt-2 flex flex-wrap gap-2 items-center">
                          <span className="text-xs text-gray-400 font-medium">{t('stylizeExampleTry')}</span>
                          {stylizeExamples.map(ex => (
                              <button key={ex.key} onClick={() => setPrompt(ex.text)} className="px-3 py-1 bg-gray-600/50 hover:bg-purple-600 text-gray-200 text-xs rounded-full transition-colors">
                                  {ex.text}
                              </button>
                          ))}
                      </div>
                  )}
              </div>
            }
            {activeTool === 'recognize' && <p className="text-sm text-gray-400">{t('recognizeDescription')}</p>}

            {activeTool === 'generate' && (
                <div>
                    <label htmlFor="aspectRatio" className="block mb-2 text-sm font-medium text-gray-300">{t('aspectRatioLabel')}</label>
                    <select id="aspectRatio" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white">
                        <option value="1:1">{t('aspectRatioSquare')}</option>
                        <option value="16:9">{t('aspectRatioWidescreen')}</option>
                        <option value="9:16">{t('aspectRatioPortrait')}</option>
                        <option value="4:3">{t('aspectRatioStandard')}</option>
                        <option value="3:4">{t('aspectRatioTall')}</option>
                    </select>
                </div>
            )}
            <button onClick={handleSubmit} disabled={isLoading || isRecording} className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors">
                {isLoading ? <Spinner /> : (activeTool === 'recognize' ? t('recognizeButton') : t('executeButton'))}
            </button>
        </div>
    );
  };

  const renderResults = () => {
    const getResultTitle = () => {
        switch (activeTool) {
            case 'edit': return t('resultsTitleEdited');
            case 'stylize': return t('resultsTitleStylized');
            case 'analyze': return t('resultsTitleAnalysis');
            case 'recognize': return t('resultsTitleAnalysis');
            default: return t('resultsTitleResult');
        }
    }

    return (
      <div className="mt-6 flex-1 flex flex-col items-center justify-center bg-gray-900/50 p-4 rounded-lg">
        {isLoading && <Spinner />}
        {error && <p className="text-red-400">{`${t('error')}: ${error}`}</p>}
        
        {activeTool === 'generate' && generatedImageUrl && (
            <img src={generatedImageUrl} alt="Generated" className="max-w-full max-h-96 rounded-lg shadow-lg" />
        )}

        {(activeTool !== 'generate' && (originalImageUrl || generatedImageUrl || analysisResult)) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {originalImageUrl && (
                    <div className="text-center">
                        <h3 className="text-lg font-semibold mb-2 text-gray-300">{t('resultsTitleOriginal')}</h3>
                        <img src={originalImageUrl} alt="Original" className="max-w-full max-h-80 rounded-lg shadow-lg mx-auto" />
                    </div>
                )}
                <div className="text-center">
                    <h3 className="text-lg font-semibold mb-2 text-gray-300">{getResultTitle()}</h3>
                    {(activeTool === 'edit' || activeTool === 'stylize') && generatedImageUrl && <img src={generatedImageUrl} alt="Processed" className="max-w-full max-h-80 rounded-lg shadow-lg mx-auto" />}
                    {(activeTool === 'analyze' || activeTool === 'recognize') && analysisResult && <p className="text-left p-4 bg-gray-800 rounded-lg whitespace-pre-wrap rtl:text-right">{analysisResult}</p>}
                </div>
            </div>
        )}

        {!isLoading && !error && !generatedImageUrl && !analysisResult && !(originalImageUrl && activeTool !== 'generate') && (
            <div className="text-center text-gray-500">
                <p>{t('resultsPlaceholder')}</p>
            </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-gray-800/50 rounded-lg shadow-xl">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-purple-300">{t('imageToolsTitle')}</h2>
        <div className="mt-2 flex flex-nowrap gap-1 border border-gray-600 rounded-lg p-1 bg-gray-900 max-w-full overflow-x-auto">
          <button onClick={() => setActiveTool('generate')} className={`px-3 py-1 text-sm rounded-md transition-colors whitespace-nowrap ${activeTool === 'generate' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>{t('imageToolGenerate')}</button>
          <button onClick={() => setActiveTool('edit')} className={`px-3 py-1 text-sm rounded-md transition-colors whitespace-nowrap ${activeTool === 'edit' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>{t('imageToolEdit')}</button>
          <button onClick={() => setActiveTool('stylize')} className={`px-3 py-1 text-sm rounded-md transition-colors whitespace-nowrap ${activeTool === 'stylize' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>{t('imageToolStylize')}</button>
          <button onClick={() => setActiveTool('analyze')} className={`px-3 py-1 text-sm rounded-md transition-colors whitespace-nowrap ${activeTool === 'analyze' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>{t('imageToolAnalyze')}</button>
          <button onClick={() => setActiveTool('recognize')} className={`px-3 py-1 text-sm rounded-md transition-colors whitespace-nowrap ${activeTool === 'recognize' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>{t('imageToolRecognize')}</button>
        </div>
      </div>
      <div className="flex-1 flex flex-col p-4 overflow-y-auto">
        {renderToolUI()}
        {renderResults()}
      </div>
    </div>
  );
};

export default ImageTools;