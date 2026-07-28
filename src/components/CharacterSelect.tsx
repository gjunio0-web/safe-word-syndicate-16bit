import React from 'react';
import { CharacterId, GameMode } from '../types';
import { useIsMobileDevice } from '../hooks/useDeviceType';
import { CharacterSelectDesktop } from './CharacterSelectDesktop';
import { CharacterSelectMobile } from './CharacterSelectMobile';

interface CharacterSelectProps {
  onSelect: (p1: CharacterId, p2?: CharacterId, mode?: GameMode) => void;
  onBack: () => void;
}

/**
 * Mobile and desktop get genuinely separate screens rather than one
 * responsive layout — two virtual D-pads and eight action buttons for 2P
 * modes simply don't fit a phone, so mobile is solo-only with its own
 * carousel-based browsing instead of a squeezed-down grid.
 *
 * Difficulty no longer travels through here. It used to be re-chosen on
 * every visit to this screen; it is a setting now, picked from a modal off
 * the title screen the way other games treat it, and read straight out of
 * GameSettings when a match starts.
 */
export const CharacterSelect: React.FC<CharacterSelectProps> = ({ onSelect, onBack }) => {
  const isMobile = useIsMobileDevice();

  if (isMobile) {
    return <CharacterSelectMobile onSelect={onSelect} onBack={onBack} />;
  }

  return <CharacterSelectDesktop onSelect={onSelect} onBack={onBack} />;
};
