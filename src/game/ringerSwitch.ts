/**
 * Whether the player is on a device whose hardware ringer switch can silence
 * the game without telling them.
 *
 * On iOS, the silent switch mutes both HTMLAudioElement and Web Audio, and
 * Safari exposes no reliable way to opt out. Workarounds circulate — coaxing
 * the audio session category into a playback mode by routing through a video
 * element, or through WebRTC — but they depend on undocumented behaviour, they
 * break between Safari versions, and none of them is something to hang a
 * player's whole soundtrack on. Treat it as unavailable rather than as absent.
 *
 * So a player who happens to have the switch flipped gets the entire campaign
 * in silence and has no reason to suspect the switch: nothing on screen is
 * broken, no control looks disabled, and the mute toggle in the header shows
 * sound as on.
 *
 * That matters more here than it would elsewhere. This game has ten scored
 * tracks, a jukebox screen built to browse them, and a premise that is
 * literally noise against silence. Someone playing it muted is not missing a
 * feature; they are missing the argument.
 *
 * Detection is deliberately *not* attempted. The obvious approach — ask
 * whether audio is playing and warn if it is not — does not work: with the
 * switch on, the audio element still reports itself as playing, because it is.
 * It advances, it fires timeupdate, it simply produces no sound. isBgmPlaying()
 * returns true either way, and there is no readable signal anywhere in the
 * platform that distinguishes the two. Anything claiming to detect this would
 * be guessing.
 *
 * So the hint is unconditional on iOS and absent everywhere else, phrased as a
 * conditional the player can check for themselves rather than as a diagnosis.
 * Android has no such switch, and a desktop that is muted was muted by someone
 * who knows where the control is.
 */

export interface PlatformSignals {
  userAgent: string;
  /** navigator.platform. iPadOS reports MacIntel and needs maxTouchPoints to disambiguate. */
  platform?: string;
  maxTouchPoints?: number;
}

/**
 * True for iPhone, iPod and iPad, including iPadOS in its desktop-Safari
 * disguise — since iPadOS 13, Safari reports the macOS platform string and a
 * macOS user agent, and the only reliable tell is that a Mac does not have a
 * touchscreen.
 */
export function hasRingerSwitch({ userAgent, platform, maxTouchPoints }: PlatformSignals): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  return platform === 'MacIntel' && (maxTouchPoints ?? 0) > 1;
}

/** Reads the signals off the current environment. Safe to call during render. */
export function currentPlatformHasRingerSwitch(): boolean {
  if (typeof navigator === 'undefined') return false;
  return hasRingerSwitch({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}
