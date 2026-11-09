/** Mobile source scope. Native MIME metadata is generated from this registry. */
export const mobileCodeFormats = [
  { language: 'javascript', label: 'JavaScript', extensions: ['js', 'mjs', 'cjs'], mime: 'text/javascript', aliases: ['application/javascript', 'application/x-javascript'], highlight: true },
  { language: 'jsx', label: 'JSX', extensions: ['jsx'], mime: 'text/jsx', aliases: [], highlight: false },
  { language: 'typescript', label: 'TypeScript', extensions: ['ts', 'mts', 'cts'], mime: 'text/typescript', aliases: ['application/typescript'], highlight: true },
  { language: 'tsx', label: 'TSX', extensions: ['tsx'], mime: 'text/tsx', aliases: [], highlight: false },
  { language: 'python', label: 'Python', extensions: ['py'], mime: 'text/x-python', aliases: ['application/x-python-code'], highlight: true },
  { language: 'rust', label: 'Rust', extensions: ['rs'], mime: 'text/x-rust', aliases: [], highlight: true },
  { language: 'go', label: 'Go', extensions: ['go'], mime: 'text/x-go', aliases: [], highlight: true },
  { language: 'java', label: 'Java', extensions: ['java'], mime: 'text/x-java-source', aliases: ['text/x-java'], highlight: true },
  { language: 'kotlin', label: 'Kotlin', extensions: ['kt', 'kts'], mime: 'text/x-kotlin', aliases: [], highlight: true },
  { language: 'c', label: 'C', extensions: ['c'], mime: 'text/x-c', aliases: ['text/x-csrc'], highlight: true },
  { language: 'cpp', label: 'C / C++', extensions: ['cpp', 'h', 'cc', 'cxx', 'hpp'], mime: 'text/x-c++src', aliases: ['text/x-c++'], highlight: true },
  { language: 'csharp', label: 'C#', extensions: ['cs'], mime: 'text/x-csharp', aliases: [], highlight: true },
  { language: 'shell', label: 'Shell', extensions: ['sh', 'bash', 'zsh'], mime: 'application/x-sh', aliases: ['text/x-shellscript', 'text/x-sh'], highlight: true },
  { language: 'powershell', label: 'PowerShell', extensions: ['ps1'], mime: 'text/x-powershell', aliases: ['application/x-powershell'], highlight: true },
  { language: 'sql', label: 'SQL', extensions: ['sql'], mime: 'application/sql', aliases: ['text/x-sql'], highlight: true },
  { language: 'html', label: 'HTML', extensions: ['html', 'htm'], mime: 'text/html', aliases: [], highlight: true },
  { language: 'css', label: 'CSS', extensions: ['css'], mime: 'text/css', aliases: [], highlight: true },
  { language: 'scss', label: 'SCSS', extensions: ['scss'], mime: 'text/x-scss', aliases: [], highlight: true },
  { language: 'less', label: 'Less', extensions: ['less'], mime: 'text/x-less', aliases: [], highlight: true },
  { language: 'vue', label: 'Vue', extensions: ['vue'], mime: 'text/x-vue', aliases: [], highlight: false }
] as const
