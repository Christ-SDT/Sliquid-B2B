/**
 * Training-video captions in the viewer's language.
 *
 * Behaviour verified against the live YouTube IFrame player (Sept 2026), not
 * the docs — the translation path is undocumented:
 *
 * - `cc_load_policy: 1` turns captions on by default. That alone is enough
 *   for English.
 * - Do NOT pass `cc_lang_pref` for a language the video has no track in:
 *   asking for es/fr on an English-only video shows NO captions at all.
 * - Auto-translation works by setting the English track with a
 *   `translationLanguage` once the captions module has loaded (onApiChange).
 *   The language object must be YouTube's own entry from
 *   `translationLanguages` (it carries `languageName`; a bare code renders
 *   "undefined" in the player's caption tooltip).
 * - `tracklist` lists uploaded (human) tracks only — auto-generated English
 *   captions never appear in it, and `getOption('captions', 'track')` reads
 *   back `{}` even while captions are showing. Only the rendered caption text
 *   is ground truth when testing.
 *
 * Videos with no captions at all (five of the eleven trainings as of this
 * writing) show nothing — captions have to be added in YouTube Studio.
 */

interface CaptionTrack {
  languageCode: string
  kind?: string
  [key: string]: unknown
}

interface TranslationLanguage {
  languageCode: string
  languageName?: string
}

/** The subset of the YT.Player surface this module touches. */
export interface CaptionCapablePlayer {
  getOption?: (module: string, option: string) => unknown
  setOption?: (module: string, option: string, value: unknown) => void
}

/** playerVars additions: captions on, and the player's own UI in the viewer's language. */
export function captionPlayerVars(lang: string): Record<string, unknown> {
  return { cc_load_policy: 1, hl: lang }
}

/**
 * Point captions at the viewer's language. Safe to call repeatedly (YouTube
 * fires onApiChange more than once) and before the captions module is ready —
 * it simply does nothing until the module answers.
 */
export function applyCaptionLanguage(player: CaptionCapablePlayer | null | undefined, lang: string): void {
  if (!player?.getOption || !player.setOption) return
  let uploaded: CaptionTrack[] = []
  let translations: TranslationLanguage[] = []
  try {
    uploaded = (player.getOption('captions', 'tracklist') as CaptionTrack[] | undefined) ?? []
    translations = (player.getOption('captions', 'translationLanguages') as TranslationLanguage[] | undefined) ?? []
  } catch {
    return // captions module not loaded yet
  }

  // 1. A real (uploaded) track in the viewer's language beats any machine translation.
  const native = uploaded.find(t => t.languageCode === lang)
  if (native) {
    player.setOption('captions', 'track', { languageCode: lang })
    return
  }
  if (lang === 'en') return // cc_load_policy already shows the default English track

  // 2. Otherwise auto-translate from English — an uploaded English track if
  //    there is one, else YouTube's auto-generated (ASR) English captions.
  const target = translations.find(l => l.languageCode === lang)
  if (!target) return
  const english = uploaded.find(t => t.languageCode === 'en') ?? { languageCode: 'en', kind: 'asr' }
  player.setOption('captions', 'track', { ...english, translationLanguage: target })
}
