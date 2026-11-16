// @ts-check
import { existsSync, readdirSync } from 'node:fs'
import withNuxt from './.nuxt/eslint.config.mjs'

// Feature boundaries (spec §10 → Rules):
// - Anything outside an app feature imports it only via its public API: '~/features/<name>'.
// - Route files in app/pages may also import a feature's *Page.vue component.
// - Inside a feature, use relative imports; reaching another feature uses '~/features/<name>'.
const FEATURE_ALIAS = String.raw`^(~|@|~~/app)/features/[^/]+/`

// Server code imports through #server/ and #shared/, never `../` across directories (spec §10, rule 8).
const SERVER_IMPORTS = [
  { regex: String.raw`^\.\./|^\./[^/]+/`, message: 'Use #server/ or #shared/ instead of relative server directory imports.' },
  { regex: String.raw`^(~~|@@)/(server|shared)(/|$)|^(~|@)/server(/|$)`, message: 'Use the Nuxt #server/ or #shared/ alias.' },
]
const FEATURE_INTERNAL = String.raw`^#server/features/[^/]+/(?!index(?:\.ts)?$).+`
const FEATURE_INTERNAL_MESSAGE = 'Import a server feature through its index.ts: #server/features/<name>.'
const dynamicRestrictions = patterns => patterns.map(({ regex, message }) => ({
  selector: `ImportExpression[source.value=/${regex.replaceAll('/', '\\u002F')}/]`,
  message,
}))

const featuresDir = new URL('./server/features/', import.meta.url)
const featureNames = existsSync(featuresDir)
  ? readdirSync(featuresDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
  : []
const otherFeatureInternals = name => ({
  regex: String.raw`^#server/features/(?!${name}(?:/|$))[^/]+/(?!index(?:\.ts)?$).+`,
  message: 'Reach another server feature only through #server/features/<name>.',
})

// The repository rules (docs/server/repositories.md, M1.2), checked where a rule can be.
const REPOSITORY_RULES = [
  { selector: 'TSAsExpression[typeAnnotation.typeName.name="Promise"]', message: 'Don\'t cast a query\'s result: let the return type check it.' },
  { selector: 'CallExpression[callee.object.name="db"][callee.property.name=/^(?:run|all|get|values)$/]', message: 'No raw statements in a repository: build it with the query builder.' },
  { selector: 'TaggedTemplateExpression[tag.name="sql"] CallExpression[callee.property.name="getTime"]', message: 'Don\'t write a time as a number: compare the column with an operator (gt(column, now)).' },
]

export default withNuxt(
  // No `v-html`: Vue escapes text, `v-html` doesn't, and the CSP allows inline scripts, so one
  // `v-html` of a shop's or customer's text is stored XSS. The default only warns.
  {
    files: ['**/*.vue'],
    rules: {
      'vue/no-v-html': 'error',
    },
  },
  // Money, numbers and dates are shown only through app/utils/format.ts (docs/standards/i18n.md):
  // one place sets the currency's decimals, the digits and the shop's time zone.
  {
    files: ['app/**/*.{ts,vue}'],
    ignores: ['app/utils/format.ts'],
    rules: {
      'no-restricted-syntax': ['error',
        { selector: 'MemberExpression[object.name="Intl"]', message: 'Format through app/utils/format.ts (formatMoney, formatDate).' },
        { selector: 'CallExpression[callee.property.name=/^toLocale(?:String|DateString|TimeString)$/]', message: 'Format through app/utils/format.ts (formatMoney, formatDate).' },
      ],
    },
  },
  {
    files: ['app/**/*.{ts,vue}'],
    ignores: ['app/pages/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { regex: FEATURE_ALIAS, message: 'Import features through their public API: \'~/features/<name>\'.' },
          { regex: String.raw`^\.\./\.\./`, message: 'Don\'t reach into other features with relative paths; use \'~/features/<name>\'.' },
        ],
      }],
    },
  },
  {
    files: ['app/pages/**/*.vue'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: String.raw`${FEATURE_ALIAS}(?!components/\w+Page\.vue$)`,
          message: 'Pages may import a feature\'s public API or its *Page.vue component only.',
        }],
      }],
    },
  },
  {
    files: ['server/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: SERVER_IMPORTS }],
      'no-restricted-syntax': ['error', ...dynamicRestrictions(SERVER_IMPORTS)],
    },
  },
  // Routes, tasks and middleware reach features only through their index.ts.
  {
    files: ['server/api/**/*.ts', 'server/routes/**/*.ts', 'server/tasks/**/*.ts', 'server/middleware/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...SERVER_IMPORTS, { regex: FEATURE_INTERNAL, message: FEATURE_INTERNAL_MESSAGE }] }],
      'no-restricted-syntax': ['error', ...dynamicRestrictions([...SERVER_IMPORTS, { regex: FEATURE_INTERNAL, message: FEATURE_INTERNAL_MESSAGE }])],
    },
  },
  // Each feature may import its own internals; other features expose only index.ts.
  // Tests intentionally inspect internals and fixtures.
  ...featureNames.flatMap(name => [
    {
      files: [`server/features/${name}/**/*.ts`],
      ignores: [`server/features/${name}/tests/**`],
      rules: {
        'no-restricted-imports': ['error', { patterns: [...SERVER_IMPORTS, otherFeatureInternals(name)] }],
        'no-restricted-syntax': ['error', ...dynamicRestrictions([...SERVER_IMPORTS, otherFeatureInternals(name)])],
      },
    },
    // A later block replaces `no-restricted-syntax` as a whole, so this one repeats the import rules.
    {
      files: [`server/features/${name}/*.repository.ts`],
      rules: {
        'no-restricted-syntax': ['error', ...dynamicRestrictions([...SERVER_IMPORTS, otherFeatureInternals(name)]), ...REPOSITORY_RULES],
      },
    },
  ]),
  // A schema may reference another feature's table for a foreign key, importing its *.schema.ts
  // directly: a feature's index.ts reaches the database through hub:db:schema, built from these files.
  {
    files: ['server/features/*/*.schema.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        ...SERVER_IMPORTS,
        {
          regex: String.raw`^#server/features/[^/]+/(?![^/]+\.schema(?:\.ts)?$).+`,
          message: 'A schema imports another feature only for its table: #server/features/<name>/<name>.schema.',
        },
      ] }],
    },
  },
)
