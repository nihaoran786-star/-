import React from 'react';
import { Download, LayoutGrid } from 'lucide-react';
import { ImageSlice } from '../utils/imageProcessor';
import { translations, Language } from '../utils/translations';

interface GridResultProps {
  slices: ImageSlice[];
  cols: number; // Dynamic column count
  lang: Language;
}

const GridResult: React.FC<GridResultProps> = ({ slices, cols, lang }) => {
  if (slices.length === 0) return null;
  const t = translations[lang];

  return (
    <div className="flex flex-col items-center animate-fade-in">
      <div className="flex items-center gap-2 mb-6 text-indigo-600 font-medium">
        <LayoutGrid size={20} />
        <span>{t.previewTitle} ({slices.length})</span>
      </div>
      
      {/* 
        Dynamic Grid Layout
      */}
      <div 
        className="grid gap-1.5 p-1.5 bg-slate-200 rounded-lg shadow-inner max-w-md w-full mx-auto"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`
        }}
      >
        {slices.map((slice) => (
          <div 
            key={slice.id} 
            className="relative group w-full h-full aspect-square overflow-hidden bg-white cursor-pointer transition-transform hover:z-10 hover:scale-[1.03] shadow-sm hover:shadow-xl rounded-sm"
          >
            <img 
              src={slice.url} 
              alt={`Slice ${slice.id + 1}`} 
              className="w-full h-full object-cover" 
            />
            
            {/* Overlay for individual download */}
            <a 
              href={slice.url} 
              download={`slice_${slice.id + 1}.png`}
              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center backdrop-blur-[2px]"
              title={`Download slice ${slice.id + 1} (${slice.width}x${slice.height})`}
            >
              <Download className="text-white drop-shadow-md transform scale-90 group-hover:scale-110 transition-transform" size={24} />
            </a>
            
            {/* Index number helper for ordering */}
            <span className="absolute top-1 left-1 text-[10px] font-bold text-white/90 bg-black/40 px-1.5 py-0.5 rounded-sm pointer-events-none backdrop-blur-sm">
              {slice.id + 1}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-4 text-center">
        {t.colsDetected.replace('{cols}', cols.toString())}. {t.hoverDownload}.
      </p>
    </div>
  );
};

export default GridResult;