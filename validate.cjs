#!/usr/bin/env node
/**
 * dsh-wishcoder-devteam 自检门禁（CommonJS：包是 type=module）。
 * 改完任何文件后跑：  node D:\agent\dsh-wishcoder-devteam\validate.cjs
 * 退出 0 = 通过；1 = 失败（逐条打到 stderr）。
 *
 * 覆盖单入口预设（devteam order 20；原 wishcoder(21) 已折叠为「许愿：」路由）的全部硬约束：
 *   1 包清单与版本（0.0.207）、bundle patch 路径存在
 *   2 顶层只有一个 `- insert:`，里面恰好一个 preset 行（id/name/order 唯一）
 *   3 preset 作用域不得出现内核级服务行（permission / permissionPresets）——
 *     会 `service ... has been registered` → 预设组装失败 → 新建会话直接失败
 *   4 persona 非空且长度在区间内，硬底线与「许愿：」路由关键词在位
 *   5 skill-filesystem.customSkillDirs 指向本包 skills\，目录存在
 *   6 每个必需技能都有 SKILL.md，front-matter name 与目录名一致，正文不为空
 *   7 技能目录不得有未登记项（roles.json 覆盖 devteam 角色，wish-loop/verify-harness 另行白名单）
 *   8 文本卫生：无 U+FFFD / 零宽字符 / BOM
 *   9 常驻记忆预算：项目根 AGENTS.md ≤8192 B / ≤60 行
 *  10 persona 只放契约：不得出现实现层词（.ps1 / uidump / JDK / PATH 无 / memory\）
 *  11 技能正文上限：wish-loop ≤19 KB，其余 ≤13 KB（只查下限会让单文件无限长）
 *  12 语境一致性：skills 里出现旧副本路径 `memory\projects` → FAIL；
 *     wish-loop 阶段号必须等于白名单（防重排时静默断掉技能间的阶段引用）；
 *     CHANGELOG 首条版本节 == package.json version
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const ROOT = __dirname;
const PROFILE = path.join(process.env.DSH_HOME || path.join(process.env.USERPROFILE || 'C:/Users/Administrator', '.dsh'), 'profiles/desktop').replace(/\\/g, '/');
const PKG_NAME = 'dsh-wishcoder-devteam';
const VERSION = '0.0.210';
const SKILLS_ROOT = path.join(ROOT, 'skills');

/** 预设白名单：id → 期望配置 */
const PRESETS = {
  devteam: {
    rowId: 'preset-devteam',
    order: 20,
    personaMin: 500,
    personaMax: 1000,
    // 「许愿：」路由行在 persona 里，wish 细则在技能正文——两条都查，防止被顺手删掉
    mustSay: ['最小 diff', '底线', '许愿：', 'wish-loop', '需求转译', '验收专家', '功能测试'],
    skills: [
      'devteam-flow',
      'requirement-translator',
      'acceptance-verifier',
      'web-platform',
      'android-app',
      'embedded-firmware',
      'debug-research',
      'win-desktop',
    ],
    roleRegistry: true,
    includeDefaultRoots: false,
  },
};

/** 不进 roles.json 的技能：折叠进来的许愿闭环（角色注册表只管 devteam 的 6 个角色） */
const NON_ROLE_SKILLS = ['wish-loop', 'verify-harness'];

const KERNEL_ROWS = new Set(['permission', 'permissionPresets']);
const BASE_SVC_ROWS = new Set(['goal', 'goal-round-driver']);

const fails = [];
const warns = [];
const oks = [];
const fail = (m) => fails.push(m);
const warn = (m) => warns.push(m);
const ok = (m) => oks.push(m);

const BAD = /[\u200B-\u200D\uFEFF\u2060\u00AD]/g;

function readText(abs, label) {
  const t = fs.readFileSync(abs, 'utf8');
  if (t.includes('\uFFFD')) fail(`${label}: 含 U+FFFD（编码损坏）`);
  if (t.charCodeAt(0) === 0xfeff) fail(`${label}: 以 BOM 开头`);
  const hidden = t.match(BAD);
  if (hidden) fail(`${label}: ${hidden.length} 个零宽/不可见字符`);
  return t;
}

function loadYaml() {
  for (const from of [`${PROFILE}/package.json`, `${ROOT}/package.json`]) {
    try {
      return createRequire(from)('yaml');
    } catch {
      /* 试下一个 */
    }
  }
  return null;
}

