/** Dezente Styles für Jahr-/Monats-Umschalter in Analytics. */
export function periodNavButtonClass(enabled: boolean): string {
  return `p-0.5 rounded transition-colors ${
    enabled
      ? 'text-gray-400 hover:text-gray-600 active:text-gray-700'
      : 'text-gray-200 cursor-not-allowed'
  }`;
}

export const periodNavValueClass =
  'text-xs font-normal text-gray-500 leading-none pointer-events-none select-none ' +
  'group-hover:text-gray-600 group-focus-within:text-gray-700 transition-colors';

/** Unsichtbares Select über dem zentrierten Label (Klickfläche). */
export const periodNavSelectOverlayClass =
  'absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none';

export const periodNavIconClass = 'w-3.5 h-3.5';
