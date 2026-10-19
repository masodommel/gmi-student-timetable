import { spawnSync } from 'node:child_process';

interface PythonCommand {
  command: string;
  args: string[];
}

const candidates: PythonCommand[] =
  process.platform === 'win32'
    ? [
        { command: 'py', args: ['-3'] },
        { command: 'python', args: [] },
        { command: 'python3', args: [] },
      ]
    : [
        { command: 'python3', args: [] },
        { command: 'python', args: [] },
      ];

for (const { command, args } of candidates) {
  const result = spawnSync(command, [...args, 'tests/check_data.py', ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') continue;
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

console.error('Python 3 is required to validate the timetable data.');
process.exit(1);