// ── 1. 包清单 ────────────────────────────────────────────────
let pkg = null;
try {
  pkg = JSON.parse(readText(path.join(ROOT, 'package.json'), 'package.json'));
  if (pkg.name !== PKG_NAME) fail(`package.json: name 应为 ${PKG_NAME}，实为 ${pkg.name}`);
  if (pkg.version !== VERSION) fail(`package.json: version 应为 ${VERSION}，实为 ${pkg.version}`);
  const patchRel = pkg?.dsh?.bundle?.patch;
  if (!patchRel) fail('package.json: 缺 dsh.bundle.patch');
  else if (!fs.existsSync(path.join(ROOT, patchRel))) fail(`package.json: patch 文件不存在（${patchRel}）`);
  else ok(`package.json ${pkg.name}@${pkg.version} + bundle patch`);
} catch (e) {
  fail(`package.json: ${e.message}`);
}

// ── 2/3. patch YAML 结构 ────────────────────────────────────
const yaml = loadYaml();
const presets = new Map();
if (!yaml) fail('无法加载 "yaml" 模块（profile 或包目录）');
else {
  const raw = readText(path.join(ROOT, 'cordis.patch.yml'), 'cordis.patch.yml');
  let doc = null;
  try {
    doc = yaml.parse(raw.replace(/!!js\s+/g, ''));
  } catch (e) {
    fail(`cordis.patch.yml: YAML 解析失败: ${e.message}`);
  }
  if (doc) {
    if (!Array.isArray(doc)) fail('cordis.patch.yml: 顶层应是列表');
    const inserts = Array.isArray(doc) ? doc.filter((r) => r && Array.isArray(r.insert)) : [];
    if (inserts.length !== 1) fail(`cordis.patch.yml: 顶层应有且只有 1 个 \`- insert:\`，实为 ${inserts.length}`);
    const rows = inserts[0]?.insert ?? [];
    const presetRows = rows.filter((r) => r && r.name === '@deepseek-ai/dsh-agent-preset');
    if (presetRows.length !== 1) fail(`cordis.patch.yml: preset 行应为 1 个（单入口），实为 ${presetRows.length}`);
    for (const row of presetRows) {
      const cfg = row.config || {};
      const spec = PRESETS[cfg.id];
      if (!spec) {
        fail(`未知 preset id: ${cfg.id}（白名单 ${Object.keys(PRESETS).join('/')}）`);
        continue;
      }
      if (row.id !== spec.rowId) fail(`${cfg.id}: 行 id 应为 ${spec.rowId}，实为 ${row.id}`);
      if (cfg.order !== spec.order) fail(`${cfg.id}: order 应为 ${spec.order}，实为 ${cfg.order}`);
      if (!Array.isArray(cfg.plugins)) {
        fail(`${cfg.id}: config.plugins 不是列表`);
        continue;
      }
      presets.set(cfg.id, cfg);
      ok(`preset ${cfg.id} order=${cfg.order} plugins=${cfg.plugins.length}`);
      for (const p of cfg.plugins) {
        if (!p || typeof p !== 'object') {
          fail(`${cfg.id}: plugins 里有非对象行 ${JSON.stringify(p)}`);
          continue;
        }
        if (KERNEL_ROWS.has(p.id)) fail(`${cfg.id}/${p.id}: 内核级服务行不能出现在 preset 作用域 → 组装失败`);
        else if (BASE_SVC_ROWS.has(p.id)) warn(`${cfg.id}/${p.id}: 可能是 base 层服务，重复声明有 registered 风险`);
        if (!p.name) fail(`${cfg.id}: plugins 行 ${p.id || '(无 id)'} 缺 name`);
      }
    }
  }
}

