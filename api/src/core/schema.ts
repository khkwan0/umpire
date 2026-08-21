/** Frozen core schema — plugins must not ALTER these tables. */

export type CoreColumnType = 'integer' | 'text' | 'real'

export interface CoreColumnDef {
  name: string
  type: CoreColumnType
  primaryKey?: boolean
  autoIncrement?: boolean
  notNull?: boolean
  unique?: boolean
  default?: string | number | {type: 'now'}
  references?: {
    table: string
    column: string
    onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT'
  }
}

export interface CoreIndexDef {
  name: string
  columns: string[]
  unique?: boolean
}

export interface CoreTableDef {
  name: string
  columns: CoreColumnDef[]
  indexes?: CoreIndexDef[]
}

export const CORE_TABLES: CoreTableDef[] = [
  {
    name: 'groups',
    columns: [
      {name: 'id', type: 'integer', primaryKey: true, autoIncrement: true},
      {name: 'parent', type: 'integer', notNull: true, default: 0},
      {name: 'name', type: 'text', notNull: true, default: ''},
      {name: 'tag', type: 'text', notNull: true, unique: true},
      {
        name: 'created_at',
        type: 'text',
        notNull: true,
        default: {type: 'now'},
      },
      {
        name: 'updated_at',
        type: 'text',
        notNull: true,
        default: {type: 'now'},
      },
    ],
    indexes: [{name: 'idx_groups_parent', columns: ['parent']}],
  },
  {
    name: 'targets',
    columns: [
      {name: 'id', type: 'integer', primaryKey: true, autoIncrement: true},
      {name: 'url', type: 'text', notNull: true},
      {name: 'interval_seconds', type: 'integer', notNull: true, default: 60},
      {name: 'enabled', type: 'integer', notNull: true, default: 1},
      {
        name: 'group_id',
        type: 'integer',
        references: {table: 'groups', column: 'id', onDelete: 'SET NULL'},
      },
      {name: 'check_ids', type: 'text', notNull: true, default: '[]'},
      {name: 'notifier_ids', type: 'text', notNull: true, default: '[]'},
      {
        name: 'created_at',
        type: 'text',
        notNull: true,
        default: {type: 'now'},
      },
      {
        name: 'updated_at',
        type: 'text',
        notNull: true,
        default: {type: 'now'},
      },
    ],
  },
  {
    name: 'settings',
    columns: [
      {name: 'key', type: 'text', primaryKey: true},
      {name: 'value', type: 'text', notNull: true},
    ],
  },
  {
    name: 'check_results',
    columns: [
      {name: 'id', type: 'integer', primaryKey: true, autoIncrement: true},
      {
        name: 'target_id',
        type: 'integer',
        notNull: true,
        references: {table: 'targets', column: 'id', onDelete: 'CASCADE'},
      },
      {name: 'ok', type: 'integer', notNull: true},
      {name: 'status_code', type: 'integer'},
      {name: 'error', type: 'text'},
      {name: 'latency_ms', type: 'integer'},
      {
        name: 'checked_at',
        type: 'text',
        notNull: true,
        default: {type: 'now'},
      },
    ],
    indexes: [
      {
        name: 'idx_check_results_target_checked',
        columns: ['target_id', 'checked_at DESC'],
      },
    ],
  },
  {
    name: 'target_state',
    columns: [
      {
        name: 'target_id',
        type: 'integer',
        primaryKey: true,
        references: {table: 'targets', column: 'id', onDelete: 'CASCADE'},
      },
      {name: 'is_up', type: 'integer'},
      {name: 'last_alert_at', type: 'text'},
      {name: 'last_checked_at', type: 'text'},
      {name: 'last_status_code', type: 'integer'},
      {name: 'last_error', type: 'text'},
      {name: 'last_latency_ms', type: 'integer'},
    ],
  },
  {
    name: 'target_check_configs',
    columns: [
      {
        name: 'target_id',
        type: 'integer',
        notNull: true,
        references: {table: 'targets', column: 'id', onDelete: 'CASCADE'},
      },
      {name: 'check_id', type: 'text', notNull: true},
      {name: 'config_json', type: 'text', notNull: true, default: '{}'},
      {
        name: 'updated_at',
        type: 'text',
        notNull: true,
        default: {type: 'now'},
      },
    ],
    indexes: [
      {
        name: 'idx_target_check_configs_target_check',
        columns: ['target_id', 'check_id'],
        unique: true,
      },
    ],
  },
  {
    name: 'target_notifier_configs',
    columns: [
      {
        name: 'target_id',
        type: 'integer',
        notNull: true,
        references: {table: 'targets', column: 'id', onDelete: 'CASCADE'},
      },
      {name: 'notifier_id', type: 'text', notNull: true},
      {name: 'config_json', type: 'text', notNull: true, default: '{}'},
      {
        name: 'updated_at',
        type: 'text',
        notNull: true,
        default: {type: 'now'},
      },
    ],
    indexes: [
      {
        name: 'idx_target_notifier_configs_target_notifier',
        columns: ['target_id', 'notifier_id'],
        unique: true,
      },
    ],
  },
  {
    name: 'roles',
    columns: [
      {name: 'id', type: 'integer', primaryKey: true, autoIncrement: true},
      {name: 'slug', type: 'text', notNull: true, unique: true},
      {name: 'name', type: 'text', notNull: true},
      {name: 'is_system', type: 'integer', notNull: true, default: 0},
      {name: 'can_write', type: 'integer', notNull: true, default: 0},
      {
        name: 'created_at',
        type: 'text',
        notNull: true,
        default: {type: 'now'},
      },
      {
        name: 'updated_at',
        type: 'text',
        notNull: true,
        default: {type: 'now'},
      },
    ],
  },
  {
    name: 'role_plugins',
    columns: [
      {
        name: 'role_id',
        type: 'integer',
        notNull: true,
        references: {table: 'roles', column: 'id', onDelete: 'CASCADE'},
      },
      {name: 'kind', type: 'text', notNull: true},
      {name: 'plugin_id', type: 'text', notNull: true},
    ],
    indexes: [
      {
        name: 'idx_role_plugins_role_kind_plugin',
        columns: ['role_id', 'kind', 'plugin_id'],
        unique: true,
      },
    ],
  },
  {
    name: 'users',
    columns: [
      {name: 'id', type: 'integer', primaryKey: true, autoIncrement: true},
      {name: 'username', type: 'text', notNull: true, unique: true},
      {name: 'password_hash', type: 'text', notNull: true},
      {
        name: 'role_id',
        type: 'integer',
        notNull: true,
        references: {table: 'roles', column: 'id', onDelete: 'RESTRICT'},
      },
      {
        name: 'created_at',
        type: 'text',
        notNull: true,
        default: {type: 'now'},
      },
      {
        name: 'updated_at',
        type: 'text',
        notNull: true,
        default: {type: 'now'},
      },
    ],
    indexes: [{name: 'idx_users_role_id', columns: ['role_id']}],
  },
  {
    name: 'sessions',
    columns: [
      {name: 'id', type: 'integer', primaryKey: true, autoIncrement: true},
      {
        name: 'user_id',
        type: 'integer',
        notNull: true,
        references: {table: 'users', column: 'id', onDelete: 'CASCADE'},
      },
      {name: 'token_hash', type: 'text', notNull: true, unique: true},
      {name: 'expires_at', type: 'text', notNull: true},
      {
        name: 'created_at',
        type: 'text',
        notNull: true,
        default: {type: 'now'},
      },
    ],
    indexes: [
      {name: 'idx_sessions_user_id', columns: ['user_id']},
      {name: 'idx_sessions_expires_at', columns: ['expires_at']},
    ],
  },
]
