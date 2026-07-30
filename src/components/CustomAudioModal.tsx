import React, { useState } from 'react';
import { Music, Upload, Play, Square, Check, RotateCcw, Volume2, X, Disc, Sparkles } from 'lucide-react';
import { sound, isBgmTrack } from '../game/sound';
import { BGM_TRACKS, BGM_TRACK_IDS, type BgmTrack } from '../game/bgmTracks';

interface CustomAudioModalProps {
  isOpen: boolean;
  onClose: () => void;
}


/**
 * Rows come from BGM_TRACKS. This list used to be maintained by hand alongside
 * three other copies elsewhere, and had drifted far enough that slot four still
 * described an "Apex Syndicate Mech" boss this game never had.
 */
const TRACK_SLOTS = BGM_TRACK_IDS.map((id) => ({ id, ...BGM_TRACKS[id] }));

export const CustomAudioModal: React.FC<CustomAudioModalProps> = ({ isOpen, onClose }) => {
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const [fileNames, setFileNames] = useState<Record<string, string>>({
    ...Object.fromEntries(BGM_TRACK_IDS.map((id) => [id, sound.getCustomTrackName(id) || ''])),
  });

  /**
   * Whatever was genuinely playing (title theme, stage music, ...) before the
   * jukebox touched anything. TEST/STOP and RESET all interrupt that track
   * through the same shared player the real bgm uses, and closing this modal
   * doesn't change `screen` — nothing elsewhere ever notices the interruption
   * and restarts it, so without this the screen the jukebox was opened from
   * goes silent for good the moment a preview is stopped.
   */
  const preOpenTrackRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setFileNames(
        Object.fromEntries(BGM_TRACK_IDS.map((id) => [id, sound.getCustomTrackName(id) || '']))
      );
      preOpenTrackRef.current = sound.getActiveTrack();
    }
  }, [isOpen]);

  /** Puts the real bgm back if a preview left it stopped or on the wrong track. */
  const restorePreOpenTrack = () => {
    const shouldBe = preOpenTrackRef.current;
    if (shouldBe && isBgmTrack(shouldBe) && (sound.getActiveTrack() !== shouldBe || !sound.isBgmPlaying())) {
      sound.playBgm(shouldBe, true);
    }
  };

  const handleClose = () => {
    restorePreOpenTrack();
    setPlayingTrack(null);
    onClose();
  };

  // The banner is dashed-bordered, says "drop all 4 audio files" and calls
  // itself a drag and drop area, but nothing ever listened for a drop: the only
  // working path was the file picker button beside it.
  //
  // Declared above the early return below: every hook here must run on every
  // render regardless of `isOpen`, or React sees a different hook count
  // between the closed and open renders and throws.
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  if (!isOpen) return null;

  // Typed as the slot union the component already declares. It was widened to
  // `string` here and cast back at the playBgm call, throwing away a type that
  // was two lines above.
  const handleFileUpload = async (trackId: BgmTrack, file: File) => {
    if (!file) return;
    await sound.setCustomTrackBlob(trackId, file, file.name);
    setFileNames((prev) => ({ ...prev, [trackId]: file.name }));
    sound.playBgm(trackId);
    setPlayingTrack(trackId);
  };

  const handleBatchUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // Dropped files fill the slots in declaration order. Capped at the slot
    // count rather than a leftover 4: BGM_TRACK_IDS grew from four tracks to
    // ten, and a hardcoded 4 here silently dropped any file past the first.
    const slots: BgmTrack[] = BGM_TRACK_IDS;

    for (let index = 0; index < Math.min(fileArray.length, slots.length); index++) {
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

  const handleResetTrack = async (trackId: BgmTrack) => {
    await sound.resetCustomTrack(trackId);
    setFileNames((prev) => ({ ...prev, [trackId]: '' }));
    // resetCustomTrack already restarts the slot as its synth fallback if it
    // was the one actually playing — an unconditional stopBgm() here used to
    // silence whatever bgm was live even when the reset track had nothing to
    // do with it.
    if (playingTrack === trackId) {
      setPlayingTrack(null);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    // Fires for children too, so only react when the pointer leaves the banner.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDraggingOver(false);

    const audio = Array.from(event.dataTransfer.files).filter(
      (file) =>
        file.type.startsWith('audio/') ||
        /\.(mp3|wav|ogg|m4a|flac|aac|webm)$/i.test(file.name)
    );
    if (audio.length > 0) {
      handleBatchUpload(audio);
    }
  };

  const handleTogglePlay = (trackId: BgmTrack) => {
    if (playingTrack === trackId) {
      // Stopping a preview should put the real bgm back immediately rather
      // than leaving the screen silent for as long as the jukebox stays open.
      restorePreOpenTrack();
      setPlayingTrack(null);
    } else {
      sound.playBgm(trackId);
      setPlayingTrack(trackId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fadeIn" data-gamepad-scope>
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
              <p className="text-xs text-zinc-400 font-mono">Upload your {BGM_TRACK_IDS.length} custom audio tracks or use built-in 16-bit synths</p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Bulk Drag and Drop Banner */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`mb-4 p-3.5 border-2 border-dashed rounded-xl text-center flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 transition-colors ${
            isDraggingOver
              ? 'bg-[#2d1155] border-[#ff00ff]'
              : 'bg-[#1b0d36] border-[#ff00ff]/60'
          }`}
        >
          <div className="flex items-center gap-2 text-left">
            <Sparkles className="w-5 h-5 text-[#ff00ff] shrink-0" />
            <div>
              <span className="text-xs font-mono font-bold text-[#ff00ff] uppercase block">QUICK BULK IMPORT</span>
              <span className="text-[11px] text-zinc-300 font-mono">Select or drop up to {BGM_TRACK_IDS.length} audio files at once, filled in slot order</span>
              {/* The picker this opens belongs to the operating system and takes
                  no gamepad input. Saying so beats a controller cursor that
                  reaches the button and then dead-ends. */}
              <span className="block text-[10px] text-amber-400 font-mono mt-0.5 uppercase tracking-wider">
                ⌨ Mouse or touch required — file picker ignores gamepads
              </span>
            </div>
          </div>

          <label className="bg-[#ff00ff] hover:bg-[#d900d9] text-black text-xs font-mono font-black px-4 py-2 rounded-lg cursor-pointer uppercase transition-all shadow-[0_0_15px_rgba(255,0,255,0.4)] shrink-0 flex items-center gap-1.5">
            <Upload className="w-4 h-4" /> BROWSE {BGM_TRACK_IDS.length} FILES
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
                {/* w-full: the card row above is `items-start` in its
                  * flex-col (mobile) layout, not `items-stretch`, so without
                  * an explicit width this block sized to its own content
                  * instead of the card's — min-w-0 further down had nothing
                  * to constrain against, and the title just grew past the
                  * card edge and pushed the badge off-screen with it. */}
                <div className="flex items-start gap-3 flex-1 min-w-0 w-full">
                  <div
                    className="p-2 rounded-lg bg-black/60 border shrink-0 mt-0.5"
                    style={{ borderColor: slot.accent }}
                  >
                    <Music className="w-5 h-5" style={{ color: slot.accent }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* min-w-0 on the title is load-bearing: without it, a flex
                      * item's default min-width is its content's natural
                      * width, so `truncate` never actually clips a long slot
                      * label (e.g. "Stage 2 Boss — Madam Mizydia (Hologram)")
                      * and it pushes the status badge off the right edge of
                      * the screen instead of the title itself eliding. shrink-0
                      * on the badge keeps it from being squeezed as a result.
                      */}
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm sm:text-base font-black text-white font-mono uppercase tracking-wide truncate min-w-0">
                        {slot.label}
                      </h3>
                      {hasCustom ? (
                        <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 px-2 py-0.5 rounded flex items-center gap-1 shrink-0">
                          <Check className="w-3 h-3" /> CUSTOM FILE
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded shrink-0">
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
                    className={`min-h-11 px-2 rounded-lg border font-mono text-xs font-bold flex items-center gap-1.5 transition-all ${
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
                  <label className="min-h-11 bg-[#00ffff] hover:bg-[#00cccc] text-black text-xs font-mono font-bold px-3 rounded-lg cursor-pointer transition-all flex items-center gap-1 shadow">
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
                      className="min-h-11 min-w-11 flex items-center justify-center text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/30"
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
          <span className="text-[11px] text-zinc-400 font-mono">Supports .MP3, .WAV, .OGG, .M4A, .FLAC, .AAC, .WEBM</span>
          <button
            onClick={handleClose}
            className="bg-[#00ffff] text-black font-mono font-black text-xs px-5 py-2 rounded-lg hover:bg-[#00cccc] transition-all uppercase shadow-[0_0_15px_rgba(0,255,255,0.4)]"
          >
            DONE / APPLY
          </button>
        </div>
      </div>
    </div>
  );
};
