
import React from 'react';
import { TreeState } from '../types';
import { Sparkles, Image as ImageIcon } from 'lucide-react';

interface OverlayUIProps {
  treeState: TreeState;
  onToggleState: () => void;
  onPhotoUpload: (url: string) => void;
}

const OverlayUI: React.FC<OverlayUIProps> = ({ treeState, onToggleState, onPhotoUpload }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      onPhotoUpload(url);
    }
  };

  return (
    <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-8 z-10">
      {/* Top Header */}
      <div className="flex justify-between items-start pointer-events-auto">
        <div className="space-y-1">
          <h1 className="text-5xl font-pinyon metallic-text">Emerald & Gold</h1>
          <p className="text-xs font-cinzel tracking-[0.3em] text-yellow-500/80 uppercase">The House of Eternal Pine</p>
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

      {/* Bottom Interface */}
      <div className="flex justify-between items-end pointer-events-auto">
        <div className="space-y-2">
           <div className="h-px w-24 bg-gradient-to-r from-yellow-500 to-transparent" />
           <p className="text-[10px] font-cinzel tracking-[0.4em] text-white/40 uppercase italic">Luxury through geometry</p>
        </div>

        {/* Branding Footer */}
        <div className="text-right space-y-2">
          <p className="text-[10px] font-cinzel tracking-[0.4em] text-white/40 uppercase">Handcrafted for Excellence</p>
          <div className="h-px w-24 bg-gradient-to-r from-transparent to-yellow-500 ml-auto" />
          <p className="text-xs font-playfair italic text-yellow-500/60">© 2024 House of Emerald</p>
        </div>
      </div>

      {/* Background Ambience UI elements */}
      <div className="absolute top-1/2 left-8 -translate-y-1/2 space-y-12 hidden lg:block text-white/10">
        <p className="rotate-90 origin-left font-cinzel text-[10px] tracking-[1em]">PURE MAGIC</p>
        <p className="rotate-90 origin-left font-cinzel text-[10px] tracking-[1em]">ETERNAL GOLD</p>
        <p className="rotate-90 origin-left font-cinzel text-[10px] tracking-[1em]">ROYAL GREEN</p>
      </div>
    </div>
  );
};

export default OverlayUI;
