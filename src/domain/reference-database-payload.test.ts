/// <reference types="node" />
import { readFileSync } from 'node:fs'

import { GAME_VERSIONS, GAME_VERSION_REGISTRY } from './game-version'
import { parseReferenceDatabase } from './reference-database.schema'
import {
  buildReferenceDatabaseIndex,
  searchReferenceItems,
} from './reference-database-index'
import { referenceRecipeToImport } from './reference-database-import'

it.each(GAME_VERSIONS)(
  'компактная база %s сохраняет данные, поиск, предпросмотр и импорт',
  (version) => {
    const definition = GAME_VERSION_REGISTRY[version]
    const load = (file: string) =>
      parseReferenceDatabase(JSON.parse(readFileSync(file, 'utf8')) as unknown, version)
    const full = load(
      `data-preparation/releases/${version}/craftcalc-db.${definition.build}.json`,
    )
    const browser = load(`public/${definition.databasePath}`)
    expect(browser).toEqual(full)
    const fullIndex = buildReferenceDatabaseIndex(full)
    const browserIndex = buildReferenceDatabaseIndex(browser)
    for (const language of ['ru', 'en'] as const) {
      for (const section of ['crafts', 'reagents', 'disenchanting'] as const) {
        for (const profession of [null, ...definition.professions]) {
          for (const query of ['', 'ткань', 'essence', '  ГРЁЗ  ', 'zz-no-match']) {
            expect(
              searchReferenceItems(browserIndex, section, query, profession, language),
            ).toEqual(
              searchReferenceItems(fullIndex, section, query, profession, language),
            )
          }
        }
      }
      expect(
        Object.values(browser.recipes).map((recipe) =>
          referenceRecipeToImport(browser, recipe, 7, language),
        ),
      ).toEqual(
        Object.values(full.recipes).map((recipe) =>
          referenceRecipeToImport(full, recipe, 7, language),
        ),
      )
    }
  },
)
