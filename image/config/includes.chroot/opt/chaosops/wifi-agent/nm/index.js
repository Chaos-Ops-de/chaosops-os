// NetworkManager abstraction. Backend selection:
//   CHAOSOPS_NM_BACKEND=nmcli | mock   (explicit)
//   unset → nmcli if the binary exists on PATH, otherwise mock (dev machines).
import { execFile } from 'node:child_process';
import { createNmcliBackend } from './nmcli.js';
import { createMockBackend } from './mock.js';

function nmcliOnPath() {
  return new Promise((resolve) => {
    execFile('nmcli', ['--version'], (err) => resolve(!err));
  });
}

export async function createBackend(env = process.env) {
  const choice = (env.CHAOSOPS_NM_BACKEND || '').toLowerCase();
  if (choice === 'mock') return createMockBackend(env);
  if (choice === 'nmcli') return createNmcliBackend();
  return (await nmcliOnPath()) ? createNmcliBackend() : createMockBackend(env);
}
