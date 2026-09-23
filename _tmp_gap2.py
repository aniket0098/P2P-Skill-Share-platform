import re

BASE = "peer to peer skill share/"
c = open(BASE + "profile.css", encoding="utf-8").read()

sels = re.findall(r'(?m)^([.#a-zA-Z\[][^{}\n]*)\{', c)
print("RULES:", len(sels))
for s in sels:
    print(s.strip())