// ── 4. persona ──────────────────────────────────────────────
for (const [id, spec] of Object.entries(PRESETS)) {
  const cfg = presets.get(id);
  if (!cfg) {
    fail(`${id}: 未找到 preset 声明`);
    continue;
  }
  const row = cfg.plugins.find((p) => p && p.id === 'persona');
  if (!row) {
    fail(`${id}: 没有 persona 行`);
    continue;
  }
  const text = row.config?.prefix ?? '';
  const len = [...text].length;
  if (len < spec.personaMin || len > spec.personaMax)
    fail(`${id}: persona 长度 ${len} 超出 ${spec.personaMin}~${spec.personaMax}`);
  else ok(`${id}: persona ${len} 字符`);
  for (const kw of spec.mustSay) if (!text.includes(kw)) fail(`${id}: persona 缺关键词「${kw}」`);
  // 常驻层只放言行契约：实现/机器层词属于技能与项目 AGENTS.md（否则每请求重付，且挤掉新规则的位置）
  const IMPL_WORDS = ['.ps1', 'uidump', 'JDK', 'PATH 无', 'memory\\'];
  const leaked = IMPL_WORDS.filter((w) => text.includes(w));
  if (leaked.length) fail(`${id}: persona 出现实现层词 ${leaked.join('/')}（迁到技能或项目 AGENTS.md）`);
}

// ── 5. 技能根目录 ───────────────────────────────────────────
const expectedDir = path.resolve(SKILLS_ROOT);
for (const [id, spec] of Object.entries(PRESETS)) {
  const cfg = presets.get(id);
  if (!cfg) continue;
  const row = cfg.plugins.find((p) => p && p.id === 'skill-filesystem');
  if (!row) {
    fail(`${id}: 没有 skill-filesystem 行`);
    continue;
  }
  const dirs = row.config?.customSkillDirs ?? [];
  if (!dirs.some((d) => path.resolve(d) === expectedDir))
    fail(`${id}: customSkillDirs 未指向本包 skills\\（实为 ${JSON.stringify(dirs)}）`);
  if (!fs.existsSync(expectedDir)) fail(`${id}: 技能根目录不存在 ${expectedDir}`);
  if ((row.config?.includeDefaultRoots ?? true) !== spec.includeDefaultRoots)
    fail(`${id}: includeDefaultRoots 应为 ${spec.includeDefaultRoots}`);
}

// ── 6. 技能正文 ─────────────────────────────────────────────
const skillDirs = fs.existsSync(SKILLS_ROOT)
  ? fs.readdirSync(SKILLS_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
for (const name of skillDirs) {
  const file = path.join(SKILLS_ROOT, name, 'SKILL.md');
  if (!fs.existsSync(file)) {
    fail(`skills/${name}: 缺 SKILL.md`);
    continue;
  }
  const text = readText(file, `skills/${name}/SKILL.md`);
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) fail(`skills/${name}/SKILL.md: 缺 front-matter`);
  else {
    const nameLine = /^name:\s*(.+)$/m.exec(fm[1]);
    if (!nameLine || nameLine[1].trim() !== name)
      fail(`skills/${name}/SKILL.md: front-matter name 应为 ${name}，实为 ${nameLine?.[1]?.trim() ?? '(缺)'}`);
    if (!/^description:\s*\S/m.test(fm[1])) fail(`skills/${name}/SKILL.md: front-matter 缺 description`);
  }
  if (text.length < 400) warn(`skills/${name}/SKILL.md: 正文只有 ${text.length} 字符，可能被截断`);
  // 上限：只有下限时单文件会一路长（wish-loop 五天涨 3 次），而它每次加载都进上下文。
  const cap = name === 'wish-loop' ? 19000 : 13000;
  if (text.length > cap) fail(`skills/${name}/SKILL.md: ${text.length} 字符 > 上限 ${cap}（拆节或下沉到引用文档）`);
  if (/memory\\projects/.test(text)) fail(`skills/${name}/SKILL.md: 出现旧副本路径 memory\\projects（应写项目根 NOTES/AGENTS）`);
}
if (skillDirs.length) ok(`skills\\: ${skillDirs.length} 个技能目录，SKILL.md + front-matter 已校验`);

// ── 7. 技能登记（roles.json 覆盖 devteam） ──────────────────
const rolesPath = path.join(ROOT, 'roles.json');
let roles = null;
if (!fs.existsSync(rolesPath)) fail('缺 roles.json');
else {
  try {
    roles = JSON.parse(readText(rolesPath, 'roles.json'));
  } catch (e) {
    fail(`roles.json: ${e.message}`);
  }
}
if (roles) {
  const registered = new Set((roles.roles ?? []).filter((r) => r.status === 'active').map((r) => r.skill));
  for (const r of roles.roles ?? []) {
    if (!r.approvedBy) fail(`roles.json: ${r.skill} 缺 approvedBy`);
    if (!fs.existsSync(path.join(SKILLS_ROOT, r.skill)))
      fail(`roles.json: 登记了 ${r.skill}，但 skills\\ 下没有该目录`);
  }
  if ((roles.maxSkills ?? 99) < registered.size) fail(`roles.json: maxSkills ${roles.maxSkills} < 已登记 ${registered.size}`);
  for (const name of PRESETS.devteam.skills)
    if (!registered.has(name)) fail(`roles.json: devteam 必需角色 ${name} 未登记为 active`);
  ok(`roles.json: ${registered.size} 个 active 角色 / maxSkills ${roles.maxSkills ?? '(未设)'}`);
  const stray = skillDirs.filter((d) => !registered.has(d) && !NON_ROLE_SKILLS.includes(d));
  if (stray.length) fail(`skills\\ 下有未登记技能目录: ${stray.join(', ')}`);
}

