import re

with open(r'C:\Users\thiag\.gemini\antigravity-ide\scratch\Patio-CRM\app.js', 'r', encoding='utf-8') as f:
    app = f.read()

with open(r'C:\Users\thiag\.gemini\antigravity-ide\scratch\Patio-CRM\financeiro.js', 'r', encoding='utf-8') as f:
    fin = f.read()

# Find the old financial section: from "function viewFinanceiro" to the line before "/* --- conciliação bancária ---"
# The old code spans from viewFinanceiro through blocoCaixa (the SVG chart version)
# We need to replace: viewFinanceiro + listaContas + cliZap + textoCobrancaRapida + blocoCaixa
# These are lines 752 through ~836

# Find start marker
start_marker = 'function viewFinanceiro(){'
start_idx = app.find(start_marker)
if start_idx == -1:
    print("ERROR: Could not find viewFinanceiro")
    exit(1)

# Find end marker - the conciliação bancária section starts after blocoCaixa
end_marker = '/* ---------------- conciliação bancária ----------------'
end_idx = app.find(end_marker)
if end_idx == -1:
    # Try without accent
    end_marker = '/* ---------------- concilia'
    end_idx = app.find(end_marker)
if end_idx == -1:
    print("ERROR: Could not find end marker")
    exit(1)

# Replace the old financial code with the new one
new_app = app[:start_idx] + fin + '\n\n' + app[end_idx:]

with open(r'C:\Users\thiag\.gemini\antigravity-ide\scratch\Patio-CRM\app.js', 'w', encoding='utf-8') as f:
    f.write(new_app)

print("SUCCESS: Financial module replaced")
print(f"  Old section: chars {start_idx} to {end_idx}")
print(f"  New module size: {len(fin)} chars")
