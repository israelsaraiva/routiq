# Changelog

## 0.6.8

- Kafka JSON tree: keys are plain themed text instead of light chips, and text can be selected and copied.

## 0.6.7

- Kafka Messages tab: the message list no longer overlaps the stats and controls row when it wraps.

## 0.6.6

- Kafka Messages tab: Collapse all / Expand all, Select all and Clear selection.

## 0.6.5

- Kafka Log file tab: collapse/expand all, select all/clear, and a resizable detail panel on the right.

## 0.6.4

- Kafka: removed the redundant saved-connection picker (connections live in the sidebar); message chip tooltips show the full topic name and partition/offset.

## 0.6.3

- Kafka sidebar: essential fields stay visible, everything else moved into a collapsible Advanced section (state remembered, badge when customised, auto-opens for SASL/SSL).

## 0.6.2

- Kafka UI: consistent spacing scale, aligned toolbar rows, tab and status bar polish, saved-filter controls shown only when relevant.

## 0.6.1

- Kafka: connecting now saves the connection, so it appears in the sidebar.

## 0.6.0

- Kafka: resizable message detail panel, reconnect countdown, consumer lag in the status bar, refreshed screenshots.
- Import: Insomnia and OpenAPI authentication mapping (basic, bearer, digest, API key, AWS, OAuth2) with inheritance and warnings.
- OAuth2 client-credentials and password tokens persist in SecretStorage and refresh automatically.

## 0.5.0

- Kafka UI redesign: status bar, collapsible options, dense message rows, flow connectors, theme-aware colours, empty states, keyboard shortcuts, send preview, unseen badge.
- Kafka: Browse for .proto, config-update notice persists, decoding and filter help, topics/cluster screenshots.
- Auth: AWS Signature v4 and OAuth2 Authorization Code (+PKCE) with Postman import/export.

## 0.4.0

- Kafka: protobuf decoding (Schema Registry and local .proto), tombstone fidelity, topic config editing and partition increase, CSV import, broker version hint.
- gRPC: server reflection (v1 and v1alpha).
- Postman import/export: fuller auth mapping (OAuth2, Digest, inheritance) with warnings for unsupported types.
- HTTP/GraphQL conversion: Undo and sidebar context-menu commands.
- Network: Diagnose Network command, `routiq.connectTimeoutMs`, connect vs response timeout messages, IPv6 fallback.
- Refreshed Marketplace description, screenshots and README.

## 0.3.0

Kafka listener
- Real record timestamps, start from offset / timestamp / last N, virtualized lists, batched rendering and large-value truncation.
- Auto-reconnect with backoff; snappy, lz4 and zstd decoding; SASL OAUTHBEARER, AWS MSK IAM, mTLS and Confluent Cloud presets.
- Topic browser, consumer groups with lag and offset reset, and cluster info.
- Structured and saved filters, JSON tree, Avro / Schema Registry decoding, highlight rules, view tabs, message compare and Save as Routiq request.
- Send templates, N copies and intervals, export (JSON / NDJSON / CSV), import, replay and a read-only connection flag.

## 0.2.2

- **Auto save**: edited requests and the environments editor are saved automatically 5 seconds after the last change, and when the panel loses focus or is hidden. New settings `routiq.autoSave` (default on) and `routiq.autoSaveDelayMs` (default 5000, minimum 500), applied live. The title shows `Saving…` / `Saved`. Blank requests and invalid JSON bodies are not auto-saved; Cmd/Ctrl+S saves immediately. An edit made while a save is in flight now stays marked as unsaved.
- Response **Pretty** view fixed: big integers beyond 2^53 are no longer rounded, and JSON with a BOM, NDJSON, XML/SOAP and HTML bodies are now indented regardless of the declared content type. **Raw** always shows the exact original body.

## 0.2.1

- Kafka: verified against a real broker. Fixed an empty error when producing to an unreachable broker and a failed first connect to a topic that is auto-created.

## 0.2.0

