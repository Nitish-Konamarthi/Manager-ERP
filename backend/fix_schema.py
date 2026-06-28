import re

with open('prisma/schema.prisma', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find all @relation declarations and build reverse map
# For each model, we track what fields it needs to have added
current_model = None
forward_rels = []  # (from_model, to_model, field_name, is_list_like)

for i, line in enumerate(lines):
    m = re.match(r'^model (\w+)', line)
    if m:
        current_model = m.group(1)
    if current_model and '@relation' in line and 'fields' in line:
        fld = re.search(r'^\s+(\w+)', line)
        type_m = re.search(r'\b(\w+)\s+@relation', line)
        if fld and type_m:
            forward_rels.append((current_model, type_m.group(1), fld.group(1)))

# Build reverse relation requirements
needed = {}  # model_name -> list of (reverse_field_name, target_model_name)
for fm, to, fld in forward_rels:
    if to not in needed:
        needed[to] = []
    # Check if reverse already exists
    reverse_field = fld + '_reverse'
    # Use a simpler naming: pluralize or use the source model name
    needed[to].append((fm.lower() + 's', fm))

print("Forward relations found:")
for fm, to, fld in forward_rels:
    print(f"  {fm}.{fld} -> {to}")

print("\nNeeded reverse fields:")
for model, revs in sorted(needed.items()):
    for rev_field, src_model in revs:
        print(f"  {model}.{rev_field} -> {src_model}")
