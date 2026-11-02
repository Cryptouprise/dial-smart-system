import io, re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

p = r'supabase\migrations\20261029142121_phase1_org_scope.sql'
t = io.open(p, encoding='utf-8', errors='replace').read()
L = t.replace('\r', '').split('\n')
print('lines', len(L))
pat = re.compile(r'(create or replace function|create policy|is_org|org_member|current_org|company)', re.I)
for i, ln in enumerate(L):
    if pat.search(ln):
        print('%4d|%s' % (i + 1, ln))
