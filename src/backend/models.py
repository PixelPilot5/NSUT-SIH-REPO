# PYDANTIC
from pydantic import BaseModel  # BaseModel is a Pydantic class that provides data validation and data parsing functionality to the class that inherits from it.

# Pydantic User represents one row of the SQLAlchemy Users table
class User(BaseModel):
    name: str
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    name: str
    email: str

class Login(BaseModel):
    email: str
    password: str
    
# Pydantic Simulation represents one row of the SQLAlchemy Simulations table
class Simulation(BaseModel):
    name: str | None = None
    state: str
    district: str
    river: str
    dam: str
    scenario: str
    model: str