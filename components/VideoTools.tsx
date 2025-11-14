import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, VideoGenerationReferenceImage, VideoGenerationReferenceType } from '@google/genai';
import { fileToBase64 } from '../utils';
import Spinner from './Spinner';
import { useTranslation } from '../contexts/LanguageContext';

type VideoTool = 'generate' | 'analyze';
type AspectRatio = "16:9" | "9:16";
type VideoModel = 'veo-3.1-fast-generate-preview' | 'veo-3.1-generate-preview';
type GeneratedVideo = {
    uri: string;
    video: any; // Storing the video object from the API for extension
    aspectRatio: AspectRatio;
};


const VideoTools: React.FC = () => {
  const { t } = useTranslation();
  const [activeTool, setActiveTool] = useState<VideoTool>('generate');
  const [prompt, setPrompt] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [refImageFiles, setRefImageFiles] = useState<File[]>([]);
  const [refImageUrls, setRefImageUrls] = useState<string[]>([]);
  const [generatedVideo, setGeneratedVideo] = useState<GeneratedVideo | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [videoModel, setVideoModel] = useState<VideoModel>('veo-3.1-fast-generate-preview');
  const [apiKeySelected, setApiKeySelected] = useState(false);
  const [extendPrompt, setExtendPrompt] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);

  const checkApiKey = useCallback(async () => {
    // @ts-ignore
    if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        // @ts-ignore
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setApiKeySelected(hasKey);
    } else {
        console.warn("aistudio not found. Assuming API key is set in environment.");
        setApiKeySelected(true);
    }
  }, []);

  useEffect(() => {
    if (activeTool === 'generate') {
        checkApiKey();
    }
  }, [activeTool, checkApiKey]);
  
  useEffect(() => {
    setPrompt('');
    setVideoFile(null);
    setGeneratedVideo(null);
    setRefImageFiles([]);
    setRefImageUrls([]);
    setAnalysisResult('');
    setError(null);
    setIsLoading(false);
    setExtendPrompt('');
  }, [activeTool]);

  useEffect(() => {
    // When multiple reference images are added, enforce model constraints
    if (refImageFiles.length > 1) {
        setVideoModel('veo-3.1-generate-preview');
        setAspectRatio('16:9');
    }
  }, [refImageFiles]);

  const handleSelectApiKey = async () => {
    // @ts-ignore
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
        try {
            // @ts-ignore
            await window.aistudio.openSelectKey();
            setApiKeySelected(true);
        } catch (e: any) {
            setError("Failed to open API key selection dialog.");
        }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setGeneratedVideo({ uri: url, video: null, aspectRatio: '16:9' });
      setAnalysisResult('');
    }
  };

  const handleRefImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
        // FIX: Use spread syntax to convert FileList to Array to ensure proper type inference.
        const files = [...e.target.files].slice(0, 3); // Max 3 files
        setRefImageFiles(files);
        const urls = files.map(file => URL.createObjectURL(file));
        setRefImageUrls(urls);
    }
  };

  const processVideoGeneration = async (payload: any) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    let operation = await ai.models.generateVideos(payload);

    const loadingMessages = t('loadingMessagesVideo').split(',');
    let msgIndex = 0;

    while (!operation.done) {
        setLoadingMessage(loadingMessages[msgIndex % loadingMessages.length].trim());
        msgIndex++;
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation });
    }
    
    if(operation.error) throw new Error(operation.error.message);
    const videoData = operation.response?.generatedVideos?.[0];
    if (videoData?.video?.uri) {
        setLoadingMessage(t('loadingMessageDownloading'));
        const response = await fetch(`${videoData.video.uri}&key=${process.env.API_KEY as string}`);
        const blob = await response.blob();
        setGeneratedVideo({
            uri: URL.createObjectURL(blob),
            video: videoData.video,
            aspectRatio: payload.config.aspectRatio,
        });
    } else {
        throw new Error("Video generation completed, but no download link was found.");
    }
  }

  const generateVideo = async () => {
    setLoadingMessage(t('loadingMessageInitializing'));
    try {
        const payload: any = {
            model: videoModel,
            prompt: prompt,
            config: { numberOfVideos: 1, resolution: '720p', aspectRatio: aspectRatio }
        };

        if (refImageFiles.length > 0) {
            if(refImageFiles.length === 1) {
                payload.image = {
                    imageBytes: await fileToBase64(refImageFiles[0]),
                    mimeType: refImageFiles[0].type,
                };
            } else {
                const referenceImagesPayload: VideoGenerationReferenceImage[] = [];
                for (const img of refImageFiles) {
                  referenceImagesPayload.push({
                    image: { imageBytes: await fileToBase64(img), mimeType: img.type },
                    referenceType: VideoGenerationReferenceType.ASSET,
                  });
                }
                payload.config.referenceImages = referenceImagesPayload;
            }
        }
        await processVideoGeneration(payload);
    } catch (e: any) {
         if (e.message?.includes("Requested entity was not found")) {
            setError(t('apiKeyError'));
            setApiKeySelected(false);
         } else {
            setError(e.message);
         }
    }
  };
  
  const extendVideo = async () => {
      if (!extendPrompt || !generatedVideo?.video) return;
      setIsLoading(true);
      setError(null);
      setLoadingMessage(t('loadingMessageExtending'));

      try {
          const payload = {
            model: 'veo-3.1-generate-preview' as VideoModel,
            prompt: extendPrompt,
            video: generatedVideo.video,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: generatedVideo.aspectRatio,
            }
          };
          await processVideoGeneration(payload);
      } catch (e: any) {
         if (e.message?.includes("Requested entity was not found")) {
            setError(t('apiKeyError'));
            setApiKeySelected(false);
         } else {
            setError(e.message);
         }
    } finally {
        setIsLoading(false);
        setLoadingMessage('');
        setExtendPrompt('');
    }
  }

  const analyzeVideo = async () => {
    if (!videoFile) return;
    setLoadingMessage(t('loadingMessageAnalyzing'));

    const frames = [];
    try {
        const videoElement = document.createElement('video');
        videoElement.src = URL.createObjectURL(videoFile);
        await new Promise(resolve => { videoElement.onloadedmetadata = resolve; });
        const duration = videoElement.duration;
        const frameTimestamps = Array.from({ length: 8 }, (_, i) => (i / 7) * duration);
        const canvasElement = document.createElement('canvas');
        const context = canvasElement.getContext('2d');
        for (const time of frameTimestamps) {
            videoElement.currentTime = time;
            await new Promise(r => videoElement.onseeked = r);
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
            context?.drawImage(videoElement, 0, 0, videoElement.videoWidth, videoElement.videoHeight);
            const base64Data = await new Promise<string>(resolve => canvasElement.toBlob(async blob => {
                if (blob) resolve(await fileToBase64(new File([blob], "frame.jpeg")));
            }, 'image/jpeg'));
            frames.push({ inlineData: { data: base64Data, mimeType: 'image/jpeg' } });
        }
    } catch (e) {
        throw new Error(t('errorFrameExtraction'));
    }

    setLoadingMessage(t('loadingMessageSending'));
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    const response = await ai.models.generateContent({ model: 'gemini-2.5-pro', contents: { parts: [{ text: prompt }, ...frames] } });
    setAnalysisResult(response.text);
  };

  const handleSubmit = async () => {
    if ((activeTool === 'generate' && !prompt && refImageFiles.length === 0) || (activeTool === 'analyze' && (!prompt || !videoFile)) || isLoading) return;
    setIsLoading(true);
    setError(null);
    setGeneratedVideo(null);
    setAnalysisResult('');
    try {
      if (activeTool === 'generate') await generateVideo();
      else await analyzeVideo();
    } catch(e: any) {
      setError(e.message);
    }
    setIsLoading(false);
    setLoadingMessage('');
  };

  const renderApiKeySelector = () => (
    <div className="p-4 rounded-lg bg-purple-900/50 border border-purple-700 text-center">
        <h3 className="font-bold text-lg mb-2">{t('apiKeyRequiredTitle')}</h3>
        <p className="text-sm text-gray-300 mb-4">{t('apiKeyRequiredDescription')}</p>
        <p className="text-xs text-gray-400 mb-4">{t('apiKeyRequiredBillingLink')} <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline hover:text-purple-300">Google AI billing documentation</a>.</p>
        <button onClick={handleSelectApiKey} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
            {t('apiKeySelectButton')}
        </button>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-gray-800/50 rounded-lg shadow-xl">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-purple-300">{t('videoToolsTitle')}</h2>
        <div className="mt-2 flex space-x-1 rtl:space-x-reverse border border-gray-600 rounded-lg p-1 bg-gray-900 w-min">
          <button onClick={() => setActiveTool('generate')} className={`px-3 py-1 text-sm rounded-md transition-colors ${activeTool === 'generate' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>{t('videoToolGenerate')}</button>
          <button onClick={() => setActiveTool('analyze')} className={`px-3 py-1 text-sm rounded-md transition-colors ${activeTool === 'analyze' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>{t('videoToolAnalyze')}</button>
        </div>
      </div>
      <div className="flex-1 flex flex-col p-4 overflow-y-auto">
        {activeTool === 'generate' && !apiKeySelected ? renderApiKeySelector() : (
            <div className="space-y-4">
                {activeTool === 'analyze' && (
                    <div>
                        <label className="block mb-2 text-sm font-medium text-gray-300">{t('uploadVideoLabel')}</label>
                        <input type="file" accept="video/*" onChange={handleFileChange} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 rtl:file:ml-4 rtl:file:mr-0"/>
                    </div>
                )}
                <div>
                    <label htmlFor="prompt" className="block mb-2 text-sm font-medium text-gray-300">{activeTool === 'generate' ? t('promptLabelVideo') : t('promptLabelVideoAnalyze')}</label>
                    <textarea id="prompt" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white" placeholder={activeTool === 'generate' ? t('promptPlaceholderVideo') : t('promptPlaceholderVideoAnalyze')}></textarea>
                     {activeTool === 'generate' && refImageFiles.length > 0 && <p className="text-xs text-gray-400 mt-1">{t('promptIsOptional')}</p>}
                </div>
                {activeTool === 'generate' && (
                    <>
                        <div>
                            <label htmlFor="refImage" className="block mb-2 text-sm font-medium text-gray-300">{t('refImageLabel')}</label>
                             <input type="file" accept="image/*" id="refImage" multiple onChange={handleRefImageChange} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 rtl:file:ml-4 rtl:file:mr-0"/>
                             <div className="mt-2 flex gap-2">
                                {refImageUrls.map((url, i) => <img key={i} src={url} alt="Reference preview" className="rounded-lg max-h-24 shadow-md"/>)}
                             </div>
                             {refImageFiles.length > 1 && <p className="text-xs text-yellow-400 mt-1">{t('multiImageWarning')}</p>}
                        </div>
                         <div>
                            <label htmlFor="videoModel" className="block mb-2 text-sm font-medium text-gray-300">{t('videoModelLabel')}</label>
                            <select id="videoModel" value={videoModel} onChange={(e) => setVideoModel(e.target.value as VideoModel)} disabled={refImageFiles.length > 1} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white disabled:bg-gray-600">
                                <option value="veo-3.1-fast-generate-preview">{t('videoModelFast')}</option>
                                <option value="veo-3.1-generate-preview">{t('videoModelHD')}</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="aspectRatioVideo" className="block mb-2 text-sm font-medium text-gray-300">{t('aspectRatioLabel')}</label>
                            <select id="aspectRatioVideo" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)} disabled={refImageFiles.length > 1} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white disabled:bg-gray-600">
                                <option value="16:9">{t('aspectRatioLandscape')}</option>
                                <option value="9:16">{t('aspectRatioPortraitVideo')}</option>
                            </select>
                        </div>
                    </>
                )}
                <button onClick={handleSubmit} disabled={isLoading} className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors">
                    {isLoading ? loadingMessage : t('executeButton')}
                </button>
            </div>
        )}
        <div className="mt-6 flex-1 flex flex-col items-center justify-center bg-gray-900/50 p-4 rounded-lg">
            {isLoading && (<div className="text-center"><Spinner /><p className="mt-2 text-purple-300">{loadingMessage}</p></div>)}
            {error && <p className="text-red-400">{`${t('error')}: ${error}`}</p>}
            {generatedVideo?.uri && (
              <div className="w-full space-y-4">
                <video ref={videoRef} src={generatedVideo.uri} controls className="max-w-full max-h-96 rounded-lg shadow-lg mx-auto" />
                {activeTool === 'generate' && generatedVideo.video && (
                  <div className="p-4 bg-gray-800 rounded-lg space-y-2">
                    <h3 className="font-bold text-lg text-purple-300">{t('extendVideoTitle')}</h3>
                    <textarea value={extendPrompt} onChange={e => setExtendPrompt(e.target.value)} rows={2} placeholder={t('extendVideoPlaceholder')} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"></textarea>
                    <button onClick={extendVideo} disabled={isLoading || !extendPrompt} className="w-full px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-500 transition-colors">{t('extendVideoButton')}</button>
                  </div>
                )}
              </div>
            )}
            {analysisResult && (<div className="w-full text-left p-4 bg-gray-800 rounded-lg whitespace-pre-wrap rtl:text-right"><h3 className="font-bold text-lg mb-2">{t('analysisTitle')}</h3><p>{analysisResult}</p></div>)}
        </div>
      </div>
    </div>
  );
};

export default VideoTools;