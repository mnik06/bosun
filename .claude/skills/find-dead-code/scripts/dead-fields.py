#!/usr/bin/env python3
"""Dataflow pass for the find-dead-code skill.

Finds fields that reference counting can never catch: a column plumbed through
every layer (drizzle schema -> repo select -> zod resp schema -> API -> FE
render) whose *every* producer writes a constant, or that no producer writes at
all. The identifier is live in 30+ places, so `verify-symbol.sh` says "keep it";
the data is always NULL, so the whole chain is dead.

The class it catches: a column with a drizzle declaration, repo select
projections, zod entity + response schemas, fe model fields and render sites —
dozens of references — where every insert hard-codes `null` and no UPDATE,
agent frame or fe POST ever supplies a value.

Usage: dead-fields.py [repo_root]

Output has two sections:
  A. NO REAL PRODUCER  - strong candidates, every write is a literal constant.
  B. PASSTHROUGH ONLY  - the only writers launder a caller's value
                         (`col: input.col ?? null`). Trace the caller chain by
                         hand before believing it; the real producer may be
                         the fe (a POST body) or the agent (a frame).

Every hit still has to clear the 3 gates in SKILL.md.
"""
import os
import re
import subprocess
import sys

# scripts/ -> find-dead-code/ -> skills/ -> .claude/ -> repo root
REPO = sys.argv[1] if len(sys.argv) > 1 else os.environ.get(
    'REPO_ROOT', os.path.abspath(os.path.join(
        os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..')))
SCHEMA_REL = 'be/src/services/drizzle/schema.ts'
SCHEMA = os.path.join(REPO, SCHEMA_REL)

COL_TYPES = ('uuid|text|integer|numeric|boolean|timestamp|date|jsonb|real|'
             'bigint|smallint|varchar|serial|doublePrecision')

# RHS values that mean "this producer writes nothing real".
CONSTANT_RHS = re.compile(
    r'^(null|undefined|\{\}|\[\]|\'\'|""|``|0|false|true)\s*[,;)]?\s*$')

# Lines that declare a shape rather than produce a value.
DECL_RHS = re.compile(r'^(z\.|Record<|Array<|string\b|number\b|boolean\b|Date\b|'
                      r'\w+Schema\b|\w+\[\]|\{ *\[)')

# The DB itself fills these in - absence of a code producer proves nothing.
DB_FILLED = re.compile(r'\.default\(|defaultNow\(|defaultRandom\(|'
                       r'generatedAlwaysAs|\$onUpdate')


def sh(args):
    return subprocess.run(args, capture_output=True, text=True,
                          cwd=REPO).stdout


def columns():
    """[(table, column, line)] from the single drizzle schema, skipping
    DB-defaulted columns."""
    out, table = [], None
    lines = open(SCHEMA).read().split('\n')
    for i, ln in enumerate(lines):
        m = re.match(r'export const (\w+) = pgTable', ln)
        if m:
            table = m.group(1)
            continue
        m = re.match(r'\t{1,2}(\w+): (%s)\b' % COL_TYPES, ln)
        if not (m and table):
            continue
        # A drizzle column decl can wrap over a few lines (.references(...)).
        decl = '\n'.join(lines[i:i + 4])
        if DB_FILLED.search(decl):
            continue
        out.append((table, m.group(1), i + 1))
    return out


def classify(col):
    """Split every `col:` assignment site into producers vs noise.

    Scans fe/ and agent/ too: a field the fe fills in and POSTs, or the agent
    reports in a frame, has its only real producer outside be/, and a be/-only
    scan would misread that as dead."""
    raw = sh(['rg', '-n', '--no-heading', r'\b%s\s*:' % re.escape(col),
              'be/src', 'fe/app', 'agent/src',
              '-g', '!**/%s' % os.path.basename(SCHEMA_REL)])
    real, const, through, other = [], [], [], []
    for line in raw.splitlines():
        try:
            path, lineno, body = line.split(':', 2)
        except ValueError:
            continue
        rhs = body.split(':', 1)[1].strip() if ':' in body else ''
        site = (path, lineno, rhs)
        # `col: fooTable.col` in a .select({...}) reads, it does not write.
        if re.match(r'^\w+Table\.\w+', rhs):
            other.append(site + ('select-projection',))
        elif CONSTANT_RHS.match(rhs):
            const.append(site)
        elif (DECL_RHS.match(rhs) or '/types/' in path or 'routes/schemas/' in path
              or '/model/' in path or path.endswith('-frames.ts')
              or path.endswith('protocol.ts')):
            other.append(site + ('type/zod decl',))
        # `col: input.col ?? null` only launders whatever the caller passed.
        elif re.match(r'^[\w.]+\.%s\b' % re.escape(col), rhs):
            through.append(site)
        else:
            real.append(site)
    return real, const, through, other


def shorthand_producers(col):
    """Producers a `col:` regex cannot see.

    `const sha = await push(...)` followed by `send({ type, buildId, sha })`
    writes a real value without ever spelling `sha:`. Any bare-identifier binding or object
    shorthand disqualifies a column from the strong list."""
    pat = (r'(const|let|var)\s+%s\s*=|[,{]\s*%s\s*[,}]'
           % (re.escape(col), re.escape(col)))
    return sh(['rg', '-n', '--no-heading', '-e', pat, 'be/src', 'fe/app',
               'agent/src', '-g', '!**/%s' % os.path.basename(SCHEMA_REL)]).splitlines()


def fe_sites(col):
    return sh(['rg', '-l', r'\b%s\b' % re.escape(col), 'fe/app']).split()


def raw_sql(col):
    """Raw-SQL writers grep cannot see through the drizzle layer."""
    snake = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', col).lower()
    return sh(['rg', '-n', snake, 'be/src',
               '-g', '!**/%s' % os.path.basename(SCHEMA_REL)]).splitlines()


def render(table, col, line, const, through, other, shorthand, header):
    print('── %s.%s   %s:%d   [%s]' % (table, col, SCHEMA_REL, line, header))
    if const:
        print('   constant-only writes (%d):' % len(const))
        for p, n, rhs in const[:8]:
            print('     %s:%s  -> %s' % (p, n, rhs))
    if through:
        print('   passthrough writes (%d) - trace these callers:' % len(through))
        for p, n, rhs in through[:8]:
            print('     %s:%s  -> %s' % (p, n, rhs))
    if shorthand:
        print('   shorthand/bare bindings (%d) - a real producer may hide here:'
              % len(shorthand))
        for s in shorthand[:6]:
            print('     %s' % s.strip())
    kinds = {}
    for p, n, rhs, kind in other:
        kinds.setdefault(kind, []).append('%s:%s' % (p, n))
    for kind, sites in kinds.items():
        print('   %s (%d): %s' % (kind, len(sites), ', '.join(sites[:4])))
    fe = fe_sites(col)
    if fe:
        print('   FE files touching it (%d): %s' % (len(fe), ', '.join(fe[:5])))
    sql = raw_sql(col)
    if sql:
        print('   !! snake_case hits (check for a raw-SQL writer): %d' % len(sql))
    print()


def main():
    cols = columns()
    strong, traced = [], []
    for table, col, line in cols:
        real, const, through, other = classify(col)
        if real or (not const and not through and not other):
            continue
        # Every known origin is a literal => strong. A passthrough chain with no
        # constant anywhere means the value probably arrives from API input, and
        # a shorthand binding means a producer exists that the regex cannot see.
        shorthand = shorthand_producers(col)
        strong_case = bool(const) and not shorthand
        (strong if strong_case else traced).append(
            (table, col, line, const, through, other, shorthand))

    print('# dataflow pass - %d code-written columns in %s' % (len(cols), SCHEMA_REL))
    print('# Listed when NO producer writes a non-constant value. Reference')
    print('# counting cannot see this: the identifier is live in every layer.')
    print('# Sites are matched by column NAME, so a name shared by several tables')
    print('# repeats the same evidence - report those as ONE chained finding.\n')

    print('## A. NO REAL PRODUCER (%d) - every write is a literal constant\n' % len(strong))
    for row in strong:
        render(*row, header='no real producer')

    print('## B. PASSTHROUGH ONLY (%d) - writer launders a caller value; trace it\n'
          % len(traced))
    for row in traced:
        render(*row, header='passthrough only')

    print('# Before reporting any of these, confirm no raw-SQL/UPDATE writer, then')
    print('# report the WHOLE chain as one finding - column + repo select + zod')
    print('# schema + TS types + FE render sites - not just the column.')


if __name__ == '__main__':
    main()