// 必需技能存在性（devteam 角色 + 许愿闭环）
for (const [id, spec] of Object.entries(PRESETS)) {
  for (const name of spec.skills) {
    if (!skillDirs.includes(name)) fail(`${id}: 必需技能 skills/${name} 缺失`);
  }
}
for (const name of NON_ROLE_SKILLS) {
  if (!skillDirs.includes(name)) fail(`许愿闭环: 必需技能 skills/${name} 缺失`);
}

// ── 8. 五段流水线（0.0.203 起，0.0.206 改结构断言）──────────────
// 需求转译 / 验收专家是流水线硬构件：删掉任一段就退回「子智能体报绿即完成」的旧行为，
// 但人不会每次都去读技能正文——把段落关键词做成门禁，比每轮靠自觉便宜。
// 0.0.206：子串包含 → 逐行正则，且跳过注释行（`//`、`/*`、`<!--`、`;` 开头），
// 否则把关键词写进注释就能骗过门禁。
const PIPELINE = [
  ['skills/requirement-translator/SKILL.md', [
    ['需求卡', /需求卡/],
    ['分派表', /分派表/],
    ['写域', /写域/],
    ['blocked_by', /blocked_by/],
  ]],
  ['skills/acceptance-verifier/SKILL.md', [
    ['## 测试报告 标题', /^##\s*测试报告/m],
    ['TEST-REPORT.md', /TEST-REPORT\.md/],
    ['判据缺陷', /判据缺陷/],
    ['功能测试', /功能测试/],
    ['EXIT=', /EXIT=/],
  ]],
  ['skills/wish-loop/SKILL.md', [
    ['五段流水线', /五段流水线/],
    ['阶段 4.7', /阶段 4\.7/],
    ['阶段 4.8', /阶段 4\.8/],
    ['阶段 5.5', /阶段 5\.5/],
    ['深度 2', /深度 2/],
    ['开工规划', /开工规划/],
    ['派发后守注意力', /派发后守注意力/],
    ['TEST-REPORT.md', /TEST-REPORT\.md/],
    ['记忆三档', /记忆三档/],
    ['常驻档预算', /≤60 行 \/ ≤8 KB/],
  ]],
  ['skills/devteam-flow/SKILL.md', [
    ['派后锁范围', /派后锁范围/],
    ['测试报告', /测试报告/],
    ['清过程件', /清过程件/],
  ]],
];
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|<!--|;)/;
for (const [rel, kws] of PIPELINE) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    fail(`流水线: 缺 ${rel}`);
    continue;
  }
  const lines = fs.readFileSync(abs, 'utf8').split('\n').filter((l) => !COMMENT_LINE.test(l));
  const miss = kws.filter(([, re]) => !lines.some((l) => re.test(l))).map(([label]) => label);
  if (miss.length) fail(`流水线: ${rel} 缺断言 ${miss.join(' / ')}`);
}
if (roles) {
  const active = new Set((roles.roles ?? []).filter((r) => r.status === 'active').map((r) => r.skill));
  for (const need of ['requirement-translator', 'acceptance-verifier'])
    if (!active.has(need)) fail(`流水线: roles.json 缺 active 角色 ${need}`);
}
// 下派预算：领域子智能体（深度 1）要能再派一层，maxDepth 必须是 2；
// 回到默认 1 会让「域内再切块」的子智能体直接被拒（深度 1 的 agent 调 subagent 会吞掉一层）。
const devteamPlugins = presets.get('devteam')?.plugins ?? [];
const delegationRow = devteamPlugins.find((p) => p && p.id === 'delegation');
const subagentRow = Array.isArray(delegationRow?.config)
  ? delegationRow.config.find((p) => p && p.id === 'tool-subagent')
  : null;
