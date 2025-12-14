import React, { useState, useRef, useEffect } from 'react';
import { BoundingBox } from '../utils/imageProcessor';
import { Check, Trash2, RotateCcw, Copy, ZoomIn, ZoomOut } from 'lucide-react';
import { translations, Language } from '../utils/translations';

interface CropAdjusterProps {
  imageUrl: string;
  initialBoxes: BoundingBox[];
  imageDimensions: { width: number; height: number };
  onConfirm: (boxes: BoundingBox[]) => void;
  onCancel: () => void;
  lang: Language;
}

const CropAdjuster: React.FC<CropAdjusterProps> = ({ imageUrl, initialBoxes, imageDimensions, onConfirm, onCancel, lang }) => {
  const [boxes, setBoxes] = useState<BoundingBox[]>(initialBoxes);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const t = translations[lang];

  // Dragging state
  const [activeBoxIndex, setActiveBoxIndex] = useState<number | null>(null); // For drag interaction
  const [selectedBoxIndex, setSelectedBoxIndex] = useState<number | null>(null); // For persistent selection (sync logic)
  
  const [interactionMode, setInteractionMode] = useState<'move' | 'resize' | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [startBoxState, setStartBoxState] = useState<BoundingBox | null>(null);

  // Zoom state
  const [scale, setScale] = useState(1);

  // Helper to calculate box dimensions in pixels and AR
  const getBoxMetrics = (box: BoundingBox) => {
    const width = Math.round(((box.xmax - box.xmin) / 1000) * imageDimensions.width);
    const height = Math.round(((box.ymax - box.ymin) / 1000) * imageDimensions.height);
    const ar = height > 0 ? (width / height).toFixed(2) : "0";
    return { width, height, ar };
  };

  const imageAR = imageDimensions.height > 0 ? (imageDimensions.width / imageDimensions.height).toFixed(2) : "0";

  // Helper to handle coordinate updates
  const updateBox = (index: number, updates: Partial<BoundingBox>) => {
    setBoxes(prev => {
      const newBoxes = [...prev];
      newBoxes[index] = { ...newBoxes[index], ...updates };
      return newBoxes;
    });
  };

  const handleResizeStart = (e: React.PointerEvent, index: number, handle: string) => {
    e.preventDefault();
    e.stopPropagation(); // Explicitly stop propagation to prevent move handler
    
    setActiveBoxIndex(index);
    setSelectedBoxIndex(index); // Set selected
    setInteractionMode('resize');
    setResizeHandle(handle);
    setStartPos({ x: e.clientX, y: e.clientY });
    setStartBoxState(boxes[index]);
    
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const handleMoveStart = (e: React.PointerEvent, index: number) => {
    e.preventDefault();
    setActiveBoxIndex(index);
    setSelectedBoxIndex(index); // Set selected
    setInteractionMode('move');
    setResizeHandle(null);
    setStartPos({ x: e.clientX, y: e.clientY });
    setStartBoxState(boxes[index]);
    
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeBoxIndex === null || !startBoxState || !containerRef.current) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current.getBoundingClientRect();
    const deltaXPixels = e.clientX - startPos.x;
    const deltaYPixels = e.clientY - startPos.y;

    // Convert pixels to normalized 0-1000 scale
    const deltaX = (deltaXPixels / rect.width) * 1000;
    const deltaY = (deltaYPixels / rect.height) * 1000;

    const box = startBoxState;

    if (interactionMode === 'move') {
      const newXmin = Math.max(0, Math.min(1000 - (box.xmax - box.xmin), box.xmin + deltaX));
      const newYmin = Math.max(0, Math.min(1000 - (box.ymax - box.ymin), box.ymin + deltaY));
      
      updateBox(activeBoxIndex, {
        xmin: newXmin,
        ymin: newYmin,
        xmax: newXmin + (box.xmax - box.xmin),
        ymax: newYmin + (box.ymax - box.ymin),
      });
    } else if (interactionMode === 'resize' && resizeHandle) {
      let { xmin, ymin, xmax, ymax } = box;
      const minSize = 20; // Relaxed minimum size constraint

      if (resizeHandle.includes('w')) {
        const newXmin = Math.min(xmax - minSize, Math.max(0, box.xmin + deltaX));
        xmin = newXmin;
      }
      if (resizeHandle.includes('e')) {
        const newXmax = Math.max(xmin + minSize, Math.min(1000, box.xmax + deltaX));
        xmax = newXmax;
      }
      if (resizeHandle.includes('n')) {
        const newYmin = Math.min(ymax - minSize, Math.max(0, box.ymin + deltaY));
        ymin = newYmin;
      }
      if (resizeHandle.includes('s')) {
        const newYmax = Math.max(ymin + minSize, Math.min(1000, box.ymax + deltaY));
        ymax = newYmax;
      }

      updateBox(activeBoxIndex, { xmin, ymin, xmax, ymax });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setActiveBoxIndex(null);
    setInteractionMode(null);
    setResizeHandle(null);
    if (containerRef.current && containerRef.current.hasPointerCapture(e.pointerId)) {
        containerRef.current.releasePointerCapture(e.pointerId);
    }
  };

  const handleDeleteBox = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setBoxes(prev => prev.filter((_, i) => i !== index));
    if (selectedBoxIndex === index) setSelectedBoxIndex(null);
  };

  const handleReset = () => {
    setBoxes(initialBoxes);
    setSelectedBoxIndex(null);
    setScale(1);
  };

  // Logic to sync size (width and height) to ensure identical dimensions
  const handleSyncSize = () => {
    if (selectedBoxIndex === null) return;
    
    const sourceBox = boxes[selectedBoxIndex];
    const targetW = sourceBox.xmax - sourceBox.xmin;
    const targetH = sourceBox.ymax - sourceBox.ymin;

    const newBoxes = boxes.map((box, idx) => {
      // Skip the source box
      if (idx === selectedBoxIndex) return box;

      // Current center of the target box
      const cx = (box.xmin + box.xmax) / 2;
      const cy = (box.ymin + box.ymax) / 2;

      // Calculate new coordinates centered on original center
      let newXmin = cx - (targetW / 2);
      let newXmax = cx + (targetW / 2);
      let newYmin = cy - (targetH / 2);
      let newYmax = cy + (targetH / 2);

      // Shift logic if out of bounds (maintain size if possible)
      // Check Left
      if (newXmin < 0) {
        const diff = 0 - newXmin;
        newXmin += diff;
        newXmax += diff;
      }
      // Check Right
      if (newXmax > 1000) {
        const diff = newXmax - 1000;
        newXmin += diff;
        newXmax += diff;
        // If still out of bounds (image smaller than box), clamp left
        if (newXmin < 0) newXmin = 0;
      }

      // Check Top
      if (newYmin < 0) {
        const diff = 0 - newYmin;
        newYmin += diff;
        newYmax += diff;
      }
      // Check Bottom
      if (newYmax > 1000) {
        const diff = newYmax - 1000;
        newYmin += diff;
        newYmax += diff;
        if (newYmin < 0) newYmin = 0;
      }

      return {
        ...box,
        xmin: newXmin,
        xmax: newXmax,
        ymin: newYmin,
        ymax: newYmax
      };
    });

    setBoxes(newBoxes);
  };

  const handleZoom = (direction: 'in' | 'out') => {
    setScale(prev => {
      const delta = direction === 'in' ? 0.25 : -0.25;
      return Math.min(Math.max(0.5, prev + delta), 4);
    });
  };

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY * -0.002;
        setScale(s => Math.min(Math.max(0.5, s + delta), 4));
      }
    };
    
    const el = scrollContainerRef.current;
    if (el) {
      el.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => el?.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
      <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center z-30 shadow-sm relative">
        <div>
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            {t.adjustTitle}
            <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
              {imageDimensions.width}x{imageDimensions.height} (AR: {imageAR})
            </span>
          </h3>
          <p className="text-xs text-slate-500 hidden sm:block">{t.adjustDesc}</p>
        </div>
        <div className="flex gap-2">
           {/* Zoom Controls */}
           <div className="flex items-center gap-1 bg-slate-50 rounded-lg border border-slate-200 p-0.5 mr-2">
            <button
              onClick={() => handleZoom('out')}
              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded transition-colors"
              title={t.zoomOut}
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-xs text-slate-400 font-medium w-8 text-center select-none">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => handleZoom('in')}
              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded transition-colors"
              title={t.zoomIn}
            >
              <ZoomIn size={16} />
            </button>
          </div>

          <button 
             onClick={handleSyncSize}
             disabled={selectedBoxIndex === null}
             className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium
                ${selectedBoxIndex !== null 
                  ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100' 
                  : 'text-slate-300 bg-slate-50 cursor-not-allowed'}
             `}
             title={t.syncRatioHelp}
          >
            <Copy size={16} />
            <span className="hidden sm:inline">{t.syncRatioBtn}</span>
          </button>
          <button 
             onClick={handleReset}
             className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
             title={t.resetBtn}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

      {/* Workspace Area - flex with m-auto to allow safe centering when zoomed */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 relative overflow-auto bg-slate-900 flex"
      >
        <div className="m-auto p-64">
            <div 
            ref={containerRef}
            className="relative select-none shadow-2xl bg-black"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{ touchAction: 'none' }}
            >
            {/* Base Image with Scaling Logic */}
            <img 
                src={imageUrl} 
                alt="Original" 
                className="object-contain pointer-events-none block transition-all duration-200 ease-out"
                draggable={false}
                style={{ 
                maxHeight: `${60 * scale}vh`,
                // When scaled up, allow width to exceed 100% of the initial container to enable scrolling
                maxWidth: scale > 1 ? 'none' : '100%',
                // Ensure it doesn't shrink below a reasonable size when zooming out
                minHeight: '20vh'
                }}
            />

            {boxes.map((box, i) => {
                const metrics = getBoxMetrics(box);
                const isSelected = selectedBoxIndex === i;
                const isActive = activeBoxIndex === i;
                
                return (
                <div
                    key={i}
                    className={`absolute border-2 transition-all group
                    ${(isSelected || isActive) ? 'border-indigo-400 z-20 bg-indigo-500/10' : 'border-white/60 z-10 hover:border-indigo-300 hover:bg-white/10'}
                    `}
                    style={{
                    left: `${box.xmin / 10}%`,
                    top: `${box.ymin / 10}%`,
                    width: `${(box.xmax - box.xmin) / 10}%`,
                    height: `${(box.ymax - box.ymin) / 10}%`,
                    cursor: 'move'
                    }}
                    onPointerDown={(e) => handleMoveStart(e, i)}
                >
                    {/* ID Tag */}
                    <div className={`absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm pointer-events-none flex items-center gap-1 z-30 transition-colors
                        ${(isSelected || isActive) ? 'bg-indigo-600/90 text-white' : 'bg-black/60 text-white'}
                    `}>
                    <span className="font-bold">#{i + 1}</span>
                    {(isSelected || isActive) && (
                        <span className="text-indigo-100 border-l border-white/30 pl-1 ml-0.5">
                        {metrics.width}x{metrics.height} (AR:{metrics.ar})
                        </span>
                    )}
                    </div>
                    
                    {/* Hover info for inactive boxes */}
                    {(!isSelected && !isActive) && (
                    <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white text-[9px] px-1 rounded backdrop-blur-sm pointer-events-none z-30">
                        AR: {metrics.ar}
                    </div>
                    )}

                    {/* Delete Button */}
                    <button
                    className={`absolute -top-3 -right-3 bg-red-500 text-white p-1 rounded-full shadow-md hover:bg-red-600 transition-opacity z-40
                        ${(isSelected || isActive) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                    `}
                    onClick={(e) => handleDeleteBox(i, e)}
                    onPointerDown={(e) => e.stopPropagation()} 
                    title={t.deleteBox}
                    >
                    <Trash2 size={12} />
                    </button>

                    {/* Resize Handles - Show when selected or active */}
                    {(isSelected || isActive) && [
                        { cursor: 'nw-resize', pos: '-top-2.5 -left-2.5', handle: 'nw' },
                        { cursor: 'ne-resize', pos: '-top-2.5 -right-2.5', handle: 'ne' },
                        { cursor: 'sw-resize', pos: '-bottom-2.5 -left-2.5', handle: 'sw' },
                        { cursor: 'se-resize', pos: '-bottom-2.5 -right-2.5', handle: 'se' }
                    ].map((h) => (
                        <div 
                            key={h.handle}
                            className={`absolute ${h.pos} w-5 h-5 bg-white border-2 border-indigo-500 ${h.cursor} z-50 rounded-full shadow-sm hover:scale-110 transition-transform`}
                            onPointerDown={(e) => handleResizeStart(e, i, h.handle)}
                        />
                    ))}
                </div>
                );
            })}
            </div>
        </div>
      </div>

      <div className="p-4 bg-white border-t border-slate-200 flex justify-end gap-3 z-30 relative shadow-[0_-1px_3px_rgba(0,0,0,0.05)]">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
        >
          {t.cancelBtn}
        </button>
        <button
          onClick={() => onConfirm(boxes)}
          className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all active:scale-95 flex items-center gap-2"
        >
          <Check size={18} />
          {t.confirmBtn}
        </button>
      </div>
    </div>
  );
};

export default CropAdjuster;