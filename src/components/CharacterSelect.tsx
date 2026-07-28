import React from 'react';
import { CharacterId, GameMode, GameSettings } from '../types';
import { useIsMobileDevice } from '../hooks/useDeviceType';
import { CharacterSelectDesktop } from './CharacterSelectDesktop';
import { CharacterSelectMobile } from './CharacterSelectMobile';

type Difficulty = GameSettings['difficulty'];

interface CharacterSelectProps {
  onSelect: (p1: CharacterId, p2?: CharacterId, mode?: GameMode, difficulty?: Difficulty) => void;
  onBack: () => void;
}

/**
 * Mobile and desktop get genuinely separate screens rather than one
 * responsive layout — two virtual D-pads and eight action buttons for 2P
 * modes simply don't fit a phone, so mobile is solo-only with its own
 * carousel-based browsing instead of a squeezed-down grid.
 */
export const CharacterSelect: React.FC<CharacterSelectProps> = ({ onSelect, onBack }) => {
  const isMobile = useIsMobileDevice();

  if (isMobile) {
    return (
      <CharacterSelectMobile
        onSelect={(p1, p2, mode, difficulty) => onSelect(p1, p2, mode, difficulty)}
        onBack={onBack}
      />
    );
  }

  return <CharacterSelectDesktop onSelect={onSelect} onBack={onBack} />;
};
