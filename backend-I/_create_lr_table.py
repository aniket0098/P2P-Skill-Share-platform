"""Create the learning_resources table in the database."""
from database import engine, Base
from models import LearningResource

print("Creating learning_resources table...")
Base.metadata.create_all(bind=engine, tables=[LearningResource.__table__])
print("Table created successfully.")
