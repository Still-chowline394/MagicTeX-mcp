#!/usr/bin/env node
// npm bin launcher. The server is TypeScript; register tsx's ESM loader in-process
// (no subprocess, so the MCP stdio channel is untouched), then start it.
import { register } from 'tsx/esm/api';

register();
await import(new URL('../src/server.ts', import.meta.url).href);
