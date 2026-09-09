import sqlite3
con = sqlite3.connect('backend-I/skillshare.db')
cur = con.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
print('Tables:')
for r in cur.fetchall():
    print(' -', r[0])

# Check learning_resources table
try:
    cur.execute("SELECT COUNT(*) FROM learning_resources")
    count = cur.fetchone()[0]
    print(f'\nLearning resources count: {count}')
    
    cur.execute("SELECT DISTINCT skill FROM learning_resources ORDER BY skill")
    print('\nSkills:')
    for r in cur.fetchall():
        print(' -', r[0])
    
    cur.execute("SELECT DISTINCT provider FROM learning_resources ORDER BY provider")
    print('\nProviders:')
    for r in cur.fetchall():
        print(' -', r[0])
        
    cur.execute("SELECT DISTINCT resource_type FROM learning_resources")
    print('\nResource types:')
    for r in cur.fetchall():
        print(' -', r[0])
        
    cur.execute("SELECT DISTINCT difficulty FROM learning_resources")
    print('\nDifficulty levels:')
    for r in cur.fetchall():
        print(' -', r[0])
        
    # Show sample resources
    cur.execute("SELECT id, provider, title, skill, resource_type, difficulty FROM learning_resources ORDER BY skill, provider LIMIT 20")
    print('\nSample resources:')
    for r in cur.fetchall():
        print(f'  {r[0]}: {r[1]} | {r[2][:45]} | {r[3]} | {r[4]} | {r[5]}')
except Exception as e:
    print(f'\nError checking learning_resources: {e}')

con.close()