- New **Kafka listener**: a Kafka view in the activity bar with saved connections and a dedicated panel (`Routiq: Open Kafka Listener`, `Routiq: New Kafka Connection`). Connect to one or more brokers and topics (with `{{variables}}` from a collection), choose consume-from-beginning and a consumer group, and use SSL/TLS and SASL (PLAIN, SCRAM-SHA-256/512); SASL passwords live in Secret Storage only.
- Live message list with search, topic filter, pause/resume, follow-newest, clear, export, per-message and per-flow copy/download/delete, selection actions, JSON pretty view, headers/key details and keyword highlighting.
- FlowID linking: messages are grouped into flows by header, JSON content or key, with durations and linked counts.
- Send tab to produce messages (topic, key, headers, value), plus **Use for Send** and **Resend** on received messages.
- Splunk JSON log file import (single JSON, array or NDJSON) shown as flows, with container/level filters and sorting.
- Last messages per connection are remembered (`routiq.kafka.persistedMessages`); new settings `routiq.kafka.maxMessages` and `routiq.kafka.connectionTimeoutMs`.
- Help page: new Kafka listener section.

## 0.1.7

- Sort collections and requests: right-click a collection or folder → **Sort** → A→Z, Z→A or by method (GET, POST, PUT, PATCH, DELETE, others), with recursive variants; **Sort Collections A→Z / Z→A** in the view menu. Sorting is saved, and manual order still works afterwards.
- Drag and drop now reorders: dropping on a request places the item before or after it depending on the drag direction, also across folders and collections. Collections can be reordered too (**Move Collection Up/Down**). The order is stored in the collection files (`order`), so it survives reloads, export/import and git sharing; files without it keep their current order.
- Subcollections: drag a collection onto another collection or folder (or **Move to…**) to turn it into a folder; variables and environments are merged without overwriting, secrets follow, and a warning lists whatever could not be carried over (active environment selection, cookies). **Promote Folder to Collection** reverses it.
- New **Move to…** command for collections, folders and requests.

## 0.1.6

- `{{variable}}` placeholders are now highlighted in every field where variables are substituted (URL, params, headers, form/multipart, body editors, auth fields, subprotocols, environment values): green when the variable exists (environment, collection, dynamic or secret), orange with a wavy underline when it is unresolved. Hover to see the resolved value and scope; secret values are never shown.
- The `{{` suggestion list now opens at the caret, also when moving into an unfinished `{{partial`, and shows a value preview (masked for secrets) and the scope (environment, collection, dynamic). Fields that lacked suggestions (param keys, multipart, binary path, auth, subprotocols) now have them, and the environment editor suggests from the variables being edited.
- Inserting a suggestion keeps the editor's undo history.
- Help page: new Variables section with worked examples.

## 0.1.5

- Convert an HTTP request to GraphQL (and back) from the **…** menu in the request toolbar. A JSON `{query, variables, operationName}` body fills the Query tab; anything that cannot be carried over is reported in a notice.

## 0.1.4

- Requests now send default `User-Agent` and `Accept` headers (like Postman) unless you set them, for gateways that reject or stall on header-less requests.

## 0.1.3

- Copy as cURL now matches your OS: PowerShell (`curl.exe`, backtick continuations, single-quoted strings) on Windows, bash elsewhere. New `routiq.curlShell` setting (`auto`, `bash`, `powershell`, `cmd`).
- Importing and pasting cURL accepts Windows commands: `curl.exe`, cmd `^` escapes and continuations (Chrome/Postman "Copy as cURL (cmd)") and PowerShell quoting with backtick continuations.

## 0.1.2

- New `routiq.useVsCodeNetworking` setting (default on): HTTP requests go through VS Code networking so the Windows/system proxy, PAC files and system certificates apply, as in Postman. Ignored when `routiq.proxy` is set.
- Timeout and connection errors now state how the request was routed (VS Code networking, proxy or direct) and which settings to check.

## 0.1.1

- A visible **Copy cURL** button in the request toolbar.

## 0.1.0

Initial release.

- Collections and folders stored as one JSON file each (global storage or a workspace folder such as `.routiq`).
- HTTP request editor: params, headers, bodies (JSON, XML, text, form-urlencoded, multipart, binary, GraphQL) and authentication (bearer, basic, API key, OAuth 2.0, Digest).
- Response viewer with syntax highlighting, pretty/raw, JSON path filter, search and save to file.
- Environments, variables, secret variables and autocomplete.
- GraphQL with schema introspection and completion, Server-Sent Events, WebSocket and gRPC requests.
- Pre-request and post-response scripts with tests, and a collection/folder runner.
- Cookie jar, redirects, proxy and TLS settings.
- Request history with stored responses.
- Import and export: Routiq JSON, Postman v2.1 (collections and environments), Insomnia, OpenAPI/Swagger and cURL; copy as cURL.
- Request search, tree filter, Help and About pages.
