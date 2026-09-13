import subprocess, os, time, signal

# Find uvicorn PID via WMIC
r = subprocess.run(
    ['wmic', 'process', 'where', 'name="python.exe"', 'get', 'ProcessId,CommandLine', '/format:list'],
    capture_output=True, text=True, timeout=10
)
lines = r.stdout.strip().split('\n')
current_pid = None
for line in lines:
    line = line.strip()
    if not line:
        continue
    if '=' in line:
        k, v = line.split('=', 1)
        if k.strip() == 'ProcessId':
            current_pid = v.strip()
        elif k.strip() == 'CommandLine' and current_pid:
            if 'uvicorn' in v.lower() or ('main' in v.lower() and '8000' in v):
                print(f'FOUND PID {current_pid}: {v[:200]}')

# Also try tasklist approach
print('\n--- tasklist filter ---')
r2 = subprocess.run(
    ['tasklist', '/FI', 'IMAGENAME eq python.exe', '/V', '/FO', 'CSV'],
    capture_output=True, text=True, timeout=10
)
print(r2.stdout[:500])