if (!subagentRow) fail('流水线: delegation/tool-subagent 行缺失');
else if (subagentRow.config?.maxDepth !== 2)
  fail(`流水线: tool-subagent maxDepth=${JSON.stringify(subagentRow.config?.maxDepth)}，应为 2（领域子智能体可再下派一层）`);
ok('流水线: 需求转译 → 分派实现(深度 2) → 验收专家 → 功能测试 断言在位');

// ── 8b. 阶段号白名单（0.0.208）───────────────────────────────
// 技能之间用「阶段 N」互相引用（acceptance-verifier / devteam-flow / verify-harness 都引 wish-loop）。
// 重排阶段时号会漂，而漂掉后引用仍"看起来对"——只有集合断言能抓到。
const WISH_STAGES = ['0', '1', '2', '3', '3.5', '4', '4.5', '4.6', '4.7', '4.8', '5', '5.5', '6'];
{
  const file = path.join(ROOT, 'skills/wish-loop/SKILL.md');
  if (fs.existsSync(file)) {
    const got = [...fs.readFileSync(file, 'utf8').matchAll(/^## 阶段 ([\d.]+)\b/gm)].map((m) => m[1]);
    const miss = WISH_STAGES.filter((s) => !got.includes(s));
    const extra = got.filter((s) => !WISH_STAGES.includes(s));
    const dup = got.filter((s, i) => got.indexOf(s) !== i);
    if (miss.length) fail(`阶段号: wish-loop 缺阶段 ${miss.join('/')}`);
    else if (extra.length) fail(`阶段号: wish-loop 多出未登记阶段 ${extra.join('/')}（要加先改白名单并说明判据）`);
    else if (dup.length) fail(`阶段号: wish-loop 阶段重复 ${[...new Set(dup)].join('/')}`);
    else ok(`阶段号: wish-loop ${got.length} 个阶段齐全且唯一（0~6，含 3.5/4.5~4.8/5.5）`);
  }
}

// ── 8c. 版本与 CHANGELOG 同源（0.0.208）──────────────────────
{
  const cl = path.join(ROOT, 'CHANGELOG.md');
  if (!fs.existsSync(cl)) fail('CHANGELOG.md 缺失');
  else {
    const first = /^## (\d+\.\d+\.\d+)/m.exec(fs.readFileSync(cl, 'utf8'));
    if (!first) fail('CHANGELOG.md: 找不到 `## <version>` 版本节');
    else if (first[1] !== VERSION) fail(`CHANGELOG.md: 首条版本 ${first[1]} ≠ VERSION ${VERSION}`);
    else ok(`CHANGELOG 首条 = ${first[1]}（与 VERSION 同源）`);
  }
}


// ── 9. 常驻记忆预算（0.0.207）─────────────────────────────────
// 项目根 AGENTS.md 整份注入、每请求重付，1 KB ≈ 300 tok × 每会话请求数。
// 没有门禁时它只会单向膨胀（实测本工作区 12,001 B / 62 行，超自定上限 50%）。
// 只在文件存在时断言，validate 不依赖工作区布局。
const AGENTS_MD = path.join(ROOT, '..', 'AGENTS.md');
if (fs.existsSync(AGENTS_MD)) {
  const bytes = fs.statSync(AGENTS_MD).size;
  const lines = fs.readFileSync(AGENTS_MD, 'utf8').split('\n').length;
  const bad = [];
  if (bytes > 8192) bad.push(`${bytes} B > 8192 B`);
  if (lines > 60) bad.push(`${lines} 行 > 60 行`);
  if (bad.length) fail(`常驻预算: AGENTS.md ${bad.join(' / ')}（按 wish-loop 阶段 6 三档往 NOTES 搬）`);
  else ok(`常驻预算: AGENTS.md ${bytes} B / ${lines} 行（上限 8192 B / 60 行）`);
}

// ── 输出 ────────────────────────────────────────────────────
for (const line of oks) console.log(`  ok   ${line}`);
for (const line of warns) console.warn(`  warn ${line}`);
if (fails.length) {
  for (const line of fails) console.error(`  FAIL ${line}`);
  console.error(`\n${fails.length} 项失败 / ${oks.length} 项通过`);
  process.exit(1);
}
console.log(`\n全部通过（${oks.length} 项，${warns.length} 条提醒）`);
