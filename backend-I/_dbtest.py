import psycopg2
import sys

try:
    c = psycopg2.connect(
        'postgresql://postgres:postgres@localhost:5432/skillshare',
        connect_timeout=5
    )
    print('Connected to local PostgreSQL successfully')
    cur = c.cursor()
    cur.execute('SELECT version()')
    print('Version:', cur.fetchone()[0][:80])
    cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'")
    tables = [r[0] for r in cur.fetchall()]
    print('Tables:', tables)
    cur.close()
    c.close()
except Exception as e:
    print('Connection failed:', e)
    sys.exit(1)