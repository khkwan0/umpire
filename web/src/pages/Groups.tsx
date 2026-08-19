import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, isTransientApiError, type Group, type GroupTreeNode } from '../api'
import ReconnectBanner from '../ReconnectBanner'

function flattenGroups(
  nodes: GroupTreeNode[],
  depth = 0,
): Array<Group & { depth: number }> {
  const out: Array<Group & { depth: number }> = []
  for (const node of nodes) {
    out.push({ ...node, depth })
    out.push(...flattenGroups(node.children, depth + 1))
  }
  return out
}

function GroupNode({
  node,
  depth,
  onAddChild,
  onRename,
  onRemove,
}: {
  node: GroupTreeNode
  depth: number
  onAddChild: (parentId: number) => void
  onRename: (group: Group) => void
  onRemove: (id: number) => void
}) {
  const isRoot = node.parent === 0
  return (
    <li className="group-node">
      <div className="group-row" style={{ paddingLeft: `${depth * 1.25}rem` }}>
        <div className="group-main">
          <strong>{node.name || `(untitled #${node.id})`}</strong>
          <span className="mono muted small">{node.tag}</span>
          <span className={`pill ${isRoot ? 'pending' : 'up'}`}>
            {isRoot ? 'root' : 'child'}
          </span>
        </div>
        <div className="actions">
          <button type="button" onClick={() => onAddChild(node.id)}>
            Add child
          </button>
          <button type="button" onClick={() => onRename(node)}>
            Rename
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => onRemove(node.id)}
          >
            Delete
          </button>
        </div>
      </div>
      {node.children.length > 0 && (
        <ul className="group-children">
          {node.children.map((child) => (
            <GroupNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onAddChild={onAddChild}
              onRename={onRename}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function Groups() {
  const [tree, setTree] = useState<GroupTreeNode[]>([])
  const [flat, setFlat] = useState<Group[]>([])
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [nextTree, nextFlat] = await Promise.all([
        api.groups.tree(),
        api.groups.list(),
      ])
      setTree(nextTree)
      setFlat(nextFlat)
      setError(null)
      setReconnecting(false)
    } catch (err) {
      if (isTransientApiError(err)) {
        setReconnecting(true)
        return
      }
      setError(err instanceof Error ? err.message : String(err))
      setReconnecting(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.groups.create({
        parent: parentId,
        name: name.trim(),
      })
      setName('')
      setParentId(0)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function addChild(parent: number) {
    const childName = prompt('Child group name')
    if (childName === null) return
    setError(null)
    try {
      await api.groups.create({ parent, name: childName.trim() })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function rename(group: Group) {
    const next = prompt('Group name', group.name)
    if (next === null) return
    setError(null)
    try {
      await api.groups.update(group.id, { name: next.trim() })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function remove(id: number) {
    if (
      !confirm(
        'Delete this group and its entire subtree? Targets in those groups will be unassigned.',
      )
    ) {
      return
    }
    setError(null)
    try {
      await api.groups.remove(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const parentOptions = [
    { id: 0, label: 'Root (new tree)' },
    ...flattenGroups(tree).map((g) => ({
      id: g.id,
      label: `${'—'.repeat(g.depth)} ${g.name || `#${g.id}`} (${g.tag})`,
    })),
  ]

  return (
    <div className="stack">
      {reconnecting && <ReconnectBanner />}
      <section className="panel">
        <h2>How grouping works</h2>
        <p className="muted">
          Groups organize targets into trees so you can route and review incidents
          by environment, service, or team.
        </p>
        <ul className="muted small">
          <li>
            Create a <strong>root</strong> group to start a tree (tag format:{' '}
            <span className="mono">group_N</span>).
          </li>
          <li>
            Add <strong>child</strong> groups under roots for actual target
            assignment (path tags such as{' '}
            <span className="mono">group_group_1_group_2</span>).
          </li>
          <li>
            Targets should attach to child groups; deleting a group deletes its
            subtree and unassigns affected targets.
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2>Add group</h2>
        <p className="muted">
          Roots get tag <span className="mono">group_N</span>. Children get a
          path tag like <span className="mono">group_group_1_group_2</span>.
          Targets attach to child groups only.
        </p>
        <form className="form-row" onSubmit={onCreate}>
          <label className="grow">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="production"
            />
          </label>
          <label>
            Parent
            <select
              value={parentId}
              onChange={(e) => setParentId(Number(e.target.value))}
            >
              {parentOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy}>
            Add
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel">
        <h2>Group trees</h2>
        {tree.length === 0 ? (
          <p className="muted">No groups yet. Create a root group above.</p>
        ) : (
          <ul className="group-tree">
            {tree.map((node) => (
              <GroupNode
                key={node.id}
                node={node}
                depth={0}
                onAddChild={(id) => void addChild(id)}
                onRename={(g) => void rename(g)}
                onRemove={(id) => void remove(id)}
              />
            ))}
          </ul>
        )}
        {flat.length > 0 && (
          <p className="muted small">
            {flat.length} group{flat.length === 1 ? '' : 's'} · {tree.length}{' '}
            tree
            {tree.length === 1 ? '' : 's'}
          </p>
        )}
      </section>
    </div>
  )
}
