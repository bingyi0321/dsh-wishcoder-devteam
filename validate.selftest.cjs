#!/usr/bin/env node
/**
 * validate.cjs 的负向自测（门禁自己的回归测试）。
 *
 * 为什么需要它：v0.0.206/207 的负向探针都是"手工改文件 → 跑 validate → 还原"，
 * 跑完就没了；下次改门禁没人知道它还能不能抓到东西。这里把 5 个探针做成一条命令，
 * 每个探针：备份字节 → 改动 → 期待 FAIL 且命中指定断言 → finally 还原 → 复核字节数。
 *
 * 跑法：node D:\agent\dsh-wishcoder-devteam\validate.selftest.cjs
 * 退出 0 = 5/5 通过；1 = 有探针没抓到（说明该断言已失效）。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = __dirname;
const VALIDATE = path.join(ROOT, 'validate.cjs');

function runValidate() {
  try {
    const out = execFileSync(process.execPath, [VALIDATE], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, text: out };
  } catch (e) {
    return { code: e.status ?? 1, text: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

let pass = 0;
const bad = [];

/** @param {string} label @param {string} rel @param {(t:string)=>string} mutate @param {RegExp} expect */
function probe(label, rel, mutate, expect) {
  const abs = path.join(ROOT, rel);
  const original = fs.readFileSync(abs);
  const size0 = original.length;
  let restored = false;
  try {
    const next = mutate(original.toString('utf8'));
    if (next === original.toString('utf8')) {
      bad.push(`${label}: 变异没生效（探针自身坏了）`);
      return;
    }
    fs.writeFileSync(abs, next, 'utf8');
    const r = runValidate();
    if (r.code === 0) bad.push(`${label}: validate 仍然 exit 0（门禁没抓到）`);
    else if (!expect.test(r.text)) bad.push(`${label}: 报错里没有 ${expect}（抓到了别的）`);
    else pass++;
  } finally {
    fs.writeFileSync(abs, original);
    restored = fs.readFileSync(abs).length === size0;
    if (!restored) bad.push(`${label}: 还原后字节数不符（${size0} → ${fs.readFileSync(abs).length}）`);
  }
}

// 1 persona 超上限（实现层词 / 长度两条断言任一命中即可，这里直接冲长度）
probe('persona 超限', 'cordis.patch.yml', (t) => t.replace('目标：最小 diff、最少 token、最快。', '目标：最小 diff、最少 token、最快。'.concat('填充'.repeat(200))), /persona 长度/);

// 2 persona 漏实现层词（把 uidump 塞回去）
probe('persona 实现层词', 'cordis.patch.yml', (t) => t.replace('验证：改动攒批跑一条验收命令', '验证：改 3~5 处跑一条 v.ps1；对齐走 uidump'), /persona 出现实现层词|persona 长度/);

// 3 技能正文超上限（wish-loop 追加 4 KB 填充）
probe('技能正文超上限', 'skills/wish-loop/SKILL.md', (t) => t + '\n' + '填充行 '.repeat(1400) + '\n', /> 上限/);

// 4 阶段号漂移（把 4.6 改成 4.66）
probe('阶段号漂移', 'skills/wish-loop/SKILL.md', (t) => t.replace('## 阶段 4.6 ·', '## 阶段 4.66 ·'), /阶段号: wish-loop 缺阶段 4\.6|阶段号: wish-loop 多出/);

// 5 版本与 CHANGELOG 不同源（当前版本从 package.json 读，别写死——写死会在每次发版后失效）
const CUR_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
probe('版本不同源', 'package.json', (t) => t.replace(`"version": "${CUR_VERSION}"`, '"version": "0.0.999"'), /version 应为|CHANGELOG\.md: 首条版本/);

if (bad.length) {
  for (const b of bad) console.error(`  FAIL ${b}`);
  console.error(`\n${pass} 通过 / ${bad.length} 失败`);
  process.exit(1);
}
console.log(`全部通过（${pass} 个负向探针，文件均已还原）`);
