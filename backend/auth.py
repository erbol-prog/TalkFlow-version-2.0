from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from .database import get_db
from .models import User, ConversationParticipant, Message
from .schemas import UserCreate, UserLogin, Token
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta

router = APIRouter(prefix="/auth")

SECRET_KEY = "your_secret_key"  # Replace with a secure key
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_current_user(
    token: str = Depends(OAuth2PasswordBearer(tokenUrl="/auth/signin")),
    db: Session = Depends(get_db),
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.post("/signup", response_model=Token)
def signup(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = get_password_hash(user.password)
    new_user = User(username=user.username, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    access_token = create_access_token(data={"sub": new_user.username})
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/signin", response_model=Token)
def signin(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    access_token = create_access_token(data={"sub": db_user.username})
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me")
def get_current_user_data(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "username": user.username,
        "is_admin": user.is_admin,
        "is_super_admin": user.is_super_admin
    }


@router.get("/user/{username}")
def get_user_by_username(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user.id, "username": user.username}


# Add new endpoint to get user by ID
@router.get("/user/id/{user_id}")
def get_user_by_id(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user.id, "username": user.username}


@router.get("/users/search")
def search_users(
    query: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not query:
        raise HTTPException(status_code=400, detail="Query parameter is required")
    users = db.query(User).filter(User.username.ilike(f"{query}%")).all()
    if not users:
        return []  # Return empty list instead of raising an error
    return [{"id": user.id, "username": user.username} for user in users]


@router.get("/profile/{user_id}")
def get_user_profile(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Find user by ID
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if viewing own profile or someone else's
    is_own_profile = current_user.id == user_id

    # Build profile data
    profile_data = {
        "id": user.id,
        "username": user.username,
        "is_own_profile": is_own_profile,
    }

    # Add additional data only visible to own user
    if is_own_profile:
        # Get count of conversations the user is part of
        conversation_count = (
            db.query(ConversationParticipant)
            .filter(ConversationParticipant.user_id == user.id)
            .count()
        )

        # Get message count sent by user
        message_count = db.query(Message).filter(Message.sender_id == user.id).count()

        profile_data.update(
            {
                "conversation_count": conversation_count,
                "message_count": message_count,
                "account_created": (
                    user.created_at.isoformat() if hasattr(user, "created_at") else None
                ),
            }
        )

    return profile_data
