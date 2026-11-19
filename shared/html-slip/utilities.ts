/**
 * The Studio's class completions: Tailwind's default scales for the families the catalog accepts
 * (`isKnownUtility`) and Satori draws. Generated rather than listed, so the editor offers the whole
 * stock theme (`text-sky-700`, `p-2.5`, `w-1/2`…). Satori knows only the stock theme, not the app's
 * Nuxt UI names like `text-primary`. Left out because Satori's Tailwind ignores them: `gap-*`,
 * `truncate`, `basis-*`, `whitespace-*`, `break-*`, `border-x`/`border-y` and the 950 shades.
 * `leading-*` and `tracking-*` need a text size on the same element. `utilities.test.ts` renders
 * each one through Satori.
 */

const SPACING = ['0', 'px', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14', '16', '20', '24', '28', '32', '36', '40', '44', '48', '52', '56', '60', '64', '72', '80', '96']
const FRACTIONS = ['1/2', '1/3', '2/3', '1/4', '2/4', '3/4', '1/5', '2/5', '3/5', '4/5', '1/6', '5/6', 'full']
const PALETTES = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose']
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']
const COLORS = ['black', 'white', 'transparent', ...PALETTES.flatMap(palette => SHADES.map(shade => `${palette}-${shade}`))]

const each = (prefixes: string[], values: string[]) => prefixes.flatMap(prefix => values.map(value => `${prefix}-${value}`))

export const UTILITY_SUGGESTIONS: readonly string[] = [
  // Layout
  'flex', 'hidden', 'relative', 'absolute',
  'flex-row', 'flex-col', 'flex-row-reverse', 'flex-col-reverse', 'flex-wrap', 'flex-nowrap', 'flex-1', 'flex-auto', 'flex-none',
  'grow', 'grow-0', 'shrink', 'shrink-0',
  ...each(['items'], ['start', 'center', 'end', 'stretch', 'baseline']),
  ...each(['justify'], ['start', 'center', 'end', 'between', 'around', 'evenly']),
  ...each(['self'], ['auto', 'start', 'center', 'end', 'stretch']),
  ...each(['overflow'], ['hidden', 'visible']),
  // Spacing and size
  ...each(['p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml'], SPACING),
  'mx-auto', 'my-auto', 'ml-auto', 'mr-auto', 'mt-auto', 'mb-auto',
  ...each(['w', 'h'], [...SPACING, ...FRACTIONS, 'auto']),
  ...each(['min-w', 'min-h', 'max-w', 'max-h'], ['0', 'full']),
  ...each(['inset', 'top', 'right', 'bottom', 'left'], ['0', 'px', '1', '2', '4', '1/2', 'full']),
  // Text
  ...each(['text'], ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', 'left', 'center', 'right', 'justify']),
  ...each(['font'], ['thin', 'light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black']),
  ...each(['leading'], ['none', 'tight', 'snug', 'normal', 'relaxed', 'loose', '3', '4', '5', '6', '7', '8']),
  ...each(['tracking'], ['tighter', 'tight', 'normal', 'wide', 'wider', 'widest']),
  'uppercase', 'lowercase', 'capitalize', 'normal-case', 'italic', 'not-italic', 'underline', 'line-through', 'no-underline',
  // Colour
  ...each(['text', 'bg', 'border'], COLORS),
  ...each(['opacity'], ['0', '25', '50', '75', '100']),
  // Borders
  'border', 'border-0', 'border-2', 'border-4', 'border-8',
  ...each(['border-t', 'border-r', 'border-b', 'border-l'], ['0', '2', '4']),
  'border-t', 'border-r', 'border-b', 'border-l',
  'border-solid', 'border-dashed', 'border-dotted',
  'rounded', ...each(['rounded'], ['none', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full']),
  // Custom values, as examples of the bracket form
  'text-[24px]', 'w-[50%]', 'p-[6px]', 'text-[#1e3a8a]',
]
