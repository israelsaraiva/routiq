const now = Date.now();

const profile = {
  id: 'k1', name: 'Orders (staging)', brokers: 'broker-1.staging.example.com:9092', topics: 'orders.created, orders.paid, orders.shipped',
  fromBeginning: false, groupId: 'routiq-orders-viewer', ssl: true, saslMechanism: 'scram-sha-256', saslUsername: 'orders-reader',
  startMode: 'latest', authPreset: 'custom', hasSaslPassword: true, storedSecrets: [],
};

const order = (id, topic, offset, secondsAgo, flowId, flowName, payload) => ({
  id: `m-${offset}-${topic}`, flowId, flowName, flowIdSource: 'json-content', timestamp: now - secondsAgo * 1000,
  topic, partition: Number(offset) % 3, offset: String(offset), key: id,
  value: JSON.stringify(payload, null, 2), valueFormat: 'json', headers: { 'content-type': 'application/json', 'x-source': 'checkout-service' },
});

const messages = [
  order('ord-1042', 'orders.shipped', 8812, 4, 'ord-1042', 'Order ord-1042', { orderId: 'ord-1042', status: 'SHIPPED', carrier: 'DHL', trackingNumber: 'JD014600003SE' }),
  order('ord-1043', 'orders.created', 8811, 9, 'ord-1043', 'Order ord-1043', { orderId: 'ord-1043', status: 'CREATED', customer: { id: 'c-77', country: 'BE' }, total: 129.9, currency: 'EUR' }),
  order('ord-1042', 'orders.paid', 8810, 21, 'ord-1042', 'Order ord-1042', { orderId: 'ord-1042', status: 'PAID', method: 'card', amount: 59.0 }),
  order('ord-1041', 'orders.shipped', 8809, 33, 'ord-1041', 'Order ord-1041', { orderId: 'ord-1041', status: 'SHIPPED', carrier: 'bpost' }),
  order('ord-1042', 'orders.created', 8808, 47, 'ord-1042', 'Order ord-1042', { orderId: 'ord-1042', status: 'CREATED', customer: { id: 'c-12', country: 'NL' }, total: 59.0, currency: 'EUR' }),
  order('ord-1041', 'orders.paid', 8807, 61, 'ord-1041', 'Order ord-1041', { orderId: 'ord-1041', status: 'PAID', method: 'ideal', amount: 24.5 }),
  order('ord-1041', 'orders.created', 8806, 80, 'ord-1041', 'Order ord-1041', { orderId: 'ord-1041', status: 'CREATED', total: 24.5, currency: 'EUR' }),
];

const ui = {
  savedFilters: [],
  views: [],
  rules: [{ id: 'r1', name: 'Shipped', matchType: 'text', pattern: 'SHIPPED', color: '#3fb950', notify: false, badge: true, enabled: true }],
  viewMode: 'tree',
};

const init = {
  type: 'kafkaInit', profiles: [profile], activeProfileId: 'k1', collections: [{ id: 'c1', name: 'Demo API' }],
  maxMessages: 1000, status: { state: 'connected' }, messages, ui,
};

const adminResult = (command, data) => ({ type: 'adminResult', result: { requestId: `req-${command}`, command, data } });

const partitions = (count, high) => Array.from({ length: count }, (_, partition) => ({ partition, leader: partition % 3 + 1, replicas: [1, 2, 3], isr: [1, 2, 3], low: '0', high: String(high + partition * 37) }));

const topics = adminResult('listTopics', {
  kind: 'topics',
  topics: [
    { name: 'orders.created', internal: false, replicationFactor: 3, messageCount: 8812, partitions: partitions(3, 2900) },
    { name: 'orders.paid', internal: false, replicationFactor: 3, messageCount: 8210, partitions: partitions(3, 2700) },
    { name: 'orders.shipped', internal: false, replicationFactor: 3, messageCount: 7640, partitions: partitions(3, 2500) },
    { name: 'payments.events', internal: false, replicationFactor: 3, messageCount: 15230, partitions: partitions(6, 2500) },
    { name: 'inventory.updates', internal: false, replicationFactor: 2, messageCount: 4120, partitions: partitions(2, 2050) },
    { name: '__consumer_offsets', internal: true, replicationFactor: 3, messageCount: 91000, partitions: partitions(5, 18000) },
  ],
});

