import React from 'react';
import { GameSettings } from '../types';
import { useIsMobileDevice } from '../hooks/useDeviceType';
import { TitleScreenDesktop } from './TitleScreenDesktop';
import { TitleScreenMobile } from './TitleScreenMobile';

export interface TitleScreenProps {
  audioUnlocked: boolean;
  difficulty: GameSettings['difficulty'];
  onStartBrawl: () => void;
  onOpenDifficulty: () => void;
  onOpenJukebox: () => void;
  onOpenCodex: () => void;
}

/**
 * Mobile and desktop get genuinely separate title screens, the same way
 * character select already does — a phone held sideways has around 400px of
 * height to work with and needs the logo and the actions side by side, while
 * desktop wants them stacked with the actions anchored to the bottom of a
 * window several times taller.
 *
 * Splitting by *device* rather than by CSS orientation is the point. Doing
 * it with Tailwind's `landscape:` variant looks equivalent and isn't: that
 * variant matches any viewport wider than it is tall, so every desktop
 * monitor quietly received the phone layout. Two files, chosen by device,
 * cannot leak into each other that way.
 *
 * The device test lives in useIsMobileDevice: the browser's own
 * `navigator.userAgentData.mobile` when it exists, falling back to
 * `(pointer: coarse) and (hover: none)` — input modality, not screen size,
 * so a touchscreen laptop with a mouse still reads as desktop.
 */
export const TitleScreen: React.FC<TitleScreenProps> = (props) => {
  const isMobile = useIsMobileDevice();

  if (isMobile) {
    return <TitleScreenMobile {...props} />;
  }

  return <TitleScreenDesktop {...props} />;
};
