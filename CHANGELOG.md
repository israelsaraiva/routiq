# Changelog

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
