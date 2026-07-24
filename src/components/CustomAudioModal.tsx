import React, { useState } from 'react';
import { Music, Upload, Play, Square, Check, RotateCcw, Volume2, X, Disc, Sparkles } from 'lucide-react';
import { sound } from '../game/sound';

interface CustomAudioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TrackSlot {
  id: 'INTRO' | 'CHAR_SELECT' | 'STAGE1' | 'STAGE1_BOSS';
  title: string;
  subtitle: string;
  iconColor: string;
  borderColor: string;
}

const TRACK_SLOTS: TrackSlot[] = [
  {
    id: 'INTRO',
    title: '1. Title & Intro Screen',
    subtitle: 'Main arcade title theme music',
    iconColor: 'text-[#00ffff]',
    borderColor: 'border-[#00ffff]',
  },
  {
    id: 'CHAR_SELECT',
    title: '2. Player Selection Screen',
    subtitle: 'Character roster select screen background music',
    iconColor: 'text-[#ff00ff]',
    borderColor: 'border-[#ff00ff]',
  },
  {
    id: 'STAGE1',
    title: '3. Stage 1 Gameplay',
    subtitle: 'Neon City street brawl stage music',
    iconColor: 'text-[#ffff00]',
    borderColor: 'border-[#ffff00]',
  },
  {
    id: 'STAGE1_BOSS',
    title: '4. Stage 1 Boss Fight',
    subtitle: 'Apex Syndicate Mech boss fight anthem',
    iconColor: 'text-red-500',
    borderColor: 'border-red-500',
  },
];

