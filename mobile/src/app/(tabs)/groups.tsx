import {useCallback, useEffect, useState} from 'react'
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {SafeAreaView} from 'react-native-safe-area-context'
import {api, isTransientApiError, type Group, type GroupTreeNode} from '@/lib/api'
import {Field, PrimaryButton, SecondaryButton} from '@/components/form'
import {
  ErrorText,
  MutedText,
  Panel,
  ReconnectBanner,
  SectionTitle,
} from '@/components/umpire-ui'
import {useAuth} from '@/providers/AuthProvider'
import {useUmpireTheme} from '@/hooks/use-umpire-theme'
import {Spacing} from '@/constants/umpire-theme'

function GroupRow({
  node,
  depth,
  onRename,
  onRemove,
  onAddChild,
}: {
  node: GroupTreeNode
  depth: number
  onRename: (group: Group) => void
  onRemove: (id: number) => void
  onAddChild: (parentId: number) => void
}) {
  const {colors} = useUmpireTheme()
  const {canWrite} = useAuth()
  const isRoot = node.parent === 0

  return (
    <View>
      <View
        style={[
          styles.groupRow,
          {paddingLeft: depth * 16, borderBottomColor: colors.line},
        ]}>
        <View style={{flex: 1}}>
          <Text style={[styles.groupName, {color: colors.text}]}>
            {node.name || `(untitled #${node.id})`}
          </Text>
          <MutedText>{node.tag}</MutedText>
          <Text
            style={{
              color: isRoot ? colors.pending : colors.up,
              fontSize: 12,
              fontWeight: '600',
              textTransform: 'uppercase',
            }}>
            {isRoot ? 'root' : 'child'}
          </Text>
        </View>
        {canWrite ? (
          <View style={styles.groupActions}>
            <SecondaryButton title="Child" onPress={() => onAddChild(node.id)} />
            <SecondaryButton title="Rename" onPress={() => onRename(node)} />
            <SecondaryButton title="Delete" danger onPress={() => onRemove(node.id)} />
          </View>
        ) : null}
      </View>
      {node.children.map(child => (
        <GroupRow
          key={child.id}
          node={child}
          depth={depth + 1}
          onRename={onRename}
          onRemove={onRemove}
          onAddChild={onAddChild}
        />
      ))}
    </View>
  )
}

export default function GroupsScreen() {
  const {colors} = useUmpireTheme()
  const {canWrite} = useAuth()
  const [tree, setTree] = useState<GroupTreeNode[]>([])
  const [flat, setFlat] = useState<Group[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('0')
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
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function createGroup() {
    setBusy(true)
    try {
      await api.groups.create({
        name: name.trim() || undefined,
        parent: Number(parentId) || 0,
      })
      setName('')
      setShowCreate(false)
      await load()
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function onRename(group: Group) {
    if (!canWrite) return
    Alert.prompt(
      'Rename group',
      `New name for ${group.tag}`,
      async text => {
        if (!text?.trim()) return
        try {
          await api.groups.update(group.id, {name: text.trim()})
          await load()
        } catch (err) {
          Alert.alert('Error', err instanceof Error ? err.message : String(err))
        }
      },
      'plain-text',
      group.name,
    )
  }

  function onRemove(id: number) {
    if (!canWrite) return
    Alert.alert(
      'Delete group',
      'This deletes the group and all child groups.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.groups.remove(id)
              await load()
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : String(err))
            }
          },
        },
      ],
    )
  }

  function onAddChild(parentId: number) {
    setParentId(String(parentId))
    setShowCreate(true)
  }

  return (
    <SafeAreaView style={[styles.safe, {backgroundColor: colors.background}]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }>
        <Text style={[styles.title, {color: colors.text}]}>Groups</Text>
        <MutedText>
          Organize targets with root and child group tags.
        </MutedText>

        {reconnecting ? <ReconnectBanner /> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}

        {canWrite ? (
          <Panel>
            {showCreate ? (
              <>
                <SectionTitle>Create group</SectionTitle>
                <Field label="Name" value={name} onChangeText={setName} />
                <Field
                  label="Parent ID (0 = root)"
                  value={parentId}
                  onChangeText={setParentId}
                  keyboardType="number-pad"
                />
                <MutedText>
                  Parents: {flat.map(g => `${g.id}:${g.tag}`).join(', ') || 'none yet'}
                </MutedText>
                <PrimaryButton title="Create" onPress={createGroup} loading={busy} />
                <SecondaryButton title="Cancel" onPress={() => setShowCreate(false)} />
              </>
            ) : (
              <PrimaryButton title="New group" onPress={() => setShowCreate(true)} />
            )}
          </Panel>
        ) : null}

        <Panel>
          <SectionTitle>Group tree</SectionTitle>
          {tree.map(node => (
            <GroupRow
              key={node.id}
              node={node}
              depth={0}
              onRename={onRename}
              onRemove={onRemove}
              onAddChild={onAddChild}
            />
          ))}
        </Panel>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {flex: 1},
  content: {padding: Spacing.three, paddingBottom: 80},
  title: {fontSize: 28, fontWeight: '800', marginBottom: Spacing.two},
  groupRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  groupName: {fontSize: 16, fontWeight: '700'},
  groupActions: {gap: Spacing.one, alignItems: 'flex-end'},
})
