
lines = open("stage7_api.py", "r", encoding="utf-8").readlines()
del lines[163:171]
open("stage7_api.py", "w", encoding="utf-8").writelines(lines)
print("Done")
