import {core, initCore, closeCore} from './sqlite.js'
import type {CoreStore} from './types.js'
import {CORE_TABLES} from './schema.js'

export {core, initCore, closeCore, CORE_TABLES}
export type {CoreStore}
export type {
  CoreTableDef,
  CoreColumnDef,
  CoreIndexDef,
  CoreColumnType,
} from './schema.js'

export function getCore(): CoreStore {
  return core
}
