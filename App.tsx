import React, { useState } from 'react';
import DropZone from './components/DropZone';
import GridResult from './components/GridResult';
import CropAdjuster from './components/CropAdjuster';
import { analyzeGrid, generateSlices, ImageSlice, downloadAllSlices, GridDimensions, AnalyzedImage, BoundingBox } from './utils/imageProcessor';
import { Download, Loader2, Scissors, Image as ImageIcon, Sparkles, Globe } from 'lucide-react';
import { translations, Language } from './utils/translations';

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('zh');
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<'upload' | 'analyzing' | 'adjusting' | 'processing' | 'result'>('upload');
  
  // Data State
  const [analyzedData, setAnalyzedData] = useState<AnalyzedImage | null>(null);
  const [slices, setSlices] = useState<ImageSlice[]>([]);
  const [gridDims, setGridDims] = useState<GridDimensions>({ rows: 3, cols: 3 });
  const [error, setError] = useState<string | null>(null);

  const t = translations[lang];

  // Step 1: File Selected -> Start Analysis
  const handleFileSelected = async (f: File) => {
    setFile(f);
    setStep('analyzing');
    setError(null);
    
    try {
      const data = await analyzeGrid(f);
      setAnalyzedData(data);
      setStep('adjusting');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Analysis failed");
      setStep('upload'); // Go back to upload but keep error visible
    }
  };

  // Step 2: Confirm Crops -> Start Processing/Upscaling
  const handleCropsConfirmed = async (boxes: BoundingBox[]) => {
    if (!file) return;
    setStep('processing');
    
    try {
      const result = await generateSlices(file, boxes);
      setSlices(result.slices);
      setGridDims(result.dimensions);
      setStep('result');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Processing failed");
      setStep('adjusting'); // Go back to adjustment on error
    }
  };

  const handleCancelAdjustment = () => {
    setFile(null);
    setAnalyzedData(null);
    setStep('upload');
  };

  const handleDownloadAll = () => {
    if (slices.length > 0) {
      downloadAllSlices(slices, file?.name.split('.')[0] || 'split');
    }
  };

  const handleClear = () => {
    setFile(null);
    setSlices([]);
    setAnalyzedData(null);
    setError(null);
    setStep('upload');
    setGridDims({ rows: 3, cols: 3 });
  };

  const toggleLang = () => {
    setLang(prev => prev === 'en' ? 'zh' : 'en');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/50 text-slate-800 font-sans">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-lg shadow-indigo-200">
              <Scissors size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 hidden sm:block">
              {t.appTitle}
            </h1>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:hidden">
              Splitter
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
             <button 
              onClick={toggleLang}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-full transition-colors"
            >
              <Globe size={16} />
              <span className="uppercase">{lang}</span>
            </button>

            <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
              <Sparkles size={14} />
              <span className="hidden sm:inline">{t.subtitle}</span>
              <span className="sm:hidden">AI</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        
        {/* Adjustment Mode occupies full width if active */}
        {step === 'adjusting' && analyzedData ? (
          <div className="h-[75vh] animate-fade-in-up">
            <CropAdjuster 
              imageUrl={analyzedData.url}
              initialBoxes={analyzedData.boxes}
              imageDimensions={{ width: analyzedData.width, height: analyzedData.height }}
              onConfirm={handleCropsConfirmed}
              onCancel={handleCancelAdjustment}
              lang={lang}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-stretch">
            
            {/* Left Column: Input / Controls */}
            <div className="flex flex-col space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 flex flex-col h-full">
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-2">{t.uploadTitle}</h2>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    {t.uploadDesc}
                  </p>
                </div>

                <div className="flex-1 flex flex-col justify-center">
                  <DropZone 
                    onFileSelected={handleFileSelected} 
                    selectedFile={file} 
                    onClear={handleClear} 
                    lang={lang}
                  />
                </div>

                {error && (
                  <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 flex items-start gap-2">
                    <span className="font-bold">{t.errorTitle}:</span> {error}
                  </div>
                )}
              </div>

              {/* Action Card - Only visible when result is ready */}
              {step === 'result' && slices.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in-up">
                  <div>
                    <h3 className="font-semibold text-slate-900">{t.readyTitle}</h3>
                    <p className="text-sm text-slate-500">
                      {t.readyDesc.replace('{count}', slices.length.toString())} ({gridDims.rows}x{gridDims.cols})
                    </p>
                  </div>
                  <button
                    onClick={handleDownloadAll}
                    className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Download size={18} />
                    {t.downloadBtn}
                  </button>
                </div>
              )}
            </div>

            {/* Right Column: Status / Preview */}
            <div className="flex flex-col h-full">
               <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 h-full flex flex-col relative min-h-[400px]">
                  
                  <div className="flex-1 flex flex-col items-center justify-center w-full">
                    {/* Empty State */}
                    {step === 'upload' && !file && (
                      <div className="w-full h-full min-h-[300px] border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400">
                        <ImageIcon size={48} className="mb-4 opacity-30" />
                        <p>{t.previewTitle}</p>
                      </div>
                    )}

                    {/* Analyzing State */}
                    {step === 'analyzing' && (
                      <div className="text-center animate-pulse">
                        <div className="relative mb-6 inline-block">
                          <div className="absolute inset-0 bg-indigo-100 rounded-full animate-ping opacity-75"></div>
                          <div className="relative bg-indigo-50 p-4 rounded-full text-indigo-600">
                            <Sparkles size={32} className="animate-pulse" />
                          </div>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">{t.analyzingTitle}</h3>
                        <p className="text-slate-500 text-sm max-w-xs mx-auto">
                          {t.analyzingDesc}
                        </p>
                      </div>
                    )}

                     {/* Processing State */}
                     {step === 'processing' && (
                      <div className="text-center">
                        <Loader2 className="animate-spin text-indigo-600 mb-4 mx-auto" size={40} />
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">{t.processingTitle}</h3>
                        <p className="text-slate-500 text-sm max-w-xs mx-auto">
                          {t.processingDesc}
                        </p>
                      </div>
                    )}

                    {/* Results */}
                    {step === 'result' && slices.length > 0 && (
                      <div className="w-full">
                        <GridResult slices={slices} cols={gridDims.cols} lang={lang} />
                        
                        <div className="mt-6 bg-indigo-50 text-indigo-800 text-sm p-4 rounded-xl flex gap-3 items-start animate-fade-in">
                          <Sparkles size={18} className="shrink-0 mt-0.5" />
                          <div>
                            <strong>{t.aiSuccess}</strong>
                            <br/>
                            {t.aiSuccessDesc}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
               </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;