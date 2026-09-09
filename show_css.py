import pathlib
css = pathlib.Path('peer to peer skill share/explore.css').read_text(encoding='utf-8')
print('CSS length:', len(css))
print('\n--- Learning resources CSS section (around line 1946) ---')
lines = css.split('\n')
for i, line in enumerate(lines[1945:2150], start=1946):
    print(f'{i}: {line}')