export const CustomAudioModal: React.FC<CustomAudioModalProps> = ({ isOpen, onClose }) => {
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const [fileNames, setFileNames] = useState<Record<string, string>>({
    INTRO: sound.getCustomTrackName('INTRO') || '',
    CHAR_SELECT: sound.getCustomTrackName('CHAR_SELECT') || '',
    STAGE1: sound.getCustomTrackName('STAGE1') || '',
    STAGE1_BOSS: sound.getCustomTrackName('STAGE1_BOSS') || '',
  });

  React.useEffect(() => {
    if (isOpen) {
      setFileNames({
        INTRO: sound.getCustomTrackName('INTRO') || '',
        CHAR_SELECT: sound.getCustomTrackName('CHAR_SELECT') || '',
        STAGE1: sound.getCustomTrackName('STAGE1') || '',
        STAGE1_BOSS: sound.getCustomTrackName('STAGE1_BOSS') || '',
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = async (trackId: string, file: File) => {
    if (!file) return;
    await sound.setCustomTrackBlob(trackId, file, file.name);
    setFileNames((prev) => ({ ...prev, [trackId]: file.name }));
    sound.playBgm(trackId as any);
    setPlayingTrack(trackId);
  };

  const handleBatchUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // Order: INTRO, CHAR_SELECT, STAGE1, STAGE1_BOSS
    const slots: ('INTRO' | 'CHAR_SELECT' | 'STAGE1' | 'STAGE1_BOSS')[] = ['INTRO', 'CHAR_SELECT', 'STAGE1', 'STAGE1_BOSS'];

    for (let index = 0; index < fileArray.slice(0, 4).length; index++) {
      const file = fileArray[index];
      const targetSlot = slots[index];
      if (file && targetSlot) {
        await sound.setCustomTrackBlob(targetSlot, file, file.name);
        setFileNames((prev) => ({ ...prev, [targetSlot]: file.name }));
      }
    }

    // Start playing the first track loaded
    if (fileArray[0]) {
      sound.playBgm('INTRO');
      setPlayingTrack('INTRO');
    }
  };

  const handleResetTrack = async (trackId: string) => {
    await sound.resetCustomTrack(trackId);
    setFileNames((prev) => ({ ...prev, [trackId]: '' }));
    sound.stopBgm();
    setPlayingTrack(null);
  };

  const handleTogglePlay = (trackId: string) => {
    if (playingTrack === trackId) {
      sound.stopBgm();
      setPlayingTrack(null);
    } else {
      sound.playBgm(trackId as any);
      setPlayingTrack(trackId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#0e071b] border-2 sm:border-4 border-[#00ffff] rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-[0_0_50px_rgba(0,255,255,0.4)] flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-[#00ffff]/30 mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00ffff]/20 border border-[#00ffff] flex items-center justify-center shadow-[0_0_15px_rgba(0,255,255,0.5)]">
              <Disc className="w-6 h-6 text-[#00ffff] animate-spin-slow" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white italic uppercase tracking-wider font-mono flex items-center gap-2">
                ARCADE JUKEBOX <span className="text-[#00ffff] text-sm font-normal">MODAL</span>
              </h2>
              <p className="text-xs text-zinc-400 font-mono">Upload your 4 custom audio tracks or use built-in 16-bit synths</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Bulk Drag and Drop Banner */}
        <div className="mb-4 p-3.5 bg-[#1b0d36] border-2 border-dashed border-[#ff00ff]/60 rounded-xl text-center flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-left">
            <Sparkles className="w-5 h-5 text-[#ff00ff] shrink-0" />
            <div>
              <span className="text-xs font-mono font-bold text-[#ff00ff] uppercase block">QUICK BULK IMPORT</span>
              <span className="text-[11px] text-zinc-300 font-mono">Select or drop all 4 audio files at once (Intro, Selection, Stage 1, Boss)</span>
            </div>
          </div>

          <label className="bg-[#ff00ff] hover:bg-[#d900d9] text-black text-xs font-mono font-black px-4 py-2 rounded-lg cursor-pointer uppercase transition-all shadow-[0_0_15px_rgba(255,0,255,0.4)] shrink-0 flex items-center gap-1.5">
            <Upload className="w-4 h-4" /> BROWSE 4 FILES
            <input
              type="file"
              multiple
              accept="audio/*"
              className="hidden"
              onChange={(e) => e.target.files && handleBatchUpload(e.target.files)}
            />
          </label>
        </div>

        {/* Track List */}
        <div className="space-y-3 overflow-y-auto pr-1 flex-1">
          {TRACK_SLOTS.map((slot) => {
            const hasCustom = !!fileNames[slot.id];
            const isPlaying = playingTrack === slot.id;

            return (
              <div
                key={slot.id}
                className={`bg-[#140a28] border ${
                  isPlaying ? 'border-[#00ffff] shadow-[0_0_20px_rgba(0,255,255,0.3)]' : 'border-[#2d164d]'
                } rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all`}
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`p-2 rounded-lg bg-black/60 border ${slot.borderColor} shrink-0 mt-0.5`}>
                    <Music className={`w-5 h-5 ${slot.iconColor}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm sm:text-base font-black text-white font-mono uppercase tracking-wide truncate">
                        {slot.title}
                      </h3>
                      {hasCustom ? (
                        <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 px-2 py-0.5 rounded flex items-center gap-1">
                          <Check className="w-3 h-3" /> CUSTOM FILE
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded">
                          16-BIT SYNTH
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 font-mono mt-0.5 truncate">{slot.subtitle}</p>
                    {hasCustom && (
                      <p className="text-xs text-[#00ffff] font-mono font-bold mt-1 truncate flex items-center gap-1">
                        <Volume2 className="w-3 h-3 shrink-0" /> {fileNames[slot.id]}
                      </p>
                    )}
                  </div>
                </div>

                {/* Slot Actions */}
                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-[#2d164d]">
                  {/* Test Play/Stop */}
                  <button
                    onClick={() => handleTogglePlay(slot.id)}
                    className={`p-2 rounded-lg border font-mono text-xs font-bold flex items-center gap-1.5 transition-all ${
                      isPlaying
                        ? 'bg-amber-500 text-black border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500'
                    }`}
                    title={isPlaying ? 'Stop Music' : 'Test Play Track'}
                  >
                    {isPlaying ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                    <span>{isPlaying ? 'STOP' : 'TEST'}</span>
                  </button>

                  {/* Upload Audio File */}
                  <label className="bg-[#00ffff] hover:bg-[#00cccc] text-black text-xs font-mono font-bold px-3 py-2 rounded-lg cursor-pointer transition-all flex items-center gap-1 shadow">
                    <Upload className="w-3.5 h-3.5" /> CHOOSE
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(slot.id, e.target.files[0])}
                    />
                  </label>

                  {/* Reset to Synth */}
                  {hasCustom && (
                    <button
                      onClick={() => handleResetTrack(slot.id)}
                      className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/30"
                      title="Reset to 16-bit Synth"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-[#00ffff]/20 flex justify-between items-center shrink-0">
          <span className="text-[11px] text-zinc-400 font-mono">Supports .MP3, .WAV, .OGG, .M4A</span>
          <button
            onClick={onClose}
            className="bg-[#00ffff] text-black font-mono font-black text-xs px-5 py-2 rounded-lg hover:bg-[#00cccc] transition-all uppercase shadow-[0_0_15px_rgba(0,255,255,0.4)]"
          >
            DONE / APPLY
          </button>
        </div>
      </div>
    </div>
  );
};
