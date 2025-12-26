
import React from 'react';
import { TreeState } from '../types';
import { Sparkles, Image as ImageIcon, X } from 'lucide-react';

interface OverlayUIProps {
  treeState: TreeState;
  onToggleState: () => void;
  onPhotoUpload: (url: string) => void;
  isPhotoFocused: boolean;
  onClearFocus: () => void;
  greeting?: string;
}

const OverlayUI: React.FC<OverlayUIProps> = ({ treeState, onToggleState, onPhotoUpload, isPhotoFocused, onClearFocus, greeting }) => {
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Try to upload to /api/upload (expects FormData 'file')
    try {
      const fd = new FormData();
      fd.append('file', file);
      const resp = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
      const json = await resp.json();
      if (json && json.url) {
        console.log('[OverlayUI] uploaded ornament url', json.url);
        onPhotoUpload(json.url);
        return;
      }
      throw new Error('Invalid response');
    } catch (err) {
      console.error('[OverlayUI] upload error, falling back to local object url', err);
      const url = URL.createObjectURL(file);
      onPhotoUpload(url);
    }
  };

  return (
    <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-8 z-10">
      {/* Top Header */}
      <div className={`flex justify-between items-start pointer-events-auto transition-opacity duration-700 ${isPhotoFocused ? 'opacity-0' : 'opacity-100'}`}>
        <div className="space-y-1">
          <h1 className="text-5xl font-pinyon metallic-text">Merry Christmas</h1>
          <p className="text-xs font-cinzel tracking-[0.3em] text-yellow-500/80 uppercase">A Winter Light by Kairo</p>
        </div>
        
        <div className="flex gap-4">
          <label className="group flex items-center gap-2 bg-emerald-900/40 hover:bg-emerald-800/60 backdrop-blur-md px-6 py-3 rounded-full gold-border transition-all cursor-pointer">
            <ImageIcon size={18} className="text-yellow-400" />
            <span className="text-xs font-cinzel text-white">Add Ornament</span>
            <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
          </label>
          
          <button 
            onClick={onToggleState}
            className="group flex items-center gap-2 bg-yellow-600/20 hover:bg-yellow-600/40 backdrop-blur-md px-6 py-3 rounded-full gold-border transition-all"
          >
            <Sparkles size={18} className="text-yellow-400 group-hover:animate-pulse" />
            <span className="text-xs font-cinzel text-white">
              {treeState === TreeState.CHAOS ? 'Form Tree' : 'Release Magic'}
            </span>
          </button>
        </div>
      </div>

      {/* Focus Mode Overlay - Strictly functional, no decorative text */}
      {isPhotoFocused && (
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-20 pointer-events-none">
          <button 
            onClick={onClearFocus}
            className="pointer-events-auto flex items-center gap-2 bg-black/60 hover:bg-black/80 backdrop-blur-xl px-10 py-5 rounded-full gold-border transition-all transform hover:scale-105 active:scale-95 group shadow-2xl"
          >
            <X size={24} className="text-yellow-500 group-hover:rotate-90 transition-transform" />
            <span className="text-base font-cinzel tracking-[0.2em] text-white">CLOSE FOCUS</span>
          </button>
        </div>
      )}

      {/* Bottom Interface */}
      <div className={`flex justify-between items-end pointer-events-auto transition-opacity duration-700 ${isPhotoFocused ? 'opacity-0' : 'opacity-100'}`}>
        <div className="space-y-2">
          {/* Tracker reserved space */}
        </div>

        <div className="text-right space-y-2">
          <p className="text-[10px] font-cinzel tracking-[0.4em] text-white/40 uppercase">Handcrafted for Excellence</p>
          <div className="h-px w-24 bg-gradient-to-r from-transparent to-yellow-500 ml-auto" />
          <p className="text-xs font-playfair italic text-yellow-500/60">© 2024 Kairo Studio</p>
        </div>
      </div>

      {/* Side Decorations */}
      <div className={`absolute top-1/2 left-8 -translate-y-1/2 space-y-12 hidden lg:block text-white/10 transition-opacity duration-700 ${isPhotoFocused ? 'opacity-0' : 'opacity-100'}`}>
        <p className="rotate-90 origin-left font-cinzel text-[10px] tracking-[1em]">PURE MAGIC</p>
        <p className="rotate-90 origin-left font-cinzel text-[10px] tracking-[1em]">ETERNAL GOLD</p>
        <p className="rotate-90 origin-left font-cinzel text-[10px] tracking-[1em]">ROYAL GREEN</p>
      </div>
    </div>
  );
};

export default OverlayUI;