const groups = adminResult('listGroups', {
  kind: 'groups',
  groups: [
    { groupId: 'routiq-orders-viewer', state: 'Stable', protocol: 'RoundRobinAssigner', protocolType: 'consumer', memberCount: 1 },
    { groupId: 'billing-service', state: 'Stable', protocol: 'range', protocolType: 'consumer', memberCount: 3 },
    { groupId: 'shipping-service', state: 'Rebalancing', protocol: 'range', protocolType: 'consumer', memberCount: 2 },
    { groupId: 'analytics-batch', state: 'Empty', protocol: '', protocolType: 'consumer', memberCount: 0 },
  ],
});

const group = adminResult('describeGroup', {
  kind: 'group',
  group: {
    groupId: 'billing-service', state: 'Stable', protocol: 'range', totalLag: 128,
    members: [
      { memberId: 'billing-1-3f9a', clientId: 'billing-1', host: '/10.0.4.11', assignments: [{ topic: 'orders.paid', partitions: [0] }] },
      { memberId: 'billing-2-77c1', clientId: 'billing-2', host: '/10.0.4.12', assignments: [{ topic: 'orders.paid', partitions: [1, 2] }] },
    ],
    offsets: [
      { topic: 'orders.paid', partition: 0, committed: '2890', logEnd: '2900', lag: 10 },
      { topic: 'orders.paid', partition: 1, committed: '2850', logEnd: '2937', lag: 87 },
      { topic: 'orders.paid', partition: 2, committed: '2948', logEnd: '2971', lag: 23 },
    ],
  },
});

const cluster = adminResult('describeCluster', {
  kind: 'cluster',
  cluster: {
    clusterId: 'Lk3x9Qd0T1OaVn7mZc2Pqg', controllerId: 2, version: '3.7',
    brokers: [
      { nodeId: 1, host: 'broker-1.staging.example.com', port: 9092, isController: false },
      { nodeId: 2, host: 'broker-2.staging.example.com', port: 9092, isController: true },
      { nodeId: 3, host: 'broker-3.staging.example.com', port: 9092, isController: false },
    ],
  },
});

const templates = {
  type: 'kafkaTemplates',
  templates: [{ id: 't1', name: 'Order paid', topic: 'orders.paid', key: 'ord-1044', headers: { 'content-type': 'application/json' }, value: '{\n  "orderId": "ord-1044",\n  "status": "PAID"\n}', partition: null, tombstone: false }],
};

const runnerResults = [
  { requestId: 'a', name: 'Login', method: 'POST', path: 'Auth', mode: 'http', status: 200, statusText: 'OK', timeMs: 142, passed: true, tests: [{ name: 'returns a token', passed: true }], scriptErrors: [], console: [] },
  { requestId: 'b', name: 'List orders', method: 'GET', path: 'Orders', mode: 'http', status: 200, statusText: 'OK', timeMs: 88, passed: true, tests: [{ name: 'status is 200', passed: true }, { name: 'has items', passed: true }], scriptErrors: [], console: [] },
  { requestId: 'c', name: 'Create order', method: 'POST', path: 'Orders', mode: 'http', status: 201, statusText: 'Created', timeMs: 203, passed: true, tests: [{ name: 'status is 201', passed: true }], scriptErrors: [], console: [] },
  { requestId: 'd', name: 'Cancel order', method: 'DELETE', path: 'Orders', mode: 'http', status: 409, statusText: 'Conflict', timeMs: 97, passed: false, tests: [{ name: 'status is 204', passed: false, message: 'expected 409 to equal 204' }], scriptErrors: [], console: [] },
];

const runnerSummary = { total: 4, executed: 4, skipped: 0, passed: 3, failed: 1, testsPassed: 4, testsFailed: 1, durationMs: 530, stopped: false };

module.exports = { init, topics, groups, group, cluster, templates, runnerResults, runnerSummary };
