import { Delete02Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { useEffect, useState } from 'react';
import { canModifyGroup } from '../../../core/kafka/admin';
import { Icon } from '../../Icon';
import { ConfirmAction } from '../../components/ConfirmAction';
import { LabeledSwitch } from '../../components/LabeledSwitch';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { AdminMessages } from './AdminMessages';
import { GroupDetail } from './GroupDetail';
import { ResetOffsetsDialog } from './ResetOffsetsDialog';
import { KafkaAdminApi, isAdminPending } from './useKafkaAdmin';
import './kafkaAdmin.css';

interface Props {
  admin: KafkaAdminApi;
}

export function GroupsPanel({ admin }: Props) {
  const { state, send, refreshIntervalSeconds } = admin;
  const [selected, setSelected] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [resetting, setResetting] = useState(false);
  const loading = isAdminPending(state, 'listGroups', 'describeGroup');
  const selectedGroup = state.groups?.find((group) => group.groupId === selected);
  const detail = state.group?.groupId === selected ? state.group : undefined;

  const refresh = () => {
    send({ kind: 'listGroups' });
    selected && send({ kind: 'describeGroup', groupId: selected });
  };

  const select = (groupId: string) => {
    setSelected(groupId);
    send({ kind: 'describeGroup', groupId });
  };

  useEffect(() => {
    state.groups === undefined && send({ kind: 'listGroups' });
  }, []);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }
    const timer = setInterval(refresh, refreshIntervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [autoRefresh, refreshIntervalSeconds, selected]);

  const deleteGroup = (groupId: string) => {
    setSelected(null);
    send({ kind: 'deleteGroup', groupId });
  };

  return (
    <div className="kafka-messages">
      <div className="kafka-toolbar">
        <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>
          <Icon icon={RefreshIcon} /> {loading ? 'Loading…' : 'Refresh'}
        </Button>
        <LabeledSwitch label={`Auto-refresh (${refreshIntervalSeconds}s)`} checked={autoRefresh} onCheckedChange={setAutoRefresh} />
      </div>
      <div className="kafka-scroll">
        <AdminMessages state={state} area="groups" />
        {state.groups === undefined && !state.errors.groups && <div className="kafka-empty">{loading ? 'Loading consumer groups…' : 'No data yet.'}</div>}
        {state.groups?.length === 0 && <div className="kafka-empty">No consumer groups.</div>}
        {state.groups && state.groups.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Protocol</TableHead>
                <TableHead>Members</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.groups.map((group) => (
                <TableRow key={group.groupId} className="kafka-admin-row" onClick={() => select(group.groupId)} aria-selected={selected === group.groupId}>
                  <TableCell className="kafka-admin-name">{group.groupId}</TableCell>
                  <TableCell>
                    <Badge variant={group.state === 'Stable' ? 'success' : 'secondary'}>{group.state}</Badge>
                  </TableCell>
                  <TableCell>{group.protocol || group.protocolType || '—'}</TableCell>
                  <TableCell>{group.memberCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {selectedGroup && (
          <div className="kafka-admin-selected">
            <div className="kafka-actions">
              <strong className="kafka-admin-name">{selectedGroup.groupId}</strong>
              <Button variant="secondary" size="sm" disabled={!canModifyGroup(selectedGroup.state)} onClick={() => setResetting(true)}>
                Reset offsets…
              </Button>
              <ConfirmAction
                trigger={
                  <Button variant="destructive" size="sm" disabled={!canModifyGroup(selectedGroup.state)}>
                    <Icon icon={Delete02Icon} /> Delete group
                  </Button>
                }
                title={`Delete group ${selectedGroup.groupId}?`}
                description="The group and its committed offsets are permanently deleted."
                confirmLabel="Delete group"
                onConfirm={() => deleteGroup(selectedGroup.groupId)}
              />
              {!canModifyGroup(selectedGroup.state) && <span className="kafka-status-detail">Stop all consumers to delete the group or reset its offsets.</span>}
            </div>
            {detail ? <GroupDetail group={detail} /> : <div className="kafka-empty">Loading group…</div>}
            <ResetOffsetsDialog
              groupId={selectedGroup.groupId}
              open={resetting}
              onOpenChange={setResetting}
              onReset={(target) => send({ kind: 'resetGroupOffsets', groupId: selectedGroup.groupId, target })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
