import { RefreshIcon } from '@hugeicons/core-free-icons';
import { useEffect } from 'react';
import { Icon } from '../../Icon';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { AdminMessages } from './AdminMessages';
import { KafkaAdminApi, isAdminPending } from './useKafkaAdmin';
import './kafkaAdmin.css';

interface Props {
  admin: KafkaAdminApi;
}

export function ClusterPanel({ admin }: Props) {
  const { state, send } = admin;
  const { cluster } = state;
  const loading = isAdminPending(state, 'describeCluster');
  const refresh = () => send({ kind: 'describeCluster' });

  useEffect(() => {
    cluster === undefined && refresh();
  }, []);

  return (
    <div className="kafka-messages">
      <div className="kafka-toolbar">
        <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>
          <Icon icon={RefreshIcon} /> {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>
      <div className="kafka-scroll">
        <AdminMessages state={state} area="cluster" />
        {cluster === undefined && !state.errors.cluster && <div className="kafka-empty">{loading ? 'Loading cluster…' : 'No data yet.'}</div>}
        {cluster && (
          <>
            <dl className="kafka-admin-facts">
              <dt>Cluster ID</dt>
              <dd className="kafka-admin-name">{cluster.clusterId}</dd>
              <dt>Controller</dt>
              <dd>{cluster.controllerId >= 0 ? `broker ${cluster.controllerId}` : 'unknown'}</dd>
              <dt>Kafka version</dt>
              <dd>{cluster.version ?? 'not reported by the broker'}</dd>
            </dl>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Broker ID</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Port</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cluster.brokers.map((broker) => (
                  <TableRow key={broker.nodeId}>
                    <TableCell>{broker.nodeId}</TableCell>
                    <TableCell className="kafka-admin-name">{broker.host}</TableCell>
                    <TableCell>{broker.port}</TableCell>
                    <TableCell>{broker.isController && <Badge variant="info">controller</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </div>
    </div>
  );
}
