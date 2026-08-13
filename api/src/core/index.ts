import { core, initCore } from './sqlite.js'
import type { CoreStore } from './types.js'
import { CORE_TABLES } from './schema.js'

export { core, initCore, CORE_TABLES }
export type { CoreStore }
export type {
  CoreTableDef,
  CoreColumnDef,
  CoreIndexDef,
  CoreColumnType,
} from './schema.js'

export function getCore(): CoreStore {
  return core
}
