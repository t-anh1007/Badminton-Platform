#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const value = name => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : '';
};

const skill = value('skill') || process.env.CODEX_SKILL_NAME || 'manual';
const file = value('file');
const note = value('note') || process.env.CODEX_CHANGELOG_NOTE || 'updated';
if (!file) {
  console.error('Thiếu --file <project-relative-path>.');
  process.exit(2);
}

let author = value('author') || process.env.CODEX_CHANGELOG_AUTHOR;
if (!author) {
  const git = spawnSync('git', ['config', 'user.name'], { encoding: 'utf8' });
  author = git.status === 0 ? git.stdout.trim() : '';
}
author = author || process.env.USERNAME || process.env.USER || 'unknown';
if (!author.startsWith('@')) author = `@${author.replace(/\s+/g, '-')}`;

const date = new Date().toISOString().slice(0, 10);
const normalizedFile = file.replaceAll('\\', '/');
const line = `${date} | ${skill} | ${author} | ${normalizedFile} | ${note.slice(0, 80)}\n`;
const log = path.resolve('docs', '_shared', 'activity.log');
fs.mkdirSync(path.dirname(log), { recursive: true });
const existing = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
if (!existing.split(/\r?\n/).includes(line.trimEnd())) fs.appendFileSync(log, line, 'utf8');
