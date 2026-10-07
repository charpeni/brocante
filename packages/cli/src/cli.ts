import { runCli } from './run';
// Consumers such as head can close the pipe before the whole report is written.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});
process.exitCode = await runCli(process.argv.slice(2));
