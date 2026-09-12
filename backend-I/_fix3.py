
lines = open("stage7_service.py", "r", encoding="utf-8").readlines()
# Remove lines 237-251 (1-indexed) = indices 236-250
del lines[236:251]
open("stage7_service.py", "w", encoding="utf-8").writelines(lines)
print("Removed orphaned lines")
