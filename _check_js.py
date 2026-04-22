import re

with open('ITSM_Ticket_Intelligence.html', 'r', encoding='utf-8') as f:
    html = f.read()

scripts = list(re.finditer(r'<script>([\s\S]*?)</script>', html))
main_script = max(scripts, key=lambda m: len(m.group(1)))
script_content = main_script.group(1)
script_start_html_line = html[:main_script.start()].count('\n') + 1

lines = script_content.split('\n')

# More careful brace counting - skip template literals
def count_braces_in_line(line):
    opens = 0
    closes = 0
    i = 0
    in_str = False
    str_char = None
    template_depth = 0
    while i < len(line):
        c = line[i]
        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == str_char and str_char != '`':
                in_str = False
            elif c == str_char and str_char == '`':
                in_str = False
        else:
            if c in ('"', "'"):
                in_str = True
                str_char = c
            elif c == '`':
                in_str = True
                str_char = '`'
            elif c == '/' and i+1 < len(line) and line[i+1] == '/':
                break  # line comment - stop
            elif c == '{':
                opens += 1
            elif c == '}':
                closes += 1
        i += 1
    return opens, closes

depth = 0
depth_history = []
for i, line in enumerate(lines, 1):
    o, c = count_braces_in_line(line)
    depth += o - c
    depth_history.append((i, depth, o, c, line.strip()[:60]))

print(f"Final depth: {depth}")
print(f"\nLines where depth INCREASED by 2+ in one line (suspicious):")
for i in range(1, len(depth_history)):
    prev_d = depth_history[i-1][1]
    curr_d = depth_history[i][1]
    if curr_d - prev_d >= 2:
        li, d, o, c, txt = depth_history[i]
        html_line = script_start_html_line + li
        print(f"  Script:{li} HTML:{html_line} depth:{prev_d}->{d} (+{o}-{c}) | {txt}")

print(f"\nLast 20 lines of script with running depth:")
for li, d, o, c, txt in depth_history[-20:]:
    html_line = script_start_html_line + li
    print(f"  Script:{li:4d} HTML:{html_line:4d} depth:{d:3d} | {txt}")
