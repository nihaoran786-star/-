import React, { useCallback, useState, useEffect } from 'react';
import { Upload, FileImage, X, Image as ImageIcon } from 'lucide-react';
import { translations, Language } from '../utils/translations';

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  selectedFile: File | null;
  onClear: () => void;
  lang: Language;
}

const DropZone: React.FC<DropZoneProps> = ({ onFileSelected, selectedFile, onClear, lang }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const t = translations[lang];

  useEffect(() => {
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [selectedFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      if (files[0].type.startsWith('image/')) {
        onFileSelected(files[0]);
      } else {
        alert("Please upload an image file.");
      }
    }
  }, [onFileSelected]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelected(e.target.files[0]);
    }
  };

  if (selectedFile) {
    return (
      <div className="w-full relative h-64 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/30 flex items-center justify-center p-4 group overflow-hidden">
        {/* Image Preview */}
        {previewUrl ? (
          <img 
            src={previewUrl} 
            alt="Preview" 
            className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg shadow-sm"
          />
        ) : (
          <div className="flex flex-col items-center text-slate-400">
             <ImageIcon className="animate-pulse mb-2" size={32} />
             <span className="text-sm">Loading preview...</span>
          </div>
        )}

        {/* Remove Button */}
        <button 
          onClick={onClear}
          className="absolute top-3 right-3 bg-white/90 hover:bg-red-50 text-slate-500 hover:text-red-600 p-2 rounded-full shadow-sm border border-slate-200 transition-all backdrop-blur-sm z-10"
          title="Remove image"
        >
          <X size={18} />
        </button>
        
        {/* File Info Badge */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-md pointer-events-none whitespace-nowrap z-10">
           {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        w-full h-64 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300
        ${isDragging 
          ? 'border-indigo-500 bg-indigo-50 scale-[1.02]' 
          : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 bg-white'
        }
      `}
    >
      <input 
        type="file" 
        accept="image/*" 
        className="hidden" 
        id="fileInput"
        onChange={handleFileInput}
      />
      <label htmlFor="fileInput" className="cursor-pointer flex flex-col items-center w-full h-full justify-center">
        <div className={`
          w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors
          ${isDragging ? 'bg-indigo-200 text-indigo-600' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-500'}
        `}>
          <Upload size={32} />
        </div>
        <p className="text-lg font-medium text-slate-700">{t.dragDrop}</p>
        <p className="text-sm text-slate-400 mt-2">{t.supports}</p>
      </label>
    </div>
  );
};

export default DropZone;