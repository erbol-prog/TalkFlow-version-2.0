from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, distinct
from datetime import datetime, timedelta
from .database import get_db
from .models import User, Conversation, Message, AdminStats, ConversationParticipant
from .auth import get_current_user, get_password_hash
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter(prefix="/admin")

# Pydantic models for request/response
class AdminStatsResponse(BaseModel):
    total_users: int
    total_conversations: int
    total_messages: int
    active_users_24h: int
    new_users_24h: int
    new_messages_24h: int
    stats_date: datetime
    additional_metrics: Optional[dict] = None

class UserStats(BaseModel):
    id: int
    username: str
    message_count: int
    conversation_count: int
    joined_at: datetime
    last_login: Optional[datetime]
    is_admin: bool
    is_super_admin: bool

# Helper function to check if user is admin
async def get_admin_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin and not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Not authorized. Admin access required.")
    return current_user

# Helper function to check if user is super admin
async def get_super_admin_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Not authorized. Super admin access required.")
    return current_user

async def update_admin_stats(db: Session):
    """Background task to update admin stats"""
    try:
        # Get total counts
        total_users = db.query(func.count(User.id)).scalar()
        total_conversations = db.query(func.count(Conversation.id)).scalar()
        total_messages = db.query(func.count(Message.id)).scalar()
        
        # Get 24h stats
        day_ago = datetime.utcnow() - timedelta(days=1)
        
        # Count distinct users who sent messages in the last 24 hours
        active_users = db.query(func.count(distinct(Message.sender_id))).\
            filter(Message.timestamp >= day_ago).scalar() or 0
        
        new_users = db.query(func.count(User.id)).\
            filter(User.created_at >= day_ago).scalar() or 0
        
        new_messages = db.query(func.count(Message.id)).\
            filter(Message.timestamp >= day_ago).scalar() or 0
        
        # Create new stats entry
        stats = AdminStats(
            total_users=total_users,
            total_conversations=total_conversations,
            total_messages=total_messages,
            active_users_24h=active_users,
            new_users_24h=new_users,
            new_messages_24h=new_messages,
            stats_date=datetime.utcnow()
        )
        
        db.add(stats)
        db.commit()
    except Exception as e:
        print(f"Error updating admin stats: {e}")
        db.rollback()

@router.post("/create-super-admin")
async def create_super_admin(
    username: str,
    password: str,
    db: Session = Depends(get_db)
):
    # Check if super admin already exists
    existing_super_admin = db.query(User).filter(User.is_super_admin == True).first()
    if existing_super_admin:
        raise HTTPException(status_code=400, detail="Super admin already exists")
    
    # Create new super admin
    hashed_password = get_password_hash(password)
    
    super_admin = User(
        username=username,
        hashed_password=hashed_password,
        is_admin=True,
        is_super_admin=True
    )
    
    db.add(super_admin)
    db.commit()
    
    return {"message": "Super admin created successfully"}

@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user.is_admin and not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get total counts
    total_users = db.query(func.count(User.id)).scalar()
    total_conversations = db.query(func.count(Conversation.id)).scalar()
    total_messages = db.query(func.count(Message.id)).scalar()
    
    # Get 24h stats
    day_ago = datetime.utcnow() - timedelta(days=1)
    
    # Count distinct users who sent messages in the last 24 hours
    active_users = db.query(func.count(distinct(Message.sender_id))).\
        filter(Message.timestamp >= day_ago).scalar() or 0
    
    new_users = db.query(func.count(User.id)).\
        filter(User.created_at >= day_ago).scalar() or 0
    
    new_messages = db.query(func.count(Message.id)).\
        filter(Message.timestamp >= day_ago).scalar() or 0
    
    # Create stats response
    stats = AdminStatsResponse(
        total_users=total_users,
        total_conversations=total_conversations,
        total_messages=total_messages,
        active_users_24h=active_users,
        new_users_24h=new_users,
        new_messages_24h=new_messages,
        stats_date=datetime.utcnow()
    )
    
    # Update stats in background
    background_tasks.add_task(update_admin_stats, db)
    
    return stats

@router.get("/users", response_model=List[UserStats])
async def get_user_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 10
):
    if not current_user.is_admin and not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get user stats with message and conversation counts
    users = db.query(
        User,
        func.count(distinct(Message.id)).label('message_count'),
        func.count(distinct(ConversationParticipant.conversation_id)).label('conversation_count')
    ).\
    outerjoin(Message, User.id == Message.sender_id).\
    outerjoin(ConversationParticipant, User.id == ConversationParticipant.user_id).\
    group_by(User.id).\
    offset(skip).\
    limit(limit).\
    all()
    
    return [
        UserStats(
            id=user.User.id,
            username=user.User.username,
            message_count=user.message_count or 0,
            conversation_count=user.conversation_count or 0,
            joined_at=user.User.created_at,
            last_login=user.User.last_login,
            is_admin=user.User.is_admin,
            is_super_admin=user.User.is_super_admin
        )
        for user in users
    ]

@router.post("/users/{user_id}/toggle-admin")
async def toggle_admin_status(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Only super admins can modify admin status")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.is_super_admin:
        raise HTTPException(status_code=400, detail="Cannot modify super admin status")
    
    user.is_admin = not user.is_admin
    db.commit()
    
    return {"message": f"Admin status {'granted' if user.is_admin else 'revoked'} for user {user.username}"}

@router.get("/stats/history")
async def get_stats_history(
    days: int = 7,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    start_date = datetime.utcnow() - timedelta(days=days)
    stats = db.query(AdminStats).filter(
        AdminStats.stats_date >= start_date
    ).order_by(AdminStats.stats_date.desc()).all()
    
    return stats 