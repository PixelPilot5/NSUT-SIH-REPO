# SQLALCHEMY
from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import declarative_base

# Base class for all our database models
Base = declarative_base()

# User database table
class Users(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String)
    email = Column(String, unique=True)
    password = Column(String)

# Simulations database table
class Simulations(Base):
    __tablename__ = "simulations"

    id = Column(Integer, primary_key=True)
    name = Column(String)
    state = Column(String)
    district = Column(String)
    river = Column(String)
    dam = Column(String)
    scenario = Column(String)
    model = Column(String)