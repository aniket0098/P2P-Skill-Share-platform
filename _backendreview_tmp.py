import pathlib

def show(path, a, b, tag):
    lines = pathlib.Path(path).read_text(encoding="utf-8").splitlines()
    print(f"===== {tag} lines {a}-{b} (total {len(lines)}) =====")
    for i, ln in enumerate(lines[a - 1:b], start=a):
        print(f"{i:5}| {ln}")
    print()

show(r"c:\project p2p\backend-I\main.py", 1600, 1710, "main.py serializer + list endpoint")
show(r"c:\project p2p\backend-I\main.py", 1710, 1775, "main.py skills + providers + detail")