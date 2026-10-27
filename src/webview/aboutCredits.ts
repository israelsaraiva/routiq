export interface Credit {
  name: string;
  purpose: string;
  license: string;
}

export const CREDITS: Credit[] = [
  { name: 'React', purpose: 'Webview UI', license: 'MIT' },
  { name: 'Radix UI', purpose: 'Accessible UI primitives', license: 'MIT' },
  { name: 'Hugeicons', purpose: 'Icons', license: 'MIT (free core set)' },
  { name: 'Jost (@fontsource-variable/jost)', purpose: 'Interface font', license: 'SIL OFL 1.1' },
  { name: 'undici', purpose: 'HTTP client', license: 'MIT' },
  { name: 'ws', purpose: 'WebSocket client', license: 'MIT' },
  { name: '@grpc/grpc-js and @grpc/proto-loader', purpose: 'gRPC client', license: 'Apache-2.0' },
  { name: 'kafkajs', purpose: 'Kafka client', license: 'MIT' },
  { name: 'graphql', purpose: 'GraphQL parsing and introspection', license: 'MIT' },
  { name: 'https-proxy-agent', purpose: 'Proxy support for WebSocket', license: 'MIT' },
  { name: 'yaml', purpose: 'OpenAPI YAML import', license: 'ISC' },
  { name: 'class-variance-authority and clsx', purpose: 'Component styling helpers', license: 'Apache-2.0 / MIT' },
];
