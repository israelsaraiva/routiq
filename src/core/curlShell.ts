export type CurlShell = 'bash' | 'powershell' | 'cmd';
export type CurlShellSetting = CurlShell | 'auto';

const CMD_SPECIAL_CHARACTERS = /[\^&<>|"%]/g;

export function resolveCurlShell(setting: CurlShellSetting, platform: string): CurlShell {
  if (setting !== 'auto') {
    return setting;
  }
  return platform === 'win32' ? 'powershell' : 'bash';
}

export function curlCommandName(shell: CurlShell): string {
  return shell === 'bash' ? 'curl' : 'curl.exe';
}

export function lineContinuation(shell: CurlShell): string {
  if (shell === 'powershell') {
    return ' `\n  ';
  }
  return shell === 'cmd' ? ' ^\n  ' : ' ';
}

function quoteForBash(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function quoteForPowerShell(value: string): string {
  return `'${value.replace(/'/g, `''`)}'`;
}

function quoteForCmd(value: string): string {
  const singleLine = value.replace(/\r?\n/g, ' ');
  const withEscapedQuotes = singleLine.replace(/(\\*)"/g, '$1$1\\"');
  return `^"${withEscapedQuotes.replace(CMD_SPECIAL_CHARACTERS, '^$&')}^"`;
}

export function quoteArgument(value: string, shell: CurlShell): string {
  if (shell === 'powershell') {
    return quoteForPowerShell(value);
  }
  return shell === 'cmd' ? quoteForCmd(value) : quoteForBash(value);
}
